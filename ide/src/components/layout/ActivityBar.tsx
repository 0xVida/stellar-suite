import {
  FolderTree,
  Users,
  History,
  Search,
  Beaker,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type ActivityTab =
  | "explorer"
  | "git"
  | "deployments"
  | "identities"
  | "search"
  | "security"
  | "tests"
  | "network";

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
    id: "git",
    icon: <History className="h-5 w-5 rotate-180" />,
    label: "Source Control",
    title: "Source Control (Git)",
  },
  {
    id: "search",
    icon: <Search className="h-5 w-5" />,
    label: "Search",
    title: "Search Files",
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
    id: "security",
    icon: <ShieldAlert className="h-5 w-5" />,
    label: "Security",
    title: "Security & Clippy",
  },
  {
    id: "tests",
    icon: <Beaker className="h-5 w-5" />,
    label: "Tests",
    title: "Test Explorer",
  },
  {
    id: "network",
    icon: <Globe className="h-5 w-5" />,
    label: "Network",
    title: "Network Explorer",
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
      <div className="flex flex-col gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "secondary" : "ghost"}
            size="icon"
            onClick={() => onTabChange(tab.id)}
            className={`h-9 w-9 ${
              activeTab === tab.id
                ? "bg-primary/20 text-primary hover:bg-primary/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={tab.title}
            aria-label={tab.label}
            aria-pressed={activeTab === tab.id}
          >
            {tab.icon}
          </Button>
        ))}
      </div>

      <div className="mt-auto border-t border-border w-full pt-4 flex flex-col items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          title={sidebarVisible ? "Collapse Sidebar" : "Expand Sidebar"}
          aria-label={sidebarVisible ? "Collapse Sidebar" : "Expand Sidebar"}
        >
          {sidebarVisible ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
