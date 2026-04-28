"use client";

/**
 * src/components/ide/EventTimeline.tsx
 * ─────────────────────────────────────────────────────────────
 * Real-time Soroban Events Timeline — Issue #653
 *
 * Features
 *  • Live polling via useContractEvents (3 s interval)
 *  • Full XDR decoding of topic segments and event data
 *  • Visual vertical timeline with topic-coloured swimlane dots
 *  • Expandable detail drawer with decoded payload tree
 *  • Filter bar (topic substring), type-filter pills, clear button
 *  • Auto-scroll with manual-override detection
 *  • Diagnostic / contract / system event type badges
 * ─────────────────────────────────────────────────────────────
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Radio,
  Search,
  Trash2,
  X,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";
import { useContractEvents } from "@/hooks/useContractEvents";
import { useWorkspaceStore } from "@/store/workspaceStore";
import type { ContractEvent } from "@/utils/eventSubscriber";
import { formatScValAsJson } from "@/lib/scvalTransformer";

// ─────────────────────────────────────────────────────────────
// XDR Decoding helpers
// ─────────────────────────────────────────────────────────────

/**
 * Attempt to decode a base64 XDR ScVal string into a JS value.
 * Delegates to the project's existing formatScValAsJson utility
 * so all XDR SDK types stay in one place (scvalTransformer.ts).
 */
function decodeScValSafe(b64: string): unknown {
  try {
    const jsonStr = formatScValAsJson(b64);
    return JSON.parse(jsonStr) as unknown;
  } catch {
    return b64;
  }
}

/** Decode all topic segments (already-decoded symbol strings). */
function decodeTopics(topicRaw: string): { label: string; decoded: unknown }[] {
  // The topic field from ContractEvent is already decoded to a human-readable
  // symbol string by eventSubscriber. Return it as-is for display.
  return [{ label: topicRaw, decoded: topicRaw }];
}

/** Decode event.data (JSON string, possibly wrapping an XDR ScVal). */
function decodeEventData(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw) as unknown;
    // If the parsed value is a plain XDR base64 string, decode it
    if (typeof parsed === "string") return decodeScValSafe(parsed);
    return parsed;
  } catch {
    // Not valid JSON — try as a raw XDR base64 string
    return decodeScValSafe(raw);
  }
}

// ─────────────────────────────────────────────────────────────
// Event classification
// ─────────────────────────────────────────────────────────────

type EventKind = "diagnostic" | "contract" | "system";

function classifyEvent(topic: string): EventKind {
  const t = topic.toLowerCase();
  if (t.includes("log") || t.includes("debug") || t.includes("trace")) return "diagnostic";
  if (t.includes("fn_call") || t.includes("fn_return") || t.includes("system")) return "system";
  return "contract";
}

const KIND_STYLES: Record<EventKind, { dot: string; badge: string; label: string }> = {
  contract:   { dot: "bg-blue-400",   badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",   label: "Contract" },
  diagnostic: { dot: "bg-amber-400",  badge: "bg-amber-500/15 text-amber-300 border-amber-500/30", label: "Diagnostic" },
  system:     { dot: "bg-purple-400", badge: "bg-purple-500/15 text-purple-300 border-purple-500/30", label: "System" },
};

// ─────────────────────────────────────────────────────────────
// Topic colour palette (deterministic hash → hue)
// ─────────────────────────────────────────────────────────────

const TOPIC_COLORS = [
  "#60A5FA", "#34D399", "#F59E0B", "#F472B6",
  "#A78BFA", "#22D3EE", "#FB923C", "#4ADE80",
];
const topicColorCache = new Map<string, string>();
function topicColor(topic: string): string {
  if (!topicColorCache.has(topic)) {
    let h = 0;
    for (let i = 0; i < topic.length; i++) h = (h * 31 + topic.charCodeAt(i)) & 0xffff;
    topicColorCache.set(topic, TOPIC_COLORS[h % TOPIC_COLORS.length]);
  }
  return topicColorCache.get(topic)!;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, "0"))
      .join(":") + "." + String(d.getMilliseconds()).padStart(3, "0");
  } catch { return iso; }
}

function shortHash(h: string) {
  return h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
}

function prettyJson(val: unknown): string {
  try { return JSON.stringify(val, null, 2); } catch { return String(val); }
}

// ─────────────────────────────────────────────────────────────
// CopyButton
// ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy to clipboard"
      className="rounded p-0.5 text-white/25 transition-colors hover:text-white/60"
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// DecodedTree — recursive JSON value renderer
// ─────────────────────────────────────────────────────────────

function DecodedTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const indent = depth * 12;
  if (value === null || value === undefined) {
    return <span className="text-white/30" style={{ marginLeft: indent }}>null</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-purple-300" style={{ marginLeft: indent }}>{String(value)}</span>;
  }
  if (typeof value === "number" || typeof value === "string") {
    return (
      <span
        className={typeof value === "number" ? "text-amber-300" : "text-green-300"}
        style={{ marginLeft: indent }}
      >
        {typeof value === "string" ? `"${value}"` : value}
      </span>
    );
  }
  if (Array.isArray(value)) {
    return (
      <div style={{ marginLeft: indent }}>
        <span className="text-white/40">[</span>
        {value.map((item, i) => (
          <div key={i} className="ml-3">
            <DecodedTree value={item} depth={0} />
            {i < value.length - 1 && <span className="text-white/30">,</span>}
          </div>
        ))}
        <span className="text-white/40">]</span>
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <div style={{ marginLeft: indent }}>
        <span className="text-white/40">{"{"}</span>
        {Object.entries(value as Record<string, unknown>).map(([k, v], i, arr) => (
          <div key={k} className="ml-3">
            <span className="text-blue-300">"{k}"</span>
            <span className="text-white/40">: </span>
            <DecodedTree value={v} depth={0} />
            {i < arr.length - 1 && <span className="text-white/30">,</span>}
          </div>
        ))}
        <span className="text-white/40">{"}"}</span>
      </div>
    );
  }
  return <span className="text-white/50" style={{ marginLeft: indent }}>{String(value)}</span>;
}

// ─────────────────────────────────────────────────────────────
// TimelineEventRow
// ─────────────────────────────────────────────────────────────

interface RowProps {
  event: ContractEvent;
  index: number;
  isLast: boolean;
}

const TimelineEventRow = memo(function TimelineEventRow({ event, index, isLast }: RowProps) {
  const [open, setOpen] = useState(false);
  const kind = classifyEvent(event.topic);
  const styles = KIND_STYLES[kind];
  const dotColor = topicColor(event.topic);
  const decodedData = useMemo(() => decodeEventData(event.data), [event.data]);
  const topics = useMemo(() => decodeTopics(event.topic), [event.topic]);

  return (
    <div className="group flex gap-0" id={`event-row-${index}`}>
      {/* ── Timeline rail ── */}
      <div className="flex w-8 shrink-0 flex-col items-center">
        <div
          className="mt-3 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-[#0F1A2E] transition-transform group-hover:scale-125"
          style={{ backgroundColor: dotColor }}
          aria-hidden="true"
        />
        {!isLast && <div className="w-px flex-1 bg-white/[0.07]" aria-hidden="true" />}
      </div>

      {/* ── Card ── */}
      <div className="mb-2 mr-3 min-w-0 flex-1 rounded-lg border border-white/[0.07] bg-white/[0.02] transition-colors hover:border-white/[0.12]">
        {/* Summary row */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-start gap-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500/50"
          aria-expanded={open}
        >
          {open
            ? <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-white/30" aria-hidden="true" />
            : <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-white/30" aria-hidden="true" />}

          {/* Timestamp */}
          <span className="w-[82px] shrink-0 font-mono text-[10px] text-green-400/70">
            {formatTime(event.timestamp)}
          </span>

          {/* Kind badge */}
          <span className={`shrink-0 rounded border px-1.5 py-px font-mono text-[9px] uppercase tracking-wider ${styles.badge}`}>
            {styles.label}
          </span>

          {/* Topic */}
          <span
            className="shrink-0 rounded px-1.5 py-px font-mono text-[10px] font-semibold"
            style={{ color: dotColor, background: `${dotColor}18` }}
          >
            {event.topic}
          </span>

          {/* Data preview */}
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-white/35">
            {event.data}
          </span>

          {/* Tx hash (hover) */}
          <span
            className="shrink-0 font-mono text-[9px] text-white/20 opacity-0 transition-opacity group-hover:opacity-100"
            title={event.txHash}
          >
            tx:{shortHash(event.txHash)}
          </span>
        </button>

        {/* ── Expanded drawer ── */}
        {open && (
          <div className="border-t border-white/[0.06] bg-black/20 px-3 py-3 font-mono text-[11px]">
            {/* ── Meta ── */}
            <div className="mb-3 grid grid-cols-[80px_1fr] gap-x-2 gap-y-1 text-[10px]">
              <span className="text-white/30">id</span>
              <span className="flex items-center gap-1 text-white/55">
                {event.id}
                <CopyButton text={event.id} />
              </span>
              <span className="text-white/30">contract</span>
              <span className="flex items-center gap-1 break-all text-white/55">
                {event.contractId}
                <CopyButton text={event.contractId} />
              </span>
              <span className="text-white/30">tx</span>
              <span className="flex items-center gap-1 break-all text-white/55">
                {event.txHash}
                <CopyButton text={event.txHash} />
              </span>
              <span className="text-white/30">ledger</span>
              <span className="text-white/55">{event.timestamp}</span>
            </div>

            {/* ── Decoded Topics ── */}
            <div className="mb-3">
              <p className="mb-1 text-[9px] uppercase tracking-widest text-white/25">Decoded Topics</p>
              <div className="flex flex-wrap gap-1.5">
                {topics.map((t, i) => (
                  <span
                    key={i}
                    className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px]"
                    title={prettyJson(t.decoded)}
                  >
                    <span className="text-white/40">#{i} </span>
                    <span style={{ color: dotColor }}>{String(t.decoded ?? t.label)}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* ── Decoded Payload ── */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[9px] uppercase tracking-widest text-white/25">Decoded Payload</p>
                <CopyButton text={prettyJson(decodedData)} />
              </div>
              <div className="max-h-48 overflow-auto rounded bg-black/30 p-2 text-[10px] leading-relaxed">
                <DecodedTree value={decodedData} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// EventTimeline — main component
// ─────────────────────────────────────────────────────────────

type KindFilter = "all" | EventKind;

export function EventTimeline() {
  const { contractId } = useWorkspaceStore();
  const { events, error, isListening, clearEvents } = useContractEvents();

  const [query, setQuery]             = useState("");
  const [kindFilter, setKindFilter]   = useState<KindFilter>("all");
  const [autoScroll, setAutoScroll]   = useState(true);

  const scrollRef        = useRef<HTMLDivElement>(null);
  const searchRef        = useRef<HTMLInputElement>(null);
  const prevCountRef     = useRef(0);

  // Filter + reverse to chronological order
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...events]
      .reverse()
      .filter((e) => {
        if (q && !e.topic.toLowerCase().includes(q) && !e.data.toLowerCase().includes(q)) return false;
        if (kindFilter !== "all" && classifyEvent(e.topic) !== kindFilter) return false;
        return true;
      });
  }, [events, query, kindFilter]);

  // Auto-scroll
  useEffect(() => {
    if (!autoScroll || events.length === prevCountRef.current) return;
    prevCountRef.current = events.length;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [events, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 8);
  }, []);

  const handleClear = useCallback(() => {
    clearEvents();
    setQuery("");
    prevCountRef.current = 0;
  }, [clearEvents]);

  // Unique topics for kind pills stats
  const kindCounts = useMemo(() => {
    const counts = { contract: 0, diagnostic: 0, system: 0 };
    for (const e of events) counts[classifyEvent(e.topic)]++;
    return counts;
  }, [events]);

  const statusText = !contractId
    ? "No contract selected"
    : error ? `Poll error: ${error.message}`
    : isListening ? `Live · ${contractId.slice(0, 8)}…`
    : "Idle";

  const statusColor = error ? "text-red-400/70" : isListening ? "text-green-400/70" : "text-white/25";

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: "#0A1628" }}
      aria-label="Soroban Events Timeline"
    >
      {/* ── Header ── */}
      <div
        className="flex shrink-0 items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
      >
        <Activity
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 ${isListening ? "animate-pulse text-green-400" : "text-white/20"}`}
        />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-white/50">
          Event Timeline
        </span>

        <div className="h-3.5 w-px bg-white/10" aria-hidden="true" />

        {/* Search */}
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search aria-hidden="true" className="pointer-events-none absolute left-1.5 h-3 w-3 text-white/25" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter topic / data…"
            aria-label="Filter events"
            className="w-full rounded border bg-white/5 py-0.5 pl-6 pr-6 font-mono text-[11px] text-white/80 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); searchRef.current?.focus(); }}
              aria-label="Clear filter"
              className="absolute right-1.5 text-white/30 hover:text-white/70"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Count badge */}
        {filtered.length > 0 && (
          <span className="shrink-0 rounded bg-white/5 px-1.5 py-px font-mono text-[10px] text-white/30">
            {filtered.length}
          </span>
        )}

        {/* Clear */}
        <button
          type="button"
          onClick={handleClear}
          disabled={events.length === 0}
          aria-label="Clear timeline"
          title="Clear timeline"
          className="shrink-0 rounded p-1 text-white/30 transition-colors hover:bg-white/5 hover:text-white/70 disabled:pointer-events-none disabled:opacity-30"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Kind filter pills ── */}
      <div
        className="flex shrink-0 items-center gap-1.5 border-b px-3 py-1.5"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        {(["all", "contract", "diagnostic", "system"] as const).map((k) => {
          const count = k === "all" ? events.length : kindCounts[k];
          const active = kindFilter === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] capitalize transition-colors ${
                active
                  ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                  : "border-white/10 text-white/30 hover:text-white/60"
              }`}
            >
              {k}
              {count > 0 && (
                <span className={`rounded-full px-1 ${active ? "bg-blue-500/30 text-blue-200" : "bg-white/10 text-white/30"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* Live dot */}
        {isListening && (
          <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-green-400/60">
            <Radio className="h-2.5 w-2.5 animate-pulse" aria-hidden="true" />
            live
          </span>
        )}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div
          className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 font-mono text-[11px] text-red-400"
          style={{ borderColor: "rgba(248,113,113,0.15)", background: "rgba(248,113,113,0.05)" }}
          role="alert"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{error.message}</span>
        </div>
      )}

      {/* ── Timeline body ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto py-3 pl-2 pr-1"
        role="log"
        aria-label="Soroban contract event timeline"
        aria-live="polite"
        aria-atomic="false"
      >
        {filtered.length === 0 ? (
          <EmptyState contractId={contractId} query={query} isListening={isListening} />
        ) : (
          filtered.map((event, i) => (
            <TimelineEventRow
              key={event.id}
              event={event}
              index={i}
              isLast={i === filtered.length - 1}
            />
          ))
        )}
      </div>

      {/* ── Status bar ── */}
      <div
        className="flex shrink-0 items-center justify-between border-t px-3 py-1"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <span className={`font-mono text-[10px] ${statusColor}`}>{statusText}</span>

        {!autoScroll && events.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setAutoScroll(true);
              const el = scrollRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            className="flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] text-white/40 transition-colors hover:text-white/70"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
          >
            <ChevronDown className="h-2.5 w-2.5" aria-hidden="true" />
            scroll to latest
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────────────────────

function EmptyState({
  contractId,
  query,
  isListening,
}: {
  contractId: string | null;
  query: string;
  isListening: boolean;
}) {
  if (query) {
    return (
      <div className="flex h-full items-center justify-center p-8 font-mono text-[11px] text-white/25">
        No events match &ldquo;{query}&rdquo;
      </div>
    );
  }
  if (!contractId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 font-mono text-[11px] text-white/25">
        <Activity className="h-6 w-6 opacity-20" aria-hidden="true" />
        <span>Deploy a contract to see its event timeline</span>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 font-mono text-[11px] text-white/25">
      <Radio
        className={`h-6 w-6 ${isListening ? "animate-pulse text-green-400/40" : "opacity-20"}`}
        aria-hidden="true"
      />
      <span>{isListening ? "Listening for events…" : "Starting subscriber…"}</span>
      <span className="text-[10px] text-white/15">{contractId.slice(0, 14)}…</span>
    </div>
  );
}
