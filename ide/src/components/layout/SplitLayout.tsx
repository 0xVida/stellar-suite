"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  Fragment,
} from "react";
import { X, PanelRight, PanelBottom } from "lucide-react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useEditorStore } from "@/store/editorStore";
import { useUserSettingsStore } from "@/store/useUserSettingsStore";
import type { FileNode } from "@/lib/sample-contracts";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PaneTab {
  path: string[];
  name: string;
}

interface Pane {
  id: string;
  tabs: PaneTab[];
  activeTabPath: string[];
}

/** Recursive binary-tree layout: a leaf holds one pane, a split holds two children. */
type LayoutNode =
  | { kind: "leaf"; paneId: string }
  | { kind: "split"; id: string; direction: "horizontal" | "vertical"; children: [LayoutNode, LayoutNode] };

// Drag-and-drop MIME key for tab moves between panes
const TAB_DRAG_KEY = "x-stellar/split-tab";

interface DragPayload {
  fromPaneId: string;
  tabPath: string[];
  tabName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

let _paneSeq = 0;
const genPaneId = () => `pane-${++_paneSeq}`;

let _splitSeq = 0;
const genSplitId = () => `split-${++_splitSeq}`;

function findFileNode(nodes: FileNode[], path: string[]): FileNode | null {
  for (const node of nodes) {
    if (node.name === path[0]) {
      if (path.length === 1) return node;
      if (node.children) return findFileNode(node.children, path.slice(1));
    }
  }
  return null;
}

function getAllLeafIds(node: LayoutNode): string[] {
  if (node.kind === "leaf") return [node.paneId];
  return [...getAllLeafIds(node.children[0]), ...getAllLeafIds(node.children[1])];
}

function splitLayout(
  node: LayoutNode,
  targetId: string,
  direction: "horizontal" | "vertical",
  newPaneId: string,
): LayoutNode {
  if (node.kind === "leaf") {
    if (node.paneId !== targetId) return node;
    return {
      kind: "split",
      id: genSplitId(),
      direction,
      children: [
        { kind: "leaf", paneId: targetId },
        { kind: "leaf", paneId: newPaneId },
      ],
    };
  }
  return {
    ...node,
    children: [
      splitLayout(node.children[0], targetId, direction, newPaneId),
      splitLayout(node.children[1], targetId, direction, newPaneId),
    ] as [LayoutNode, LayoutNode],
  };
}

function removeLeaf(node: LayoutNode, targetId: string): LayoutNode | null {
  if (node.kind === "leaf") return node.paneId === targetId ? null : node;
  const left = removeLeaf(node.children[0], targetId);
  const right = removeLeaf(node.children[1], targetId);
  if (!left && !right) return null;
  if (!left) return right;
  if (!right) return left;
  return { ...node, children: [left, right] };
}

// ─────────────────────────────────────────────────────────────────────────────
// PaneEditor  — lightweight Monaco wrapper scoped to one split pane
// ─────────────────────────────────────────────────────────────────────────────

interface PaneEditorProps {
  paneId: string;
  activeTabPath: string[];
}

function PaneEditor({ paneId, activeTabPath }: PaneEditorProps) {
  const { files, updateFileContent } = useWorkspaceStore();
  const { saveViewState, getViewState } = useEditorStore();
  const { fontSize } = useUserSettingsStore();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const activeFileId = activeTabPath.join("/");
  const prevFileIdRef = useRef(activeFileId);

  const activeFile = useMemo(
    () => (activeTabPath.length > 0 ? findFileNode(files, activeTabPath) : null),
    [files, activeTabPath],
  );

  // Persist view state on file/pane change
  useEffect(() => {
    const prev = prevFileIdRef.current;
    prevFileIdRef.current = activeFileId;
    return () => {
      const editor = editorRef.current;
      if (editor && prev) {
        const vs = editor.saveViewState();
        if (vs) saveViewState(`split:${paneId}:${prev}`, vs);
      }
    };
  }, [activeFileId, paneId, saveViewState]);

  // Restore view state when switching to a file
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeFileId) return;
    const raf = window.requestAnimationFrame(() => {
      const stored = getViewState(
        `split:${paneId}:${activeFileId}`,
      ) as Monaco.editor.ICodeEditorViewState | null;
      if (stored) {
        editor.restoreViewState(stored);
        editor.render();
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeFileId, paneId, getViewState]);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      // Define Stellar theme (idempotent — Monaco ignores re-definitions)
      try {
        monaco.editor.defineTheme("stellar-dark", {
          base: "vs-dark",
          inherit: true,
          rules: [
            { token: "variable", foreground: "89b4fa" },
            { token: "function", foreground: "b4befe", fontStyle: "bold" },
            { token: "struct", foreground: "a6e3a1", fontStyle: "bold" },
            { token: "keyword", foreground: "cba6f7" },
            { token: "string", foreground: "a6e3a1" },
            { token: "number", foreground: "fab387" },
            { token: "comment", foreground: "6c7086", fontStyle: "italic" },
          ],
          colors: {
            "editor.background": "#1e1e2e",
            "editor.foreground": "#cdd6f4",
            "editor.lineHighlightBackground": "#313244",
            "editor.selectionBackground": "#45475a",
            "editorCursor.foreground": "#f5e0dc",
            "editorIndentGuide.background1": "#313244",
          },
        });
      } catch {
        // Already registered — safe to ignore
      }
      monaco.editor.setTheme("stellar-dark");
    },
    [],
  );

  if (!activeFile || activeTabPath.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#1e1e2e] text-muted-foreground select-none">
        <div className="text-5xl opacity-10">⬒</div>
        <p className="font-mono text-xs">
          Open a file or drag a tab here
        </p>
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      path={activeFileId}
      language={
        activeFile.language ??
        (activeFile.name?.endsWith(".toml") ? "toml" : "rust")
      }
      value={activeFile.content}
      saveViewState={false}
      onChange={(v) => {
        if (v !== undefined) updateFileContent(activeTabPath, v);
      }}
      onMount={handleMount}
      options={{
        fontSize,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        lineNumbers: "on",
        glyphMargin: false,
        folding: true,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
        wordWrap: "off",
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PaneTabBar  — tab strip + split controls for one pane
// ─────────────────────────────────────────────────────────────────────────────

interface PaneTabBarProps {
  pane: Pane;
  isFocused: boolean;
  totalPanes: number;
  onFocus: () => void;
  onTabSelect: (path: string[]) => void;
  onTabClose: (path: string[]) => void;
  onSplit: (direction: "horizontal" | "vertical") => void;
  onClosePane: () => void;
  onTabDropped: (payload: DragPayload) => void;
}

function PaneTabBar({
  pane,
  isFocused,
  totalPanes,
  onFocus,
  onTabSelect,
  onTabClose,
  onSplit,
  onClosePane,
  onTabDropped,
}: PaneTabBarProps) {
  const [dragOver, setDragOver] = useState(false);
  const activeFileId = pane.activeTabPath.join("/");

  const extractDrag = (e: React.DragEvent): DragPayload | null => {
    try {
      const raw = e.dataTransfer.getData(TAB_DRAG_KEY);
      return raw ? (JSON.parse(raw) as DragPayload) : null;
    } catch {
      return null;
    }
  };

  const handleDragStart = (e: React.DragEvent, tab: PaneTab) => {
    const payload: DragPayload = {
      fromPaneId: pane.id,
      tabPath: tab.path,
      tabName: tab.name,
    };
    e.dataTransfer.setData(TAB_DRAG_KEY, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes(TAB_DRAG_KEY)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(true);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const payload = extractDrag(e);
    if (payload && payload.fromPaneId !== pane.id) {
      onTabDropped(payload);
    }
  };

  return (
    <div
      className={`flex shrink-0 items-stretch border-b border-border bg-sidebar transition-colors ${
        isFocused ? "border-b-primary/60" : ""
      } ${dragOver ? "bg-primary/5" : ""}`}
      onClick={onFocus}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Tab list */}
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {pane.tabs.map((tab) => {
          const fileId = tab.path.join("/");
          const isActive = fileId === activeFileId;
          return (
            <div
              key={fileId}
              draggable
              onDragStart={(e) => handleDragStart(e, tab)}
              onClick={(e) => {
                e.stopPropagation();
                onTabSelect(tab.path);
              }}
              className={`group flex shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-border px-3 py-1.5 transition-colors ${
                isActive
                  ? "border-t-2 border-t-primary bg-background text-foreground"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <span className="max-w-[120px] truncate font-mono text-[11px]">
                {tab.name}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.path);
                }}
                className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                aria-label={`Close ${tab.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        {/* Empty drop-zone */}
        <div className="flex-1" />
      </div>

      {/* Pane controls */}
      <div
        className="flex shrink-0 items-center gap-px border-l border-border px-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onSplit("horizontal")}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Split Right"
          aria-label="Split pane to the right"
        >
          <PanelRight className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onSplit("vertical")}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Split Down"
          aria-label="Split pane downward"
        >
          <PanelBottom className="h-3.5 w-3.5" />
        </button>
        {totalPanes > 1 && (
          <button
            onClick={onClosePane}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
            title="Close Pane"
            aria-label="Close this editor pane"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SplitLayout  — exported main component
// ─────────────────────────────────────────────────────────────────────────────

export function SplitLayout() {
  const { openTabs, activeTabPath, setActiveTabPath, files } =
    useWorkspaceStore();

  // ── Initial pane seeded from current workspace state ──────────────────────
  const [layout, setLayout] = useState<LayoutNode>(() => ({
    kind: "leaf",
    paneId: genPaneId(),
  }));

  const [panes, setPanes] = useState<Record<string, Pane>>(() => {
    const firstId = getAllLeafIds({ kind: "leaf", paneId: "pane-1" })[0] ?? "pane-1";
    // layout is guaranteed to be a single leaf here (initial state)
    const seedId = (layout as { kind: "leaf"; paneId: string }).paneId;
    return {
      [seedId]: {
        id: seedId,
        tabs: openTabs.map((t) => ({ path: t.path, name: t.name })),
        activeTabPath,
      },
    };
  });

  const [focusedPaneId, setFocusedPaneId] = useState<string>(
    () => getAllLeafIds(layout)[0],
  );

  // Keep a ref of current panes for use in effects without them as deps
  const panesRef = useRef(panes);
  useEffect(() => {
    panesRef.current = panes;
  }, [panes]);

  // ── Sync external file opens (FileExplorer → workspaceStore → here) ───────
  const prevOpenTabsRef = useRef(openTabs);
  useEffect(() => {
    const prev = prevOpenTabsRef.current;
    prevOpenTabsRef.current = openTabs;

    const newTabs = openTabs.filter((t) => {
      const id = t.path.join("/");
      return !prev.some((p) => p.path.join("/") === id);
    });

    if (newTabs.length === 0) return;

    const focusId = focusedPaneId;
    setPanes((curr) => {
      const focused = curr[focusId];
      if (!focused) return curr;
      const existing = new Set(focused.tabs.map((t) => t.path.join("/")));
      const toAdd = newTabs.filter((t) => !existing.has(t.path.join("/")));
      if (toAdd.length === 0) return curr;
      const lastAdded = toAdd[toAdd.length - 1];
      return {
        ...curr,
        [focusId]: {
          ...focused,
          tabs: [
            ...focused.tabs,
            ...toAdd.map((t) => ({ path: t.path, name: t.name })),
          ],
          activeTabPath: lastAdded.path,
        },
      };
    });
  }, [openTabs, focusedPaneId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleTabSelect = useCallback(
    (paneId: string, path: string[]) => {
      setPanes((curr) => ({
        ...curr,
        [paneId]: { ...curr[paneId], activeTabPath: path },
      }));
      setFocusedPaneId(paneId);
      setActiveTabPath(path);
    },
    [setActiveTabPath],
  );

  const handleTabClose = useCallback((paneId: string, path: string[]) => {
    const fileId = path.join("/");
    setPanes((curr) => {
      const pane = curr[paneId];
      if (!pane) return curr;
      const nextTabs = pane.tabs.filter((t) => t.path.join("/") !== fileId);
      const wasActive = pane.activeTabPath.join("/") === fileId;
      const nextActive = wasActive
        ? (nextTabs.at(-1)?.path ?? [])
        : pane.activeTabPath;
      return {
        ...curr,
        [paneId]: { ...pane, tabs: nextTabs, activeTabPath: nextActive },
      };
    });
  }, []);

  const handleSplit = useCallback(
    (sourcePaneId: string, direction: "horizontal" | "vertical") => {
      const sourcePane = panesRef.current[sourcePaneId];
      if (!sourcePane) return;

      const newId = genPaneId();
      // New pane opens with the same file visible in the source pane
      const seedTab =
        sourcePane.tabs.find(
          (t) =>
            t.path.join("/") === sourcePane.activeTabPath.join("/"),
        ) ?? sourcePane.tabs[0];

      const newPane: Pane = {
        id: newId,
        tabs: seedTab ? [seedTab] : [],
        activeTabPath: seedTab?.path ?? [],
      };

      setLayout((prev) => splitLayout(prev, sourcePaneId, direction, newId));
      setPanes((curr) => ({ ...curr, [newId]: newPane }));
      setFocusedPaneId(newId);
    },
    [],
  );

  const handleClosePane = useCallback(
    (paneId: string) => {
      setLayout((prev) => {
        const next = removeLeaf(prev, paneId);
        if (!next) return prev; // single pane — can't close
        // Focus the first remaining pane
        const remaining = getAllLeafIds(next);
        setFocusedPaneId(remaining[0]);
        return next;
      });
      setPanes((curr) => {
        const next = { ...curr };
        delete next[paneId];
        return next;
      });
    },
    [],
  );

  const handleTabDropped = useCallback(
    (toPaneId: string, payload: DragPayload) => {
      const { fromPaneId, tabPath, tabName } = payload;
      const fileId = tabPath.join("/");

      setPanes((curr) => {
        const from = curr[fromPaneId];
        const to = curr[toPaneId];
        if (!from || !to) return curr;

        const next = { ...curr };

        // Remove from source
        const srcTabs = from.tabs.filter((t) => t.path.join("/") !== fileId);
        const srcActive =
          from.activeTabPath.join("/") === fileId
            ? (srcTabs.at(-1)?.path ?? [])
            : from.activeTabPath;
        next[fromPaneId] = { ...from, tabs: srcTabs, activeTabPath: srcActive };

        // Add to destination if not already present
        if (!to.tabs.some((t) => t.path.join("/") === fileId)) {
          next[toPaneId] = {
            ...to,
            tabs: [...to.tabs, { path: tabPath, name: tabName }],
            activeTabPath: tabPath,
          };
        } else {
          next[toPaneId] = { ...to, activeTabPath: tabPath };
        }
        return next;
      });

      setFocusedPaneId(toPaneId);
    },
    [],
  );

  // ── Recursive renderer ────────────────────────────────────────────────────

  const totalPanes = getAllLeafIds(layout).length;

  const renderNode = useCallback(
    (node: LayoutNode): React.ReactNode => {
      if (node.kind === "leaf") {
        const pane = panes[node.paneId];
        if (!pane) return null;
        return (
          <div
            key={pane.id}
            className={`flex h-full flex-col overflow-hidden outline-none ${
              focusedPaneId === pane.id
                ? "ring-1 ring-inset ring-primary/40"
                : ""
            }`}
            onFocus={() => setFocusedPaneId(pane.id)}
            onClick={() => setFocusedPaneId(pane.id)}
          >
            <PaneTabBar
              pane={pane}
              isFocused={focusedPaneId === pane.id}
              totalPanes={totalPanes}
              onFocus={() => setFocusedPaneId(pane.id)}
              onTabSelect={(path) => handleTabSelect(pane.id, path)}
              onTabClose={(path) => handleTabClose(pane.id, path)}
              onSplit={(dir) => handleSplit(pane.id, dir)}
              onClosePane={() => handleClosePane(pane.id)}
              onTabDropped={(payload) => handleTabDropped(pane.id, payload)}
            />
            <div className="min-h-0 flex-1 overflow-hidden">
              <PaneEditor
                paneId={pane.id}
                activeTabPath={pane.activeTabPath}
              />
            </div>
          </div>
        );
      }

      // Split node — render a ResizablePanelGroup with two children
      return (
        <ResizablePanelGroup
          key={node.id}
          direction={node.direction}
          autoSaveId={`split-${node.id}`}
          className="h-full"
        >
          <ResizablePanel minSize={15} defaultSize={50}>
            {renderNode(node.children[0])}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel minSize={15} defaultSize={50}>
            {renderNode(node.children[1])}
          </ResizablePanel>
        </ResizablePanelGroup>
      );
    },
    [
      panes,
      focusedPaneId,
      totalPanes,
      handleTabSelect,
      handleTabClose,
      handleSplit,
      handleClosePane,
      handleTabDropped,
    ],
  );

  return (
    <div className="h-full w-full overflow-hidden">
      {renderNode(layout)}
    </div>
  );
}
