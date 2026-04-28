import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity, RefreshCw, Search, ChevronRight, ChevronDown,
  AlertCircle, Loader2, X, Play, Pause, Clock, Info,
} from "lucide-react";
import {
  fetchLedgerEntries,
  fetchLatestLedger,
  clearRpcCache,
  type LedgerEntry,
} from "@/lib/sorobanRpc";

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight XDR / ScVal decoder
// No external dependency — handles the most common Soroban ScVal types.
// Spec ref: https://github.com/stellar/stellar-xdr
// ─────────────────────────────────────────────────────────────────────────────

function b64ToBytes(b64: string): Uint8Array {
  try {
    const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return new Uint8Array(0);
  }
}

function u32(buf: Uint8Array, off: number): number {
  if (off + 4 > buf.length) return 0;
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

function i32(buf: Uint8Array, off: number): number {
  return u32(buf, off) | 0;
}

function u64str(buf: Uint8Array, off: number): string {
  const hi = u32(buf, off);
  const lo = u32(buf, off + 4);
  return (BigInt(hi) * 0x100000000n + BigInt(lo)).toString();
}

function i64str(buf: Uint8Array, off: number): string {
  const hi = u32(buf, off);
  const lo = u32(buf, off + 4);
  return BigInt.asIntN(64, BigInt(hi) * 0x100000000n + BigInt(lo)).toString();
}

function hex(buf: Uint8Array, maxBytes = 20): string {
  const slice = buf.slice(0, maxBytes);
  const h = Array.from(slice).map((b) => b.toString(16).padStart(2, "0")).join("");
  return buf.length > maxBytes ? `0x${h}…` : `0x${h}`;
}

function xdrStr(buf: Uint8Array, off: number): [string, number] {
  const len = u32(buf, off);
  off += 4;
  const bytes = buf.slice(off, off + len);
  const pad = (4 - (len % 4)) % 4;
  return [new TextDecoder("utf-8", { fatal: false }).decode(bytes), off + len + pad];
}

function xdrBytes(buf: Uint8Array, off: number): [string, number] {
  const len = u32(buf, off);
  off += 4;
  const bytes = buf.slice(off, off + len);
  const pad = (4 - (len % 4)) % 4;
  return [hex(bytes), off + len + pad];
}

// ── ScVal ─────────────────────────────────────────────────────────────────────

export interface ParsedVal {
  typeLabel: string;
  display: string;
  children?: Array<ParsedVal & { childKey?: string }>;
}

function parseScVal(buf: Uint8Array, off: number): [ParsedVal, number] {
  if (off + 4 > buf.length) return [{ typeLabel: "?", display: "…" }, buf.length];

  const t = u32(buf, off);
  off += 4;

  switch (t) {
    case 0: { // SCV_BOOL
      const v = u32(buf, off);
      return [{ typeLabel: "bool", display: v ? "true" : "false" }, off + 4];
    }
    case 1: // SCV_VOID
      return [{ typeLabel: "void", display: "()" }, off];
    case 3: // SCV_U32
      return [{ typeLabel: "u32", display: String(u32(buf, off)) }, off + 4];
    case 4: // SCV_I32
      return [{ typeLabel: "i32", display: String(i32(buf, off)) }, off + 4];
    case 5: // SCV_U64
      return [{ typeLabel: "u64", display: u64str(buf, off) }, off + 8];
    case 6: // SCV_I64
      return [{ typeLabel: "i64", display: i64str(buf, off) }, off + 8];
    case 7: // SCV_TIMEPOINT
      return [{ typeLabel: "timepoint", display: u64str(buf, off) }, off + 8];
    case 8: // SCV_DURATION
      return [{ typeLabel: "duration", display: u64str(buf, off) + "s" }, off + 8];
    case 9: { // SCV_U128 — hi64 + lo64
      const hi = BigInt(u32(buf, off)) * 0x100000000n + BigInt(u32(buf, off + 4));
      const lo = BigInt(u32(buf, off + 8)) * 0x100000000n + BigInt(u32(buf, off + 12));
      return [{ typeLabel: "u128", display: (hi * 0x10000000000000000n + lo).toString() }, off + 16];
    }
    case 10: { // SCV_I128
      const hi = BigInt.asIntN(64, BigInt(u32(buf, off)) * 0x100000000n + BigInt(u32(buf, off + 4)));
      const lo = BigInt(u32(buf, off + 8)) * 0x100000000n + BigInt(u32(buf, off + 12));
      return [{ typeLabel: "i128", display: (hi * 0x10000000000000000n + lo).toString() }, off + 16];
    }
    case 13: { // SCV_BYTES
      const [s, next] = xdrBytes(buf, off);
      return [{ typeLabel: "bytes", display: s }, next];
    }
    case 14: { // SCV_STRING
      const [s, next] = xdrStr(buf, off);
      return [{ typeLabel: "string", display: `"${s.slice(0, 80)}${s.length > 80 ? "…" : ""}"` }, next];
    }
    case 15: { // SCV_SYMBOL
      const [s, next] = xdrStr(buf, off);
      return [{ typeLabel: "symbol", display: s }, next];
    }
    case 16: { // SCV_VEC — optional pointer + count + items
      const present = u32(buf, off); off += 4;
      if (!present) return [{ typeLabel: "vec", display: "[]" }, off];
      const count = u32(buf, off); off += 4;
      const children: Array<ParsedVal & { childKey?: string }> = [];
      for (let i = 0; i < Math.min(count, 128) && off < buf.length; i++) {
        const [child, next] = parseScVal(buf, off);
        children.push({ ...child, childKey: `[${i}]` });
        off = next;
      }
      return [{ typeLabel: "vec", display: `[${count}]`, children }, off];
    }
    case 17: { // SCV_MAP — optional pointer + count + (key,val) pairs
      const present = u32(buf, off); off += 4;
      if (!present) return [{ typeLabel: "map", display: "{}" }, off];
      const count = u32(buf, off); off += 4;
      const children: Array<ParsedVal & { childKey?: string }> = [];
      for (let i = 0; i < Math.min(count, 128) && off < buf.length; i++) {
        const [k, off1] = parseScVal(buf, off);
        const [v, off2] = parseScVal(buf, off1);
        children.push({ ...v, childKey: k.display });
        off = off2;
      }
      return [{ typeLabel: "map", display: `{${count}}`, children }, off];
    }
    case 18: { // SCV_ADDRESS (SCAddress)
      const addrType = u32(buf, off); off += 4;
      if (addrType === 1) { // SC_ADDRESS_TYPE_CONTRACT — 32-byte hash
        const h = hex(buf.slice(off, off + 32), 32);
        return [{ typeLabel: "contract", display: h }, off + 32];
      }
      // SC_ADDRESS_TYPE_ACCOUNT — KEY_TYPE_ED25519 (4) + 32 bytes
      off += 4;
      const h = hex(buf.slice(off, off + 32), 32);
      return [{ typeLabel: "account", display: h }, off + 32];
    }
    case 19: // SCV_LEDGER_KEY_CONTRACT_INSTANCE
      return [{ typeLabel: "ContractInstance", display: "(instance)" }, off];
    case 20: // SCV_LEDGER_KEY_NONCE
      return [{ typeLabel: "Nonce", display: i64str(buf, off) }, off + 8];
    default:
      return [{ typeLabel: `type(${t})`, display: "…" }, off];
  }
}

// ── LedgerEntry ───────────────────────────────────────────────────────────────

interface ContractDataEntry {
  kind: "ContractData";
  contractHex: string;
  key: ParsedVal;
  keyRaw: string;
  durability: "Persistent" | "Temporary";
  value: ParsedVal;
  lastModified: number;
  liveUntil?: number;
  raw: string;
}

interface OtherEntry {
  kind: string;
  lastModified: number;
  keyRaw: string;
  raw: string;
}

type ParsedEntry = ContractDataEntry | OtherEntry;

const ENTRY_TYPES: Record<number, string> = {
  0: "Account", 1: "TrustLine", 2: "Offer", 3: "Data",
  4: "ClaimableBalance", 5: "LiquidityPool", 6: "ContractData",
  7: "ContractCode", 8: "ConfigSetting", 9: "TTL",
};

function parseLedgerEntry(entry: LedgerEntry): ParsedEntry {
  try {
    const buf = b64ToBytes(entry.xdr);
    if (buf.length < 8) throw new Error("too short");
    let off = 0;

    const lastMod = u32(buf, off); off += 4;
    const entryType = u32(buf, off); off += 4;

    if (entryType !== 6) {
      return { kind: ENTRY_TYPES[entryType] ?? `type_${entryType}`, lastModified: lastMod, keyRaw: entry.key, raw: entry.xdr };
    }

    // ExtensionPoint discriminant (= 0)
    off += 4;

    // SCAddress (contract)
    const addrType = u32(buf, off); off += 4;
    let contractHex = "";
    if (addrType === 1) {
      contractHex = hex(buf.slice(off, off + 32), 32);
      off += 32;
    } else {
      off += 4 + 32; // key_type + ed25519
    }

    // SCVal key
    const [keyVal, off2] = parseScVal(buf, off);
    off = off2;

    // ContractDataDurability: 0 = Temporary, 1 = Persistent
    const dur = u32(buf, off); off += 4;

    // SCVal value
    const [valVal] = parseScVal(buf, off);

    return {
      kind: "ContractData",
      contractHex,
      key: keyVal,
      keyRaw: entry.key,
      durability: dur === 0 ? "Temporary" : "Persistent",
      value: valVal,
      lastModified: lastMod,
      liveUntil: entry.liveUntilLedgerSeq,
      raw: entry.xdr,
    };
  } catch {
    return { kind: "unknown", lastModified: entry.lastModifiedLedgerSeq, keyRaw: entry.key, raw: entry.xdr };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Type-colour map
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  bool: "text-amber-400",
  u32: "text-sky-400", i32: "text-sky-400",
  u64: "text-sky-400", i64: "text-sky-400",
  u128: "text-sky-400", i128: "text-sky-400",
  timepoint: "text-violet-400", duration: "text-violet-400",
  string: "text-green-400",
  symbol: "text-emerald-400",
  bytes: "text-orange-400",
  vec: "text-primary", map: "text-primary",
  contract: "text-pink-400", account: "text-pink-400",
  ContractInstance: "text-muted-foreground",
  Nonce: "text-muted-foreground",
};

function typeColor(label: string) {
  return TYPE_COLOR[label] ?? "text-muted-foreground";
}

// ─────────────────────────────────────────────────────────────────────────────
// Recursive tree node
// ─────────────────────────────────────────────────────────────────────────────

function ValNode({
  val,
  entryKey,
  depth = 0,
}: {
  val: ParsedVal;
  entryKey?: string;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = (val.children?.length ?? 0) > 0;

  return (
    <div>
      <div
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className={`flex items-start gap-1 py-[3px] pr-3 ${
          hasChildren ? "cursor-pointer hover:bg-sidebar-accent" : ""
        } transition-colors`}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        <span className="shrink-0 mt-[3px] w-3">
          {hasChildren ? (
            open ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )
          ) : null}
        </span>
        <span className="text-[11px] font-mono leading-relaxed min-w-0 break-all select-text">
          {entryKey !== undefined && (
            <>
              <span className="text-sidebar-foreground/90">{entryKey}</span>
              <span className="text-muted-foreground">: </span>
            </>
          )}
          {hasChildren ? (
            <span className="text-muted-foreground/50">{val.display}</span>
          ) : (
            <span className={typeColor(val.typeLabel)}>{val.display}</span>
          )}
          <span className="ml-1 text-[9px] text-muted-foreground/35">{val.typeLabel}</span>
        </span>
      </div>
      {hasChildren && open && (
        <div>
          {val.children!.map((child, i) => (
            <ValNode key={i} val={child} entryKey={child.childKey} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry card
// ─────────────────────────────────────────────────────────────────────────────

function ContractDataCard({
  entry,
  changed,
}: {
  entry: ContractDataEntry;
  changed: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className={`border-b border-sidebar-border last:border-0 ${changed ? "border-l-2 border-l-warning" : ""}`}>
      <button
        className="w-full flex items-start gap-1.5 px-3 py-2 hover:bg-sidebar-accent transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="shrink-0 mt-0.5">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span className={`text-[11px] font-mono break-all ${typeColor(entry.key.typeLabel)}`}>
            {entry.key.display}
          </span>
          <span className="ml-1 text-[9px] text-muted-foreground/40">{entry.key.typeLabel}</span>
          {changed && (
            <span className="ml-2 text-[10px] font-semibold text-warning">● changed</span>
          )}
        </span>
        <span
          className={`shrink-0 self-center text-[9px] font-mono px-1 py-0.5 rounded text-primary-foreground/90 ${
            entry.durability === "Persistent" ? "bg-primary/50" : "bg-muted-foreground/30"
          }`}
          title={entry.durability}
        >
          {entry.durability === "Persistent" ? "P" : "T"}
        </span>
      </button>

      {open && (
        <div className="pb-1.5">
          <div className="px-3 pb-1 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground font-mono">
              ledger #{entry.lastModified.toLocaleString()}
            </span>
            {entry.liveUntil !== undefined && (
              <span className="text-[10px] text-muted-foreground font-mono">
                · live until #{entry.liveUntil.toLocaleString()}
              </span>
            )}
          </div>
          <ValNode val={entry.value} entryKey="value" depth={0} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVALS = [5, 10, 30] as const;
type PollInterval = (typeof POLL_INTERVALS)[number];

interface StateExplorerProps {
  network: string;
  contractId?: string | null;
}

export function StateExplorer({ network, contractId: propContractId }: StateExplorerProps) {
  const [xdrKeys, setXdrKeys] = useState("");
  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [prevRawMap, setPrevRawMap] = useState<Map<string, string>>(new Map());
  const [latestLedger, setLatestLedger] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [pollInterval, setPollInterval] = useState<PollInterval>(10);
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Seed XDR key area when a contract is deployed
  useEffect(() => {
    if (propContractId && !xdrKeys) {
      // Just set as a comment/hint so the user knows which contract is active
      setXdrKeys("");
    }
  }, [propContractId, xdrKeys]);

  // Update latest ledger on network change
  useEffect(() => {
    setEntries([]);
    setPrevRawMap(new Map());
    setLatestLedger(0);
    setError(null);
    fetchLatestLedger(network)
      .then((l) => setLatestLedger(l.sequence))
      .catch(() => {});
  }, [network]);

  const fetchState = useCallback(async () => {
    const keys = xdrKeys
      .split("\n")
      .map((k) => k.trim())
      .filter(Boolean);

    setLoading(true);
    setError(null);

    try {
      const { entries: raw, latestLedger: seq } = await fetchLedgerEntries(network, keys);
      if (seq) setLatestLedger(seq);

      // Build prev→raw map before overwriting entries
      setPrevRawMap((prev) => {
        const next = new Map(prev);
        // snapshot current entries for change detection on next fetch
        return next;
      });

      const parsed = raw.map(parseLedgerEntry);

      setEntries((old) => {
        // Record what was there before
        const oldMap = new Map(old.map((e) => [e.keyRaw, e.raw]));
        setPrevRawMap(oldMap);
        return parsed;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setLoading(false);
    }

    // Refresh ledger sequence independently (catches blocks even without key results)
    try {
      clearRpcCache();
      const l = await fetchLatestLedger(network);
      setLatestLedger(l.sequence);
    } catch {
      // silently ignore
    }
  }, [network, xdrKeys]);

  // Auto-refresh countdown + trigger
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!autoRefresh) { setCountdown(0); return; }

    setCountdown(pollInterval);
    let remaining = pollInterval;

    intervalRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        remaining = pollInterval;
        setCountdown(pollInterval);
        fetchState();
      }
    }, 1_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, pollInterval, fetchState]);

  // Change detection — compare current raw XDR with previous fetch snapshot
  const changedKeys = new Set<string>();
  for (const entry of entries) {
    const prev = prevRawMap.get(entry.keyRaw);
    if (prev !== undefined && prev !== entry.raw) changedKeys.add(entry.keyRaw);
  }

  const contractEntries = entries.filter(
    (e): e is ContractDataEntry => e.kind === "ContractData"
  );

  const filteredEntries = contractEntries.filter(
    (e) =>
      search === "" ||
      e.key.display.toLowerCase().includes(search.toLowerCase()) ||
      e.value.display.toLowerCase().includes(search.toLowerCase()) ||
      e.value.typeLabel.toLowerCase().includes(search.toLowerCase())
  );

  const progress = autoRefresh && pollInterval > 0
    ? ((pollInterval - countdown) / pollInterval) * 100
    : 0;

  return (
    <div className="h-full bg-sidebar flex flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-sidebar-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          State Explorer
        </div>
        <div className="flex items-center gap-1.5">
          {latestLedger > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground" title="Latest ledger">
              #{latestLedger.toLocaleString()}
            </span>
          )}
          {autoRefresh && countdown > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-mono text-primary">
              <Clock className="h-2.5 w-2.5" />
              {countdown}s
            </span>
          )}
          <button
            onClick={fetchState}
            disabled={loading}
            title="Fetch now"
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Auto-refresh progress bar */}
      {autoRefresh && (
        <div className="h-0.5 bg-muted shrink-0">
          <div
            className="h-full bg-primary transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* ── XDR key input ──────────────────────────────────────────── */}
        <div className="px-3 py-2 border-b border-sidebar-border space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              XDR Ledger Keys
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50 font-mono">
              <Info className="h-2.5 w-2.5" />
              one per line
            </span>
          </div>
          <textarea
            value={xdrKeys}
            onChange={(e) => setXdrKeys(e.target.value)}
            rows={3}
            placeholder={"AAAA…base64-encoded LedgerKey XDR\nAAAA…another key"}
            className="w-full bg-muted border border-border rounded px-2 py-1.5 text-[10px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          {propContractId && (
            <p className="text-[10px] font-mono text-muted-foreground/60">
              Active contract: <span className="text-primary">{propContractId}</span>
            </p>
          )}
          <button
            onClick={fetchState}
            disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-mono rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {loading ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Fetching…</>
            ) : (
              <><RefreshCw className="h-3 w-3" /> Fetch State</>
            )}
          </button>
        </div>

        {/* ── Live-update controls ───────────────────────────────────── */}
        <div className="px-3 py-2 border-b border-sidebar-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Live Updates
            </span>
            <button
              onClick={() => setAutoRefresh((a) => !a)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                autoRefresh
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {autoRefresh ? (
                <><Pause className="h-2.5 w-2.5" /> Pause</>
              ) : (
                <><Play className="h-2.5 w-2.5" /> Start</>
              )}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-muted-foreground">Every</span>
            {POLL_INTERVALS.map((s) => (
              <button
                key={s}
                onClick={() => setPollInterval(s)}
                className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors ${
                  pollInterval === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>

        {/* ── Error ─────────────────────────────────────────────────── */}
        {error && (
          <div className="mx-3 mt-2 flex items-start gap-1.5 text-[11px] text-destructive font-mono bg-destructive/10 rounded p-2 leading-relaxed">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* ── Search ────────────────────────────────────────────────── */}
        {contractEntries.length > 0 && (
          <div className="px-3 py-1.5 border-b border-sidebar-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by key, value, or type…"
                className="w-full bg-muted border border-border rounded pl-6 pr-6 py-1 text-[10px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] font-mono text-muted-foreground">
                {filteredEntries.length} / {contractEntries.length} entries
              </span>
              {changedKeys.size > 0 && (
                <span className="text-[10px] font-mono text-warning font-semibold">
                  {changedKeys.size} changed
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Loading skeleton ───────────────────────────────────────── */}
        {loading && entries.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-6 text-[11px] text-muted-foreground font-mono">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            Fetching contract state…
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────────────── */}
        {!loading && entries.length === 0 && (
          <div className="px-4 py-6 text-center space-y-2">
            <Activity className="h-8 w-8 text-muted-foreground/20 mx-auto" />
            <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
              Paste base64-encoded{" "}
              <span className="text-foreground">LedgerKey</span> XDR above, then click{" "}
              <span className="text-primary font-semibold">Fetch State</span>.
            </p>
            <p className="text-[10px] text-muted-foreground/50 font-mono leading-relaxed">
              Keys can be obtained via the Stellar CLI:<br />
              <code className="text-muted-foreground">stellar contract read --id &lt;ID&gt;</code>
            </p>
          </div>
        )}

        {/* ── Contract data tree ─────────────────────────────────────── */}
        {filteredEntries.length > 0 && (
          <div className="py-1">
            {filteredEntries.map((entry, i) => (
              <ContractDataCard
                key={i}
                entry={entry}
                changed={changedKeys.has(entry.keyRaw)}
              />
            ))}
          </div>
        )}

        {/* ── Type legend ────────────────────────────────────────────── */}
        {entries.length > 0 && (
          <div className="px-3 py-2 border-t border-sidebar-border mt-1">
            <p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider mb-1">
              Type colours
            </p>
            <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
              {[
                ["number", "text-sky-400"],
                ["string", "text-green-400"],
                ["symbol", "text-emerald-400"],
                ["bytes", "text-orange-400"],
                ["bool", "text-amber-400"],
                ["address", "text-pink-400"],
                ["container", "text-primary"],
              ].map(([label, cls]) => (
                <span key={label} className={`text-[10px] font-mono ${cls}`}>{label}</span>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline text-[9px] font-mono px-1 rounded bg-primary/50 text-primary-foreground/90">P</span>
              <span className="text-[10px] text-muted-foreground font-mono">Persistent</span>
              <span className="inline text-[9px] font-mono px-1 rounded bg-muted-foreground/30 text-primary-foreground/90">T</span>
              <span className="text-[10px] text-muted-foreground font-mono">Temporary</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
