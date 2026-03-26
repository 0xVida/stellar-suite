"use client";

import { FolderTree, Users, History, Search, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { ReactNode } from "react";

export type ActivityTab = "explorer" | "deployments" | "identities" | "search";

interface ActivityBarProps {
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
}

interface ActivityBarTab {
  id: ActivityTab;
  icon: ReactNode;
  label: string;
  title: string;
}

const tabs: ActivityBarTab[] = [
  {
    id: "explorer",
    icon: <FolderTree className="h-5 w-5" />,
    label: "Explorer",
    title: "File Explorer",
  },
  {
    id: "deployments",
    icon: <History className="h-5 w-5" />,
    label: "History",
    title: "Recent Deployments",
  },
  {
    id: "identities",
    icon: <Users className="h-5 w-5" />,
    label: "Users",
    title: "Identities",
  },
  {
    id: "search",
    icon: <Search className="h-5 w-5" />,
    label: "Search",
    title: "Search Files",
  },
];

export function ActivityBar({
  activeTab,
  onTabChange,
  sidebarVisible,
  onToggleSidebar,
}: ActivityBarProps) {
  return (
    <div className="hidden md:flex flex-col bg-sidebar border-r border-border shrink-0 w-12 items-center py-4 gap-4">
      {/* Activity Tabs */}
      <div className="flex flex-col gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`p-2 rounded-md transition-all ${
              activeTab === tab.id
                ? "bg-primary/20 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            title={tab.title}
            aria-label={tab.label}
            aria-pressed={activeTab === tab.id}
          >
            {tab.icon}
          </button>
        ))}
      </div>

      {/* Bottom Actions */}
      <div className="mt-auto border-t border-border w-full pt-4 flex flex-col items-center gap-2">
        {/* Toggle Sidebar */}
        <button
          onClick={onToggleSidebar}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          title={sidebarVisible ? "Collapse Sidebar" : "Expand Sidebar"}
          aria-label={sidebarVisible ? "Collapse Sidebar" : "Expand Sidebar"}
        >
          {sidebarVisible ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </button>

        {/* Settings */}
        <button
          className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}