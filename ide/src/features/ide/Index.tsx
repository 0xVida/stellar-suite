"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { contract } from "@stellar/stellar-sdk";
import { Api, Server } from "@stellar/stellar-sdk/rpc";
import {
  PanelRightClose,
  PanelRightOpen,
  Activity,
} from "lucide-react";
import { toast } from "sonner";


import { StateExplorer } from "@/components/ide/StateExplorer";
import { ContractPanel } from "@/components/ide/ContractPanel";
import { DeploymentStepper } from "@/components/ide/DeploymentStepper";
import { SidebarTab } from "@/store/workspaceStore";
import { LazySidebar } from "@/components/layout/LazySidebar";
import { HotkeysModal } from "@/components/ide/HotkeysModal";
import { TestingView, TemplatesView } from "@/components/ide/TestingView";
import { GeneratePropertyTest } from "@/components/Testing/GeneratePropertyTest";
import { ProptestView } from "@/components/Panels/ProptestView";
import { EventsPane } from "@/components/ide/EventsPane";
import { StatusBar } from "@/components/ide/StatusBar";
import { Terminal } from "@/components/ide/Terminal";
import { useTerminalBridge } from "@/hooks/useTerminalBridge";
import { TestResultsLog } from "@/components/terminal/TestResultsLog";
import { useLayoutStore } from "@/lib/layout/layoutStore";

import CodeEditor from "@/components/ide/CodeEditor";
import { SplitLayout } from "@/components/layout/SplitLayout";
import { Toolbar } from "@/components/ide/Toolbar";
import { StarterProjectWizard } from "@/components/modals/StarterProjectWizard";
import { ActivityBar, type ActivityTab } from "@/components/layout/ActivityBar";
import { NETWORK_CONFIG, type NetworkKey } from "@/lib/networkConfig";
import { type FileNode } from "@/lib/sample-contracts";
import {
  discoverWorkspaceTests,
  hasRootTestsDirectory,
  listIntegrationTargets,
} from "@/lib/integrationTestDiscovery";
import { instantiateContract } from "@/lib/contractInstantiator";
import { useDeployedContractsStore } from "@/store/useDeployedContractsStore";
import useEnvironmentSlotsStore from "@/store/useEnvironmentSlotsStore";
import { useDeploymentStore } from "@/store/useDeploymentStore";
import { useDiagnosticsStore } from "@/store/useDiagnosticsStore";
import { useIdentityStore } from "@/store/useIdentityStore";
import {
  useWorkspaceStore,
  flattenWorkspaceFiles,
} from "@/store/workspaceStore";
import { useSharedEnvironmentStore } from "@/store/useSharedEnvironmentStore";
import { useAuditLogStore } from "@/store/useAuditLogStore";
import { useUserSettingsStore } from "@/store/useUserSettingsStore";
import { useAuth } from "@/hooks/useAuth";
import { useVCSStore } from "@/store/vcsStore";
import { useErrorHelpStore } from "@/store/useErrorHelpStore";
import ErrorHelpPanel from "@/components/ide/ErrorHelpPanel";
import { useCloudSyncStore } from "@/store/useCloudSyncStore";
import { ConflictModal } from "@/components/cloud/ConflictModal";
import { parseCargoAuditOutput } from "@/utils/cargoAuditParser";
import { type ClippyLint } from "@/utils/clippyParser";
import {
  createStreamProcessor,
  readCompileResponse,
} from "@/utils/compileStream";
import { getDiagnosticsWorker } from "./workers/DiagnosticsWorker";
import {
  createStructuredTestOutputFromCargoRun,
  createSimulatedCargoTestOutput,
  formatTestRunForTerminal,
  parseStructuredTestOutput,
  resolveWorkspacePathForTrace,
  toRevealRange,
  type TestRunResult,
} from "@/lib/testResults";
import { useCompilationWorker } from "@/hooks/useCompilationWorker";
import {
  buildSimulationComparison,
  fetchCurrentLedgerEntriesForSimulation,
  type SimulationComparisonData,
} from "@/lib/simulationDiff";
import { useTransactionResultsStore } from "@/store/useTransactionResultsStore";
import { executeWriteTransaction } from "@/lib/transactionExecution";
import { useWalletStore } from "@/store/walletStore";
import { SimulationDiff } from "@/components/ide/SimulationDiff";

const COMPILE_API_URL =
  process.env.NEXT_PUBLIC_COMPILE_API_URL ?? "/api/compile";

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

  const prefix =
    lines[startLineIndex]?.slice(0, Math.max(0, startCol - 1)) ?? "";
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


// TestingSidebar — three sub-tabs: Snippets | Templates | Generate


function TestingSidebar() {
  const [tab, setTab] = useState<"snippets" | "templates" | "generate">(
    "snippets",
  );
  return (
    <div className="flex h-full flex-col">
      {/* Sub-tab bar */}
      <div className="flex shrink-0 border-b border-sidebar-border">
        {(["snippets", "templates", "generate"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors border-b-2 ${
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "snippets"
              ? "Snippets"
              : t === "templates"
                ? "Templates"
                : "Generate"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "snippets" && <TestingView />}
        {tab === "templates" && <TemplatesView />}
        {tab === "generate" && <GeneratePropertyTest />}
      </div>
    </div>
  );
}

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
    hydrationComplete,
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
    mockLedgerState,
    diffViewPath,
    setDiffViewPath,
    setTerminalOutput,
    customRpcUrl,
    horizonUrl,
    networkPassphrase,
  } = useWorkspaceStore();
  const [isHotkeysOpen, setIsHotkeysOpen] = useState(false);
  useTerminalBridge();
  
  if (!hydrationComplete) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Activity className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground animate-pulse">Initializing Stellar IDE...</p>
        </div>
      </div>
    );
  }

  const { compile: workerCompile, cancel: cancelCompile } = useCompilationWorker();

  const { activeContext, activeIdentity, loadIdentities, webWalletPublicKey } = useIdentityStore();
  const walletType = useWalletStore((s) => s.walletType);
  const appendTransactionLog = useTransactionResultsStore((state) => state.appendLog);
  const { localRepoInitialized, hydrateLocalRepo, refreshLocalStatuses } =
    useVCSStore();
  const sharedEnvConfig = useSharedEnvironmentStore((s) => s.config);
  const { addLog: addAuditLog } = useAuditLogStore();
  const { user, isAuthenticated } = useAuth();
  const auditUser = user?.name ?? user?.email ?? "Guest";
  const { setDiagnostics, clearDiagnostics } = useDiagnosticsStore();
  const { addContract } = useDeployedContractsStore();
  const {
    isOpen: isErrorHelpOpen,
    errorCode,
    closeErrorHelp,
  } = useErrorHelpStore();
  const { scheduleAutoSave, scheduleTabSync, syncStatus, conflictData } = useCloudSyncStore();
  const {
    isDeployModalOpen,
    deploymentStep,
    deploymentError,
    pendingWasmHash,
    openDeployModal,
    closeDeployModal,
    setDeploymentStep,
    setDeploymentError,
    setPendingWasmHash,
    resetDeployment,
  } = useDeploymentStore();

  // Contract ID produced by the current deployment (shown in stepper on success)
  const [deployedContractId, setDeployedContractId] = useState<string | null>(
    null,
  );

  const [bottomTab, setBottomTab] = useState<"console" | "events" | "proptest">(
    "console",
  );
  const [rightView, setRightView] = useState<"interact" | "state">("interact");

  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    if (files.length === 0) {
      setWizardOpen(true);
    }
  }, [files.length]);

  // Propagate shared/workspace environment settings to the personal store
  // once the workspace store has finished rehydrating from IndexedDB.
  useEffect(() => {
    if (!hydrationComplete) return;
    if (!sharedEnvConfig.enabled) return;
    if (sharedEnvConfig.network) setNetwork(sharedEnvConfig.network);
  }, [
    hydrationComplete,
    sharedEnvConfig.enabled,
    sharedEnvConfig.network,
    setNetwork,
  ]);

  const [invokeState, setInvokeState] = useState<{
    phase: "idle" | "preparing" | "signing" | "submitting" | "confirming" | "success" | "failed";
    message: string;
  }>({ phase: "idle", message: "Invoke" });

  const [simulationDiffData, setSimulationDiffData] = useState<{
    comparison: SimulationComparisonData;
    fn: string;
    args: string;
  } | null>(null);
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);

  const [clippyLints, setClippyLints] = useState<ClippyLint[]>([]);
  const [isRunningClippy, setIsRunningClippy] = useState(false);
  const [clippyError, setClippyError] = useState<string | null>(null);
  const [lastClippyRunAt, setLastClippyRunAt] = useState<string | null>(null);

  const [auditFindings, setAuditFindings] = useState<
    ReturnType<typeof parseCargoAuditOutput>["findings"]
  >([]);
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [lastAuditRunAt, setLastAuditRunAt] = useState<string | null>(null);
  const [testRun, setTestRun] = useState<TestRunResult | null>(null);

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  useEffect(() => {
    if (!hydrationComplete) {
      return;
    }

    void hydrateLocalRepo(flattenWorkspaceFiles(files));
  }, [files, hydrateLocalRepo, hydrationComplete]);

  // Auto-save to cloud (throttled 5 s) whenever files change and user is signed in
  useEffect(() => {
    if (!isAuthenticated || !user || !hydrationComplete) return;
    const userId = user.id ?? user.email ?? "anon";
    scheduleAutoSave(userId, flattenWorkspaceFiles(files), network, openTabs, activeTabPath);
  }, [
    files,
    isAuthenticated,
    user,
    network,
    hydrationComplete,
    scheduleAutoSave,
    openTabs,
    activeTabPath,
  ]);

  // Real-time tab sync (throttled 1 s) - separate from file auto-save for lower latency
  useEffect(() => {
    if (!isAuthenticated || !user || !hydrationComplete) return;
    const userId = user.id ?? user.email ?? "anon";
    scheduleTabSync(userId, flattenWorkspaceFiles(files), network, openTabs, activeTabPath);
  }, [
    openTabs,
    activeTabPath,
    isAuthenticated,
    user,
    network,
    hydrationComplete,
    scheduleTabSync,
    files,
  ]);

  useEffect(() => {
    if (!hydrationComplete || !localRepoInitialized) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshLocalStatuses(
        flattenWorkspaceFiles(useWorkspaceStore.getState().files),
      );
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [hydrationComplete, localRepoInitialized, refreshLocalStatuses]);

  useEffect(() => {
    const handleRefTab = () => {
      setLeftSidebarTab("references");
      setShowExplorer(true);
    };
    window.addEventListener("referencesFound", handleRefTab);
    return () => window.removeEventListener("referencesFound", handleRefTab);
  }, [setLeftSidebarTab, setShowExplorer]);

  const { snapshots, setActiveSnapshotId } = useLayoutStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const index = parseInt(e.key, 10);
      if (isNaN(index) || index < 1 || index > 9) return;
      const snapshot = snapshots[index - 1];
      if (!snapshot) return;
      e.preventDefault();
      setShowExplorer(snapshot.showExplorer);
      setShowPanel(snapshot.showPanel);
      setLeftSidebarTab(snapshot.leftSidebarTab);
      setActiveSnapshotId(snapshot.id);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [snapshots, setShowExplorer, setShowPanel, setLeftSidebarTab, setActiveSnapshotId]);

  const contractName = useMemo(
    () => activeTabPath[0] ?? files[0]?.name ?? "hello_world",
    [activeTabPath, files],
  );

  const environmentSlots = useEnvironmentSlotsStore((s) => s.slots);
  const selectedEnvironmentSlotId = useEnvironmentSlotsStore(
    (s) => s.selectedSlotId,
  );

  const selectedEnvironmentSlot = useMemo(() => {
    return (
      environmentSlots[selectedEnvironmentSlotId] ?? environmentSlots["staging"]
    );
  }, [environmentSlots, selectedEnvironmentSlotId]);

  const compilePayload = useMemo(
    () => ({
      contractName,
      network,
      activeFilePath: activeTabPath.join("/"),
      files: flattenProjectFiles(files),
      cargoFeatures: selectedEnvironmentSlot?.cargoFeatures ?? [],
      envSlot: selectedEnvironmentSlot?.id,
    }),
    [activeTabPath, contractName, files, network, selectedEnvironmentSlot],
  );

  const handleCompile = useCallback(async () => {
    setIsCompiling(true);
    setBuildState("building");
    clearDiagnostics();
    setTerminalExpanded(true);
    appendTerminalOutput("> Compiling contract...\r\n");
    appendTerminalOutput(`Target network: ${network}\r\n`);
    appendTerminalOutput(`[env: ${selectedEnvironmentSlot.id}]\r\n`);
    
    const { experimentalLocalBuild } = useUserSettingsStore.getState();
    if (experimentalLocalBuild) {
      appendTerminalOutput("[EXPERIMENTAL] Local browser-based compilation enabled\r\n");
      appendTerminalOutput("⚠️  WARNING: This mode uses significant browser memory (~300-500MB)\r\n");
      appendTerminalOutput("⚠️  WARNING: Not recommended for large projects or older devices\r\n");
    }
    
    if (
      selectedEnvironmentSlot.cargoFeatures &&
      selectedEnvironmentSlot.cargoFeatures.length > 0
    ) {
      appendTerminalOutput(
        `cargo build --features ${selectedEnvironmentSlot.cargoFeatures.join(",")}\r\n`,
      );
    }

    let wasCancelled = false;

    try {
      const result = await workerCompile({
        url: COMPILE_API_URL,
        payload: compilePayload,
        onChunk: appendTerminalOutput,
      });

      // Offload diagnostics parsing to worker to keep UI responsive
      const diagnosticsWorker = getDiagnosticsWorker();
      const diagnostics = await diagnosticsWorker.parseDiagnostics(result.output, contractName);
      setDiagnostics(diagnostics);

      if (!result.ok) {
        throw new Error(
          result.output.trim() ||
            `Build request failed with status ${result.status}`,
        );
      }

      appendTerminalOutput("✓ Compilation finished.\r\n");
      setBuildState("success");
      addAuditLog({
        category: "build",
        action: "Contract Build",
        status: "success",
        user: auditUser,
        params: { contractName, network, experimentalLocalBuild },
        details: "Contract compiled successfully",
        rawJson: { contractName, network, timestamp: new Date().toISOString(), experimentalLocalBuild },
      });
    } catch (error) {
      if (error instanceof Error && "cancelled" in error) {
        wasCancelled = true;
        appendTerminalOutput("Build cancelled.\r\n");
        setBuildState("idle");
      } else {
        const message = error instanceof Error ? error.message : "Build failed";
        appendTerminalOutput(`Build failed: ${message}\r\n`);
        setBuildState("error");
        addAuditLog({
          category: "build",
          action: "Contract Build",
          status: "failure",
          user: auditUser,
          params: { contractName, network },
          details: message,
          rawJson: {
            contractName,
            network,
            error: message,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } finally {
      setIsCompiling(false);
      if (!wasCancelled) {
        setTimeout(() => setBuildState("idle"), 1000);
      }
    }
  }, [
    addAuditLog,
    appendTerminalOutput,
    auditUser,
    clearDiagnostics,
    compilePayload,
    contractName,
    network,
    selectedEnvironmentSlot,
    setBuildState,
    setDiagnostics,
    setIsCompiling,
    setTerminalExpanded,
    workerCompile,
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

      // Offload diagnostics parsing to worker to keep UI responsive
      const diagnosticsWorker = getDiagnosticsWorker();
      const [parsedClippy, parsedDiagnostics] = await Promise.all([
        diagnosticsWorker.parseClippy(output, contractName),
        diagnosticsWorker.parseDiagnostics(output, contractName)
      ]);

      setDiagnostics(
        parsedDiagnostics.length > 0
          ? parsedDiagnostics
          : parsedClippy.diagnostics,
      );
      setClippyLints(parsedClippy.lints);
      setLastClippyRunAt(formatRunTime());

      if (!response.ok || payload.error) {
        const message =
          payload.error || `Clippy request failed (status ${response.status})`;
        setClippyError(message);
      }

      appendTerminalOutput(`${output || "No Clippy output returned."}\r\n`);
      appendTerminalOutput(
        `Clippy finished with ${parsedClippy.lints.length} lint(s).\r\n`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Clippy request failed";
      setClippyError(message);
      appendTerminalOutput(`Clippy failed: ${message}\r\n`);
    } finally {
      setIsRunningClippy(false);
    }
  }, [
    appendTerminalOutput,
    compilePayload.files,
    contractName,
    setDiagnostics,
    setTerminalExpanded,
  ]);

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
        : (payload.stderr ?? "");

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
      const message =
        error instanceof Error ? error.message : "Audit request failed";
      setAuditError(message);
      appendTerminalOutput(`Audit failed: ${message}\r\n`);
    } finally {
      setIsRunningAudit(false);
    }
  }, [
    appendTerminalOutput,
    compilePayload.files,
    contractName,
    setTerminalExpanded,
  ]);

  const handleApplyClippyFix = useCallback(
    (lint: ClippyLint) => {
      if (!lint.autoFix) {
        return;
      }

      const filePath = lint.autoFix.fileId.split("/");
      const file = findNode(files, filePath);

      if (!file || file.type !== "file") {
        setClippyError(
          `Unable to apply fix: file '${lint.autoFix.fileId}' not found.`,
        );
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

  /**
   * Run the instantiation step (step 2) given an already-uploaded WASM hash.
   * Extracted so it can be called both from the sequential flow and from
   * the "Retry instantiation" button in the stepper.
   */
  const runInstantiate = useCallback(
    async (wasmHash: string) => {
      const rpcUrl =
        network === "local"
          ? useWorkspaceStore.getState().customRpcUrl
          : (NETWORK_CONFIG[network as NetworkKey]?.horizon ??
            "https://soroban-testnet.stellar.org:443");
      const networkPassphrase =
        NETWORK_CONFIG[network as NetworkKey]?.passphrase ??
        "Test SDF Network ; September 2015";

      setDeploymentStep("instantiating");
      appendTerminalOutput("> Instantiating contract from WASM hash…\r\n");

      const { contractId: newContractId, transactionHash } =
        await instantiateContract({
          wasmHash,
          rpcUrl,
          networkPassphrase,
          activeContext,
          activeIdentity,
          webWalletPublicKey: null,
          walletType: null,
          onStatus: (s) => {
            appendTerminalOutput(`  [instantiate] ${s.message}\r\n`);
          },
        });

      setContractId(newContractId);
      setDeployedContractId(newContractId);
      addContract(newContractId, network as NetworkKey, contractName);
      setPendingWasmHash(null);

      appendTerminalOutput(`✓ Contract instantiated! ID: ${newContractId}\r\n`);
      appendTerminalOutput(`  Transaction: ${transactionHash}\r\n`);

      addAuditLog({
        category: "deploy",
        action: "Contract Deploy",
        status: "success",
        user: auditUser,
        params: {
          contractId: newContractId,
          contractName,
          network,
          wasmHash,
          transactionHash,
        },
        details: `Deployed to ${network} — ID: ${newContractId}`,
        rawJson: {
          contractId: newContractId,
          contractName,
          network,
          wasmHash,
          transactionHash,
          timestamp: new Date().toISOString(),
        },
      });

      setDeploymentStep("success");
      toast.success(`Contract deployed: ${newContractId.substring(0, 8)}…`);
    },
    [
      addAuditLog,
      activeContext,
      activeIdentity,
      addContract,
      appendTerminalOutput,
      auditUser,
      contractName,
      network,
      setContractId,
      setDeploymentStep,
      setPendingWasmHash,
    ],
  );

  /**
   * Full two-phase deployment:
   *   Phase 1 — compile + upload WASM  → wasmHash
   *   Phase 2 — createContract         → contractId (C...)
   */
  const handleDeploy = useCallback(async () => {
    appendTerminalOutput(`[env: ${selectedEnvironmentSlot.id}]\r\n`);
    if (
      selectedEnvironmentSlot.cargoFeatures &&
      selectedEnvironmentSlot.cargoFeatures.length > 0
    ) {
      appendTerminalOutput(
        `cargo build --features ${selectedEnvironmentSlot.cargoFeatures.join(",")}\r\n`,
      );
    }

    if (selectedEnvironmentSlot.id === "production") {
      const input = prompt("Type PROD to deploy to production");
      if (input !== "PROD") {
        appendTerminalOutput(
          "Production deploy aborted: confirmation mismatch.\r\n",
        );
        return;
      }
    }

    if (selectedEnvironmentSlot.contractId) {
      appendTerminalOutput(
        `Using pinned contract: ${selectedEnvironmentSlot.contractId}\r\n`,
      );
      setContractId(selectedEnvironmentSlot.contractId);
      return;
    }

    setDeployedContractId(null);
    openDeployModal();
    setDeploymentStep("simulating");
    setDeploymentError(null);
    setPendingWasmHash(null);
    setTerminalExpanded(true);
    appendTerminalOutput(`> Deploying to ${network}…\r\n`);

    try {
      // Phase 1: compile + upload WASM
      setDeploymentStep("uploading");
      appendTerminalOutput("> Compiling and uploading WASM…\r\n");

      const response = await fetch(COMPILE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(compilePayload),
      });

      const processor = createStreamProcessor({
        onTerminalData: appendTerminalOutput,
      });
      const output = await readCompileResponse(response, processor);

      if (!response.ok) {
        throw new Error(
          output.trim() || `Build failed with status ${response.status}`,
        );
      }

      // Extract WASM hash from compile output
      let wasmHash: string | null = null;
      try {
        const parsed = JSON.parse(output) as { contractHash?: string | null };
        wasmHash = parsed.contractHash ?? null;
      } catch {
        const match = output.match(/contract[_\s]?hash[:\s]+([a-f0-9]{64})/i);
        wasmHash = match?.[1] ?? null;
      }

      if (!wasmHash) {
        throw new Error(
          "WASM uploaded but no contract hash was returned. " +
            "Cannot proceed to instantiation.",
        );
      }

      appendTerminalOutput(`✓ WASM uploaded. Hash: ${wasmHash}\r\n`);
      // Persist hash so the user can retry instantiation without re-uploading
      setPendingWasmHash(wasmHash);

      // Phase 2: instantiate contract
      await runInstantiate(wasmHash);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deployment failed";
      setDeploymentStep("error");
      setDeploymentError(message);
      appendTerminalOutput(`✗ Deployment failed: ${message}\r\n`);
      toast.error(message);
      addAuditLog({
        category: "deploy",
        action: "Contract Deploy",
        status: "failure",
        user: auditUser,
        params: { contractName, network },
        details: message,
        rawJson: {
          contractName,
          network,
          error: message,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }, [
    addAuditLog,
    appendTerminalOutput,
    auditUser,
    compilePayload,
    contractName,
    network,
    selectedEnvironmentSlot,
    openDeployModal,
    runInstantiate,
    setDeploymentError,
    setDeploymentStep,
    setContractId,
    setPendingWasmHash,
    setTerminalExpanded,
  ]);

  const handleTest = useCallback(() => {
    void (async () => {
      setTerminalExpanded(true);

      if (mockLedgerState.entries.length > 0) {
        appendTerminalOutput(
          `Injecting ${mockLedgerState.entries.length} mock ledger ${mockLedgerState.entries.length === 1 ? "entry" : "entries"} via --ledger-snapshot...\r\n`,
        );
        appendTerminalOutput(
          `Mock state: ${JSON.stringify(mockLedgerState)}\r\n`,
        );
      }

      const discoveredTests = discoverWorkspaceTests(files, contractName);
      const integrationTargets = listIntegrationTargets(discoveredTests);
      const hasRootTests = hasRootTestsDirectory(files, contractName);

      if (discoveredTests.length === 0) {
        appendTerminalOutput(
          "No Rust tests discovered for the active contract.\r\n",
        );
        return;
      }

      appendTerminalOutput(
        `Detected ${discoveredTests.length} test(s): ${discoveredTests.filter((test) => test.testType === "integration").length} integration, ${discoveredTests.filter((test) => test.testType === "unit").length} unit.\r\n`,
      );
      if (hasRootTests) {
        appendTerminalOutput(
          "Integration tests folder detected at contract root: tests/.\r\n",
        );
      }

      try {
        const response = await fetch("/api/run-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contractName,
            files: compilePayload.files,
            mode: "full",
            integrationTargets,
          }),
        });

        const payload = (await response.json()) as {
          success: boolean;
          mode?: "full" | "failed-only";
          command?: string;
          stdout?: string;
          stderr?: string;
          outcomes?: Record<string, "passed" | "failed">;
          error?: string;
        };

        if (!response.ok || payload.error) {
          throw new Error(
            payload.error ||
              `Run test request failed (status ${response.status})`,
          );
        }

        const rawOutput = createStructuredTestOutputFromCargoRun(
          payload,
          discoveredTests.map((test) => ({
            id: test.id,
            suite: test.contractName,
            name: test.testName,
            testType: test.testType,
            rerunCommand: `cargo test ${test.testName} -- --exact`,
          })),
        );

        const nextRun = parseStructuredTestOutput(rawOutput);
        setTestRun(nextRun);
        setTerminalOutput(formatTestRunForTerminal(nextRun));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Run test request failed";
        appendTerminalOutput(`Falling back to simulated tests: ${message}\r\n`);
        const rawOutput = createSimulatedCargoTestOutput({
          files,
          activeTabPath,
        });
        const nextRun = parseStructuredTestOutput(rawOutput);
        setTestRun(nextRun);
        setTerminalOutput(formatTestRunForTerminal(nextRun));
      }
    })();
  }, [
    activeTabPath,
    appendTerminalOutput,
    compilePayload.files,
    contractName,
    files,
    mockLedgerState,
    setTerminalExpanded,
    setTerminalOutput,
  ]);

  const handleRerunFailedTests = useCallback(() => {
    void (async () => {
      const failedTestNames =
        testRun?.cases
          .filter((testCase) => testCase.status === "failed")
          .map((testCase) => testCase.name) ?? [];

      if (failedTestNames.length === 0) {
        return;
      }

      const discoveredTests = discoverWorkspaceTests(files, contractName);
      const integrationTargets = listIntegrationTargets(discoveredTests);

      try {
        const response = await fetch("/api/run-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contractName,
            files: compilePayload.files,
            mode: "failed-only",
            failedTestNames,
            integrationTargets,
          }),
        });

        const payload = (await response.json()) as {
          success: boolean;
          mode?: "full" | "failed-only";
          command?: string;
          stdout?: string;
          stderr?: string;
          outcomes?: Record<string, "passed" | "failed">;
          error?: string;
        };

        if (!response.ok || payload.error) {
          throw new Error(
            payload.error ||
              `Run test request failed (status ${response.status})`,
          );
        }

        const selectedTests = discoveredTests.filter((test) =>
          failedTestNames.includes(test.testName),
        );

        const rawOutput = createStructuredTestOutputFromCargoRun(
          payload,
          selectedTests.map((test) => ({
            id: test.id,
            suite: test.contractName,
            name: test.testName,
            testType: test.testType,
            rerunCommand: `cargo test ${test.testName} -- --exact`,
          })),
        );

        const nextRun = parseStructuredTestOutput(rawOutput);
        setTestRun(nextRun);
        setTerminalExpanded(true);
        setTerminalOutput(formatTestRunForTerminal(nextRun));
      } catch {
        const rawOutput = createSimulatedCargoTestOutput({
          files,
          activeTabPath,
          previousRun: testRun,
          rerunFailedOnly: true,
        });
        const nextRun = parseStructuredTestOutput(rawOutput);
        setTestRun(nextRun);
        setTerminalExpanded(true);
        setTerminalOutput(formatTestRunForTerminal(nextRun));
      }
    })();
  }, [
    activeTabPath,
    compilePayload.files,
    contractName,
    files,
    setTerminalExpanded,
    setTerminalOutput,
    testRun,
  ]);

  const handleOpenTestTrace = useCallback(
    (traceFile: string, line: number, column = 1) => {
      const pathParts = resolveWorkspacePathForTrace(traceFile, files);
      if (!pathParts) {
        appendTerminalOutput(
          `Unable to resolve ${traceFile}:${line}:${column}\r\n`,
        );
        return;
      }
      addTab(pathParts, pathParts[pathParts.length - 1]);
      setActiveTabPath(pathParts);
      window.dispatchEvent(
        new CustomEvent("ide:reveal-range", {
          detail: {
            fileId: pathParts.join("/"),
            pathParts,
            range: toRevealRange(line, column),
          },
        }),
      );
    },
    [addTab, appendTerminalOutput, files, setActiveTabPath],
  );

  const handleClearTerminal = useCallback(() => {
    setTerminalOutput("");
    setTestRun(null);
  }, [setTerminalOutput]);

  const handleInvoke = useCallback(
    async (fn: string, args: string) => {
      if (!contractId) {
        appendTerminalOutput("Invoke aborted: no contract selected.\r\n");
        return;
      }

      if (!activeContext) {
        appendTerminalOutput("Invoke aborted: select a signing identity first.\r\n");
        return;
      }

      setTerminalExpanded(true);
      const signer =
        activeContext?.type === "web-wallet"
          ? "browser-wallet"
          : (activeIdentity?.nickname ?? "anonymous");

      appendTerminalOutput(`Preparing pre-flight simulation for ${fn}(${args}) as ${signer}...\r\n`);
      setInvokeState({ phase: "preparing", message: "Preparing pre-flight..." });

      const startedAt = Date.now();
      const rpcUrl =
        network === "local"
          ? customRpcUrl
          : (NETWORK_CONFIG[network as NetworkKey]?.horizon ?? horizonUrl);

      try {
        const publicKey =
          activeContext.type === "local-keypair"
            ? activeIdentity?.publicKey
            : webWalletPublicKey;

        if (!publicKey) {
          throw new Error("The selected signer does not have a public key available for simulation.");
        }

        const server = new Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
        const client = await contract.Client.from({
          contractId,
          rpcUrl,
          networkPassphrase,
          allowHttp: rpcUrl.startsWith("http://"),
          publicKey,
          server,
        });

        const method = (client as unknown as Record<string, unknown>)[fn];
        if (typeof method !== "function") {
          throw new Error(`Contract function "${fn}" was not found in the resolved contract spec.`);
        }

        const parsedArgs = args.trim() ? JSON.parse(args) : [];
        const normalizedArgs = Array.isArray(parsedArgs) ? parsedArgs : [parsedArgs];

        const invocationResult =
          normalizedArgs.length === 0
            ? await (method as (options?: Record<string, unknown>) => Promise<unknown>)({
                publicKey,
                restore: true,
                timeoutInSeconds: 45,
              })
            : await (
                method as (
                  methodArgs: unknown[],
                  options?: Record<string, unknown>,
                ) => Promise<unknown>
              )(normalizedArgs, {
                publicKey,
                restore: true,
                timeoutInSeconds: 45,
              });

        const assembled = invocationResult as {
          isReadCall?: boolean;
          result?: unknown;
          simulationResult?: unknown;
          simulation?: unknown;
          built?: unknown;
          transaction?: unknown;
          raw?: unknown;
        };

        let simulationPayload = assembled.simulationResult ?? assembled.simulation ?? null;
        const simulationSource =
          assembled.raw ??
          assembled.transaction ??
          assembled.built ??
          null;

        if (!simulationPayload && simulationSource) {
          const simulationResponse = await server.simulateTransaction(
            simulationSource as any,
          );

          if (Api.isSimulationError(simulationResponse)) {
            throw new Error(`Simulation failed: ${simulationResponse.error}`);
          }

          if (Api.isSimulationSuccess(simulationResponse)) {
            simulationPayload = simulationResponse;
          }
        }

        const currentState = simulationPayload
          ? await fetchCurrentLedgerEntriesForSimulation({
              simulation: simulationPayload,
              rpcUrl,
              network,
              customHeaders: useWorkspaceStore.getState().customHeaders,
            })
          : { entries: [], latestLedger: undefined };

        const simulationComparison = simulationPayload
          ? buildSimulationComparison({
              simulation: simulationPayload,
              currentEntries: currentState.entries,
              latestLedger: currentState.latestLedger,
            })
          : null;

        appendTransactionLog({
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${fn}`,
          timestamp: new Date().toISOString(),
          network,
          contractId,
          fnName: fn,
          argsJson: args,
          status: "success",
          txHash: null,
          resultScValBase64: null,
          decodedResult: assembled.result ?? null,
          errorMessage: null,
          durationMs: Date.now() - startedAt,
          source: "simulate",
          simulationComparison,
        });

        const summaryText = simulationComparison
          ? `${simulationComparison.summary.total} keys checked, ${simulationComparison.summary.drifted} drifted`
          : "simulation completed";

        appendTerminalOutput(`Pre-flight ready: ${summaryText}.\r\n`);
        if (simulationComparison?.feeBreakdown.minResourceFee) {
          appendTerminalOutput(
            `Estimated min resource fee: ${simulationComparison.feeBreakdown.minResourceFee}\r\n`,
          );
        }
        if (simulationComparison?.warningText) {
          appendTerminalOutput(`Warning: ${simulationComparison.warningText}\r\n`);
        }

        setInvokeState({ phase: "success", message: "Pre-flight Ready" });

        // Open pre-signing modal for write calls so user can review before submitting
        if (simulationComparison && !assembled.isReadCall) {
          setSimulationDiffData({ comparison: simulationComparison, fn, args });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invocation failed";
        appendTerminalOutput(`Pre-flight simulation failed: ${message}\r\n`);
        appendTransactionLog({
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${fn}-error`,
          timestamp: new Date().toISOString(),
          network,
          contractId,
          fnName: fn,
          argsJson: args,
          status: "error",
          txHash: null,
          resultScValBase64: null,
          decodedResult: null,
          errorMessage: message,
          durationMs: Date.now() - startedAt,
          source: "simulate",
          simulationComparison: null,
        });
        setInvokeState({ phase: "failed", message: "Pre-flight Failed" });
      } finally {
        setTimeout(() => {
          setInvokeState({ phase: "idle", message: "Invoke" });
        }, 1500);
      }
    },
    [
      activeContext,
      activeIdentity,
      appendTransactionLog,
      appendTerminalOutput,
      contractId,
      customRpcUrl,
      horizonUrl,
      network,
      networkPassphrase,
      setTerminalExpanded,
      webWalletPublicKey,
    ],
  );

  const handleConfirmSign = useCallback(async () => {
    if (!simulationDiffData || !contractId || !activeContext) return;
    const { fn, args, comparison } = simulationDiffData;

    setIsSubmittingTx(true);
    setInvokeState({ phase: "signing", message: "Waiting for signature…" });

    const rpcUrl =
      network === "local"
        ? customRpcUrl
        : (NETWORK_CONFIG[network as NetworkKey]?.horizon ?? horizonUrl);

    const startedAt = Date.now();
    try {
      const result = await executeWriteTransaction({
        contractId,
        fnName: fn,
        args,
        rpcUrl,
        network,
        networkPassphrase,
        activeContext,
        activeIdentity,
        webWalletPublicKey,
        walletType,
        onStatus: (s) => {
          setInvokeState({ phase: s.phase as typeof invokeState.phase, message: s.message });
          appendTerminalOutput(`  [${s.phase}] ${s.message}\r\n`);
        },
      });

      appendTerminalOutput(`✓ Transaction confirmed: ${result.hash}\r\n`);

      appendTransactionLog({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${fn}-send`,
        timestamp: new Date().toISOString(),
        network,
        contractId,
        fnName: fn,
        argsJson: args,
        status: "success",
        txHash: result.hash,
        resultScValBase64: null,
        decodedResult: null,
        errorMessage: null,
        durationMs: Date.now() - startedAt,
        source: "send",
        simulationComparison: comparison,
      });

      setInvokeState({ phase: "success", message: "Transaction Confirmed" });
      toast.success(`Transaction confirmed: ${result.hash.slice(0, 8)}…`);
      setSimulationDiffData(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Sign & submit failed";
      appendTerminalOutput(`Sign & submit failed: ${message}\r\n`);

      appendTransactionLog({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${fn}-send-error`,
        timestamp: new Date().toISOString(),
        network,
        contractId,
        fnName: fn,
        argsJson: args,
        status: "error",
        txHash: null,
        resultScValBase64: null,
        decodedResult: null,
        errorMessage: message,
        durationMs: Date.now() - startedAt,
        source: "send",
        simulationComparison: comparison,
      });

      setInvokeState({ phase: "failed", message: "Transaction Failed" });
      toast.error(message);
    } finally {
      setIsSubmittingTx(false);
      setTimeout(() => {
        setInvokeState({ phase: "idle", message: "Invoke" });
      }, 2000);
    }
  }, [
    simulationDiffData,
    contractId,
    activeContext,
    activeIdentity,
    appendTransactionLog,
    appendTerminalOutput,
    customRpcUrl,
    horizonUrl,
    network,
    networkPassphrase,
    walletType,
    webWalletPublicKey,
  ]);

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
        onCancelCompile={cancelCompile}
        onDeploy={() => {
          void handleDeploy();
        }}
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
          activeTab={leftSidebarTab as ActivityTab}
          onTabChange={(tab) => {
            if (leftSidebarTab === tab && showExplorer) {
              setShowExplorer(false);
              return;
            }

            setLeftSidebarTab(tab as SidebarTab);
            setShowExplorer(true);
          }}
          sidebarVisible={showExplorer}
          onToggleSidebar={() => setShowExplorer(!showExplorer)}
        />

        {showExplorer ? (
          <LazySidebar
            activeTab={leftSidebarTab as SidebarTab}
            className="hidden w-72 shrink-0 border-r border-border bg-sidebar md:flex"
            network={network}
            onNetworkChange={setNetwork}
            activeContractId={contractId}
            onSelectContract={(id, net) => {
              setContractId(id);
              setNetwork(net as NetworkKey);
              appendTerminalOutput(
                `Targeting contract ${id.substring(0, 8)}... on ${net}\r\n`,
              );
            }}
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

        <main id="main-content" className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <SplitLayout />
          </div>
          <div className="h-56 shrink-0 border-t border-border flex flex-col">
            {/* Bottom panel tab bar */}
            <div
              className="flex shrink-0 items-center border-b border-border bg-secondary"
              role="tablist"
              aria-label="Bottom panel tabs"
            >
              {(
                [
                  { id: "console", label: "Console" },
                  { id: "events", label: "Events" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={bottomTab === tab.id}
                  onClick={() => setBottomTab(tab.id)}
                  className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors border-b-2 ${
                    bottomTab === tab.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab panels */}
            <div className="min-h-0 flex-1 overflow-hidden">
              {bottomTab === "console" && (
                <Terminal
                  onClear={handleClearTerminal}
                  supplementaryContent={
                    <TestResultsLog
                      result={testRun}
                      onOpenTrace={handleOpenTestTrace}
                      onRerunFailed={handleRerunFailedTests}
                    />
                  }
                />
              )}
              {bottomTab === "events" && <EventsPane />}
              {bottomTab === "proptest" && <ProptestView />}
            </div>
          </div>
        </main>

        <aside className="hidden md:flex">
          {isErrorHelpOpen && errorCode ? (
            <div className="w-96 shrink-0">
              <ErrorHelpPanel errorCode={errorCode} onClose={closeErrorHelp} />
            </div>
          ) : null}

          {showPanel ? (
            <div className="w-80 border-l border-border bg-card flex flex-col">
              {/* Interact / State tab bar */}
              <div className="flex shrink-0 border-b border-border">
                {(["interact", "state"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setRightView(v)}
                    className={`flex-1 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider transition-colors ${
                      rightView === v
                        ? "text-foreground border-b-2 border-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-hidden">
                {rightView === "interact" ? (
                  <ContractPanel
                    contractId={contractId}
                    onInvoke={handleInvoke}
                    invokeState={invokeState}
                  />
                ) : (
                  <StateExplorer network={network} contractId={contractId} />
                )}
              </div>
            </div>
          ) : null}

          <div className="flex h-full flex-col border-l border-border bg-card">
            <button
              onClick={() => setShowPanel(!showPanel)}
              className="p-2 text-muted-foreground transition-colors hover:text-foreground"
              title="Toggle Panel"
              aria-label="Toggle panel"
            >
              {showPanel ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>
          </div>
        </aside>
      </div>

      <div className="hidden md:block">
        <StatusBar language={activeFileContext?.language} />
      </div>

      <StarterProjectWizard open={wizardOpen} onOpenChange={setWizardOpen} />

      {/* ── Cloud conflict resolution modal ───────────────────────────── */}
      {syncStatus === "conflict" && conflictData && (
        <ConflictModal conflictData={conflictData} />
      )}
      {/* ── Deployment progress modal ──────────────────────────────── */}
      <DeploymentStepper
        open={isDeployModalOpen}
        step={deploymentStep}
        error={deploymentError}
        contractId={deployedContractId}
        pendingWasmHash={pendingWasmHash}
        onClose={resetDeployment}
        onRetryInstantiate={
          pendingWasmHash
            ? () => {
                setDeploymentError(null);
                void runInstantiate(pendingWasmHash);
              }
            : undefined
        }
      />

      <HotkeysModal open={isHotkeysOpen} onOpenChange={setIsHotkeysOpen} />

      {/* ── Pre-signing simulation diff modal ─────────────────────────── */}
      {simulationDiffData && (
        <SimulationDiff
          open
          comparison={simulationDiffData.comparison}
          fnName={simulationDiffData.fn}
          contractId={contractId ?? ""}
          isSubmitting={isSubmittingTx}
          onConfirm={() => { void handleConfirmSign(); }}
          onCancel={() => setSimulationDiffData(null)}
        />
      )}
    </div>
  );
}
