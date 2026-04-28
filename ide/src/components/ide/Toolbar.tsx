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
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BuildButton } from "@/components/ide/BuildButton";
import { Button } from "@/components/ui/button";
import { type NetworkKey } from "@/lib/networkConfig";
import ImportGithubModal from "@/components/ide/ImportGithubModal";
import { SettingsModal } from "@/components/ide/SettingsModal";
import { WalletManager } from "@/components/WalletManager";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { SignInButton } from "@/components/auth/SignInButton";
import { UserMenu } from "@/components/auth/UserMenu";
import { SaveToCloudButton } from "@/components/cloud/SaveToCloudButton";
import { useAuth } from "@/hooks/useAuth";
import useEnvironmentSlotsStore from "@/store/useEnvironmentSlotsStore";
import { useLiveShareStore } from "@/store/useLiveShareStore";
import NotificationCenter from "@/components/notifications/NotificationCenter";

type BuildState = "idle" | "building" | "success" | "error";

interface ToolbarProps {
  onCompile: () => void;
  onCancelCompile?: () => void;
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
  onCancelCompile,
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
  } = useWorkspaceStore();

  const isCompiling = propIsCompiling ?? storeIsCompiling;
  const buildState = propBuildState ?? storeBuildState;
  const network = propNetwork ?? storeNetwork;
  const saveStatus = propSaveStatus ?? storeSaveStatus;

  const changeNetwork = useMemo(
    () => onNetworkChange ?? setNetwork,
    [onNetworkChange, setNetwork],
  );

  const slots = useEnvironmentSlotsStore((s) => s.slots);
  const selectedSlotId = useEnvironmentSlotsStore((s) => s.selectedSlotId);
  const selectSlot = useEnvironmentSlotsStore((s) => s.selectSlot);
  const selectedSlot = slots[selectedSlotId] ?? slots["staging"];

  const mapColor = (c: string) => {
    switch (c) {
      case "red":
        return "#ef4444";
      case "yellow":
        return "#f59e0b";
      case "green":
        return "#10b981";
      default:
        return "#94a3b8";
    }
  };

  const { mode } = useLiveShareStore();
  const { isAuthenticated } = useAuth();
  const isReadOnly = mode === "recipient";

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const handler = () => setSettingsOpen(true);
    window.addEventListener("ide:open-settings", handler);
    return () => window.removeEventListener("ide:open-settings", handler);
  }, []);

  return (
    <div className="border-b border-border bg-toolbar-bg">
      {/* Desktop toolbar */}
      <div className="hidden items-center justify-between px-3 py-2.5 md:flex">
        <div className="flex items-center gap-2">
          <span className="mr-2 font-mono text-sm font-semibold text-primary">
            Kit CANVAS
          </span>

          <BuildButton
            onClick={onCompile}
            isBuilding={isCompiling}
            state={isCompiling ? "building" : buildState}
            disabled={isReadOnly}
          />

          {isCompiling && onCancelCompile ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancelCompile}
              className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
              title="Cancel build"
              aria-label="Cancel build"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </Button>
          ) : null}

          <Button
            onClick={onDeploy}
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={isReadOnly}
          >
            <Upload className="h-3.5 w-3.5" />
            Deploy
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onTest}
            className="h-8 gap-1.5 text-xs"
            disabled={isReadOnly}
          >
            <TestTube className="h-3.5 w-3.5" />
            Test
          </Button>

          {onRunClippy ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRunClippy}
              disabled={isRunningClippy || isReadOnly}
              className="h-8 gap-1.5 text-xs"
            >
              {isRunningClippy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Run Clippy
            </Button>
          ) : null}

          {onRunAudit ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRunAudit}
              disabled={isRunningAudit || isReadOnly}
              className="h-8 gap-1.5 text-xs"
            >
              {isRunningAudit ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5" />
              )}
              Audit
            </Button>
          ) : null}

          <Button
            onClick={() => setImportOpen(true)}
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={isReadOnly}
          >
            <Github className="h-3.5 w-3.5" />
            Import
          </Button>

          <SaveToCloudButton disabled={isReadOnly} />

          {saveStatus ? (
            <span className="ml-2 font-mono text-[10px] text-muted-foreground">
              {saveStatus}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-4">
          <NotificationCenter />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Network className="h-3.5 w-3.5" />
            <div className="flex items-center gap-3">
              <div
                title={selectedSlot?.label}
                style={{ backgroundColor: mapColor(selectedSlot?.color ?? "") }}
                className="w-3 h-3 rounded-full border border-border"
              />
              <div className="flex items-center gap-2">
                <select
                  value={selectedSlotId}
                  onChange={(e) => selectSlot(e.target.value)}
                  className="min-w-[108px] rounded border border-border bg-secondary px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  aria-label="Environment slot"
                  title="Current environment"
                  disabled={isReadOnly}
                >
                  {Object.values(slots).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {selectedSlotId === "production" ? (
                  <span
                    className="inline-flex items-center rounded border border-red-700 bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white"
                    aria-hidden
                  >
                    PRODUCTION
                  </span>
                ) : null}
              </div>
              <select
                value={network}
                onChange={(e) => changeNetwork(e.target.value as NetworkKey)}
                className="min-w-[100px] rounded border border-border bg-secondary px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                disabled={isReadOnly}
              >
                <option value="testnet">Testnet</option>
                <option value="futurenet">Futurenet</option>
                <option value="mainnet">Mainnet</option>
                <option value="local">Local</option>
              </select>
            </div>
          </label>
          <WalletManager />
          {isAuthenticated ? <UserMenu /> : <SignInButton />}
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mobile toolbar */}
      <div className="flex items-center justify-between px-2 py-2 md:hidden">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-primary">
            Kit CANVAS
          </span>
          <BuildButton
            onClick={onCompile}
            isBuilding={isCompiling}
            state={isCompiling ? "building" : buildState}
            compact
            disabled={isReadOnly}
          />
        </div>

        <div className="flex items-center gap-1">
          {saveStatus ? (
            <span className="font-mono text-[9px] text-muted-foreground">
              {saveStatus}
            </span>
          ) : null}
          <div className="flex items-center gap-1">
            <div
              title={selectedSlot?.label}
              style={{ backgroundColor: mapColor(selectedSlot?.color ?? "") }}
              className="w-2.5 h-2.5 rounded-full border border-border"
            />
            <select
              value={selectedSlotId}
              onChange={(e) => selectSlot(e.target.value)}
              className="rounded border border-border bg-secondary px-1 py-0.5 text-[10px] text-foreground focus:outline-none"
              aria-label="Environment slot"
              title="Current environment"
              disabled={isReadOnly}
            >
              {Object.values(slots).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            {selectedSlotId === "production" ? (
              <span
                className="ml-1 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-red-600 text-white border border-red-700"
                aria-hidden
              >
                PROD
              </span>
            ) : null}
            <select
              value={network}
              onChange={(e) => changeNetwork(e.target.value as NetworkKey)}
              className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-foreground focus:outline-none"
              disabled={isReadOnly}
            >
              <option value="testnet">Testnet</option>
              <option value="futurenet">Futurenet</option>
              <option value="mainnet">Mainnet</option>
              <option value="local">Local</option>
            </select>
          </div>
          <div className="origin-right scale-90">
            <WalletManager />
          </div>
          <div className="origin-right scale-90">
            {isAuthenticated ? <UserMenu /> : <SignInButton />}
          </div>
          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile expanded menu */}
      {mobileMenuOpen ? (
        <div className="flex flex-col gap-2 border-b border-border px-2 pb-2 md:hidden">
          <Button
            onClick={() => { onCompile(); setMobileMenuOpen(false); }}
            disabled={isCompiling || isReadOnly}
            className="h-9 flex-1 gap-1 text-[11px]"
          >
            <Play className="h-3 w-3" />
            {isCompiling ? "..." : "Build"}
          </Button>

          <Button
            onClick={() => { onDeploy(); setMobileMenuOpen(false); }}
            variant="outline"
            disabled={isReadOnly}
            className="h-9 flex-1 gap-1 text-[11px]"
          >
            <Upload className="h-3 w-3" />
            Deploy
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-9 flex-1 gap-1 text-[11px]"
            onClick={() => { onTest(); setMobileMenuOpen(false); }}
            disabled={isReadOnly}
          >
            Test
          </Button>

          {onRunClippy ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 flex-1 gap-1 text-[11px]"
              onClick={() => { onRunClippy(); setMobileMenuOpen(false); }}
              disabled={isRunningClippy || isReadOnly}
            >
              {isRunningClippy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Clippy
            </Button>
          ) : null}

          {onRunAudit ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 flex-1 gap-1 text-[11px]"
              onClick={() => { onRunAudit(); setMobileMenuOpen(false); }}
              disabled={isRunningAudit || isReadOnly}
            >
              {isRunningAudit ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ShieldAlert className="h-3 w-3" />
              )}
              Audit
            </Button>
          ) : null}

          <Button
            variant="outline"
            className="h-9 flex-1 gap-1 text-[11px]"
            onClick={() => { setImportOpen(true); setMobileMenuOpen(false); }}
            disabled={isReadOnly}
          >
            <Github className="h-3 w-3" />
            Import GitHub
          </Button>

          <Button
            variant="outline"
            className="h-9 flex-1 gap-1 text-[11px]"
            onClick={() => { setSettingsOpen(true); setMobileMenuOpen(false); }}
          >
            <Settings className="h-3 w-3" />
            Settings
          </Button>
        </div>
      ) : null}

      <ImportGithubModal open={importOpen} onClose={() => setImportOpen(false)} />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
