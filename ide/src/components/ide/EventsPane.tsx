"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { Radio, Search, Trash2, X, AlertCircle, ChevronDown } from "lucide-react";
import { useContractEvents } from "@/hooks/useContractEvents";
import { useWorkspaceStore } from "@/store/workspaceStore";
import type { ContractEvent } from "@/utils/eventSubscriber";
import { LogRedactor, useRedaction } from "@/components/ide/LogRedactor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format an ISO-8601 timestamp down to HH:MM:SS.mmm */
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
  } catch {
    return iso;
  }
}

/** Pretty-print a JSON string; fall back to the raw string on parse error. */
function prettyData(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** Truncate a contract/tx hash for display: first 6 … last 4 chars. */
function shortHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// EventRow — a single collapsible log entry
// ---------------------------------------------------------------------------

interface EventRowProps {
  event: ContractEvent;
  index: number;
}

const EventRow = React.memo(function EventRow({ event, index }: EventRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { apply } = useRedaction();

  const safeData = useMemo(() => apply(event.data).redacted, [apply, event.data]);
  const safeContractId = useMemo(
    () => apply(event.contractId).redacted,
    [apply, event.contractId],
  );
  const safeTxHash = useMemo(() => apply(event.txHash).redacted, [apply, event.txHash]);

  // Alternate very-subtle row tinting for scannability
  const rowBg = index % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]";

  return (
    <div
      className={`group border-b border-white/5 font-mono text-[11px] leading-relaxed ${rowBg}`}
    >
      {/* ── Summary row ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#3B82F6]/50"
        aria-expanded={expanded}
        aria-label={`Event ${event.topic}, expand for details`}
      >
        {/* Expand caret */}
        <ChevronDown
          aria-hidden="true"
          className={`mt-0.5 h-3 w-3 shrink-0 text-white/30 transition-transform duration-150 ${
            expanded ? "rotate-180" : ""
          }`}
        />

        {/* Timestamp */}
        <span className="w-[88px] shrink-0 text-[#4ADE80]/70">
          {formatTime(event.timestamp)}
        </span>

        {/* Topic badge */}
        <span className="shrink-0 rounded border border-[#3B82F6]/30 bg-[#3B82F6]/10 px-1.5 py-px text-[10px] text-[#93C5FD]">
          {event.topic}
        </span>

        {/* Data preview — single line, truncated */}
        <span className="min-w-0 flex-1 truncate text-white/50">
          {safeData}
        </span>

        {/* Tx hash */}
        <span
          className="shrink-0 text-white/25 opacity-0 transition-opacity group-hover:opacity-100"
          title={safeTxHash}
        >
          tx:{shortHash(safeTxHash)}
        </span>
      </button>

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <div className="border-t border-white/5 bg-black/20 px-3 py-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-white/30">id</dt>
            <dd className="break-all text-white/60">{event.id}</dd>

            <dt className="text-white/30">contract</dt>
            <dd className="break-all text-white/60">{safeContractId}</dd>

            <dt className="text-white/30">tx</dt>
            <dd className="break-all text-white/60">{safeTxHash}</dd>

            <dt className="text-white/30">time</dt>
            <dd className="text-white/60">{event.timestamp}</dd>

            <dt className="text-white/30">topic</dt>
            <dd className="text-[#93C5FD]">{event.topic}</dd>

            <dt className="self-start text-white/30">data</dt>
            <dd>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[#4ADE80]/90">
                {prettyData(safeData)}
              </pre>
            </dd>
          </dl>
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// EventsPane
// ---------------------------------------------------------------------------

export function EventsPane() {
  const { contractId } = useWorkspaceStore();
  const { events, error, isListening, clearEvents } = useContractEvents();

  const [query, setQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const prevEventCountRef = useRef(0);

  // Filter events by topic (case-insensitive substring match)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // events are newest-first from the hook; reverse for chronological display
    const chronological = [...events].reverse();
    return q
      ? chronological.filter((e) => e.topic.toLowerCase().includes(q))
      : chronological;
  }, [events, query]);

  // Auto-scroll to bottom when new events arrive (only if user hasn't scrolled up)
  useEffect(() => {
    if (!autoScroll) return;
    if (events.length === prevEventCountRef.current) return;
    prevEventCountRef.current = events.length;

    const el = scrollRef.current;
    if (el) {
      // Use requestAnimationFrame so the DOM has painted the new row first
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [events, autoScroll]);

  // Detect manual scroll-up → pause auto-scroll; scroll to bottom → resume
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    setAutoScroll(atBottom);
  }, []);

  const handleClear = useCallback(() => {
    clearEvents();
    setQuery("");
    prevEventCountRef.current = 0;
  }, [clearEvents]);

  const handleClearQuery = useCallback(() => {
    setQuery("");
    searchRef.current?.focus();
  }, []);

  // ── Status line content ──────────────────────────────────────────────────

  const statusText = useMemo(() => {
    if (!contractId) return "No contract selected";
    if (error) return `Poll error: ${error.message}`;
    if (isListening) return `Listening · ${contractId.slice(0, 8)}…`;
    return "Idle";
  }, [contractId, error, isListening]);

  const statusColor = error
    ? "text-[#F87171]"
    : isListening
      ? "text-[#4ADE80]/70"
      : "text-white/30";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: "#0F1A2E" }}
    >
      {/* ── Header bar ── */}
      <div
        className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5"
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
      >
        {/* Title + live indicator */}
        <Radio
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 ${
            isListening ? "text-[#4ADE80] animate-pulse" : "text-white/20"
          }`}
        />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-white/50">
          Events
        </span>

        {/* Divider */}
        <div className="h-3.5 w-px bg-white/10" aria-hidden="true" />

        {/* Search input */}
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-1.5 h-3 w-3 text-white/25"
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by topic…"
            aria-label="Filter events by topic"
            className="w-full rounded border bg-white/5 py-0.5 pl-6 pr-6 font-mono text-[11px] text-white/80 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/50"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          />
          {query && (
            <button
              type="button"
              onClick={handleClearQuery}
              aria-label="Clear filter"
              className="absolute right-1.5 rounded p-px text-white/30 hover:text-white/70"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Event count badge */}
        {filtered.length > 0 && (
          <span className="shrink-0 rounded bg-white/5 px-1.5 py-px font-mono text-[10px] text-white/30">
            {filtered.length}
          </span>
        )}

        {/* Redaction toggle */}
        <LogRedactor />

        {/* Clear log button */}
        <button
          type="button"
          onClick={handleClear}
          disabled={events.length === 0}
          aria-label="Clear event log"
          title="Clear log"
          className="shrink-0 rounded p-1 text-white/30 transition-colors hover:bg-white/5 hover:text-white/70 disabled:pointer-events-none disabled:opacity-30"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div
          className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 font-mono text-[11px] text-[#F87171]"
          style={{ borderColor: "rgba(248,113,113,0.15)", background: "rgba(248,113,113,0.05)" }}
          role="alert"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{error.message}</span>
        </div>
      )}

      {/* ── Log body ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto"
        role="log"
        aria-label="Contract event log"
        aria-live="polite"
        aria-atomic="false"
      >
        {filtered.length === 0 ? (
          <EmptyState contractId={contractId} query={query} isListening={isListening} />
        ) : (
          filtered.map((event, i) => (
            <EventRow key={event.id} event={event} index={i} />
          ))
        )}
      </div>

      {/* ── Status bar ── */}
      <div
        className="flex shrink-0 items-center justify-between border-t px-3 py-1"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <span className={`font-mono text-[10px] ${statusColor}`}>
          {statusText}
        </span>

        {/* Auto-scroll indicator */}
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

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

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
      <div className="flex h-full items-center justify-center p-6 font-mono text-[11px] text-white/25">
        No events match &ldquo;{query}&rdquo;
      </div>
    );
  }

  if (!contractId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 font-mono text-[11px] text-white/25">
        <Radio className="h-5 w-5 opacity-30" aria-hidden="true" />
        <span>Deploy a contract to start listening for events</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 font-mono text-[11px] text-white/25">
      <Radio
        className={`h-5 w-5 ${isListening ? "animate-pulse text-[#4ADE80]/40" : "opacity-30"}`}
        aria-hidden="true"
      />
      <span>{isListening ? "Listening for events…" : "Waiting for subscriber…"}</span>
      <span className="text-[10px] text-white/15">{contractId.slice(0, 12)}…</span>
    </div>
  );
}
