"use client";

/**
 * RevertModal.tsx
 *
 * Confirmation modal for reverting a single file to either:
 *  - HEAD  ("Revert to HEAD")
 *  - Any prior committed version  ("Revert to Version…")
 *
 * Flow for "head"   mode: load diff → show diff → confirm
 * Flow for "version" mode: pick commit → load diff → show diff → confirm
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Loader2, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  type DiffLine,
  type RevertTarget,
  buildContextualDiff,
  computeDiff,
  fetchCommitsForFile,
  getHeadCommit,
  readFileAtCommit,
} from "@/lib/vcs/revertUtility";

// ── Props ──────────────────────────────────────────────────────────────────

export interface RevertModalProps {
  open: boolean;
  onClose: () => void;
  /** Path parts, e.g. ["src", "lib.rs"] */
  pathArray: string[];
  /** Joined filepath, e.g. "src/lib.rs" */
  filePath: string;
  /** Current file content in the workspace (null = file was deleted) */
  currentContent: string | null;
  /** What kind of revert to perform */
  mode: "head" | "version";
  /** Called with the restored content once the user confirms */
  onConfirm: (restoredContent: string) => void;
}

// ── Internal step type ─────────────────────────────────────────────────────

type Step =
  | { name: "loading" }
  | { name: "pick-commit"; commits: RevertTarget[] }
  | { name: "show-diff"; target: RevertTarget; diff: DiffLine[]; restoredContent: string }
  | { name: "error"; message: string };

// ── Diff display ───────────────────────────────────────────────────────────

function DiffView({ diff }: { diff: DiffLine[] }) {
  if (diff.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        No changes detected — file is already at this version.
      </p>
    );
  }

  return (
    <div className="overflow-auto rounded border border-border bg-editor-bg font-mono text-xs">
      {diff.map((line, idx) => {
        const isGap = line.type === "unchanged" && line.content === "···";
        const bg = isGap
          ? "bg-transparent"
          : line.type === "removed"
          ? "bg-rose-500/15"
          : line.type === "added"
          ? "bg-emerald-500/15"
          : "bg-transparent";
        const prefix = isGap ? "   " : line.type === "removed" ? "−  " : line.type === "added" ? "+  " : "   ";
        const textColor = isGap
          ? "text-muted-foreground"
          : line.type === "removed"
          ? "text-rose-400"
          : line.type === "added"
          ? "text-emerald-400"
          : "text-foreground";

        return (
          <div
            key={idx}
            className={`flex whitespace-pre px-2 py-0.5 leading-relaxed ${bg} ${textColor} ${isGap ? "border-y border-border/40" : ""}`}
          >
            <span className="mr-2 select-none text-muted-foreground/60">{prefix}</span>
            <span className="min-w-0">{isGap ? "···" : line.content}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Commit picker ──────────────────────────────────────────────────────────

function CommitPicker({
  commits,
  onSelect,
}: {
  commits: RevertTarget[];
  onSelect: (commit: RevertTarget) => void;
}) {
  if (commits.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        No commits found for this file.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-auto rounded border border-border">
      {commits.map((commit) => (
        <li key={commit.oid}>
          <button
            type="button"
            onClick={() => onSelect(commit)}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/60"
          >
            <span className="shrink-0 font-mono text-primary">{commit.shortOid}</span>
            <span className="min-w-0 flex-1 truncate text-foreground">{commit.message}</span>
            <span className="shrink-0 text-muted-foreground">{commit.author}</span>
            <span className="shrink-0 text-muted-foreground">{commit.date}</span>
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────

export function RevertModal({
  open,
  onClose,
  pathArray,
  filePath,
  currentContent,
  mode,
  onConfirm,
}: RevertModalProps) {
  const [step, setStep] = useState<Step>({ name: "loading" });

  // Reset and load when modal opens
  useEffect(() => {
    if (!open) return;

    setStep({ name: "loading" });

    void (async () => {
      try {
        if (mode === "head") {
          const head = await getHeadCommit();
          if (!head) {
            setStep({ name: "error", message: "No commits found in the repository." });
            return;
          }
          await loadDiff(head);
        } else {
          const commits = await fetchCommitsForFile(filePath);
          setStep({ name: "pick-commit", commits });
        }
      } catch (err) {
        setStep({
          name: "error",
          message: err instanceof Error ? err.message : "Failed to load commit data.",
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, filePath]);

  const loadDiff = async (target: RevertTarget) => {
    setStep({ name: "loading" });
    try {
      const restoredContent = await readFileAtCommit(filePath, target.oid);

      if (restoredContent === null && currentContent === null) {
        setStep({ name: "error", message: "File not found at this commit." });
        return;
      }

      const from = currentContent ?? "";
      const to = restoredContent ?? "";
      const rawDiff = computeDiff(from, to);
      const diff = buildContextualDiff(rawDiff);

      setStep({
        name: "show-diff",
        target,
        diff,
        restoredContent: to,
      });
    } catch (err) {
      setStep({
        name: "error",
        message: err instanceof Error ? err.message : "Failed to compute diff.",
      });
    }
  };

  const filename = pathArray[pathArray.length - 1] ?? filePath;

  const title =
    step.name === "pick-commit"
      ? `Revert to Version — ${filename}`
      : step.name === "show-diff"
      ? `Revert to ${step.target.shortOid} — ${filename}`
      : `Revert — ${filename}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <RotateCcw className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          <p className="text-xs text-muted-foreground font-mono">{filePath}</p>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-auto px-4 py-3">
          {step.name === "loading" && (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}

          {step.name === "error" && (
            <div className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {step.message}
            </div>
          )}

          {step.name === "pick-commit" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Select the commit you want to restore this file to:
              </p>
              <CommitPicker
                commits={step.commits}
                onSelect={(commit) => void loadDiff(commit)}
              />
            </div>
          )}

          {step.name === "show-diff" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded border border-border bg-secondary/50 px-3 py-2 text-xs">
                <span className="font-mono text-primary">{step.target.shortOid}</span>
                <span className="flex-1 truncate text-foreground">{step.target.message}</span>
                <span className="text-muted-foreground">{step.target.author}</span>
                <span className="text-muted-foreground">{step.target.date}</span>
              </div>

              <div className="flex gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500/40" />
                  Current (will be removed)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/40" />
                  Restored (will be added)
                </span>
              </div>

              <DiffView diff={step.diff} />

              <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                This will overwrite your current local changes. This action cannot be undone.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-border px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {step.name === "show-diff" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                onConfirm(step.restoredContent);
                onClose();
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Confirm Revert
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
