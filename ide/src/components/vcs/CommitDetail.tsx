import { memo } from "react";
import { X, FileText, FilePlus, FileMinus, GitCommit } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CommitNode } from "@/lib/vcs/historyService";

interface CommitDetailProps {
  commit: CommitNode;
  onClose: () => void;
}

const fileStatusIcon = {
  added: <FilePlus className="h-3 w-3 text-emerald-400 shrink-0" />,
  modified: <FileText className="h-3 w-3 text-amber-400  shrink-0" />,
  deleted: <FileMinus className="h-3 w-3 text-rose-400   shrink-0" />,
};

const fileStatusColour = {
  added: "text-emerald-400",
  modified: "text-amber-400",
  deleted: "text-rose-400",
};

export const CommitDetail = memo(function CommitDetail({
  commit,
  onClose,
}: CommitDetailProps) {
  return (
    <div className="flex flex-col border-t border-sidebar-border bg-sidebar text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-sidebar-border">
        <div className="flex items-center gap-1.5 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
          <GitCommit className="h-3.5 w-3.5" />
          <span>Commit Detail</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          aria-label="Close commit detail"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="max-h-64">
        <div className="px-3 py-2 space-y-3">
          {/* Subject */}
          <p className="font-medium text-foreground leading-snug">
            {commit.subject}
          </p>

          {/* Meta */}
          <div className="space-y-1">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-14 shrink-0 font-bold uppercase text-[9px]">
                SHA
              </span>
              <Badge
                variant="secondary"
                className="font-mono text-[9px] h-4 py-0 px-1 truncate"
                title={commit.oid}
              >
                {commit.oid}
              </Badge>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-14 shrink-0 font-bold uppercase text-[9px]">
                Author
              </span>
              <span className="text-foreground truncate">{commit.author}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-14 shrink-0 font-bold uppercase text-[9px]">
                Date
              </span>
              <span className="text-foreground">{commit.date}</span>
            </div>
            {commit.parents.length > 0 && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-14 shrink-0 font-bold uppercase text-[9px]">
                  {commit.parents.length > 1 ? "Parents" : "Parent"}
                </span>
                <div className="font-mono text-[9px] text-foreground space-y-0.5">
                  {commit.parents.map((p) => (
                    <div key={p} className="truncate" title={p}>
                      {p.slice(0, 7)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Changed files */}
          {commit.changedFiles.length > 0 ? (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Changed files ({commit.changedFiles.length})
              </p>
              <ul className="space-y-0.5">
                {commit.changedFiles.map((f) => (
                  <li
                    key={f.path}
                    className="flex items-center gap-1.5"
                    title={f.path}
                  >
                    {fileStatusIcon[f.status]}
                    <span
                      className={`font-mono text-[10px] truncate ${fileStatusColour[f.status]}`}
                    >
                      {f.path}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/60 italic">
              No file changes recorded.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});
