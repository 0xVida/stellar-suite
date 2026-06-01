"use client";

/**
 * EnhancedSearch.tsx
 *
 * Global workspace search with:
 *  - Syntax-highlighted match snippets (context lines above/below)
 *  - Exact line numbers for every match
 *  - Quick-jump to file + line in the editor
 *  - Text / regex mode toggle
 *  - Match-case and whole-word toggles
 *  - Debounced input for instant response on large workspaces
 *  - Results grouped by file
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { searchWorkspace, type SearchMatch, type SearchMode } from "@/utils/searchWorkspace";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 120;
const CONTEXT_LINES = 1; // lines of context above/below the match line
const MAX_DISPLAY_RESULTS = 500;

// ── Types ─────────────────────────────────────────────────────────────────────

interface GroupedResult {
  fileId: string;
  pathParts: string[];
  matches: SearchMatch[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByFile(matches: SearchMatch[]): GroupedResult[] {
  const map = new Map<string, GroupedResult>();
  for (const m of matches) {
    if (!map.has(m.fileId)) {
      map.set(m.fileId, { fileId: m.fileId, pathParts: m.pathParts, matches: [] });
    }
    map.get(m.fileId)!.matches.push(m);
  }
  return Array.from(map.values());
}

/** Escape special regex chars for use in a RegExp */
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── SnippetLine ───────────────────────────────────────────────────────────────

interface SnippetLineProps {
  lineNumber: number;
  text: string;
  /** Ranges [start, end) within `text` to highlight */
  highlights: Array<[number, number]>;
  isMatchLine: boolean;
}

function SnippetLine({ lineNumber, text, highlights, isMatchLine }: SnippetLineProps) {
  // Build segments: plain | highlighted | plain | ...
  const segments: Array<{ text: string; highlight: boolean }> = [];
  let cursor = 0;
  const sorted = [...highlights].sort((a, b) => a[0] - b[0]);

  for (const [start, end] of sorted) {
    if (cursor < start) segments.push({ text: text.slice(cursor, start), highlight: false });
    segments.push({ text: text.slice(start, end), highlight: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlight: false });

  return (
    <div
      className={`flex items-start gap-2 px-2 py-0.5 font-mono text-xs leading-5 ${
        isMatchLine ? "bg-accent/10" : ""
      }`}
    >
      {/* Line number gutter */}
      <span
        className="w-8 shrink-0 select-none text-right text-muted-foreground"
        aria-label={`Line ${lineNumber}`}
      >
        {lineNumber}
      </span>

      {/* Code with inline highlights */}
      <span className="min-w-0 break-all text-foreground">
        {segments.map((seg, i) =>
          seg.highlight ? (
            <mark
              key={i}
              className="rounded-sm bg-yellow-400/40 text-foreground dark:bg-yellow-500/30"
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </span>
    </div>
  );
}

// ── MatchSnippet ──────────────────────────────────────────────────────────────

interface MatchSnippetProps {
  match: SearchMatch;
  fileLines: string[];
  query: string;
  mode: SearchMode;
  matchCase: boolean;
  onJump: (match: SearchMatch) => void;
}

function MatchSnippet({ match, fileLines, query, mode, matchCase, onJump }: MatchSnippetProps) {
  const startLine = Math.max(0, match.lineNumber - 1 - CONTEXT_LINES);
  const endLine = Math.min(fileLines.length - 1, match.lineNumber - 1 + CONTEXT_LINES);

  // Build highlight ranges for the match line only
  const getHighlights = (lineIdx: number): Array<[number, number]> => {
    if (lineIdx !== match.lineNumber - 1) return [];
    const col0 = match.startColumn - 1;
    const col1 = match.endColumn - 1;
    return [[col0, col1]];
  };

  return (
    <button
      type="button"
      className="w-full cursor-pointer rounded border border-transparent text-left hover:border-border hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring"
      onClick={() => onJump(match)}
      aria-label={`Jump to line ${match.lineNumber} in ${match.fileId}`}
    >
      {Array.from({ length: endLine - startLine + 1 }, (_, i) => {
        const lineIdx = startLine + i;
        return (
          <SnippetLine
            key={lineIdx}
            lineNumber={lineIdx + 1}
            text={fileLines[lineIdx] ?? ""}
            highlights={getHighlights(lineIdx)}
            isMatchLine={lineIdx === match.lineNumber - 1}
          />
        );
      })}
    </button>
  );
}

// ── FileGroup ─────────────────────────────────────────────────────────────────

interface FileGroupProps {
  group: GroupedResult;
  fileLines: string[];
  query: string;
  mode: SearchMode;
  matchCase: boolean;
  onJump: (match: SearchMatch) => void;
}

function FileGroup({ group, fileLines, query, mode, matchCase, onJump }: FileGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const fileName = group.pathParts[group.pathParts.length - 1];
  const dirPath = group.pathParts.slice(0, -1).join("/");

  return (
    <div className="mb-2">
      {/* File header */}
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs font-medium hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span className="text-muted-foreground">{collapsed ? "▶" : "▼"}</span>
        <span className="truncate text-foreground">{fileName}</span>
        {dirPath && (
          <span className="ml-1 truncate text-muted-foreground">{dirPath}</span>
        )}
        <span className="ml-auto shrink-0 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
          {group.matches.length}
        </span>
      </button>

      {/* Match snippets */}
      {!collapsed && (
        <div className="ml-2 mt-0.5 space-y-0.5 border-l border-border pl-2">
          {group.matches.map((m, i) => (
            <MatchSnippet
              key={`${m.fileId}-${m.lineNumber}-${m.startColumn}-${i}`}
              match={m}
              fileLines={fileLines}
              query={query}
              mode={mode}
              matchCase={matchCase}
              onJump={onJump}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── EnhancedSearch (main export) ──────────────────────────────────────────────

export function EnhancedSearch() {
  const { files, addTab, setActiveTabPath } = useWorkspaceStore();

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("text");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce query input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Run search
  const { matches, regexError } = useMemo(() => {
    if (!debouncedQuery.trim()) return { matches: [] };
    return searchWorkspace(files, debouncedQuery, { mode, matchCase, wholeWord, limit: MAX_DISPLAY_RESULTS });
  }, [debouncedQuery, files, mode, matchCase, wholeWord]);

  const grouped = useMemo(() => groupByFile(matches), [matches]);

  // Build a map of fileId → lines for context rendering
  const fileLinesMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const flatten = (nodes: typeof files, parent: string[] = []) => {
      for (const node of nodes) {
        const path = [...parent, node.name];
        if (node.type === "folder") flatten(node.children ?? [], path);
        else map.set(path.join("/"), (node.content ?? "").split(/\r?\n/));
      }
    };
    flatten(files);
    return map;
  }, [files]);

  // Jump to file + line
  const handleJump = useCallback((match: SearchMatch) => {
    addTab(match.pathParts, match.pathParts[match.pathParts.length - 1]);
    setActiveTabPath(match.pathParts);
    // Emit a custom event that the Monaco editor can listen to for line navigation
    window.dispatchEvent(
      new CustomEvent("search:jump", {
        detail: { path: match.pathParts, line: match.lineNumber, column: match.startColumn },
      }),
    );
  }, [addTab, setActiveTabPath]);

  const totalMatches = matches.length;
  const isCapped = totalMatches >= MAX_DISPLAY_RESULTS;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Search input ── */}
      <div className="shrink-0 space-y-1.5 border-b border-border p-2">
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workspace…"
            aria-label="Search workspace"
            className="w-full rounded border border-border bg-background px-2 py-1.5 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <ToggleButton
            active={mode === "regex"}
            onClick={() => setMode((m) => (m === "regex" ? "text" : "regex"))}
            title="Regular expression"
          >
            .*
          </ToggleButton>
          <ToggleButton
            active={matchCase}
            onClick={() => setMatchCase((v) => !v)}
            title="Match case"
          >
            Aa
          </ToggleButton>
          <ToggleButton
            active={wholeWord}
            onClick={() => setWholeWord((v) => !v)}
            title="Whole word"
          >
            W
          </ToggleButton>

          {totalMatches > 0 && (
            <span className="ml-auto text-muted-foreground">
              {isCapped ? `${totalMatches}+ results` : `${totalMatches} result${totalMatches !== 1 ? "s" : ""}`}
            </span>
          )}
        </div>

        {regexError && (
          <p className="text-xs text-destructive" role="alert">
            {regexError}
          </p>
        )}
      </div>

      {/* ── Results ── */}
      <div className="flex-1 overflow-y-auto p-2" role="list" aria-label="Search results">
        {!debouncedQuery.trim() && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Type to search across all workspace files
          </p>
        )}

        {debouncedQuery.trim() && totalMatches === 0 && !regexError && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            No results for <strong>{debouncedQuery}</strong>
          </p>
        )}

        {grouped.map((group) => (
          <FileGroup
            key={group.fileId}
            group={group}
            fileLines={fileLinesMap.get(group.fileId) ?? []}
            query={debouncedQuery}
            mode={mode}
            matchCase={matchCase}
            onJump={handleJump}
          />
        ))}

        {isCapped && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Showing first {MAX_DISPLAY_RESULTS} results — refine your query to see more
          </p>
        )}
      </div>
    </div>
  );
}

// ── ToggleButton ──────────────────────────────────────────────────────────────

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded border px-1.5 py-0.5 font-mono text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-ring ${
        active
          ? "border-primary bg-primary/20 text-primary"
          : "border-border bg-background text-muted-foreground hover:border-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
