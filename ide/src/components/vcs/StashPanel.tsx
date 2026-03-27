/**
 * StashPanel.tsx
 *
 * Sidebar panel for managing Git stashes.
 * Renders inside GitPane below the CommitForm.
 *
 * Features:
 *  - Push stash with optional message
 *  - List all stash entries with timestamp + message
 *  - Apply (safe — keeps stash) or Pop (removes stash) per entry
 *  - Drop individual entries
 *  - Conflict-risk warning dialog before Pop when working tree is dirty
 */

import { useCallback, useEffect, useState } from "react";
import { useStashStore } from "@/store/useStashStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Layers,
  PackagePlus,
  PackageOpen,
  Trash2,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────

interface StatusBannerProps {
  message: string;
  kind: "success" | "error" | "warning";
  onDismiss: () => void;
}

function StatusBanner({ message, kind, onDismiss }: StatusBannerProps) {
  const colours = {
    success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    error: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  };
  const Icon =
    kind === "success"
      ? CheckCircle2
      : kind === "error"
      ? XCircle
      : AlertTriangle;

  return (
    <div
      className={`flex items-start gap-1.5 px-2 py-1.5 rounded border text-[10px] ${colours[kind]}`}
    >
      <Icon className="h-3 w-3 shrink-0 mt-0.5" />
      <span className="flex-1 leading-snug">{message}</span>
      <button
        onClick={onDismiss}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function StashPanel() {
  const {
    entries,
    operation,
    activeIndex,
    error,
    loadEntries,
    pushStash,
    applyStash,
    popStash,
    dropStash,
    clearError,
  } = useStashStore();

  const [expanded, setExpanded] = useState(true);
  const [stashMessage, setStashMessage] = useState("");
  const [banner, setBanner] = useState<{
    text: string;
    kind: "success" | "error" | "warning";
  } | null>(null);

  // Conflict-risk confirmation dialog state
  const [conflictDialog, setConflictDialog] = useState<{
    open: boolean;
    index: number;
    mode: "pop" | "apply";
  }>({ open: false, index: 0, mode: "pop" });

  // Load stash list on mount
  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Surface store errors as banners
  useEffect(() => {
    if (error) {
      setBanner({ text: error, kind: "error" });
      clearError();
    }
  }, [error, clearError]);

  const showBanner = useCallback(
    (text: string, kind: "success" | "error" | "warning") => {
      setBanner({ text, kind });
    },
    []
  );

  // ── Push ────────────────────────────────────────────────────────────────

  const handlePush = useCallback(async () => {
    const result = await pushStash(stashMessage || undefined);
    if (result.success) {
      setStashMessage("");
      showBanner(result.message, "success");
    } else {
      showBanner(result.message, "error");
    }
  }, [pushStash, stashMessage, showBanner]);

  // ── Apply ───────────────────────────────────────────────────────────────

  const handleApply = useCallback(
    async (index: number) => {
      const result = await applyStash(index);
      if (!result.success) {
        showBanner(result.message, "error");
        return;
      }
      if (result.hadConflictRisk) {
        showBanner(
          `Applied stash@{${index}} — working tree had uncommitted changes. Review your files carefully.`,
          "warning"
        );
      } else {
        showBanner(result.message, "success");
      }
    },
    [applyStash, showBanner]
  );

  // ── Pop (with conflict pre-check) ───────────────────────────────────────

  const handlePopRequest = useCallback(
    async (index: number) => {
      // Run a lightweight dirty-check before opening the dialog
      const { files } = await import("@/store/workspaceStore").then((m) =>
        m.useWorkspaceStore.getState()
      );
      const { flattenWorkspaceFiles } = await import("@/store/workspaceStore");
      const { stashService } = await import("@/lib/vcs/stashService");

      const workspaceFiles = Object.fromEntries(
        flattenWorkspaceFiles(files).map((f) => [f.path, f.content])
      );

      // Peek at dirty state without actually popping
      const peekResult = await stashService.apply(index, workspaceFiles);

      if (peekResult.hadConflictRisk) {
        // Show confirmation dialog
        setConflictDialog({ open: true, index, mode: "pop" });
      } else {
        await executePop(index);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [popStash]
  );

  const executePop = useCallback(
    async (index: number) => {
      const result = await popStash(index);
      if (!result.success) {
        showBanner(result.message, "error");
        return;
      }
      showBanner(result.message, "success");
    },
    [popStash, showBanner]
  );

  const handleConfirmPop = useCallback(async () => {
    setConflictDialog((d) => ({ ...d, open: false }));
    await executePop(conflictDialog.index);
  }, [conflictDialog.index, executePop]);

  // ── Drop ────────────────────────────────────────────────────────────────

  const handleDrop = useCallback(
    async (index: number) => {
      await dropStash(index);
      showBanner(`Dropped stash@{${index}}`, "success");
    },
    [dropStash, showBanner]
  );

  const isBusy = operation !== "idle";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="border-t border-sidebar-border">
      {/* Section header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={expanded}
        aria-controls="stash-panel-body"
      >
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5" />
          <span>Stash</span>
          {entries.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
              {entries.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>

      {expanded && (
        <div id="stash-panel-body" className="flex flex-col gap-2 px-3 pb-3">
          {/* Status banner */}
          {banner && (
            <StatusBanner
              message={banner.text}
              kind={banner.kind}
              onDismiss={() => setBanner(null)}
            />
          )}

          {/* Push row */}
          <div className="flex gap-1.5">
            <Input
              placeholder="Stash message (optional)"
              value={stashMessage}
              onChange={(e) => setStashMessage(e.target.value)}
              disabled={isBusy}
              className="h-7 text-xs flex-1"
              aria-label="Stash message"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isBusy) handlePush();
              }}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 shrink-0"
                  onClick={handlePush}
                  disabled={isBusy}
                  aria-label="Push stash"
                >
                  {operation === "pushing" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PackagePlus className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Stash changes
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Stash list */}
          {entries.length === 0 ? (
            <p className="text-center text-[10px] text-muted-foreground py-3">
              No stashes yet.
            </p>
          ) : (
            <ScrollArea className="max-h-56">
              <ul className="space-y-1" role="list" aria-label="Stash entries">
                {entries.map((entry) => {
                  const isActive = activeIndex === entry.index && isBusy;
                  return (
                    <li
                      key={entry.index}
                      className="group flex flex-col gap-0.5 rounded border border-sidebar-border bg-sidebar px-2 py-1.5 text-xs transition-colors hover:bg-muted/40"
                    >
                      {/* Entry header */}
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex flex-col min-w-0">
                          <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                            stash@{"{"}
                            {entry.index}
                            {"}"}
                          </span>
                          <span
                            className="truncate text-foreground leading-snug"
                            title={entry.message}
                          >
                            {entry.message}
                          </span>
                          <span className="text-[9px] text-muted-foreground/70 mt-0.5">
                            {formatTimestamp(entry.timestamp)} ·{" "}
                            {Object.keys(entry.files).length} file
                            {Object.keys(entry.files).length !== 1 ? "s" : ""}
                          </span>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Apply */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => handleApply(entry.index)}
                                disabled={isBusy}
                                aria-label={`Apply stash@{${entry.index}}`}
                              >
                                {isActive && operation === "applying" ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <PackageOpen className="h-3 w-3 text-blue-400" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Apply (keep stash)
                            </TooltipContent>
                          </Tooltip>

                          {/* Pop */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => handlePopRequest(entry.index)}
                                disabled={isBusy}
                                aria-label={`Pop stash@{${entry.index}}`}
                              >
                                {isActive && operation === "popping" ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <PackagePlus className="h-3 w-3 rotate-180 text-emerald-400" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Pop (apply &amp; remove)
                            </TooltipContent>
                          </Tooltip>

                          {/* Drop */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => handleDrop(entry.index)}
                                disabled={isBusy}
                                aria-label={`Drop stash@{${entry.index}}`}
                              >
                                {isActive && operation === "dropping" ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3 text-rose-400" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Drop (discard)
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      {/* File list preview */}
                      <ul className="mt-0.5 space-y-0.5 pl-1">
                        {Object.keys(entry.files)
                          .slice(0, 4)
                          .map((path) => (
                            <li
                              key={path}
                              className="truncate font-mono text-[9px] text-muted-foreground/70"
                              title={path}
                            >
                              {path}
                            </li>
                          ))}
                        {Object.keys(entry.files).length > 4 && (
                          <li className="text-[9px] text-muted-foreground/50">
                            +{Object.keys(entry.files).length - 4} more…
                          </li>
                        )}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </div>
      )}

      {/* Conflict-risk confirmation dialog */}
      <Dialog
        open={conflictDialog.open}
        onOpenChange={(open) =>
          setConflictDialog((d) => ({ ...d, open }))
        }
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Uncommitted Changes Detected
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Your working tree has uncommitted changes. Popping{" "}
              <span className="font-mono text-foreground">
                stash@{"{"}
                {conflictDialog.index}
                {"}"}
              </span>{" "}
              may overwrite them.
              <br />
              <br />
              Consider using <strong>Apply</strong> instead — it restores the
              stash without removing it, so you can review before committing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConflictDialog((d) => ({ ...d, open: false }))}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-blue-400 border-blue-400/30 hover:bg-blue-400/10"
              onClick={async () => {
                setConflictDialog((d) => ({ ...d, open: false }));
                await handleApply(conflictDialog.index);
              }}
            >
              <PackageOpen className="h-3.5 w-3.5 mr-1" />
              Apply Instead
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmPop}
            >
              Pop Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default StashPanel;
