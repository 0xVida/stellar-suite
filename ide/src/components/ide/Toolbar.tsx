import { Network, Settings, TestTube, Upload, Menu, X } from "lucide-react";
import { useState } from "react";

import { BuildButton } from "@/components/ide/BuildButton";
import { Button } from "@/components/ui/button";
import { type NetworkKey } from "@/lib/networkConfig";

type BuildState = "idle" | "building" | "success" | "error";

interface ToolbarProps {
  onCompile: () => void;
  onDeploy: () => void;
  onTest: () => void;
  isCompiling: boolean;
  buildState: BuildState;
  network: NetworkKey;
  onNetworkChange: (network: NetworkKey) => void;
  saveStatus?: string;
}

export function Toolbar({
  onCompile,
  onDeploy,
  onTest,
  isCompiling,
  buildState,
  network,
  onNetworkChange,
  saveStatus,
}: ToolbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="bg-toolbar-bg border-b border-border">
      <div className="hidden md:flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="mr-2 text-sm font-semibold font-mono text-primary">
            Kit CANVAS
          </span>
          <BuildButton
            onClick={onCompile}
            disabled={isCompiling}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
            
            <Play className="h-3.5 w-3.5" />
            {isCompiling ? "Building..." : "Build"}
          </button>
          <button
            onClick={onDeploy}
            className="gap-1.5 text-xs"
          >
            <Upload className="h-3.5 w-3.5" />
            Deploy
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onTest}
            className="gap-1.5 text-xs"
          >
            <TestTube className="h-3.5 w-3.5" />
            Test
          </Button>
          {saveStatus && (
            <span className="ml-2 animate-in fade-in font-mono text-[10px] text-muted-foreground">
              {saveStatus}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Network className="h-3.5 w-3.5" />
            <select
              value={network}
              onChange={(e) => onNetworkChange(e.target.value as NetworkKey)}
              className="rounded border border-border bg-secondary px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="testnet">Testnet</option>
              <option value="futurenet">Futurenet</option>
              <option value="mainnet">Mainnet</option>
              <option value="local">Local</option>
            </select>
          </div>
          <button className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-2 py-1.5 md:hidden">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold font-mono text-primary">
            Kit CANVAS
          </span>
          <BuildButton
            onClick={onCompile}
            isBuilding={isCompiling}
            state={isCompiling ? "building" : buildState}
            compact
          />
        </div>
        <div className="flex items-center gap-1">
          {saveStatus && (
            <span className="font-mono text-[9px] text-muted-foreground">
              {saveStatus}
            </span>
          )}
          <select
            value={network}
            onChange={(e) => onNetworkChange(e.target.value as NetworkKey)}
            className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-foreground focus:outline-none"
          >
            <option value="testnet">Testnet</option>
            <option value="futurenet">Futurenet</option>
            <option value="mainnet">Mainnet</option>
            <option value="local">Local</option>
          </select>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 text-muted-foreground hover:text-foreground"
          >
            {mobileMenuOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen &&
      <div className="md:hidden flex gap-1 px-2 pb-2 border-b border-border">
          <button
          onClick={() => {onCompile();setMobileMenuOpen(false);}}
          disabled={isCompiling}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium rounded bg-primary text-primary-foreground disabled:opacity-50">
          
            <Play className="h-3 w-3" />
            {isCompiling ? "..." : "Build"}
          </button>
          <button
          onClick={() => {onDeploy();setMobileMenuOpen(false);}}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium rounded bg-secondary text-secondary-foreground">
          
            <Upload className="h-3 w-3" />
            Deploy
          </Button>
          <Button
            type="button"
            onClick={() => {
              onTest();
              setMobileMenuOpen(false);
            }}
            variant="secondary"
            className="h-9 flex-1 gap-1 px-2 text-[11px]"
          >
            <TestTube className="h-3 w-3" />
            Test
          </Button>
        </div>
      }
    </div>);

}
