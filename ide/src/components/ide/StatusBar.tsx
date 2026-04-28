"use client";

import { useWorkspaceStore } from "@/store/workspaceStore";
import { Settings, WifiOff, Loader2, CheckCircle2, Database } from "lucide-react";
import { NetworkSelector } from "./NetworkSelector";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";

interface StatusBarProps {
  language?: string;
}

export function StatusBar({ language: propLanguage }: StatusBarProps) {
  const {
    cursorPos,
    network,
    horizonUrl,
    customRpcUrl,
    customHeaders,
    setNetwork,
    setCustomRpcUrl,
    setCustomHeaders,
    unsavedFiles,
    files,
    activeTabPath,
  } = useWorkspaceStore();

  const { isOffline, pendingSyncCount, syncState, cacheHitCount } = useOfflineStatus();

  const activeFile = files.find(
    (f) => f.name === activeTabPath[activeTabPath.length - 1],
  );
  const language = propLanguage || activeFile?.language || "rust";

  const openSettings = () => {
    window.dispatchEvent(new Event("ide:open-settings"));
  };

  return (
    <div className="flex items-center justify-between bg-primary text-primary-foreground text-[10px] md:text-[11px] font-mono px-2 md:px-3 py-0.5">
      <div className="flex items-center gap-3">
        <span>
          Ln {cursorPos.line}, Col {cursorPos.col}
        </span>
        <span className="hidden sm:inline">{language}</span>
        <span className="hidden md:inline">UTF-8</span>
        {unsavedFiles.size > 0 && (
          <span className="text-primary-foreground/70">
            {unsavedFiles.size} unsaved
          </span>
        )}

        {/* ── Offline / Sync indicator ── */}
        {isOffline && (
          <span
            id="statusbar-offline-indicator"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 bg-red-600/90 text-white animate-pulse"
            title={
              pendingSyncCount > 0
                ? `Offline — ${pendingSyncCount} change(s) queued for sync`
                : "Offline — changes are saved locally"
            }
            aria-live="polite"
            aria-label="Offline mode active"
          >
            <WifiOff className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Offline</span>
            {pendingSyncCount > 0 && (
              <span className="ml-0.5 font-semibold">{pendingSyncCount}</span>
            )}
          </span>
        )}

        {!isOffline && syncState === "syncing" && (
          <span
            id="statusbar-syncing-indicator"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 bg-amber-500/90 text-white"
            aria-live="polite"
            aria-label="Syncing queued changes"
          >
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
            <span className="hidden sm:inline">Syncing…</span>
          </span>
        )}

        {!isOffline && syncState === "synced" && (
          <span
            id="statusbar-synced-indicator"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 bg-emerald-600/90 text-white transition-opacity duration-500"
            aria-live="polite"
            aria-label="All changes synced"
          >
            <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Synced</span>
          </span>
        )}
        {cacheHitCount > 0 && (
          <span
            id="statusbar-cache-indicator"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 bg-blue-600/90 text-white"
            title={`${cacheHitCount} core libraries loaded from local CDN cache`}
            aria-live="polite"
          >
            <Database className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Cached: {cacheHitCount}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <NetworkSelector
          network={network}
          horizonUrl={horizonUrl}
          customRpcUrl={customRpcUrl}
          customHeaders={customHeaders}
          onNetworkChange={setNetwork}
          onCustomRpcUrlChange={setCustomRpcUrl}
          onCustomHeadersChange={setCustomHeaders}
        />
        <button
          onClick={openSettings}
          className="flex items-center gap-1 hover:bg-primary-foreground/20 px-2 py-1 rounded transition-colors"
          title="Open Settings"
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-[10px]">Settings</span>
        </button>
      </div>
    </div>
  );
}
