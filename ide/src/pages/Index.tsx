import { useState, useCallback, useEffect } from "react";
import { FileExplorer } from "@/components/ide/FileExplorer";
import { EditorTabs, TabInfo } from "@/components/ide/EditorTabs";
import CodeEditor from "@/components/ide/CodeEditor";
import { Terminal, LogEntry } from "@/components/ide/Terminal";
import { Toolbar } from "@/components/ide/Toolbar";
import { ContractPanel } from "@/components/ide/ContractPanel";
import { IdentitiesView } from "@/components/ide/IdentitiesView";
import { StatusBar } from "@/components/ide/StatusBar";
import { useIdentityStore } from "@/store/useIdentityStore";
import { sampleContracts, FileNode } from "@/lib/sample-contracts";
import { DEFAULT_CUSTOM_RPC, NETWORK_CONFIG, type NetworkKey } from "@/lib/networkConfig";
import { showCompilationFailedToast, showCompilationSuccessToast } from "@/lib/compilationToasts";
import { DROP_LIMIT_BYTES, mapDroppedEntriesToTree, mergeFileNodes, readDropPayload } from "@/lib/file-drop";
import { FileNode } from "@/lib/sample-contracts";
import { useFileStore } from "@/store/useFileStore";
import { useDiagnosticsStore } from "@/store/useDiagnosticsStore";
import { parseMixedOutput } from "@/utils/cargoParser";
import { createStreamProcessor, readCompileResponse } from "@/utils/compileStream";
import {
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  FolderTree, Rocket, X, FileText, Terminal as TerminalIcon, Users,
} from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

const cloneFiles = (files: FileNode[]): FileNode[] =>
  JSON.parse(JSON.stringify(files));

const COMPILE_API_URL = import.meta.env.VITE_COMPILE_API_URL ?? "/api/compile";

const findNode = (nodes: FileNode[], pathParts: string[]): FileNode | null => {
  for (const node of nodes) {
    if (node.name === pathParts[0]) {
      if (pathParts.length === 1) return node;
      if (node.children) return findNode(node.children, pathParts.slice(1));
    }
  }
  return null;
};

const toCompilePath = (pathParts: string[]) => {
  if (pathParts.length === 2 && pathParts[1].endsWith(".rs")) {
    return [pathParts[0], "src", pathParts[1]].join("/");
  }

  return pathParts.join("/");
};

type BuildState = "idle" | "building" | "success" | "error";

const containsCompileError = (nodes: FileNode[]): boolean => {
  for (const node of nodes) {
    if (node.type === "folder" && node.children && containsCompileError(node.children)) return true;
    if (node.type === "file") {
      const isRust = node.language === "rust" || node.name.endsWith(".rs");
      const content = node.content ?? "";
      if (isRust && content.includes("compile_error!")) return true;
    }
  }
  return false;
};
const flattenProjectFiles = (nodes: FileNode[], parentPath: string[] = []) =>
  nodes.flatMap((node) => {
    const nextPath = [...parentPath, node.name];

    if (node.type === "folder") {
      return flattenProjectFiles(node.children ?? [], nextPath);
    }

    return [
      {
        path: toCompilePath(nextPath),
        content: node.content ?? "",
        language: node.language ?? "text",
      },
    ];
  });

const Index = () => {
  const {
    files,
    openTabs,
    activeTabPath,
    unsavedFiles,
    setActiveTabPath,
    addTab,
    closeTab,
    createFile,
    createFolder,
    deleteNode,
    renameNode,
    markSaved,
    network,
    horizonUrl,
    customRpcUrl,
    setNetwork,
    setCustomRpcUrl,
  } = useFileStore();

  const { setDiagnostics, clearDiagnostics } = useDiagnosticsStore();

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

const Index = () => {
  const { loadIdentities, activeContext, activeIdentity } = useIdentityStore();
  const [files, setFiles] = useState<FileNode[]>(() => cloneFiles(sampleContracts));
  const [openTabs, setOpenTabs] = useState<TabInfo[]>([
    { path: ["hello_world", "lib.rs"], name: "lib.rs" },
  ]);
  const [activeTabPath, setActiveTabPath] = useState<string[]>(["hello_world", "lib.rs"]);
  const [terminalExpanded, setTerminalExpanded] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [network, setNetwork] = useState<NetworkKey>("testnet");
  const [customRpcUrl, setCustomRpcUrl] = useState<string>(DEFAULT_CUSTOM_RPC);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [isCompiling, setIsCompiling] = useState(false);
  const [buildState, setBuildState] = useState<BuildState>("idle");
  const [contractId, setContractId] = useState<string | null>(null);
  const [showExplorer, setShowExplorer] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [unsavedFiles, setUnsavedFiles] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState("");
  const [leftSidebarTab, setLeftSidebarTab] = useState<"explorer" | "identities">("explorer");
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

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  // Desktop defaults — show panels on wide screens
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    if (mq.matches) {
      setShowExplorer(true);
      setShowPanel(true);
    }

    const handler = (event: MediaQueryListEvent) => {
      if (event.matches) {
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

  const appendTerminalOutput = useCallback((chunk: string) => {
    setTerminalOutput((prev) => prev + chunk);
  }, []);

  const handleFileSelect = useCallback(
    (path: string[], file: FileNode) => {
      if (file.type !== "file") return;
      addTab(path, file.name);
      setMobilePanel("none");
    },
    [addTab]
  );

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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  const handleCompile = useCallback(async () => {
    setIsCompiling(true);
    setTerminalExpanded(true);
    setTerminalOutput("");
    clearDiagnostics();
    appendTerminalOutput("> Compiling contract...\r\n");

    const contractName = activeTabPath[0] ?? files[0]?.name ?? "hello_world";
    const processor = createStreamProcessor({
      onTerminalData: appendTerminalOutput,
    });

    try {
      const response = await fetch(COMPILE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contractName,
          network,
          activeFilePath: activeTabPath.join("/"),
          files: flattenProjectFiles(files),
        }),
      });

      const output = await readCompileResponse(response, processor);

      if (!response.ok) {
        throw new Error(
          output.trim() || `Build request failed with status ${response.status}`
        );
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
    if (
      activeTabPath.join("/") === oldKey ||
      activeTabPath.join("/").startsWith(oldKey + "/")
    ) {
      setActiveTabPath([...newPath, ...activeTabPath.slice(path.length)]);
    }

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

  const handleDeploy = useCallback(() => {
    setTerminalExpanded(true);
    appendTerminalOutput(`Deploying to ${network}...\r\n`);
    setTimeout(() => {
      const id = "CDLZ...X7YQ";
      setContractId(id);
      appendTerminalOutput(`Contract deployed! ID: ${id}\r\n`);
    }, 2000);
  }, [appendTerminalOutput, network]);

  const handleTest = useCallback(() => {
    setTerminalExpanded(true);
    appendTerminalOutput("Running tests...\r\n");
    setTimeout(() => {
      appendTerminalOutput("test_hello ... ok\r\ntest result: ok. 1 passed; 0 failed;\r\n");
    }, 1200);
  }, [appendTerminalOutput]);

  const handleInvoke = useCallback(
    (fn: string, args: string) => {
      setTerminalExpanded(true);
      
      const signer =
      activeContext?.type === "web-wallet"
        ? "browser-wallet"
        : activeIdentity?.nickname ?? "anonymous";
  
      //   Structured log
      addLog("info", `Invoking ${fn}(${args}) as ${signer}...`);

      // Terminal output
      appendTerminalOutput(`Invoking ${fn}(${args}) as ${signer}...\r\n`);

      setTimeout(() => {
        addLog("success", `✓ Result: ["Hello", "Dev"]`);
        appendTerminalOutput('Result: ["Hello", "Dev"]\r\n');
      }, 800);
  );

  useEffect(() => {
    const onBuild = () => {
      void handleCompile();
    };
    const onDeploy = () => handleDeploy();
    const onTest = () => handleTest();

    window.addEventListener("ide:build-contract", onBuild);
    window.addEventListener("ide:deploy-contract", onDeploy);
    window.addEventListener("ide:run-tests", onTest);

    return () => {
      window.removeEventListener("ide:build-contract", onBuild);
      window.removeEventListener("ide:deploy-contract", onDeploy);
      window.removeEventListener("ide:run-tests", onTest);
    };
  }, [handleCompile, handleDeploy, handleTest]);

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
  const horizonUrl = NETWORK_CONFIG[network].horizon;
  const { language } = getActiveContent();

  const tabsWithStatus = openTabs.map((tab) => ({
    ...tab,
    unsaved: unsavedFiles.has(tab.path.join("/")),
  }));

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Toolbar
        onCompile={() => {
          void handleCompile();
        }}
        onDeploy={handleDeploy}
        onTest={handleTest}
        isCompiling={isCompiling}
        buildState={buildState}
        network={network}
        onNetworkChange={setNetwork}
        saveStatus={saveStatus}
      />

      <div className="relative flex flex-1 overflow-hidden">
        <div className="z-10 hidden shrink-0 flex-col border-r border-border bg-sidebar md:flex">
          <button
            onClick={() => setShowExplorer(!showExplorer)}
            className="p-2 text-muted-foreground transition-colors hover:text-foreground"
            title="Toggle Explorer"
>
          >
            {showExplorer ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          <button
            onClick={() => {
              setLeftSidebarTab("explorer");
              setShowExplorer(true);
            }}
            className={`p-2 transition-colors ${leftSidebarTab === "explorer" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            title="Explorer"
          >
            <FolderTree className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setLeftSidebarTab("identities");
              setShowExplorer(true);
            }}
            className={`p-2 transition-colors ${leftSidebarTab === "identities" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            title="Identities"
          >
            <Users className="h-4 w-4" />
          </button>
        </div>

        {mobilePanel === "explorer" && (
          <div className="absolute inset-0 z-30 flex md:hidden">
            <div className="h-full w-64 border-r border-border bg-sidebar">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  Explorer
                </span>
                <button
                  title="Close Explorer"
                  onClick={() => setMobilePanel("none")}
                  className="text-muted-foreground hover:text-foreground"
                >
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
          <div className="absolute inset-0 z-30 flex justify-end md:hidden">
            <div
              className="flex-1 bg-background/60"
              onClick={() => setMobilePanel("none")}
            />
            <div className="h-full w-72 border-l border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  Interact
                </span>
                <button
                  title="Close Interact"
                  onClick={() => setMobilePanel("none")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ContractPanel contractId={contractId} onInvoke={handleInvoke} />
            </div>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" autoSaveId="ide-main-layout">
            
            {showExplorer && (
              <>
                <ResizablePanel id="explorer" order={1} defaultSize={20} minSize={10} maxSize={40} className="hidden md:block">
                  <div className="h-full w-full overflow-hidden border-r border-border bg-sidebar">
                    {leftSidebarTab === "explorer" ? (
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
                    ) : (
                      <IdentitiesView network={network} />
                    )}
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle className="hidden md:flex" />
              </>
            )}

            <ResizablePanel
              id="main-content"
              order={2}
              minSize={30}
              className="flex min-w-0 flex-col"
            >
              <ResizablePanelGroup direction="vertical" autoSaveId="ide-editor-terminal">
                <ResizablePanel
                  id="editor"
                  order={1}
                  defaultSize={75}
                  minSize={30}
                  className="flex min-w-0 flex-col"
                >
                  <EditorTabs
                    tabs={tabsWithStatus}
                    activeTab={activeTabPath.join("/")}
                    onTabSelect={setActiveTabPath}
                    onTabClose={handleTabClose}
                  />
                  <div className="flex-1 overflow-hidden">
                    <CodeEditor
                      onCursorChange={(line, col) => setCursorPos({ line, col })}
                      onSave={handleSave}
                    />
                  </div>
                </ResizablePanel>

                {terminalExpanded ? (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel
                      id="terminal"
                      order={2}
                      defaultSize={25}
                      minSize={10}
                      className="flex min-w-0 flex-col"
                    >
                      <Terminal
                        output={terminalOutput}
                        isExpanded={terminalExpanded}
                        onToggle={() => setTerminalExpanded(!terminalExpanded)}
                        onClear={() => setTerminalOutput("")}
                      />
                    </ResizablePanel>
                  </>
                ) : (
                  <div className="shrink-0 flex min-w-0 flex-col">
                    <Terminal
                      output={terminalOutput}
                      isExpanded={terminalExpanded}
                      onToggle={() => setTerminalExpanded(!terminalExpanded)}
                      onClear={() => setTerminalOutput("")}
                    />
                  </div>
                )}

              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <div className="z-10 hidden shrink-0 md:flex">
          {showPanel && (
            <div className="w-64 border-l border-border bg-card">
              <ContractPanel contractId={contractId} onInvoke={handleInvoke} />
            </div>
          )}
          <div className="flex h-full flex-col border-l border-border bg-card">
            <button
              onClick={() => setShowPanel(!showPanel)}
              className="p-2 text-muted-foreground transition-colors hover:text-foreground"
              title="Toggle Panel"
            >
              {showPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="hidden md:block">
        <StatusBar
          language={language}
          line={cursorPos.line}
          col={cursorPos.col}
          network={network}
          horizonUrl={horizonUrl}
          customRpcUrl={customRpcUrl}
          onNetworkChange={setNetwork}
          onCustomRpcUrlChange={setCustomRpcUrl}
          unsavedCount={unsavedFiles.size}
        />
      </div>

      <div className="flex flex-col border-t border-border bg-sidebar md:hidden">
        <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-3 py-1">
          <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            {unsavedFiles.size > 0 && (
              <span className="text-warning">{unsavedFiles.size} unsaved</span>
            )}
            <span>
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            {network}
          </span>
        </div>

        <div className="flex items-stretch">
          <button
            onClick={() =>
              setMobilePanel(mobilePanel === "explorer" ? "none" : "explorer")
            }
            className={`flex-1 flex flex-col items-center gap-0.5 border-t-2 py-2.5 text-[10px] font-medium transition-colors ${
              mobilePanel === "explorer"
                ? "border-primary bg-primary/5 text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <FolderTree className="h-4 w-4" />
            Explorer
          </button>
          <button
            onClick={() => setMobilePanel("none")}
            className={`flex-1 flex flex-col items-center gap-0.5 border-t-2 py-2.5 text-[10px] font-medium transition-colors ${
              mobilePanel === "none"
                ? "border-primary bg-primary/5 text-primary"
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
            className={`flex-1 flex flex-col items-center gap-0.5 border-t-2 py-2.5 text-[10px] font-medium transition-colors ${
              mobilePanel === "interact"
                ? "border-primary bg-primary/5 text-primary"
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
            className={`flex-1 flex flex-col items-center gap-0.5 border-t-2 py-2.5 text-[10px] font-medium transition-colors ${
              terminalExpanded
                ? "border-primary bg-primary/5 text-primary"
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
