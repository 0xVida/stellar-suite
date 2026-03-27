import { useState } from "react";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { FileText, GitBranch, AlertCircle, ShieldOff, Globe } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommitForm } from "@/components/vcs/CommitForm";
import { GitIgnoreEditor } from "@/components/vcs/GitIgnoreEditor";
import { RemoteManager } from "@/components/vcs/RemoteManager";
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

type GitPaneTab = "changes" | "gitignore" | "remotes";

const TABS: { id: GitPaneTab; label: string; icon: React.ReactNode }[] = [
  { id: "changes", label: "Changes", icon: <GitBranch className="h-3 w-3" /> },
  { id: "gitignore", label: ".gitignore", icon: <ShieldOff className="h-3 w-3" /> },
  { id: "remotes", label: "Remotes", icon: <Globe className="h-3 w-3" /> },
];

export function GitPane() {
  const [activeTab, setActiveTab] = useState<GitPaneTab>("changes");
  const { unsavedFiles, setDiffViewPath } = useWorkspaceStore();
  const { localRepoInitialized, localStatusMap } = useVCSStore();

  const handleDoubleClick = (pathStr: string, status?: GitFileStatus) => {
    if (status === "deleted") return;
    setDiffViewPath(pathStr.split("/"));
  };

  const modifiedFiles: [string, GitFileStatus][] = localRepoInitialized
    ? (Object.entries(localStatusMap) as [string, GitFileStatus][]).sort((a, b) =>
        a[0].localeCompare(b[0])
      )
    : Array.from(unsavedFiles as Set<string>)
        .sort()
        .map((path): [string, GitFileStatus] => [path, "modified"]);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <GitBranch className="h-4 w-4" />
        <span>Source Control</span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-sidebar-border text-xs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-1 py-2 transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-primary text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-selected={activeTab === tab.id}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "gitignore" && <GitIgnoreEditor />}
      {activeTab === "remotes" && <RemoteManager />}
      {activeTab === "changes" && (
        <>
          <ScrollArea className="flex-1">
            <div className="py-2">
              {!localRepoInitialized ? (
                <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                  <GitBranch className="mb-2 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">
                    Initialize a local Git repository from the Explorer to track file
                    status in IndexedDB.
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
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                      Changes
                    </span>
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
        </>
      )}
    </div>
  );
}
