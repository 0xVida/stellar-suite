import { memo, useCallback, useEffect, useState } from "react";
import {
  Plus,
  Minus,
  ChevronsUp,
  ChevronsDown,
  RefreshCw,
  Loader2,
  GitBranch,
  ChevronDown,
  ChevronRight,
  XCircle,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStagingStore } from "@/store/useStagingStore";
import { useVCSStore } from "@/store/vcsStore";
import type { StagedFile, StagingStatus } from "@/lib/vcs/stagingService";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ── Status badge ──────────────────────────────────────────────────────────

const STATUS_SYMBOL: Record<StagingStatus, string> = {
  modified: "M",
  untracked: "U",
  deleted: "D",
};

const STATUS_COLOUR: Record<StagingStatus, string> = {
  modified: "text-amber-400",
  untracked: "text-emerald-400",
  deleted: "text-rose-400",
};

const STATUS_LABEL: Record<StagingStatus, string> = {
  modified: "Modified",
  untracked: "Untracked",
  deleted: "Deleted",
};

interface StatusBadgeProps {
  status: StagingStatus;
}

const StatusBadge = memo(function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`shrink-0 w-4 text-center font-mono text-[10px] font-bold ${STATUS_COLOUR[status]}`}
          aria-label={STATUS_LABEL[status]}
        >
          {STATUS_SYMBOL[status]}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {STATUS_LABEL[status]}
      </TooltipContent>
    </Tooltip>
  );
});

// ── File row ──────────────────────────────────────────────────────────────

interface FileRowProps {
  file: StagedFile;
  actionIcon: React.ReactNode;
  actionLabel: string;
  onAction: (path: string) => void;
  isActive: boolean;
}

const FileRow = memo(function FileRow({
  file,
  actionIcon,
  actionLabel,
  onAction,
  isActive,
}: FileRowProps) {
  const handleAction = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onAction(file.path);
    },
    [file.path, onAction],
  );

  // Derive display name: show only the filename, full path on hover
  const parts = file.path.split("/");
  const filename = parts[parts.length - 1];
  const dir = parts.slice(0, -1).join("/");

  return (
    <div
      className="group flex items-center gap-1.5 px-3 py-1 text-xs hover:bg-muted/40 transition-colors"
      title={file.path}
    >
      <StatusBadge status={file.status} />

      <span className="flex-1 min-w-0 flex flex-col leading-tight">
        <span className="truncate font-mono text-foreground">{filename}</span>
        {dir && (
          <span className="truncate font-mono text-[9px] text-muted-foreground/60">
            {dir}
          </span>
        )}
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className={`h-5 w-5 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
              isActive ? "opacity-100" : ""
            }`}
            onClick={handleAction}
            disabled={isActive}
            aria-label={`${actionLabel} ${file.path}`}
          >
            {isActive ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              actionIcon
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          {actionLabel}
        </TooltipContent>
      </Tooltip>
    </div>
  );
});

// ── Section header ────────────────────────────────────────────────────────

interface SectionHeaderProps {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  bulkIcon: React.ReactNode;
  bulkLabel: string;
  onBulk: () => void;
  bulkDisabled: boolean;
}

function SectionHeader({
  label,
  count,
  expanded,
  onToggle,
  bulkIcon,
  bulkLabel,
  onBulk,
  bulkDisabled,
}: SectionHeaderProps) {
  return (
    <div className="flex items-center px-2 py-1 border-b border-sidebar-border/50 bg-sidebar">
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="flex flex-1 items-center justify-start gap-1.5 h-7 p-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-transparent"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span>{label}</span>
        {count > 0 && (
          <Badge
            variant="secondary"
            className="rounded-full px-1.5 py-0 text-[9px] font-bold h-4 min-w-[1.25rem] justify-center"
          >
            {count}
          </Badge>
        )}
      </Button>

      {count > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={onBulk}
              disabled={bulkDisabled}
              aria-label={bulkLabel}
            >
              {bulkIcon}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            {bulkLabel}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function SourceControl() {
  const {
    staged,
    unstaged,
    op,
    activePath,
    error,
    refresh,
    stageFile,
    unstageFile,
    stageAll,
    unstageAll,
    clearError,
  } = useStagingStore();

  const { localRepoInitialized } = useVCSStore();

  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);

  // Load on mount and whenever the repo becomes initialized
  useEffect(() => {
    if (localRepoInitialized) {
      refresh();
    }
  }, [localRepoInitialized, refresh]);

  const isBusy = op !== "idle";

  // ── Not initialized ──────────────────────────────────────────────────

  if (!localRepoInitialized) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-10 text-center gap-2">
        <GitBranch className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">
          Initialize a local Git repository from the Explorer to use staging.
        </p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-sidebar-border shrink-0">
        <span className="text-[10px] text-muted-foreground">
          {staged.length} staged · {unstaged.length} unstaged
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={refresh}
              disabled={isBusy}
              aria-label="Refresh staging status"
            >
              {op === "loading" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            Refresh
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mt-2">
          <Alert variant="destructive" className="py-2 px-3 relative">
            <XCircle className="h-3 w-3" />
            <AlertDescription className="text-[10px] leading-snug pr-4">
              {error}
            </AlertDescription>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 absolute top-2 right-1.5 opacity-60 hover:opacity-100"
              onClick={clearError}
              aria-label="Dismiss error"
            >
              ×
            </Button>
          </Alert>
        </div>
      )}

      <ScrollArea className="flex-1">
        {/* ── Staged Changes ─────────────────────────────────────────── */}
        <SectionHeader
          label="Staged Changes"
          count={staged.length}
          expanded={stagedExpanded}
          onToggle={() => setStagedExpanded((v) => !v)}
          bulkIcon={<ChevronsDown className="h-3 w-3" />}
          bulkLabel="Unstage all"
          onBulk={unstageAll}
          bulkDisabled={isBusy}
        />

        {stagedExpanded && (
          <div className="pb-1">
            {staged.length === 0 ? (
              <p className="px-3 py-2 text-[10px] text-muted-foreground/60 italic">
                Nothing staged.
              </p>
            ) : (
              staged.map((file) => (
                <FileRow
                  key={`staged-${file.path}`}
                  file={file}
                  actionIcon={<Minus className="h-3 w-3 text-rose-400" />}
                  actionLabel="Unstage"
                  onAction={unstageFile}
                  isActive={activePath === file.path && op === "unstaging"}
                />
              ))
            )}
          </div>
        )}

        {/* ── Changes (unstaged) ─────────────────────────────────────── */}
        <SectionHeader
          label="Changes"
          count={unstaged.length}
          expanded={changesExpanded}
          onToggle={() => setChangesExpanded((v) => !v)}
          bulkIcon={<ChevronsUp className="h-3 w-3" />}
          bulkLabel="Stage all"
          onBulk={stageAll}
          bulkDisabled={isBusy}
        />

        {changesExpanded && (
          <div className="pb-1">
            {unstaged.length === 0 ? (
              <p className="px-3 py-2 text-[10px] text-muted-foreground/60 italic">
                No unstaged changes.
              </p>
            ) : (
              unstaged.map((file) => (
                <FileRow
                  key={`unstaged-${file.path}`}
                  file={file}
                  actionIcon={<Plus className="h-3 w-3 text-emerald-400" />}
                  actionLabel="Stage"
                  onAction={stageFile}
                  isActive={activePath === file.path && op === "staging"}
                />
              ))
            )}
          </div>
        )}

        {/* Clean state */}
        {staged.length === 0 && unstaged.length === 0 && op === "idle" && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-2">
            <GitBranch className="h-7 w-7 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              Working tree clean.
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default SourceControl;
