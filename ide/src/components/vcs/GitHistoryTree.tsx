/**
 * GitHistoryTree.tsx
 *
 * SVG-based git commit history tree rendered inside the VCS sidebar.
 * - Loads up to 50 commits via historyService
 * - Calculates branch lane positions via treeCalculator
 * - Renders <circle> nodes and <path> connectors, memoised for perf
 * - Clicking a node opens CommitDetail
 */

"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GitCommit, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { fetchHistory, type CommitNode } from "@/lib/vcs/historyService";
import {
  calculatePositions,
  svgWidth,
  svgHeight,
  ROW_HEIGHT,
  NODE_RADIUS,
  type PositionedCommit,
  type Connector,
} from "@/lib/vcs/treeCalculator";
import { CommitDetail } from "./CommitDetail";

// ── Memoised SVG sub-components ───────────────────────────────────────────

interface ConnectorLineProps {
  connector: Connector;
}

const ConnectorLine = memo(function ConnectorLine({
  connector: { x1, y1, x2, y2, colour },
}: ConnectorLineProps) {
  // Cubic bezier: vertical drop then horizontal slide
  const midY = (y1 + y2) / 2;
  const d =
    x1 === x2
      ? `M ${x1} ${y1} L ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

  return (
    <path
      d={d}
      stroke={colour}
      strokeWidth={1.5}
      fill="none"
      strokeOpacity={0.7}
    />
  );
});

interface CommitCircleProps {
  commit: PositionedCommit;
  isSelected: boolean;
  onClick: (commit: PositionedCommit) => void;
}

const CommitCircle = memo(function CommitCircle({
  commit,
  isSelected,
  onClick,
}: CommitCircleProps) {
  const handleClick = useCallback(() => onClick(commit), [commit, onClick]);

  return (
    <g
      onClick={handleClick}
      style={{ cursor: "pointer" }}
      role="button"
      aria-label={`Commit ${commit.shortOid}: ${commit.subject}`}
    >
      {/* Outer ring when selected */}
      {isSelected && (
        <circle
          cx={commit.x}
          cy={commit.y}
          r={NODE_RADIUS + 3}
          fill="none"
          stroke={commit.colour}
          strokeWidth={1.5}
          strokeOpacity={0.5}
        />
      )}
      <circle
        cx={commit.x}
        cy={commit.y}
        r={NODE_RADIUS}
        fill={isSelected ? commit.colour : "hsl(var(--sidebar))"}
        stroke={commit.colour}
        strokeWidth={2}
      />
    </g>
  );
});

interface CommitRowLabelProps {
  commit: PositionedCommit;
  labelX: number;
  isSelected: boolean;
  onClick: (commit: PositionedCommit) => void;
}

const CommitRowLabel = memo(function CommitRowLabel({
  commit,
  labelX,
  isSelected,
  onClick,
}: CommitRowLabelProps) {
  const handleClick = useCallback(() => onClick(commit), [commit, onClick]);

  return (
    <g onClick={handleClick} style={{ cursor: "pointer" }}>
      {/* Hover / selected highlight row */}
      <rect
        x={0}
        y={commit.y - ROW_HEIGHT / 2}
        width="100%"
        height={ROW_HEIGHT}
        fill={isSelected ? "hsl(var(--muted))" : "transparent"}
        className="hover:fill-muted/40 transition-colors"
      />
      {/* Short SHA */}
      <text
        x={labelX}
        y={commit.y + 1}
        dominantBaseline="middle"
        fontSize={9}
        fontFamily="'JetBrains Mono', monospace"
        fill={commit.colour}
        opacity={0.9}
      >
        {commit.shortOid}
      </text>
      {/* Subject */}
      <foreignObject
        x={labelX + 44}
        y={commit.y - ROW_HEIGHT / 2}
        width={180}
        height={ROW_HEIGHT}
      >
        <div xmlns="http://www.w3.org/1999/xhtml"
          style={{
            display: "flex",
            alignItems: "center",
            height: "100%",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontFamily: "Inter, sans-serif",
              color: isSelected
                ? "hsl(var(--foreground))"
                : "hsl(var(--muted-foreground))",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 176,
            }}
            title={commit.subject}
          >
            {commit.subject}
          </span>
        </div>
      </foreignObject>
    </g>
  );
});

// ── Main component ────────────────────────────────────────────────────────

export function GitHistoryTree() {
  const [commits, setCommits] = useState<CommitNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PositionedCommit | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHistory();
      setCommits(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load commit history."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const positioned = useMemo(() => calculatePositions(commits), [commits]);

  const treeW = useMemo(() => svgWidth(positioned), [positioned]);
  const treeH = useMemo(() => svgHeight(positioned.length), [positioned]);

  // Label column starts after the widest lane
  const labelX = treeW + 4;
  // Total SVG width = tree lanes + label area
  const totalW = labelX + 240;

  const handleNodeClick = useCallback((commit: PositionedCommit) => {
    setSelected((prev) =>
      prev?.oid === commit.oid ? null : commit
    );
  }, []);

  const handleCloseDetail = useCallback(() => setSelected(null), []);

  // ── Empty / loading / error states ──────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-xs">Loading history…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-8 gap-3 text-center">
        <AlertCircle className="h-6 w-6 text-rose-400" />
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={load}>
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-10 text-center gap-2">
        <GitCommit className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">
          No commits yet. Initialize a local repository first.
        </p>
      </div>
    );
  }

  // ── Tree render ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-sidebar-border shrink-0">
        <span className="text-[10px] text-muted-foreground">
          {commits.length} commit{commits.length !== 1 ? "s" : ""}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={load}
          aria-label="Refresh history"
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {/* SVG tree — scrollable */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <svg
          width={totalW}
          height={treeH}
          style={{ display: "block", minWidth: totalW }}
          aria-label="Git commit history tree"
          role="img"
        >
          {/* Connectors (drawn first, behind circles) */}
          {positioned.map((commit) =>
            commit.connectors.map((conn, ci) => (
              <ConnectorLine
                key={`${commit.oid}-conn-${ci}`}
                connector={conn}
              />
            ))
          )}

          {/* Row labels (hover rects + text) */}
          {positioned.map((commit) => (
            <CommitRowLabel
              key={`${commit.oid}-label`}
              commit={commit}
              labelX={labelX}
              isSelected={selected?.oid === commit.oid}
              onClick={handleNodeClick}
            />
          ))}

          {/* Commit circles (drawn on top) */}
          {positioned.map((commit) => (
            <CommitCircle
              key={`${commit.oid}-circle`}
              commit={commit}
              isSelected={selected?.oid === commit.oid}
              onClick={handleNodeClick}
            />
          ))}
        </svg>
      </ScrollArea>

      {/* Detail panel — slides in below the tree */}
      {selected && (
        <CommitDetail commit={selected} onClose={handleCloseDetail} />
      )}
    </div>
  );
}

export default GitHistoryTree;
