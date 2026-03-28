import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  History,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  Pencil,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { RevertModal } from "@/components/vcs/RevertModal";

import { FileNode } from "@/lib/sample-contracts";
import {
  useWorkspaceStore,
  flattenWorkspaceFiles,
} from "@/store/workspaceStore";
import { exportWorkspaceAsZip } from "@/utils/exportZip";
import { useCoverageStore } from "@/store/useCoverageStore";
import { useVCSStore } from "@/store/vcsStore";
import { type GitFileStatus } from "@/lib/vcs/gitService";

interface FileExplorerProps {
  onFileSelect?: (path: string[], file: FileNode) => void;
}

const pathKey = (path: string[]) => path.join("/");

type ExplorerNode = FileNode & {
  gitStatus?: GitFileStatus;
  deletedGhost?: boolean;
  children?: ExplorerNode[];
};

const inferLanguage = (name: string) => {
  if (name.endsWith(".rs")) return "rust";
  if (name.endsWith(".toml")) return "toml";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".ts") || name.endsWith(".tsx")) return "typescript";
  return "text";
};

const cloneExplorerNodes = (
  nodes: FileNode[],
  currentPath: string[],
  statusMap: Record<string, GitFileStatus>,
): ExplorerNode[] =>
  nodes.map((node) => {
    const fullPath = [...currentPath, node.name];
    const gitStatus = statusMap[pathKey(fullPath)];

    if (node.type === "folder") {
      return {
        ...node,
        gitStatus,
        children: cloneExplorerNodes(node.children ?? [], fullPath, statusMap),
      };
    }

    return {
      ...node,
      gitStatus,
    };
  });

const ensureFolderNode = (nodes: ExplorerNode[], name: string): ExplorerNode => {
  const existing = nodes.find((node) => node.name === name && node.type === "folder");
  if (existing && existing.type === "folder") {
    existing.children ??= [];
    return existing;
  }

  const created: ExplorerNode = {
    name,
    type: "folder",
    children: [],
  };
  nodes.push(created);
  return created;
};

const appendDeletedGhosts = (
  nodes: ExplorerNode[],
  statusMap: Record<string, GitFileStatus>,
) => {
  for (const [fullPath, status] of Object.entries(statusMap)) {
    if (status !== "deleted") {
      continue;
    }

    const parts = fullPath.split("/").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    let cursor = nodes;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const folder = ensureFolderNode(cursor, parts[index]);
      folder.children ??= [];
      cursor = folder.children;
    }

    const fileName = parts[parts.length - 1];
    if (!cursor.some((node) => node.name === fileName)) {
      cursor.push({
        name: fileName,
        type: "file",
        content: "",
        language: inferLanguage(fileName),
        gitStatus: "deleted",
        deletedGhost: true,
      });
    }
  }
};

const buildExplorerNodes = (
  files: FileNode[],
  statusMap: Record<string, GitFileStatus>,
): ExplorerNode[] => {
  const decorated = cloneExplorerNodes(files, [], statusMap);
  appendDeletedGhosts(decorated, statusMap);
  return decorated;
};

function GitStatusBadge({ status }: { status?: GitFileStatus }) {
  if (!status) {
    return null;
  }

  const label =
    status === "modified" ? "Modified" : status === "new" ? "New" : "Deleted";
  const short = status === "modified" ? "M" : status === "new" ? "N" : "D";
  const tone =
    status === "modified"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
      : status === "new"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : "border-rose-500/30 bg-rose-500/10 text-rose-400";

  return (
    <span
      className={`ml-auto shrink-0 rounded border px-1 text-[10px] font-semibold ${tone}`}
      title={label}
      aria-label={label.toLowerCase()}
    >
      {short}
    </span>
  );
}

interface TreeRowProps {
  node: ExplorerNode;
  depth: number;
  path: string[];
  activePath: string[];
  expanded: Set<string>;
  onToggleExpand: (key: string) => void;
  onSelect: (path: string[], file: FileNode) => void;
  onCreateFile: (parentPath: string[]) => void;
  onCreateFolder: (parentPath: string[]) => void;
  onRename: (path: string[]) => void;
  onDelete: (path: string[]) => void;
  /** Called when user picks "Revert to HEAD" from the context menu */
  onRevertToHead?: (path: string[], content: string | null) => void;
  /** Called when user picks "Revert to Version…" from the context menu */
  onRevertToVersion?: (path: string[], content: string | null) => void;
  /** Whether a local git repo is initialized */
  gitInitialized?: boolean;
  /** Coverage percentage for this file (undefined = no data) */
  coveragePct?: number;
}

function TreeRow({
  node,
  depth,
  path,
  activePath,
  expanded,
  onToggleExpand,
  onSelect,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  onRevertToHead,
  onRevertToVersion,
  gitInitialized,
  coveragePct,
}: TreeRowProps) {
  const currentPath = [...path, node.name];
  const key = pathKey(currentPath);
  const isFolder = node.type === "folder";
  const isOpen = expanded.has(key);
  const isActive = pathKey(activePath) === key;
  const isDeletedGhost = node.deletedGhost === true;
  const status = node.gitStatus;

  const canRevertToHead =
    gitInitialized &&
    !isFolder &&
    (status === "modified" || status === "deleted");

  const canRevertToVersion =
    gitInitialized && !isFolder;

  const rowContent = (
    <div
      className={`group flex items-center gap-1 py-1 pr-1 text-xs ${
        isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/40"
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
        {isFolder ? (
          <button
            type="button"
            onClick={() => onToggleExpand(key)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
            aria-label={isOpen ? "Collapse folder" : "Expand folder"}
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-5" />
        )}

        <button
          type="button"
          onClick={() => {
            if (!isDeletedGhost) {
              onSelect(currentPath, node);
            }
          }}
          className={`flex min-w-0 flex-1 items-center gap-1.5 text-left ${
            isDeletedGhost ? "cursor-default opacity-70" : ""
          }`}
          aria-disabled={isDeletedGhost}
        >
          {isFolder ? (
            isOpen ? <FolderOpen className="h-3.5 w-3.5 text-primary" /> : <Folder className="h-3.5 w-3.5 text-primary" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-warning" />
          )}
          <span className="truncate font-mono">{node.name}</span>
          {!isFolder && coveragePct !== undefined && (
            <span
              className={`ml-auto shrink-0 rounded px-1 text-[10px] font-semibold tabular-nums ${
                coveragePct >= 80
                  ? "bg-green-500/15 text-green-400"
                  : coveragePct >= 50
                  ? "bg-yellow-500/15 text-yellow-400"
                  : "bg-red-500/15 text-red-400"
              }`}
              title={`Coverage: ${coveragePct}%`}
            >
              {coveragePct}%
            </span>
          )}
          {!isFolder && <GitStatusBadge status={status} />}
        </button>

        {!isDeletedGhost && (
          <div className="hidden items-center gap-0.5 group-hover:flex">
            {isFolder && (
              <>
                <button
                  type="button"
                  onClick={() => onCreateFile(currentPath)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="New file"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onCreateFolder(currentPath)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="New folder"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => onRename(currentPath)}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(currentPath)}
              className="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
    </div>
  );

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          {canRevertToHead && (
            <ContextMenuItem
              onClick={() =>
                onRevertToHead?.(
                  currentPath,
                  node.type === "file" ? (node.content ?? null) : null,
                )
              }
              className="gap-2 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Revert to HEAD
            </ContextMenuItem>
          )}
          {canRevertToHead && canRevertToVersion && <ContextMenuSeparator />}
          {canRevertToVersion && (
            <ContextMenuItem
              onClick={() =>
                onRevertToVersion?.(
                  currentPath,
                  node.type === "file" ? (node.content ?? null) : null,
                )
              }
              className="gap-2 text-xs"
            >
              <History className="h-3.5 w-3.5" />
              Revert to Version…
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {isFolder && isOpen
        ? node.children?.map((child) => (
            <TreeRow
              key={`${key}/${child.name}`}
              node={child}
              depth={depth + 1}
              path={currentPath}
              activePath={activePath}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onRename={onRename}
              onDelete={onDelete}
              onRevertToHead={onRevertToHead}
              onRevertToVersion={onRevertToVersion}
              gitInitialized={gitInitialized}
              coveragePct={coveragePct}
            />
          ))
        : null}
    </div>
  );
}

export function FileExplorer({ onFileSelect }: FileExplorerProps) {
  const {
    files,
    activeTabPath,
    addTab,
    createFile,
    createFolder,
    deleteNode,
    renameNode,
    updateFileContent,
    setMobilePanel,
  } = useWorkspaceStore();

  const { summary: coverageSummary, getFileCoverage } = useCoverageStore();
  const {
    localRepoInitialized,
    localRepoInitializing,
    localRepoMessage,
    localRepoError,
    localStatusMap,
    initializeLocalRepo,
    refreshLocalStatuses,
    clearLocalRepoError,
  } = useVCSStore();

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const node of files) {
      if (node.type === "folder") {
        initial.add(node.name);
      }
    }
    return initial;
  });

  const workspaceFiles = useMemo(() => flattenWorkspaceFiles(files), [files]);
  const explorerNodes = useMemo(
    () => buildExplorerNodes(files, localStatusMap),
    [files, localStatusMap],
  );
  const rootKeys = useMemo(() => explorerNodes.map((n) => n.name), [explorerNodes]);

  useEffect(() => {
    if (!localRepoInitialized) {
      return;
    }

    const deletedFolderKeys = Object.entries(localStatusMap)
      .filter(([, status]) => status === "deleted")
      .flatMap(([fullPath]) =>
        fullPath
          .split("/")
          .slice(0, -1)
          .map((_, index, parts) => parts.slice(0, index + 1).join("/")),
      );

    if (deletedFolderKeys.length === 0) {
      return;
    }

    setExpanded((prev) => {
      const next = new Set(prev);
      for (const key of deletedFolderKeys) {
        next.add(key);
      }
      return next;
    });
  }, [localRepoInitialized, localStatusMap]);

  const onToggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelect = (path: string[], file: FileNode) => {
    if (file.type !== "file") {
      onToggleExpand(pathKey(path));
      return;
    }

    if (onFileSelect) {
      onFileSelect(path, file);
    } else {
      addTab(path, file.name);
      setMobilePanel("none");
    }
  };

  const requestName = (label: string) => {
    const value = window.prompt(label);
    return value?.trim() || "";
  };

  const handleCreateFile = (parentPath: string[]) => {
    const name = requestName("New file name");
    if (!name) return;
    createFile(parentPath, name);
  };

  const handleCreateFolder = (parentPath: string[]) => {
    const name = requestName("New folder name");
    if (!name) return;
    createFolder(parentPath, name);
    const key = pathKey([...parentPath, name]);
    setExpanded((prev) => new Set(prev).add(key));
  };

  const handleRename = (path: string[]) => {
    const current = path[path.length - 1];
    const name = window.prompt("Rename item", current)?.trim();
    if (!name || name === current) return;
    renameNode(path, name);
  };

  const handleDelete = (path: string[]) => {
    const label = path[path.length - 1];
    if (!window.confirm(`Delete ${label}?`)) return;
    deleteNode(path);
  };

  const handleInitializeRepo = () => {
    clearLocalRepoError();
    void initializeLocalRepo(workspaceFiles);
  };

  // ── Revert modal state ────────────────────────────────────────────────────

  const [revertModal, setRevertModal] = useState<{
    open: boolean;
    mode: "head" | "version";
    pathArray: string[];
    filePath: string;
    currentContent: string | null;
  }>({
    open: false,
    mode: "head",
    pathArray: [],
    filePath: "",
    currentContent: null,
  });

  const openRevert = (
    mode: "head" | "version",
    pathArray: string[],
    currentContent: string | null,
  ) => {
    setRevertModal({
      open: true,
      mode,
      pathArray,
      filePath: pathArray.join("/"),
      currentContent,
    });
  };

  const handleRevertConfirm = (restoredContent: string) => {
    const { pathArray, filePath } = revertModal;
    const isDeleted = localStatusMap[filePath] === "deleted";

    if (isDeleted) {
      const parentPath = pathArray.slice(0, -1);
      const filename = pathArray[pathArray.length - 1] ?? "";
      createFile(parentPath, filename, restoredContent);
    } else {
      updateFileContent(pathArray, restoredContent);
    }

    // Sync the updated workspace with git to refresh status badges
    void refreshLocalStatuses(
      flattenWorkspaceFiles(useWorkspaceStore.getState().files),
    );
  };

  return (
    <div id="tour-explorer" className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Explorer</span>
        <div className="flex items-center gap-1">
          {!localRepoInitialized ? (
            <button
              type="button"
              onClick={handleInitializeRepo}
              disabled={localRepoInitializing}
              className="inline-flex items-center gap-1 rounded border border-sidebar-border px-2 py-1 text-[10px] font-semibold normal-case tracking-normal text-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-70"
              aria-label="Initialize Git Repository"
            >
              {localRepoInitializing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <GitBranch className="h-3 w-3" />
              )}
              <span>Initialize Git Repository</span>
            </button>
          ) : (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold normal-case tracking-normal text-emerald-400">
              Git Ready
            </span>
          )}
          <button
            type="button"
            onClick={() => handleCreateFile([])}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="New file"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleCreateFolder([])}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="New folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              const projectName = files[0]?.name ?? "workspace";
              void exportWorkspaceAsZip(files, projectName);
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Export Project"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {(localRepoMessage || localRepoError) && (
        <div
          className={`border-b border-sidebar-border px-3 py-1.5 text-[10px] ${
            localRepoError ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {localRepoError ?? localRepoMessage}
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {explorerNodes.map((node) => (
          <TreeRow
            key={node.name}
            node={node}
            depth={0}
            path={[]}
            activePath={activeTabPath}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            onSelect={handleSelect}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onRename={handleRename}
            onDelete={handleDelete}
            onRevertToHead={(path, content) => openRevert("head", path, content)}
            onRevertToVersion={(path, content) => openRevert("version", path, content)}
            gitInitialized={localRepoInitialized}
            coveragePct={
              node.type === "file"
                ? (getFileCoverage(node.name)?.pct)
                : undefined
            }
          />
        ))}

        {rootKeys.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">No files in workspace.</p>
        ) : null}
      </div>

      {coverageSummary && (
        <div className="border-t border-sidebar-border px-3 py-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Coverage</span>
            <span
              className={`font-semibold tabular-nums ${
                coverageSummary.totalPct >= 80
                  ? "text-green-400"
                  : coverageSummary.totalPct >= 50
                  ? "text-yellow-400"
                  : "text-red-400"
              }`}
            >
              {coverageSummary.totalPct}%
            </span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                coverageSummary.totalPct >= 80
                  ? "bg-green-400"
                  : coverageSummary.totalPct >= 50
                  ? "bg-yellow-400"
                  : "bg-red-400"
              }`}
              style={{ width: `${coverageSummary.totalPct}%` }}
              role="progressbar"
              aria-valuenow={coverageSummary.totalPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Project coverage: ${coverageSummary.totalPct}%`}
            />
          </div>
        </div>
      )}

      <RevertModal
        open={revertModal.open}
        onClose={() => setRevertModal((prev) => ({ ...prev, open: false }))}
        pathArray={revertModal.pathArray}
        filePath={revertModal.filePath}
        currentContent={revertModal.currentContent}
        mode={revertModal.mode}
        onConfirm={handleRevertConfirm}
      />
    </div>
  );
}
