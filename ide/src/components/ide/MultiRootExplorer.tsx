import { useState, useCallback, useRef, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
  Trash2,
  Pencil,
  GripVertical,
  FolderInput,
  X,
} from "lucide-react";
import { FileNode } from "@/lib/sample-contracts";
import {
  useMultiRootStore,
  TRASH_RETENTION_DAYS,
  type WorkspaceRoot,
} from "@/store/useMultiRootStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pathKey = (path: string[]) => path.join("/");

const cloneFiles = (files: FileNode[]): FileNode[] =>
  JSON.parse(JSON.stringify(files));

const findNode = (nodes: FileNode[], parts: string[]): FileNode | null => {
  for (const node of nodes) {
    if (node.name === parts[0]) {
      if (parts.length === 1) return node;
      if (node.children) return findNode(node.children, parts.slice(1));
    }
  }
  return null;
};

const findParent = (nodes: FileNode[], parts: string[]): FileNode[] | null => {
  if (parts.length <= 1) return nodes;
  const parent = findNode(nodes, parts.slice(0, -1));
  return parent?.children ?? null;
};

// ---------------------------------------------------------------------------
// TreeRow (reused per root)
// ---------------------------------------------------------------------------

interface TreeRowProps {
  node: FileNode;
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
}: TreeRowProps) {
  const currentPath = [...path, node.name];
  const key = pathKey(currentPath);
  const isFolder = node.type === "folder";
  const isOpen = expanded.has(key);
  const isActive = pathKey(activePath) === key;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 py-1 pr-1 text-xs ${
          isActive
            ? "bg-primary/10 text-primary"
            : "text-foreground hover:bg-muted/40"
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
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}

        <button
          type="button"
          onClick={() => onSelect(currentPath, node)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {isFolder ? (
            isOpen ? (
              <FolderOpen className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-primary" />
            )
          ) : (
            <FileText className="h-3.5 w-3.5 text-warning" />
          )}
          <span className="truncate font-mono">{node.name}</span>
        </button>

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
      </div>

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
            />
          ))
        : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RootSection — one collapsible root folder
// ---------------------------------------------------------------------------

interface RootSectionProps {
  root: WorkspaceRoot;
  index: number;
  totalRoots: number;
  activePath: string[];
  onFileSelect: (rootId: string, path: string[], file: FileNode) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: () => void;
  isDragTarget: boolean;
}

function RootSection({
  root,
  index,
  activePath,
  onFileSelect,
  onDragStart,
  onDragOver,
  onDrop,
  isDragTarget,
}: RootSectionProps) {
  const { removeRoot, setRootFiles, renameRoot } = useMultiRootStore();
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    root.files.forEach((n) => {
      if (n.type === "folder") s.add(n.name);
    });
    return s;
  });
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(root.name);

  const onToggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const mutateFiles = useCallback(
    (fn: (files: FileNode[]) => void) => {
      const next = cloneFiles(root.files);
      fn(next);
      setRootFiles(root.id, next);
    },
    [root.id, root.files, setRootFiles]
  );

  const handleSelect = (path: string[], file: FileNode) => {
    if (file.type === "folder") {
      onToggleExpand(pathKey(path));
      return;
    }
    onFileSelect(root.id, path, file);
  };

  const handleCreateFile = (parentPath: string[]) => {
    const name = window.prompt("New file name")?.trim();
    if (!name) return;
    mutateFiles((files) => {
      const parent =
        parentPath.length === 0
          ? files
          : findNode(files, parentPath)?.children;
      if (parent) {
        parent.push({
          name,
          type: "file",
          language: name.endsWith(".rs")
            ? "rust"
            : name.endsWith(".toml")
            ? "toml"
            : "text",
          content: "",
        });
      }
    });
  };

  const handleCreateFolder = (parentPath: string[]) => {
    const name = window.prompt("New folder name")?.trim();
    if (!name) return;
    mutateFiles((files) => {
      const parent =
        parentPath.length === 0
          ? files
          : findNode(files, parentPath)?.children;
      if (parent) {
        parent.push({ name, type: "folder", children: [] });
        setExpanded((prev) =>
          new Set(prev).add(pathKey([...parentPath, name]))
        );
      }
    });
  };

  const handleRename = (path: string[]) => {
    const current = path[path.length - 1];
    const name = window.prompt("Rename", current)?.trim();
    if (!name || name === current) return;
    mutateFiles((files) => {
      const node = findNode(files, path);
      if (node) node.name = name;
    });
  };

  const handleDelete = (path: string[]) => {
    const label = path[path.length - 1];
    if (!window.confirm(`Delete ${label}?`)) return;
    mutateFiles((files) => {
      const parent = findParent(files, path);
      if (parent) {
        const idx = parent.findIndex((n) => n.name === path[path.length - 1]);
        if (idx !== -1) parent.splice(idx, 1);
      }
    });
  };

  const handleRemoveRoot = () => {
    if (!window.confirm(`Move project "${root.name}" to Trash?`)) return;
    removeRoot(root.id);
  };

  const commitRename = () => {
    renameRoot(root.id, renameValue);
    setRenaming(false);
  };

  return (
    <div
      className={`border-b border-sidebar-border ${
        isDragTarget ? "ring-1 ring-primary/50 ring-inset" : ""
      }`}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={onDrop}
    >
      {/* Root header */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-muted/30 group">
        <GripVertical
          className="h-3.5 w-3.5 text-muted-foreground/40 cursor-grab shrink-0"
          aria-label="Drag to reorder"
        />
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          aria-label={collapsed ? "Expand project" : "Collapse project"}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        {renaming ? (
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="h-5 text-xs flex-1 font-semibold px-1"
            autoFocus
            aria-label="Rename project"
          />
        ) : (
          <span
            className="flex-1 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer"
            onDoubleClick={() => {
              setRenameValue(root.name);
              setRenaming(true);
            }}
            title="Double-click to rename"
          >
            {root.name}
          </span>
        )}

        <div className="hidden items-center gap-0.5 group-hover:flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handleCreateFile([])}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="New file in root"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">New file</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handleCreateFolder([])}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="New folder in root"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">New folder</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleRemoveRoot}
                className="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                aria-label={`Remove ${root.name} from workspace`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Remove from workspace</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* File tree */}
      {!collapsed && (
        <div className="py-0.5">
          {root.files.length === 0 ? (
            <p className="px-4 py-2 text-xs text-muted-foreground">Empty project.</p>
          ) : (
            root.files.map((node) => (
              <TreeRow
                key={node.name}
                node={node}
                depth={0}
                path={[]}
                activePath={activePath}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
                onSelect={handleSelect}
                onCreateFile={handleCreateFile}
                onCreateFolder={handleCreateFolder}
                onRename={handleRename}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MultiRootExplorer — main export
// ---------------------------------------------------------------------------

export function MultiRootExplorer() {
  const {
    roots,
    trash,
    addRoot,
    reorderRoots,
    restoreRoot,
    permanentlyDeleteRoot,
    purgeExpiredTrash,
  } = useMultiRootStore();
  const { addTab, setMobilePanel } = useWorkspaceStore();

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [activeView, setActiveView] = useState<"active" | "trash">("active");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    purgeExpiredTrash();
  }, [purgeExpiredTrash]);

  const handleFileSelect = useCallback(
    (_rootId: string, path: string[], file: FileNode) => {
      addTab(path, file.name);
      setMobilePanel("none");
    },
    [addTab, setMobilePanel]
  );

  const handleDrop = () => {
    if (dragFrom !== null && dragOver !== null && dragFrom !== dragOver) {
      reorderRoots(dragFrom, dragOver);
    }
    setDragFrom(null);
    setDragOver(null);
  };

  const handleAddFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    addRoot(name);
    setNewFolderName("");
    setAddingFolder(false);
  };

  const getDaysRemaining = (deletedAt: string) => {
    const ageMs = Date.now() - new Date(deletedAt).getTime();
    const retentionMs = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(ageMs)) return 0;
    return Math.max(0, Math.ceil((retentionMs - ageMs) / (24 * 60 * 60 * 1000)));
  };

  const handlePermanentDelete = (id: string, name: string) => {
    if (!window.confirm(`Permanently delete "${name}"? This cannot be undone.`)) {
      return;
    }
    permanentlyDeleteRoot(id);
  };

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-sidebar">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Explorer</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] gap-1 normal-case tracking-normal font-normal"
                onClick={() => {
                  setAddingFolder(true);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                aria-label="Add folder to workspace"
              >
                <FolderInput className="h-3.5 w-3.5" />
                Add Folder to Workspace...
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Open an additional project root
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="grid grid-cols-2 border-b border-sidebar-border bg-muted/20 px-2 py-1">
          <button
            type="button"
            className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              activeView === "active"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveView("active")}
          >
            Active ({roots.length})
          </button>
          <button
            type="button"
            className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              activeView === "trash"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveView("trash")}
          >
            Trash ({trash.length})
          </button>
        </div>

        {/* Add folder inline form */}
        {addingFolder && activeView === "active" && (
          <div className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2">
            <Input
              ref={inputRef}
              placeholder="Project / folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddFolder();
                if (e.key === "Escape") setAddingFolder(false);
              }}
              className="h-7 text-xs flex-1"
              aria-label="New project name"
            />
            <Button
              size="sm"
              className="h-7 px-2 text-[10px]"
              onClick={handleAddFolder}
              disabled={!newFolderName.trim()}
            >
              Add
            </Button>
            <button
              type="button"
              onClick={() => setAddingFolder(false)}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Roots list */}
        <div className="flex-1 overflow-y-auto">
          {activeView === "active" ? (
            roots.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                No active projects. Add a folder or restore one from Trash.
              </p>
            ) : (
              roots.map((root, index) => (
                <RootSection
                  key={root.id}
                  root={root}
                  index={index}
                  totalRoots={roots.length}
                  activePath={[]}
                  onFileSelect={handleFileSelect}
                  onDragStart={setDragFrom}
                  onDragOver={setDragOver}
                  onDrop={handleDrop}
                  isDragTarget={dragOver === index && dragFrom !== index}
                />
              ))
            )
          ) : trash.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              Trash is empty.
            </p>
          ) : (
            <div className="space-y-2 p-2">
              {trash
                .slice()
                .sort(
                  (a, b) =>
                    new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
                )
                .map((item) => {
                  const daysRemaining = getDaysRemaining(item.deletedAt);
                  return (
                    <div
                      key={item.id}
                      className="rounded-md border border-sidebar-border bg-card/60 p-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">{item.name}</p>
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock3 className="h-3 w-3" />
                            <span>{daysRemaining} day{daysRemaining === 1 ? "" : "s"} remaining</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => restoreRoot(item.id)}
                          >
                            Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => handlePermanentDelete(item.id, item.name)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        {activeView === "active" && roots.length > 1 && (
          <div className="border-t border-sidebar-border px-3 py-2 text-[10px] text-muted-foreground">
            {roots.length} projects in workspace · drag headers to reorder
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
