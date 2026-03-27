import {
  Network,
  Settings,
  TestTube,
  Upload,
  Menu,
  X,
  Play,
  Github,
  Sparkles,
  ShieldAlert,
  Loader2,
  FileCode2,
  Database,
} from "lucide-react";
import { useMemo, useState } from "react";

import { BuildButton } from "@/components/ide/BuildButton";
import { Button } from "@/components/ui/button";
import { type NetworkKey } from "@/lib/networkConfig";
import ImportGithubModal from "@/components/ide/ImportGithubModal";
import CiConfigGenerator from "@/components/modals/CiConfigGenerator";
import StateMockEditor from "@/components/modals/StateMockEditor";
import { WalletManager } from "@/components/WalletManager";
import { useWorkspaceStore } from "@/store/workspaceStore";

type BuildState = "idle" | "building" | "success" | "error";

interface ToolbarProps {
  onCompile: () => void;
  onDeploy: () => void;
  onTest: () => void;
  isCompiling?: boolean;
  buildState?: BuildState;
  network?: NetworkKey;
  onNetworkChange?: (network: NetworkKey) => void;
  saveStatus?: string;
  onRunClippy?: () => void;
  isRunningClippy?: boolean;
  onRunAudit?: () => void;
  isRunningAudit?: boolean;
}

export function Toolbar({
  onCompile,
  onDeploy,
  onTest,
  isCompiling: propIsCompiling,
  buildState: propBuildState,
  network: propNetwork,
  onNetworkChange,
  saveStatus: propSaveStatus,
  onRunClippy,
  isRunningClippy = false,
  onRunAudit,
  isRunningAudit = false,
}: ToolbarProps) {
  const {
    isCompiling: storeIsCompiling,
    buildState: storeBuildState,
    network: storeNetwork,
    setNetwork,
    saveStatus: storeSaveStatus,
    mockLedgerState,
    setMockLedgerState,
  } = useWorkspaceStore();

  const isCompiling = propIsCompiling ?? storeIsCompiling;
  const buildState = propBuildState ?? storeBuildState;
  const network = propNetwork ?? storeNetwork;
  const saveStatus = propSaveStatus ?? storeSaveStatus;

  const changeNetwork = useMemo(
    () => onNetworkChange ?? setNetwork,
    [onNetworkChange, setNetwork],
  );

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [ciOpen, setCiOpen] = useState(false);
  const [stateEditorOpen, setStateEditorOpen] = useState(false);
  const hasMockState = mockLedgerState.entries.length > 0;

  return (
    <div className="border-b border-border bg-toolbar-bg">
      <div className="hidden items-center justify-between px-3 py-1.5 md:flex">
        <div className="flex items-center gap-2">
          <span className="mr-2 font-mono text-sm font-semibold text-primary">Kit CANVAS</span>

          <BuildButton onClick={onCompile} isBuilding={isCompiling} state={isCompiling ? "building" : buildState} />

          <Button onClick={onDeploy} variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" />
            Deploy
          </Button>

          <Button type="button" variant="ghost" size="sm" onClick={onTest} className="h-8 gap-1.5 text-xs">
            <TestTube className="h-3.5 w-3.5" />
            Test
          </Button>

          {onRunClippy ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRunClippy} disabled={isRunningClippy} className="h-8 gap-1.5 text-xs">
              {isRunningClippy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Run Clippy
            </Button>
          ) : null}

          {onRunAudit ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRunAudit} disabled={isRunningAudit} className="h-8 gap-1.5 text-xs">
              {isRunningAudit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
              Audit
            </Button>
          ) : null}

          <Button onClick={() => setImportOpen(true)} variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
            <Github className="h-3.5 w-3.5" />
            Import
          </Button>

          <Button onClick={() => setCiOpen(true)} variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
            <FileCode2 className="h-3.5 w-3.5" />
            Export CI
          <Button
            onClick={() => setStateEditorOpen(true)}
            variant="ghost"
            size="sm"
            className={`h-8 gap-1.5 text-xs ${hasMockState ? "text-primary" : ""}`}
            title="Mock Ledger State"
          >
            <Database className="h-3.5 w-3.5" />
            Mock State{hasMockState ? ` (${mockLedgerState.entries.length})` : ""}
          </Button>

          {saveStatus ? <span className="ml-2 font-mono text-[10px] text-muted-foreground">{saveStatus}</span> : null}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Network className="h-3.5 w-3.5" />
            <select
              value={network}
              onChange={(e) => changeNetwork(e.target.value as NetworkKey)}
              className="rounded border border-border bg-secondary px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="testnet">Testnet</option>
              <option value="futurenet">Futurenet</option>
              <option value="mainnet">Mainnet</option>
              <option value="local">Local</option>
            </select>
          </label>
          <WalletManager />
          <button className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Settings" aria-label="Settings">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-2 py-1.5 md:hidden">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-primary">Kit CANVAS</span>
          <BuildButton onClick={onCompile} isBuilding={isCompiling} state={isCompiling ? "building" : buildState} compact />
        </div>

        <div className="flex items-center gap-1">
          {saveStatus ? <span className="font-mono text-[9px] text-muted-foreground">{saveStatus}</span> : null}
          <select
            value={network}
            onChange={(e) => changeNetwork(e.target.value as NetworkKey)}
            className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-foreground focus:outline-none"
          >
            <option value="testnet">Testnet</option>
            <option value="futurenet">Futurenet</option>
            <option value="mainnet">Mainnet</option>
            <option value="local">Local</option>
          </select>
          <div className="origin-right scale-90">
            <WalletManager />
          </div>
          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className="flex flex-col gap-2 border-b border-border px-2 pb-2 md:hidden">
          <Button
            onClick={() => {
              onCompile();
              setMobileMenuOpen(false);
            }}
            disabled={isCompiling}
            className="h-9 flex-1 gap-1 text-[11px]"
          >
            <Play className="h-3 w-3" />
            {isCompiling ? "..." : "Build"}
          </Button>

          <Button
            onClick={() => {
              onDeploy();
              setMobileMenuOpen(false);
            }}
            variant="outline"
            className="h-9 flex-1 gap-1 text-[11px]"
          >
            <Upload className="h-3 w-3" />
            Deploy
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-9 flex-1 gap-1 text-[11px]"
            onClick={() => {
              onTest();
              setMobileMenuOpen(false);
            }}
          >
            Test
          </Button>

          {onRunClippy ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 flex-1 gap-1 text-[11px]"
              onClick={() => {
                onRunClippy();
                setMobileMenuOpen(false);
              }}
              disabled={isRunningClippy}
            >
              {isRunningClippy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Clippy
            </Button>
          ) : null}

          {onRunAudit ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 flex-1 gap-1 text-[11px]"
              onClick={() => {
                onRunAudit();
                setMobileMenuOpen(false);
              }}
              disabled={isRunningAudit}
            >
              {isRunningAudit ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldAlert className="h-3 w-3" />}
              Audit
            </Button>
          ) : null}

          <Button
            variant="outline"
            className="h-9 flex-1 gap-1 text-[11px]"
            onClick={() => {
              setImportOpen(true);
              setMobileMenuOpen(false);
            }}
          >
            <Github className="h-3 w-3" />
            Import GitHub
          </Button>

          <Button
            variant="outline"
            className="h-9 flex-1 gap-1 text-[11px]"
            onClick={() => {
              setCiOpen(true);
              setMobileMenuOpen(false);
            }}
          >
            <FileCode2 className="h-3 w-3" />
            Export CI
            className={`h-9 flex-1 gap-1 text-[11px] ${hasMockState ? "text-primary" : ""}`}
            onClick={() => {
              setStateEditorOpen(true);
              setMobileMenuOpen(false);
            }}
          >
            <Database className="h-3 w-3" />
            Mock State
          </Button>
        </div>
      ) : null}

      <ImportGithubModal open={importOpen} onClose={() => setImportOpen(false)} />
      <CiConfigGenerator open={ciOpen} onOpenChange={setCiOpen} />

      <StateMockEditor
        open={stateEditorOpen}
        onOpenChange={setStateEditorOpen}
        value={mockLedgerState}
        onSave={setMockLedgerState}
      />
    </div>
  );
}
