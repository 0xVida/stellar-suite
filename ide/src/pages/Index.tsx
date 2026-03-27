import { DragEvent, useState, useCallback, useEffect, useRef } from "react";
import { FileExplorer } from "@/components/ide/FileExplorer";
import { EditorTabs, TabInfo } from "@/components/ide/EditorTabs";
import CodeEditor from "@/components/editor/CodeEditor";
import { Terminal, LogEntry } from "@/components/ide/Terminal";
import { Toolbar } from "@/components/ide/Toolbar";
import { ContractPanel } from "@/components/ide/ContractPanel";
import { StatusBar } from "@/components/ide/StatusBar";
import { DeploymentStepper } from "@/components/ide/DeploymentStepper";
import { useDeploymentStore } from "@/store/useDeploymentStore";
import { useFileStore } from "@/store/useFileStore";
import { useIdentityStore } from "@/store/useIdentityStore";
import { sampleContracts, FileNode } from "@/lib/sample-contracts";
import { DROP_LIMIT_BYTES, mapDroppedEntriesToTree, mergeFileNodes, readDropPayload } from "@/lib/file-drop";
import {
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  FolderTree, Rocket, X, FileText, Terminal as TerminalIcon,
} from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

const cloneFiles = (files: FileNode[]): FileNode[] =>
  JSON.parse(JSON.stringify(files));

const findNode = (nodes: FileNode[], pathParts: string[]): FileNode | null => {
  for (const node of nodes) {
    if (node.name === pathParts[0]) {
      if (pathParts.length === 1) return node;
      if (node.children) return findNode(node.children, pathParts.slice(1));
    }
  }
  return null;
};

const findParent = (nodes: FileNode[], pathParts: string[]): FileNode[] | null => {
  if (pathParts.length <= 1) return nodes;
  const parent = findNode(nodes, pathParts.slice(0, -1));
  return parent?.children ?? null;
};

const Index = () => {
  const [files, setFiles] = useState<FileNode[]>(() => cloneFiles(sampleContracts));
  const [openTabs, setOpenTabs] = useState<TabInfo[]>([
    { path: ["hello_world", "lib.rs"], name: "lib.rs" },
  ]);
  const [activeTabPath, setActiveTabPath] = useState<string[]>(["hello_world", "lib.rs"]);
  const [terminalExpanded, setTerminalExpanded] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [network, setNetwork] = useState("testnet");
  const [isCompiling, setIsCompiling] = useState(false);
  const [contractId, setContractId] = useState<string | null>(null);
  const [showExplorer, setShowExplorer] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [unsavedFiles, setUnsavedFiles] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"none" | "explorer" | "interact">("none");
   const [isExplorerDragActive, setIsExplorerDragActive] = useState(false);
  const dragDepthRef = useRef(0);

  // Track saved state
  const savedContentRef = useRef<Record<string, string>>({});

  // Initialize saved content
  useEffect(() => {
    const init = (nodes: FileNode[], path: string[]) => {
      for (const node of nodes) {
        const p = [...path, node.name].join("/");
        if (node.type === "file" && node.content) {
          savedContentRef.current[p] = node.content;
        }
        if (node.children) init(node.children, [...path, node.name]);
      }
    };
    init(files, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Desktop defaults — show panels on wide screens
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    if (mq.matches) {
      setShowExplorer(true);
      setShowPanel(true);
    }
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setShowExplorer(true);
        setShowPanel(true);
      } else {
        setShowExplorer(false);
        setShowPanel(false);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const getTimestamp = () => new Date().toLocaleTimeString("en-US", { hour12: false });

  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    setLogs((prev) => [...prev, { type, message, timestamp: getTimestamp() }]);
  }, []);

  const handleFileSelect = useCallback((path: string[], file: FileNode) => {
    if (file.type !== "file") return;
    const key = path.join("/");
    setActiveTabPath(path);
    setOpenTabs((prev) => {
      if (prev.some((t) => t.path.join("/") === key)) return prev;
      return [...prev, { path, name: file.name }];
    });
    // Close mobile explorer after selection
    setMobilePanel("none");
  }, []);

  const handleTabClose = useCallback((path: string[]) => {
    const key = path.join("/");
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.path.join("/") !== key);
      if (activeTabPath.join("/") === key && next.length > 0) {
        setActiveTabPath(next[next.length - 1].path);
      }
      return next;
    });
    // Remove unsaved marker
    setUnsavedFiles((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, [activeTabPath]);

  const handleContentChange = useCallback((newContent: string) => {
    const key = activeTabPath.join("/");
    setFiles((prev) => {
      const next = cloneFiles(prev);
      const file = findNode(next, activeTabPath);
      if (file) file.content = newContent;
      return next;
    });
    // Mark unsaved
    setUnsavedFiles((prev) => {
      if (savedContentRef.current[key] !== newContent) {
        return new Set(prev).add(key);
      }
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, [activeTabPath]);

  const handleSave = useCallback(() => {
    const key = activeTabPath.join("/");
    const file = findNode(files, activeTabPath);
    if (file?.content !== undefined) {
      savedContentRef.current[key] = file.content;
    }
    setUnsavedFiles((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setSaveStatus("Saved");
    setTimeout(() => setSaveStatus(""), 2000);
  }, [activeTabPath, files]);

  // Global Ctrl/Cmd+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  const handleCreateFile = useCallback((parentPath: string[], name: string) => {
    const newContent = name.endsWith(".rs")
      ? `#![no_std]\nuse soroban_sdk::{contract, contractimpl, Env};\n\n// New contract\n`
      : "";
    setFiles((prev) => {
      const next = cloneFiles(prev);
      const parent = parentPath.length === 0 ? next : findNode(next, parentPath)?.children;
      if (parent) {
        parent.push({
          name,
          type: "file",
          language: name.endsWith(".rs") ? "rust" : name.endsWith(".toml") ? "toml" : "text",
          content: newContent,
        });
      }
      return next;
    });
    const newPath = [...parentPath, name];
    const key = newPath.join("/");
    savedContentRef.current[key] = newContent;
    setActiveTabPath(newPath);
    setOpenTabs((prev) => [...prev, { path: newPath, name }]);
  }, []);

  const handleCreateFolder = useCallback((parentPath: string[], name: string) => {
    setFiles((prev) => {
      const next = cloneFiles(prev);
      const parent = parentPath.length === 0 ? next : findNode(next, parentPath)?.children;
      if (parent) {
        parent.push({ name, type: "folder", children: [] });
      }
      return next;
    });
  }, []);

  const handleDeleteNode = useCallback((path: string[]) => {
    setFiles((prev) => {
      const next = cloneFiles(prev);
      const parent = findParent(next, path);
      if (parent) {
        const idx = parent.findIndex((n) => n.name === path[path.length - 1]);
        if (idx !== -1) parent.splice(idx, 1);
      }
      return next;
    });
    const key = path.join("/");
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.path.join("/") !== key);
      if (activeTabPath.join("/") === key && next.length > 0) {
        setActiveTabPath(next[next.length - 1].path);
      }
      return next;
    });
  }, [activeTabPath]);

  const handleRenameNode = useCallback((path: string[], newName: string) => {
    const oldKey = path.join("/");
    const newPath = [...path.slice(0, -1), newName];
    const newKey = newPath.join("/");

    setFiles((prev) => {
      const next = cloneFiles(prev);
      const node = findNode(next, path);
      if (node) node.name = newName;
      return next;
    });

    // Update open tabs
    setOpenTabs((prev) =>
      prev.map((t) => {
        const tKey = t.path.join("/");
        if (tKey === oldKey || tKey.startsWith(oldKey + "/")) {
          const updated = [...newPath, ...t.path.slice(path.length)];
          return { ...t, path: updated, name: updated[updated.length - 1] };
        }
        return t;
      })
    );

    // Update active tab
    if (activeTabPath.join("/") === oldKey || activeTabPath.join("/").startsWith(oldKey + "/")) {
      setActiveTabPath([...newPath, ...activeTabPath.slice(path.length)]);
    }

    // Update saved content refs
    const entries = Object.entries(savedContentRef.current);
    for (const [k, v] of entries) {
      if (k === oldKey || k.startsWith(oldKey + "/")) {
        const newK = newKey + k.slice(oldKey.length);
        savedContentRef.current[newK] = v;
        delete savedContentRef.current[k];
      }
    }
  }, [activeTabPath]);

  const getActiveContent = (): { content: string; language: string } => {
    const file = findNode(files, activeTabPath);
    return {
      content: file?.content || "// Select a file to begin editing",
      language: file?.language || "rust",
    };
  };

  const handleCompile = useCallback(() => {
    setIsCompiling(true);
    setTerminalExpanded(true);
    addLog("info", "Compiling contract...");
    addLog("info", `Target network: ${network}`);
    setTimeout(() => addLog("info", "Resolving dependencies..."), 400);
    setTimeout(() => addLog("info", "Building release target..."), 900);
    setTimeout(() => {
      addLog("success", "✓ Compilation successful! WASM binary: 1.2 KB");
      addLog("info", "Contract hash: 7a8b9c...d4e5f6");
      setIsCompiling(false);
    }, 1800);
  }, [network, addLog]);

  const {
    isDeployModalOpen,
    deploymentStep,
    deploymentError,
    openDeployModal,
    closeDeployModal,
    setDeploymentStep,
    setDeploymentError,
    resetDeployment,
  } = useDeploymentStore();

  /** Simulates the Soroban multi-step deploy sequence. Replace awaits with real SDK calls later. */
  const handleDeploy = useCallback(async () => {
    resetDeployment();
    openDeployModal();
    setTerminalExpanded(true);
    addLog("info", `Deploying to ${network}...`);

    const delay = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    try {
      setDeploymentStep("simulating");
      await delay(800);

      setDeploymentStep("signing");
      await delay(1200); // user approves in Freighter during this window

      setDeploymentStep("uploading");
      await delay(1500);

      setDeploymentStep("instantiating");
      await delay(1000);

      const id = "CDLZ...X7YQ";
      setDeploymentStep("success");
      setContractId(id);
      addLog("success", `✓ Contract deployed! ID: ${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deployment failed";
      setDeploymentStep("error");
      setDeploymentError(message);
      addLog("error", `✗ Deployment failed: ${message}`);
    }
  }, [network, addLog, openDeployModal, resetDeployment, setDeploymentStep, setDeploymentError]);

  const handleTest = useCallback(() => {
    setTerminalExpanded(true);
    addLog("info", "Running tests...");
    setTimeout(() => {
      addLog("success", "✓ test_hello ... ok");
      addLog("info", "test result: ok. 1 passed; 0 failed;");
    }, 1200);
  }, [addLog]);

  const { activeIdentity, loadIdentities } = useIdentityStore();

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  const handleInvoke = useCallback(
    (fn: string, args: string) => {
      setTerminalExpanded(true);
      const signer = activeIdentity ? activeIdentity.nickname : "anonymous";
      addLog("info", `Invoking ${fn}(${args}) as ${signer}...`);
      setTimeout(() => addLog("success", `✓ Result: ["Hello", "Dev"]`), 800);
    },
    [addLog, activeIdentity]
  );

  const handleExplorerDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsExplorerDragActive(true);
  }, []);

  const handleExplorerDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setIsExplorerDragActive(true);
  }, []);

  const handleExplorerDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsExplorerDragActive(false);
    }
  }, []);

  const handleExplorerDrop = useCallback(async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsExplorerDragActive(false);

    try {
      const dropped = await readDropPayload(event.dataTransfer);
      const { nodes, uploadedFiles, skippedFiles, totalBytes } = await mapDroppedEntriesToTree(dropped);

      if (uploadedFiles === 0) {
        addLog("error", `Upload skipped. No eligible files found (limit ${(DROP_LIMIT_BYTES / (1024 * 1024)).toFixed(0)} MB).`);
        return;
      }

      setFiles((prev) => mergeFileNodes(prev, nodes));
      addLog("success", `Uploaded ${uploadedFiles} file${uploadedFiles === 1 ? "" : "s"} (${(totalBytes / 1024).toFixed(1)} KB).`);
      if (skippedFiles > 0) {
        addLog("warning", `Skipped ${skippedFiles} file${skippedFiles === 1 ? "" : "s"} (ignored folders or upload limit).`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      addLog("error", `Upload failed: ${message}`);
    }
  }, [addLog]);
  const { content, language } = getActiveContent();


  // Tabs with unsaved markers
  const tabsWithStatus = openTabs.map((t) => ({
    ...t,
    unsaved: unsavedFiles.has(t.path.join("/")),
  }));

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Deployment progress modal */}
      <DeploymentStepper
        open={isDeployModalOpen}
        step={deploymentStep}
        error={deploymentError}
        onClose={closeDeployModal}
      />
      {/* Toolbar */}
      <Toolbar
        onCompile={handleCompile}
        onDeploy={handleDeploy}
        onTest={handleTest}
        isCompiling={isCompiling}
        network={network}
        onNetworkChange={setNetwork}
        saveStatus={saveStatus}
      />

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Toggle Bar */}
        <div className="hidden md:flex flex-col bg-sidebar border-r border-border shrink-0 z-10">
          <button
            onClick={() => setShowExplorer(!showExplorer)}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            title="Toggle Explorer"
          >
            {showExplorer ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
        </div>

        {/* Mobile overlay panels */}
        {mobilePanel === "explorer" && (
          <div className="md:hidden absolute inset-0 z-30 flex">
            <div className="w-64 bg-sidebar border-r border-border h-full">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Explorer</span>
                <button title="Close Explorer" onClick={() => setMobilePanel("none")} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <FileExplorer
                files={files}
                onFileSelect={handleFileSelect}
                activeFilePath={activeTabPath}
                onCreateFile={handleCreateFile}
                onCreateFolder={handleCreateFolder}
                onDeleteNode={handleDeleteNode}
                onRenameNode={handleRenameNode}
                isDragActive={isExplorerDragActive}
                onDragEnter={handleExplorerDragEnter}
                onDragOver={handleExplorerDragOver}
                onDragLeave={handleExplorerDragLeave}
                onDrop={handleExplorerDrop}
              />
            </div>
            <div className="flex-1 bg-background/60" onClick={() => setMobilePanel("none")} />
          </div>
        )}
        {mobilePanel === "interact" && (
          <div className="md:hidden absolute inset-0 z-30 flex justify-end">
            <div className="flex-1 bg-background/60" onClick={() => setMobilePanel("none")} />
            <div className="w-72 bg-card border-l border-border h-full">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Interact</span>
                <button title="Close Interact" onClick={() => setMobilePanel("none")} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ContractPanel contractId={contractId} onInvoke={handleInvoke} />
            </div>
          </div>
        )}

        {/* Resizable Layout for Desktop Content */}
        <div className="flex-1 flex overflow-hidden">
          <ResizablePanelGroup direction="horizontal" autoSaveId="ide-main-layout">
            
            {showExplorer && (
              <>
                <ResizablePanel id="explorer" order={1} defaultSize={20} minSize={10} maxSize={40} className="hidden md:block">
                  <div className="h-full w-full overflow-hidden border-r border-border bg-sidebar">
                     <FileExplorer
                files={files}
                onFileSelect={(path, file) => { handleFileSelect(path, file); }}
                activeFilePath={activeTabPath}
                onCreateFile={handleCreateFile}
                onCreateFolder={handleCreateFolder}
                onDeleteNode={handleDeleteNode}
                onRenameNode={handleRenameNode}
                isDragActive={isExplorerDragActive}
                onDragEnter={handleExplorerDragEnter}
                onDragOver={handleExplorerDragOver}
                onDragLeave={handleExplorerDragLeave}
                onDrop={handleExplorerDrop}
              />
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle className="hidden md:flex" />
              </>
            )}

            <ResizablePanel id="main-content" order={2} minSize={30} className="flex flex-col min-w-0">
              <ResizablePanelGroup direction="vertical" autoSaveId="ide-editor-terminal">
                
                <ResizablePanel id="editor" order={1} defaultSize={75} minSize={30} className="flex flex-col min-w-0">
                  <EditorTabs
                    tabs={tabsWithStatus}
                    activeTab={activeTabPath.join("/")}
                    onTabSelect={setActiveTabPath}
                    onTabClose={handleTabClose}
                  />
                  <div className="flex-1 overflow-hidden">
                    <CodeEditor
                      content={content}
                      language={language}
                      onChange={handleContentChange}
                      onCursorChange={(line, col) => setCursorPos({ line, col })}
                      onSave={handleSave}
                    />
                  </div>
                </ResizablePanel>

                {terminalExpanded ? (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel id="terminal" order={2} defaultSize={25} minSize={10} className="flex flex-col min-w-0">
                      <Terminal
                        logs={logs}
                        isExpanded={terminalExpanded}
                        onToggle={() => setTerminalExpanded(!terminalExpanded)}
                        onClear={() => setLogs([])}
                      />
                    </ResizablePanel>
                  </>
                ) : (
                  <div className="shrink-0 flex flex-col min-w-0">
                    <Terminal
                      logs={logs}
                      isExpanded={terminalExpanded}
                      onToggle={() => setTerminalExpanded(!terminalExpanded)}
                      onClear={() => setLogs([])}
                    />
                  </div>
                )}

              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* Desktop contract panel */}
        <div className="hidden md:flex shrink-0 z-10">
          {showPanel && (
            <div className="w-64 border-l border-border bg-card">
              <ContractPanel contractId={contractId} onInvoke={handleInvoke} />
            </div>
          )}
          <div className="flex flex-col bg-card border-l border-border h-full">
            <button
              onClick={() => setShowPanel(!showPanel)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              title="Toggle Panel"
            >
              {showPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Status Bar - Desktop */}
      <div className="hidden md:block">
        <StatusBar
          language={language}
          line={cursorPos.line}
          col={cursorPos.col}
          network={network}
          unsavedCount={unsavedFiles.size}
        />
      </div>

      {/* Mobile bottom tab bar */}
      <div className="md:hidden flex flex-col border-t border-border bg-sidebar">
        {/* Status row */}
        <div className="flex items-center justify-between px-3 py-1 border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
            {unsavedFiles.size > 0 && <span className="text-warning">{unsavedFiles.size} unsaved</span>}
            <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">{network}</span>
        </div>
        {/* Tab buttons */}
        <div className="flex items-stretch">
          <button
            onClick={() =>
              setMobilePanel(mobilePanel === "explorer" ? "none" : "explorer")
            }
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${mobilePanel === "explorer"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            <FolderTree className="h-4 w-4" />
            Explorer
          </button>
          <button
            onClick={() => setMobilePanel("none")}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${mobilePanel === "none"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            <FileText className="h-4 w-4" />
            Editor
          </button>
          <button
            onClick={() =>
              setMobilePanel(mobilePanel === "interact" ? "none" : "interact")
            }
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${mobilePanel === "interact"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            <Rocket className="h-4 w-4" />
            Interact
          </button>
          <button
            onClick={() => {
              setTerminalExpanded(!terminalExpanded);
              setMobilePanel("none");
            }}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${terminalExpanded
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            <TerminalIcon className="h-4 w-4" />
            Console
          </button>
        </div>
      </div>
    </div>
  );
};

export default Index;
