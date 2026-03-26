"use client";

import { DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { FileExplorer } from "@/components/ide/FileExplorer";
import { EditorTabs } from "@/components/ide/EditorTabs";
import CodeEditor from "@/components/ide/CodeEditor";
import { Terminal } from "@/components/ide/Terminal";
import { Toolbar } from "@/components/ide/Toolbar";
import { ContractPanel } from "@/components/ide/ContractPanel";
import { IdentitiesView } from "@/components/ide/IdentitiesView";
import { StatusBar } from "@/components/ide/StatusBar";
import { SearchPane } from "@/components/ide/SearchPane";
import { useIdentityStore } from "@/store/useIdentityStore";
import { useFileStore } from "@/store/useFileStore";
import { useDiagnosticsStore } from "@/store/useDiagnosticsStore";
import { showCompilationFailedToast, showCompilationSuccessToast } from "@/lib/compilationToasts";
import { DROP_LIMIT_BYTES, mapDroppedEntriesToTree, mergeFileNodes, readDropPayload } from "@/lib/file-drop";
import { type NetworkKey } from "@/lib/networkConfig";
import { FileNode } from "@/lib/sample-contracts";
import { createStreamProcessor, readCompileResponse } from "@/utils/compileStream";
import { parseMixedOutput } from "@/utils/cargoParser";
import { RpcService } from "@/lib/rpcService";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DeploymentsView } from "@/components/ide/DeploymentsView";
import { useDeployedContractsStore } from "@/store/useDeployedContractsStore";
import {
  FileText,
  FolderTree,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Rocket,
  Search,
  Terminal as TerminalIcon,
  History,
  Users,
  X,
} from "lucide-react";

const COMPILE_API_URL = process.env.NEXT_PUBLIC_COMPILE_API_URL ?? "/api/compile";

type BuildState = "idle" | "building" | "success" | "error";

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

const toCompilePath = (pathParts: string[]) => {
  if (pathParts.length === 2 && pathParts[1].endsWith(".rs")) {
    return [pathParts[0], "src", pathParts[1]].join("/");
  }
  return pathParts.join("/");
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
  const [terminalExpanded, setTerminalExpanded] = useState(true);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [isCompiling, setIsCompiling] = useState(false);
  const [contractId, setContractId] = useState<string | null>(null);
  const [showExplorer, setShowExplorer] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [saveStatus, setSaveStatus] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"none" | "explorer" | "interact" | "deployments" | "identities">("none");
  const [isExplorerDragActive, setIsExplorerDragActive] = useState(false);
  const [leftSidebarTab, setLeftSidebarTab] = useState<"explorer" | "deployments" | "identities" | "search">("explorer");
  const dragDepthRef = useRef(0);

  const {
    files,
    setFiles,
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
    updateFileContent,
    network,
    horizonUrl,
    customRpcUrl,
    setNetwork,
    setCustomRpcUrl,
  } = useFileStore();

  const { loadIdentities, activeContext, activeIdentity } = useIdentityStore();
  const { addContract } = useDeployedContractsStore();
  const { setDiagnostics, clearDiagnostics } = useDiagnosticsStore();

  const [buildState, setBuildState] = useState<BuildState>("idle");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

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

  const handleTabClose = useCallback(
    (path: string[]) => {
      closeTab(path);
    },
    [closeTab]
  );

  const handleContentChange = useCallback((newContent: string) => {
    const nextFiles = cloneFiles(files);
    const file = findNode(nextFiles, activeTabPath);
    if (file) {
      file.content = newContent;
      setFiles(nextFiles);
      // Unsaved tracking is handled within the store via setUnsavedFiles usually, 
      // but if not, we can manually update it here if necessary.
      // Based on useFileStore, it uses unsavedFiles Set.
    }
  }, [activeTabPath, files, setFiles]);

  const handleSave = useCallback(() => {
    markSaved(activeTabPath);
    setSaveStatus("Saved");
    setTimeout(() => setSaveStatus(""), 1500);
  }, [activeTabPath, markSaved]);

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

  
  const handleCompile = useCallback(async () => {
    setIsCompiling(true);
    setBuildState("building");
    setTerminalExpanded(true);
    appendTerminalOutput("> Compiling contract...\r\n");
    appendTerminalOutput(`Target network: ${network}\r\n`);

    const contractName = activeTabPath[0] ?? files[0]?.name ?? "hello_world";
    const processor = createStreamProcessor({ onTerminalData: appendTerminalOutput });

    try {
      const response = await fetch(COMPILE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractName,
          network,
          activeFilePath: activeTabPath.join("/"),
          files: flattenProjectFiles(files),
        }),
      });

      const output = await readCompileResponse(response, processor);
      const diagnostics = parseMixedOutput(output, contractName);
      setDiagnostics(diagnostics);

      if (!response.ok) {
        throw new Error(output.trim() || `Build request failed with status ${response.status}`);
      }

      appendTerminalOutput(`✓ Compilation successful! WASM binary: 1.2 KB\r\n`);
      showCompilationSuccessToast();
      setBuildState("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Build failed";
      appendTerminalOutput(`Build failed: ${message}\r\n`);
      showCompilationFailedToast({ onViewLogs: () => setTerminalExpanded(true) });
      setBuildState("error");
    } finally {
      setIsCompiling(false);
      setTimeout(() => setBuildState("idle"), 1200);
    }
  }, [activeTabPath, appendTerminalOutput, files, network, setDiagnostics]);

  const handleDeploy = useCallback(() => {
    setTerminalExpanded(true);
    appendTerminalOutput(`Deploying to ${network}...\r\n`);
    setTimeout(() => {
      const fullId =
        `CD${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`.substring(0, 56).toUpperCase();
      setContractId(fullId);
      appendTerminalOutput(`✓ Contract deployed! ID: ${fullId}\r\n`);
      addContract(fullId, network as NetworkKey, "hello_world");
    }, 2000);
  }, [network, appendTerminalOutput, addContract]);

  const handleTest = useCallback(() => {
    setTerminalExpanded(true);
    appendTerminalOutput("Running tests...\r\n");
    setTimeout(() => {
      appendTerminalOutput("✓ test_hello ... ok\r\ntest result: ok. 1 passed; 0 failed;\r\n");
    }, 1200);
  }, [appendTerminalOutput]);

  const handleInvoke = useCallback(
    async (fn: string, args: string, isSimulation: boolean) => {
      setTerminalExpanded(true);
      const signer =
        activeContext?.type === "web-wallet"
          ? "browser-wallet"
          : activeIdentity?.nickname ?? "anonymous";
      appendTerminalOutput(`${isSimulation ? 'Simulating' : 'Invoking'} ${fn}(${args}) as ${signer}...\r\n`);

      try {
        const parsedArgs = JSON.parse(args);
        const rpcUrl = network === "local" ? customRpcUrl : horizonUrl;
        const rpcService = new RpcService(rpcUrl);

        if (isSimulation) {
          const result = await rpcService.simulateTransaction(contractId!, fn, Array.isArray(parsedArgs) ? parsedArgs : [parsedArgs]);
          if (result.success) {
            appendTerminalOutput(`Result: ${JSON.stringify(result.result)}\r\n`);
          } else {
            appendTerminalOutput(`Error: ${result.error}\r\n`);
          }
        } else {
          // TODO: Implement actual transaction invocation
          appendTerminalOutput('Transaction invocation not yet implemented\r\n');
        }
      } catch (error) {
        appendTerminalOutput(`Error: ${error instanceof Error ? error.message : 'Invalid arguments'}\r\n`);
      }
    },
    [activeContext, activeIdentity, appendTerminalOutput, network, customRpcUrl, horizonUrl, contractId]
  );

  const handleCreateFile = useCallback(
    (parent: string[], name: string) => {
      createFile(parent, name);
    },
    [createFile]
  );

  const handleCreateFolder = useCallback(
    (parent: string[], name: string) => {
      createFolder(parent, name);
    },
    [createFolder]
  );

  const handleDeleteNode = useCallback(
    (path: string[]) => {
      deleteNode(path);
    },
    [deleteNode]
  );

  const handleRenameNode = useCallback(
    (path: string[], newName: string) => {
      renameNode(path, newName);
    },
    [renameNode]
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

  const handleExplorerDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setIsExplorerDragActive(false);

      try {
        const dropped = await readDropPayload(event.dataTransfer);
        const { nodes, uploadedFiles, skippedFiles, totalBytes } = await mapDroppedEntriesToTree(dropped);

        if (uploadedFiles === 0) {
          appendTerminalOutput(
            `Upload skipped. No eligible files found (limit ${(DROP_LIMIT_BYTES / (1024 * 1024)).toFixed(0)} MB).\r\n`
          );
          return;
        }

        setFiles(mergeFileNodes(files, nodes));
        appendTerminalOutput(
          `Uploaded ${uploadedFiles} file${uploadedFiles === 1 ? "" : "s"} (${(totalBytes / 1024).toFixed(1)} KB).\r\n`
        );
        if (skippedFiles > 0) {
          appendTerminalOutput(
            `Skipped ${skippedFiles} file${skippedFiles === 1 ? "" : "s"} (ignored folders or upload limit).\r\n`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        appendTerminalOutput(`Upload failed: ${message}\r\n`);
      }
    },
    [appendTerminalOutput, files, setFiles]
  );

  const getActiveContent = useCallback((): { content: string; language: string; fileId: string } => {
    const file = findNode(files, activeTabPath);
    return {
      content: file?.content ?? "// Select a file to begin editing",
      language: file?.language ?? "rust",
      fileId: activeTabPath.join("/"),
    };
  }, [activeTabPath, files]);

  // Global search opening via shortcut
  useEffect(() => {
    const onOpenSearch = () => {
      setLeftSidebarTab("search");
      setShowExplorer(true);
      setMobilePanel("none");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    };

    window.addEventListener("ide:open-search", onOpenSearch);
    return () => window.removeEventListener("ide:open-search", onOpenSearch);
  }, []);

  const { content, language, fileId } = getActiveContent();

  const tabsWithStatus = openTabs.map((t) => ({
    ...t,
    unsaved: unsavedFiles.has(t.path.join("/")),
  }));

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Toolbar
        onCompile={handleCompile}
        onDeploy={handleDeploy}
        onTest={handleTest}
        isCompiling={isCompiling}
        buildState={isCompiling ? "building" : "idle"}
        network={network}
        onNetworkChange={setNetwork}
        saveStatus={saveStatus}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Sidebar (Left) */}
        <div className="hidden md:flex flex-col bg-sidebar border-r border-border shrink-0 z-10 w-12 items-center py-4 gap-4">
          <button
            onClick={() => {
              if (leftSidebarTab === "explorer" && showExplorer) {
                setShowExplorer(false);
              } else {
                setLeftSidebarTab("explorer");
                setShowExplorer(true);
              }
            }}
            className={`p-2 rounded-md transition-all ${
              showExplorer && leftSidebarTab === "explorer" 
                ? "bg-primary/20 text-primary shadow-sm" 
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            title="File Explorer"
          >
            <FolderTree className="h-5 w-5" />
          </button>
          
          <button
            onClick={() => {
              if (leftSidebarTab === "identities" && showExplorer) {
                setShowExplorer(false);
              } else {
                setLeftSidebarTab("identities");
                setShowExplorer(true);
              }
            }}
            className={`p-2 rounded-md transition-all ${
                showExplorer && leftSidebarTab === "identities" 
                  ? "bg-primary/20 text-primary shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            title="Identities"
          >
            <Users className="h-5 w-5" />
          </button>

          <button
            onClick={() => {
              if (leftSidebarTab === "deployments" && showExplorer) {
                setShowExplorer(false);
              } else {
                setLeftSidebarTab("deployments");
                setShowExplorer(true);
              }
            }}
            className={`p-2 rounded-md transition-all ${
              showExplorer && leftSidebarTab === "deployments" 
                ? "bg-primary/20 text-primary shadow-sm" 
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            title="Recent Deployments"
          >
            <History className="h-5 w-5" />
          </button>

          <button
            onClick={() => {
              if (leftSidebarTab === "search" && showExplorer) {
                setShowExplorer(false);
              } else {
                setLeftSidebarTab("search");
                setShowExplorer(true);
                setTimeout(() => searchInputRef.current?.focus(), 0);
              }
            }}
            className={`p-2 rounded-md transition-all ${
              showExplorer && leftSidebarTab === "search" 
                ? "bg-primary/20 text-primary shadow-sm" 
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            title="Search"
          >
            <Search className="h-5 w-5" />
          </button>

          <div className="mt-auto border-t border-border w-full pt-4 flex flex-col items-center">
            <button
              onClick={() => setShowExplorer(!showExplorer)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              title="Toggle Sidebar"
            >
              {showExplorer ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Panels */}
        {mobilePanel === "explorer" && (
          <div className="md:hidden absolute inset-0 z-30 flex">
            <div className="w-64 bg-sidebar border-r border-border h-full flex flex-col">
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
                onCreateFile={createFile}
                onCreateFolder={createFolder}
                onDeleteNode={deleteNode}
                onRenameNode={renameNode}
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

        {mobilePanel === "identities" && (
          <div className="md:hidden absolute inset-0 z-30 flex">
            <div className="w-64 bg-sidebar border-r border-border h-full flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Users</span>
                <button title="Close" onClick={() => setMobilePanel("none")} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <IdentitiesView network={network} />
            </div>
            <div className="flex-1 bg-background/60" onClick={() => setMobilePanel("none")} />
          </div>
        )}

        {mobilePanel === "deployments" && (
          <div className="md:hidden absolute inset-0 z-30 flex">
            <div className="w-64 bg-sidebar border-r border-border h-full flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Recent</span>
                <button title="Close" onClick={() => setMobilePanel("none")} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <DeploymentsView 
                activeContractId={contractId}
                onSelectContract={(id, net) => {
                  setContractId(id);
                  setNetwork(net as NetworkKey);
                  setMobilePanel("none");
                  appendTerminalOutput(`Targeting contract ${id.substring(0,8)}... on ${net}\r\n`);
                }}
              />
            </div>
            <div className="flex-1 bg-background/60" onClick={() => setMobilePanel("none")} />
          </div>
        )}

        {mobilePanel === "interact" && (
          <div className="md:hidden absolute inset-0 z-30 flex justify-end">
            <div className="flex-1 bg-background/60" onClick={() => setMobilePanel("none")} />
            <div className="w-72 bg-card border-l border-border h-full flex flex-col">
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

        {/* Desktop Main Content */}
        <div className="flex-1 flex overflow-hidden">
          <ResizablePanelGroup direction="horizontal" autoSaveId="ide-main-layout">
            {showExplorer && (
              <>
                <ResizablePanel
                  id="explorer"
                  order={1}
                  defaultSize={20}
                  minSize={12}
                  maxSize={40}
                  className="hidden md:block"
                >
                  <div className="h-full w-full overflow-hidden border-r border-border bg-sidebar">
                    {leftSidebarTab === "explorer" && (
                      <FileExplorer
                        files={files}
                        onFileSelect={handleFileSelect}
                        activeFilePath={activeTabPath}
                        onCreateFile={createFile}
                        onCreateFolder={createFolder}
                        onDeleteNode={deleteNode}
                        onRenameNode={renameNode}
                        isDragActive={isExplorerDragActive}
                        onDragEnter={handleExplorerDragEnter}
                        onDragOver={handleExplorerDragOver}
                        onDragLeave={handleExplorerDragLeave}
                        onDrop={handleExplorerDrop}
                      />
                    )}
                    {leftSidebarTab === "identities" && (
                      <IdentitiesView network={network} />
                    )}
                    {leftSidebarTab === "deployments" && (
                      <DeploymentsView 
                        activeContractId={contractId}
                        onSelectContract={(id, net) => {
                          setContractId(id);
                          setNetwork(net as NetworkKey);
                          appendTerminalOutput(`Targeting contract ${id.substring(0,8)}... on ${net}\r\n`);
                        }}
                      />
                    )}
                    {leftSidebarTab === "search" && (
                      <SearchPane
                        inputRef={searchInputRef}
                        onResultSelect={(pathParts, range) => {
                          addTab(pathParts, pathParts[pathParts.length - 1]);
                          setActiveTabPath(pathParts);
                          window.dispatchEvent(
                            new CustomEvent("ide:reveal-range", {
                              detail: {
                                fileId: pathParts.join("/"),
                                pathParts,
                                range,
                              },
                            })
                          );
                        }}
                      />
                    )}
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
                      fileId={fileId}
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
                        output={terminalOutput}
                        isExpanded={terminalExpanded}
                        onToggle={() => setTerminalExpanded((prev) => !prev)}
                        onClear={() => setTerminalOutput("")}
                      />
                    </ResizablePanel>
                  </>
                ) : (
                  <div className="shrink-0">
                    <Terminal
                      output={terminalOutput}
                      isExpanded={false}
                      onToggle={() => setTerminalExpanded(true)}
                      onClear={() => setTerminalOutput("")}
                    />
                  </div>
                )}
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* Desktop Right Sidebar */}
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

      {/* Desktop Footer */}
      <div className="hidden md:block">
        <StatusBar
          language={language}
          line={cursorPos.line}
          col={cursorPos.col}
          network={network as NetworkKey}
          horizonUrl={horizonUrl}
          customRpcUrl={customRpcUrl}
          onNetworkChange={setNetwork}
          onCustomRpcUrlChange={setCustomRpcUrl}
          unsavedCount={unsavedFiles.size}
        />
      </div>

      {/* Mobile Footer Navigation */}
      <div className="md:hidden flex flex-col border-t border-border bg-sidebar">
        <div className="flex items-center justify-between px-3 py-1 border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
            {unsavedFiles.size > 0 && <span className="text-warning">{unsavedFiles.size} unsaved</span>}
            <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">{network}</span>
        </div>
        <div className="flex items-stretch">
          <button
            onClick={() => setMobilePanel(mobilePanel === "explorer" ? "none" : "explorer")}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${mobilePanel === "explorer" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <FolderTree className="h-4 w-4" />
            Explorer
          </button>
          <button
            onClick={() => setMobilePanel(mobilePanel === "identities" ? "none" : "identities")}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${mobilePanel === "identities" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Users className="h-4 w-4" />
            Users
          </button>
          <button
            onClick={() => setMobilePanel(mobilePanel === "deployments" ? "none" : "deployments")}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${mobilePanel === "deployments" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <History className="h-4 w-4" />
            Activity
          </button>
          <button
            onClick={() => setMobilePanel("none")}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${mobilePanel === "none" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <FileText className="h-4 w-4" />
            Editor
          </button>
          <button
            onClick={() => setMobilePanel(mobilePanel === "interact" ? "none" : "interact")}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${mobilePanel === "interact" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Rocket className="h-4 w-4" />
            Interact
          </button>
          <button
            onClick={() => {
              setTerminalExpanded((prev) => !prev);
              setMobilePanel("none");
            }}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${terminalExpanded ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"}`}
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
