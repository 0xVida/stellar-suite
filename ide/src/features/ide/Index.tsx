"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

import CodeEditor from "@/components/ide/CodeEditor";
import { ContractPanel } from "@/components/ide/ContractPanel";
import { DeploymentsView } from "@/components/ide/DeploymentsView";
import { EditorTabs } from "@/components/ide/EditorTabs";
import { FileExplorer } from "@/components/ide/FileExplorer";
import { IdentitiesView } from "@/components/ide/IdentitiesView";
import { SearchPane } from "@/components/ide/SearchPane";
import { SecurityView } from "@/components/ide/SecurityView";
import { StatusBar } from "@/components/ide/StatusBar";
import { Terminal } from "@/components/ide/Terminal";
import { Toolbar } from "@/components/ide/Toolbar";
import { OutlineView } from "@/components/sidebar/OutlineView";
import { ActivityBar } from "@/components/layout/ActivityBar";
import { type NetworkKey } from "@/lib/networkConfig";
import { type FileNode } from "@/lib/sample-contracts";
import { useDeployedContractsStore } from "@/store/useDeployedContractsStore";
import { useDiagnosticsStore } from "@/store/useDiagnosticsStore";
import { useIdentityStore } from "@/store/useIdentityStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { parseCargoAuditOutput } from "@/utils/cargoAuditParser";
import { parseMixedOutput } from "@/utils/cargoParser";
import { parseClippyOutput, type ClippyLint } from "@/utils/clippyParser";
import { createStreamProcessor, readCompileResponse } from "@/utils/compileStream";

const COMPILE_API_URL = process.env.NEXT_PUBLIC_COMPILE_API_URL ?? "/api/compile";

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

const findNode = (nodes: FileNode[], pathParts: string[]): FileNode | null => {
  for (const node of nodes) {
    if (node.name === pathParts[0]) {
      if (pathParts.length === 1) return node;
      if (node.children) return findNode(node.children, pathParts.slice(1));
    }
  }

  return null;
};

const replaceByLineColumn = (
  content: string,
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number,
  replacement: string,
) => {
  const lines = content.split("\n");

  const startLineIndex = Math.max(0, startLine - 1);
  const endLineIndex = Math.max(0, endLine - 1);

  const prefix = lines[startLineIndex]?.slice(0, Math.max(0, startCol - 1)) ?? "";
  const suffix = lines[endLineIndex]?.slice(Math.max(0, endCol - 1)) ?? "";

  const before = lines.slice(0, startLineIndex).join("\n");
  const after = lines.slice(endLineIndex + 1).join("\n");

  const middle = `${prefix}${replacement}${suffix}`;

  return [before, middle, after].filter((part) => part.length > 0).join("\n");
};

const formatRunTime = () =>
  new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export default function Index() {
  const {
    files,
    activeTabPath,
    network,
    isCompiling,
    buildState,
    contractId,
    showExplorer,
    showPanel,
    leftSidebarTab,
    setIsCompiling,
    setBuildState,
    setContractId,
    setShowExplorer,
    setShowPanel,
    setNetwork,
    setLeftSidebarTab,
    setTerminalExpanded,
    appendTerminalOutput,
    updateFileContent,
    addTab,
    setActiveTabPath,
  } = useWorkspaceStore();

  const { activeContext, activeIdentity, loadIdentities } = useIdentityStore();
  const { setDiagnostics, clearDiagnostics } = useDiagnosticsStore();
  const { addContract } = useDeployedContractsStore();

  const [invokeState, setInvokeState] = useState<{
    phase: "idle" | "preparing" | "success" | "failed";
    message: string;
  }>({ phase: "idle", message: "Invoke" });

  const [clippyLints, setClippyLints] = useState<ClippyLint[]>([]);
  const [isRunningClippy, setIsRunningClippy] = useState(false);
  const [clippyError, setClippyError] = useState<string | null>(null);
  const [lastClippyRunAt, setLastClippyRunAt] = useState<string | null>(null);

  const [auditFindings, setAuditFindings] = useState<ReturnType<typeof parseCargoAuditOutput>["findings"]>([]);
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [lastAuditRunAt, setLastAuditRunAt] = useState<string | null>(null);

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  const contractName = useMemo(
    () => activeTabPath[0] ?? files[0]?.name ?? "hello_world",
    [activeTabPath, files],
  );

  const compilePayload = useMemo(
    () => ({
      contractName,
      network,
      activeFilePath: activeTabPath.join("/"),
      files: flattenProjectFiles(files),
    }),
    [activeTabPath, contractName, files, network],
  );

  const handleCompile = useCallback(async () => {
    setIsCompiling(true);
    setBuildState("building");
    clearDiagnostics();
    setTerminalExpanded(true);
    appendTerminalOutput("> Compiling contract...\r\n");
    appendTerminalOutput(`Target network: ${network}\r\n`);

    const processor = createStreamProcessor({ onTerminalData: appendTerminalOutput });

    try {
      const response = await fetch(COMPILE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(compilePayload),
      });

      const output = await readCompileResponse(response, processor);
      const diagnostics = parseMixedOutput(output, contractName);
      setDiagnostics(diagnostics);

      if (!response.ok) {
        throw new Error(output.trim() || `Build request failed with status ${response.status}`);
      }

      appendTerminalOutput("✓ Compilation finished.\r\n");
      setBuildState("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Build failed";
      appendTerminalOutput(`Build failed: ${message}\r\n`);
      setBuildState("error");
    } finally {
      setIsCompiling(false);
      setTimeout(() => setBuildState("idle"), 1000);
    }
  }, [
    appendTerminalOutput,
    clearDiagnostics,
    compilePayload,
    contractName,
    network,
    setBuildState,
    setDiagnostics,
    setIsCompiling,
    setTerminalExpanded,
  ]);

  const handleRunClippy = useCallback(async () => {
    setIsRunningClippy(true);
    setClippyError(null);
    setTerminalExpanded(true);
    appendTerminalOutput("> Running cargo clippy --message-format=json\r\n");

    try {
      const response = await fetch("/api/clippy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractName,
          files: compilePayload.files,
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        exitCode?: number;
        stdout?: string;
        stderr?: string;
        error?: string;
      };

      const output = `${payload.stdout ?? ""}${payload.stderr ?? ""}`;
      const parsedClippy = parseClippyOutput(output, contractName);
      const parsedDiagnostics = parseMixedOutput(output, contractName);

      setDiagnostics(
        parsedDiagnostics.length > 0 ? parsedDiagnostics : parsedClippy.diagnostics,
      );
      setClippyLints(parsedClippy.lints);
      setLastClippyRunAt(formatRunTime());

      if (!response.ok || payload.error) {
        const message = payload.error || `Clippy request failed (status ${response.status})`;
        setClippyError(message);
      }

      appendTerminalOutput(
        `${output || "No Clippy output returned."}\r\n`,
      );
      appendTerminalOutput(
        `Clippy finished with ${parsedClippy.lints.length} lint(s).\r\n`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clippy request failed";
      setClippyError(message);
      appendTerminalOutput(`Clippy failed: ${message}\r\n`);
    } finally {
      setIsRunningClippy(false);
    }
  }, [appendTerminalOutput, compilePayload.files, contractName, setDiagnostics, setTerminalExpanded]);

  const handleRunAudit = useCallback(async () => {
    setIsRunningAudit(true);
    setAuditError(null);
    setTerminalExpanded(true);
    appendTerminalOutput("> Running cargo audit --json\r\n");

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractName,
          files: compilePayload.files,
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        exitCode?: number;
        stdout?: string;
        stderr?: string;
        error?: string;
      };

      const rawOutput = payload.stdout?.trim().length
        ? payload.stdout
        : payload.stderr ?? "";

      const parsedAudit = parseCargoAuditOutput(rawOutput);
      setAuditFindings(parsedAudit.findings);
      setLastAuditRunAt(formatRunTime());

      if (payload.error) {
        setAuditError(payload.error);
      } else if (parsedAudit.errors.length > 0) {
        setAuditError(parsedAudit.errors.join("\n"));
      } else if (!response.ok) {
        setAuditError(`Audit request failed (status ${response.status})`);
      }

      if (rawOutput.length > 0) {
        appendTerminalOutput(`${rawOutput}\r\n`);
      }

      appendTerminalOutput(
        `Audit finished with ${parsedAudit.findings.length} vulnerability finding(s).\r\n`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Audit request failed";
      setAuditError(message);
      appendTerminalOutput(`Audit failed: ${message}\r\n`);
    } finally {
      setIsRunningAudit(false);
    }
  }, [appendTerminalOutput, compilePayload.files, contractName, setTerminalExpanded]);

  const handleApplyClippyFix = useCallback(
    (lint: ClippyLint) => {
      if (!lint.autoFix) {
        return;
      }

      const filePath = lint.autoFix.fileId.split("/");
      const file = findNode(files, filePath);

      if (!file || file.type !== "file") {
        setClippyError(`Unable to apply fix: file '${lint.autoFix.fileId}' not found.`);
        return;
      }

      const updated = replaceByLineColumn(
        file.content ?? "",
        lint.autoFix.line,
        lint.autoFix.column,
        lint.autoFix.endLine,
        lint.autoFix.endColumn,
        lint.autoFix.replacement,
      );

      updateFileContent(filePath, updated);
      appendTerminalOutput(
        `Applied auto-fix for ${lint.lintCode} at ${lint.autoFix.fileId}:${lint.autoFix.line}.\r\n`,
      );
    },
    [appendTerminalOutput, files, updateFileContent],
  );

  const handleDeploy = useCallback(() => {
    setTerminalExpanded(true);
    appendTerminalOutput(`Deploying to ${network}...\r\n`);

    setTimeout(() => {
      const fullId =
        `CD${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
          .substring(0, 56)
          .toUpperCase();
      setContractId(fullId);
      addContract(fullId, network, contractName);
      appendTerminalOutput(`✓ Contract deployed! ID: ${fullId}\r\n`);
    }, 1200);
  }, [addContract, appendTerminalOutput, contractName, network, setContractId, setTerminalExpanded]);

  const handleTest = useCallback(() => {
    setTerminalExpanded(true);
    appendTerminalOutput("Running tests...\r\n");
    setTimeout(() => {
      appendTerminalOutput("✓ test_hello ... ok\r\n");
      appendTerminalOutput("test result: ok. 1 passed; 0 failed;\r\n");
    }, 900);
  }, [appendTerminalOutput, setTerminalExpanded]);

  const handleInvoke = useCallback(
    async (fn: string, args: string) => {
      if (!contractId) {
        appendTerminalOutput("Invoke aborted: no contract selected.\r\n");
        return;
      }

      setTerminalExpanded(true);
      const signer =
        activeContext?.type === "web-wallet"
          ? "browser-wallet"
          : activeIdentity?.nickname ?? "anonymous";

      appendTerminalOutput(`Invoking ${fn}(${args}) as ${signer}...\r\n`);
      setInvokeState({ phase: "preparing", message: "Preparing..." });

      setTimeout(() => {
        appendTerminalOutput('Result: ["ok"]\r\n');
        setInvokeState({ phase: "success", message: "Confirmed" });
        setTimeout(() => {
          setInvokeState({ phase: "idle", message: "Invoke" });
        }, 1500);
      }, 900);
    },
    [activeContext, activeIdentity, appendTerminalOutput, contractId, setTerminalExpanded],
  );

  const activeFileContext = useMemo(() => {
    if (!activeTabPath.length) return null;

    const file = findNode(files, activeTabPath);
    if (!file || file.type !== "file") return null;

    return {
      path: activeTabPath.join("/"),
      language: file.language ?? "text",
      content: file.content ?? "",
    };
  }, [activeTabPath, files]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Toolbar
        onCompile={handleCompile}
        onDeploy={handleDeploy}
        onTest={handleTest}
        isCompiling={isCompiling}
        buildState={buildState}
        network={network}
        onNetworkChange={setNetwork}
        onRunClippy={handleRunClippy}
        isRunningClippy={isRunningClippy}
        onRunAudit={handleRunAudit}
        isRunningAudit={isRunningAudit}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ActivityBar
          activeTab={leftSidebarTab}
          onTabChange={(tab) => {
            if (leftSidebarTab === tab && showExplorer) {
              setShowExplorer(false);
              return;
            }

            setLeftSidebarTab(tab);
            setShowExplorer(true);
          }}
          sidebarVisible={showExplorer}
          onToggleSidebar={() => setShowExplorer(!showExplorer)}
        />

        {showExplorer ? (
          <aside className="hidden w-72 shrink-0 border-r border-border bg-sidebar md:block">
            {leftSidebarTab === "explorer" ? <FileExplorer /> : null}
            {leftSidebarTab === "deployments" ? (
              <DeploymentsView
                activeContractId={contractId}
                onSelectContract={(id, net) => {
                  setContractId(id);
                  setNetwork(net as NetworkKey);
                  appendTerminalOutput(
                    `Targeting contract ${id.substring(0, 8)}... on ${net}\r\n`,
                  );
                }}
              />
            ) : null}
            {leftSidebarTab === "identities" ? <IdentitiesView network={network} /> : null}
            {leftSidebarTab === "search" ? (
              <SearchPane
                onResultSelect={(pathParts, _range) => {
                  addTab(pathParts, pathParts[pathParts.length - 1]);
                  setActiveTabPath(pathParts);
                }}
              />
            ) : null}
            {leftSidebarTab === "outline" ? <OutlineView /> : null}
            {leftSidebarTab === "security" ? (
              <SecurityView
                clippyLints={clippyLints}
                clippyRunning={isRunningClippy}
                clippyError={clippyError}
                onRunClippy={handleRunClippy}
                onApplyClippyFix={handleApplyClippyFix}
                auditFindings={auditFindings}
                auditRunning={isRunningAudit}
                auditError={auditError}
                onRunAudit={handleRunAudit}
                lastClippyRunAt={lastClippyRunAt}
                lastAuditRunAt={lastAuditRunAt}
              />
            ) : null}
          </aside>
        ) : null}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <EditorTabs />
          <div className="min-h-0 flex-1 overflow-hidden">
            <CodeEditor />
          </div>
          <div className="h-56 shrink-0 border-t border-border">
            <Terminal />
          </div>
        </main>

        <aside className="hidden md:flex">
          {showPanel ? (
            <div className="w-80 border-l border-border bg-card">
              <ContractPanel contractId={contractId} onInvoke={handleInvoke} invokeState={invokeState} />
            </div>
          ) : null}

          <div className="flex h-full flex-col border-l border-border bg-card">
            <button
              onClick={() => setShowPanel(!showPanel)}
              className="p-2 text-muted-foreground transition-colors hover:text-foreground"
              title="Toggle Panel"
              aria-label="Toggle panel"
            >
              {showPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
          </div>
        </aside>
      </div>

      <div className="hidden md:block">
        <StatusBar language={activeFileContext?.language} />
      </div>
    </div>
  );
}
