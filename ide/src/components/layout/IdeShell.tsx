"use client";

import { ReactNode } from "react";
import { Toolbar } from "@/components/ide/Toolbar";
import { ActivityBar, type ActivityTab } from "@/components/layout/ActivityBar";
import { type NetworkKey } from "@/lib/networkConfig";

type BuildState = "idle" | "building" | "success" | "error";

interface IdeShellProps {
  children: ReactNode;
  onCompile: () => void;
  onDeploy: () => void;
  onTest: () => void;
  isCompiling: boolean;
  buildState: BuildState;
  network: NetworkKey;
  onNetworkChange: (network: NetworkKey) => void;
  saveStatus?: string;
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
}

/**
 * IdeShell
 *
 * The outermost layout shell for the IDE, providing:
 * - Top Menu Bar (Toolbar) with branding and main actions
 * - Left Activity Bar for navigation icons
 * - Main content area (children) that fills remaining space
 *
 * This layout is designed to never unmount during navigation,
 * maintaining a stable shell like VS Code.
 */

export function IdeShell({
  children,
  onCompile,
  onDeploy,
  onTest,
  isCompiling,
  buildState,
  network,
  onNetworkChange,
  saveStatus,
  activeTab,
  onTabChange,
  sidebarVisible,
  onToggleSidebar,
}: IdeShellProps) {
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      {/* Top Menu Bar */}
      <Toolbar
        onCompile={onCompile}
        onDeploy={onDeploy}
        onTest={onTest}
        isCompiling={isCompiling}
        buildState={buildState}
        network={network}
        onNetworkChange={onNetworkChange}
        saveStatus={saveStatus}
      />

      {/* Main Content Area: Activity Bar + Sidebar + Editor */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Activity Bar */}
        <ActivityBar
          activeTab={activeTab}
          onTabChange={onTabChange}
          sidebarVisible={sidebarVisible}
          onToggleSidebar={onToggleSidebar}
        />

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}