import { useWorkspaceStore } from "@/store/workspaceStore";
import { FileText, GitBranch, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommitForm } from "@/components/vcs/CommitForm";
import { StashPanel } from "@/components/vcs/StashPanel";
import { useVCSStore } from "@/store/vcsStore";
import { type GitFileStatus } from "@/lib/vcs/gitService";

const statusLabel: Record<GitFileStatus, string> = {
  modified: "Modified",
  new: "New",
  deleted: "Deleted",
};

const statusTone: Record<GitFileStatus, string> = {
  modified: "text-amber-400",
  new: "text-emerald-400",
  deleted: "text-rose-400",
};

export function GitPane() {
  const { unsavedFiles, setDiffViewPath } = useWorkspaceStore();
  const { localRepoInitialized, localStatusMap } = useVCSStore();

  const handleDoubleClick = (pathStr: string, status?: GitFileStatus) => {
    if (status === "deleted") {
      return;
    }

    const path = pathStr.split("/");
    setDiffViewPath(path);
  };

  const modifiedFiles = localRepoInitialized
    ? Object.entries(localStatusMap).sort((a, b) => a[0].localeCompare(b[0]))
    : Array.from(unsavedFiles).sort().map((path) => [path, "modified" as GitFileStatus]);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          <span>Source Control</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {!localRepoInitialized ? (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <GitBranch className="mb-2 h-10 w-10 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                Initialize a local Git repository from the Explorer to track file status in IndexedDB.
              </p>
            </div>
          ) : modifiedFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <GitBranch className="h-10 w-10 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No local changes found.</p>
            </div>
          ) : (
            <>
              <div className="px-3 mb-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Changes</span>
              </div>
              <div className="space-y-0.5">
                {modifiedFiles.map(([pathStr, status]) => (
                  <button
                    key={pathStr}
                    onDoubleClick={() => handleDoubleClick(pathStr, status)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted/50 group transition-colors"
                  >
                    <FileText className={`h-3.5 w-3.5 shrink-0 ${statusTone[status]}`} />
                    <span className="truncate flex-1 text-left font-mono">{pathStr}</span>
                    <span
                      className={`text-[10px] font-semibold opacity-0 transition-opacity group-hover:opacity-100 ${statusTone[status]}`}
                    >
                      {statusLabel[status]}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {localRepoInitialized && modifiedFiles.length > 0 && (
        <div className="px-3 pb-1">
          <div className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-500">
            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
            <p>Double-click a modified or new file to view diff with HEAD.</p>
          </div>
        </div>
      )}

      <CommitForm />
      <StashPanel />
    </div>
  );
}
