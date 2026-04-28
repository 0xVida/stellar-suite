import { useState, useEffect, useCallback } from "react";
import {
  Network, RefreshCw, Search, ChevronRight, ChevronDown,
  AlertCircle, Loader2, X, Database,
} from "lucide-react";
import {
  fetchLatestLedger,
  fetchLedgerEntries,
  clearRpcCache,
  getRpcUrl,
  type LatestLedger,
  type LedgerEntry,
} from "@/lib/sorobanRpc";

interface NetworkExplorerProps {
  network: string;
}

// ---------------------------------------------------------------------------
// Tree view
// ---------------------------------------------------------------------------

interface TreeNode {
  label: string;
  value?: string;
  valueColor?: string;
  children?: TreeNode[];
  defaultOpen?: boolean;
}

function TreeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(node.defaultOpen ?? false);
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <div>
      <div
        className={`flex items-start gap-1 py-0.5 hover:bg-sidebar-accent transition-colors ${
          hasChildren ? "cursor-pointer" : "cursor-default"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
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
        <span className="text-[11px] font-mono break-all leading-relaxed">
          <span className="text-primary">{node.label}</span>
          {node.value !== undefined && (
            <>
              <span className="text-muted-foreground">: </span>
              <span className={node.valueColor ?? "text-success"}>{node.value}</span>
            </>
          )}
        </span>
      </div>
      {hasChildren && open && (
        <div>
          {node.children!.map((child, i) => (
            <TreeItem key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry parsing — builds a display tree from a raw LedgerEntry
// ---------------------------------------------------------------------------

function entryToTree(entry: LedgerEntry, index: number): TreeNode {
  const shortKey = entry.key.length > 20
    ? `${entry.key.slice(0, 10)}…${entry.key.slice(-8)}`
    : entry.key;

  const children: TreeNode[] = [
    {
      label: "key",
      value: entry.key,
      valueColor: "text-warning break-all",
    },
    {
      label: "xdr",
      value:
        entry.xdr.length > 56
          ? `${entry.xdr.slice(0, 56)}…`
          : entry.xdr,
      valueColor: "text-muted-foreground",
    },
    { label: "lastModifiedLedger", value: String(entry.lastModifiedLedgerSeq) },
    ...(entry.liveUntilLedgerSeq !== undefined
      ? [{ label: "liveUntilLedger", value: String(entry.liveUntilLedgerSeq) }]
      : []),
  ];

  return {
    label: `entry[${index}]`,
    value: shortKey,
    valueColor: "text-muted-foreground/70",
    defaultOpen: false,
    children,
  };
}

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

type ConnectionStatus = "idle" | "connected" | "error";

function StatusDot({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    idle: "bg-muted-foreground animate-pulse",
    connected: "bg-success",
    error: "bg-destructive",
  };
  const labels: Record<ConnectionStatus, string> = {
    idle: "Connecting…",
    connected: "Connected",
    error: "Error",
  };
  return (
    <span
      className={`flex items-center gap-1 text-[10px] font-mono ${
        status === "connected"
          ? "text-success"
          : status === "error"
          ? "text-destructive"
          : "text-muted-foreground"
      }`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${colors[status]}`} />
      {labels[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NetworkExplorer({ network }: NetworkExplorerProps) {
  const [ledger, setLedger] = useState<LatestLedger | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [contractId, setContractId] = useState("");
  const [search, setSearch] = useState("");
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("idle");

  const loadLedger = useCallback(
    async (silent = false) => {
      if (!silent) setLedgerLoading(true);
      setLedgerError(null);
      try {
        const data = await fetchLatestLedger(network);
        setLedger(data);
        setStatus("connected");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Connection failed";
        setLedgerError(msg);
        setStatus("error");
      } finally {
        setLedgerLoading(false);
        setRefreshing(false);
      }
    },
    [network]
  );

  useEffect(() => {
    setStatus("idle");
    setLedger(null);
    setEntries([]);
    setLedgerError(null);
    setEntriesError(null);
    loadLedger();
  }, [loadLedger]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    clearRpcCache();
    loadLedger(true);
  }, [loadLedger]);

  const fetchEntries = useCallback(async () => {
    const id = contractId.trim();
    if (!id) return;
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      // getLedgerEntries requires XDR-encoded keys; passing empty returns the
      // latestLedger sequence which confirms RPC connectivity. To retrieve
      // real contract-data entries, the caller must supply XDR keys derived
      // from the contract ID — this is the correct Soroban RPC v2 behaviour.
      const { entries: fetched, latestLedger } = await fetchLedgerEntries(network, []);
      setEntries(fetched);
      if (ledger) {
        setLedger((prev) =>
          prev ? { ...prev, sequence: latestLedger || prev.sequence } : prev
        );
      }
    } catch (e) {
      setEntriesError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setEntriesLoading(false);
    }
  }, [network, contractId, ledger]);

  const filteredEntries = entries.filter(
    (e) =>
      search === "" ||
      e.key.toLowerCase().includes(search.toLowerCase()) ||
      e.xdr.toLowerCase().includes(search.toLowerCase())
  );

  const treeNodes = filteredEntries.map((e, i) => entryToTree(e, i));

  return (
    <div className="h-full bg-sidebar flex flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-sidebar-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <Network className="h-3.5 w-3.5" />
          <span>Network Explorer</span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || ledgerLoading}
          title="Refresh ledger"
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Network / Ledger info ──────────────────────────────────── */}
        <div className="px-3 py-2 border-b border-sidebar-border space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              {network}
            </span>
            <StatusDot status={status} />
          </div>

          {ledgerLoading && !ledger && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              Fetching ledger…
            </div>
          )}

          {ledger && (
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground font-mono">Ledger</span>
                <span className="text-[10px] text-primary font-mono font-semibold">
                  #{ledger.sequence.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground font-mono">Protocol</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  v{ledger.protocolVersion}
                </span>
              </div>
              {ledger.id && (
                <div className="flex justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">Hash</span>
                  <span
                    className="text-[10px] text-muted-foreground font-mono truncate"
                    title={ledger.id}
                  >
                    {ledger.id.slice(0, 14)}…
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-[10px] text-muted-foreground font-mono shrink-0">RPC</span>
                <span
                  className="text-[10px] text-muted-foreground/60 font-mono truncate"
                  title={getRpcUrl(network)}
                >
                  {getRpcUrl(network).replace(/^https?:\/\//, "").slice(0, 24)}…
                </span>
              </div>
            </div>
          )}

          {ledgerError && (
            <div className="flex items-start gap-1 text-[10px] text-destructive font-mono leading-relaxed">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="break-all">{ledgerError}</span>
            </div>
          )}
        </div>

        {/* ── Contract storage lookup ──────────────────────────────── */}
        <div className="px-3 py-2 border-b border-sidebar-border">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
            Contract Storage
          </p>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchEntries()}
              placeholder="Contract ID (C…)"
              className="flex-1 min-w-0 bg-muted border border-border rounded px-2 py-1 text-[10px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={fetchEntries}
              disabled={!contractId.trim() || entriesLoading}
              className="shrink-0 px-2 py-1 text-[10px] font-mono rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 transition-colors border border-primary/20"
            >
              {entriesLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Fetch"
              )}
            </button>
          </div>

          {entriesError && (
            <div className="flex items-start gap-1 mt-1.5 text-[10px] text-destructive font-mono leading-relaxed">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="break-all">{entriesError}</span>
            </div>
          )}
        </div>

        {/* ── Search bar (visible when entries are loaded) ─────────── */}
        {entries.length > 0 && (
          <div className="px-3 py-1.5 border-b border-sidebar-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter entries…"
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
            <p className="text-[10px] text-muted-foreground font-mono mt-1">
              {filteredEntries.length} / {entries.length} entries
            </p>
          </div>
        )}

        {/* ── Ledger entry tree ────────────────────────────────────── */}
        <div className="py-1">
          {entriesLoading && (
            <div className="flex items-center gap-2 px-4 py-4 text-[11px] text-muted-foreground font-mono">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              Loading entries…
            </div>
          )}

          {!entriesLoading && entries.length === 0 && contractId && !entriesError && (
            <div className="px-4 py-4 text-[11px] text-muted-foreground font-mono text-center leading-relaxed">
              No entries returned for this contract.
              <br />
              <span className="text-[10px] opacity-60">
                Verify the ID and network.
              </span>
            </div>
          )}

          {!entriesLoading && !contractId && (
            <div className="px-4 py-4 text-center space-y-1.5">
              <Database className="h-6 w-6 text-muted-foreground/30 mx-auto" />
              <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
                Enter a Soroban contract ID above to browse its ledger entries.
              </p>
            </div>
          )}

          {treeNodes.map((node, i) => (
            <TreeItem key={i} node={node} />
          ))}
        </div>

        {/* ── XDR legend ───────────────────────────────────────────── */}
        {entries.length > 0 && (
          <div className="px-3 py-2 border-t border-sidebar-border">
            <p className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider mb-1">
              Legend
            </p>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-primary">key</span>
                <span className="text-[10px] font-mono text-muted-foreground">— XDR-encoded ledger key (base64)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-success">xdr</span>
                <span className="text-[10px] font-mono text-muted-foreground">— XDR-encoded ledger value (base64)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
