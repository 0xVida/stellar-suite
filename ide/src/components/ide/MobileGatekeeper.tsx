"use client";

/**
 * MobileGatekeeper.tsx
 * Responsive mobile layout for read-only code review — Issue #815
 *
 * On mobile: renders a read-only banner + bottom nav instead of blocking the IDE.
 * On desktop: renders nothing (IDE renders normally).
 */

import { useEffect, useState, useCallback } from "react";
import {
  EyeOff,
  FolderTree,
  History,
  Activity,
  X,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore, type MobilePanel } from "@/store/workspaceStore";

const BOTTOM_NAV_ITEMS: {
  id: MobilePanel;
  icon: React.ReactNode;
  label: string;
}[] = [
  { id: "explorer", icon: <FolderTree className="w-5 h-5" />, label: "Files" },
  { id: "deployments", icon: <History className="w-5 h-5" />, label: "Deploy" },
  { id: "identities", icon: <Activity className="w-5 h-5" />, label: "Status" },
];

export function MobileGatekeeper() {
  const [isMobile, setIsMobile] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { mobilePanel, setMobilePanel } = useWorkspaceStore();

  useEffect(() => {
    setIsHydrated(true);
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleNavClick = useCallback(
    (panel: MobilePanel) => {
      if (mobilePanel === panel) {
        setMobilePanel("none");
        setSidebarOpen(false);
      } else {
        setMobilePanel(panel);
        setSidebarOpen(true);
      }
    },
    [mobilePanel, setMobilePanel]
  );

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    setMobilePanel("none");
  }, [setMobilePanel]);

  if (!isHydrated || !isMobile) return null;

  return (
    <>
      {/* Read-only banner */}
      <div
        className="ide-mobile-readonly-banner"
        role="status"
        aria-live="polite"
      >
        <EyeOff className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>Read-only mode — editing disabled on mobile</span>
      </div>

      {/* Sidebar backdrop */}
      <div
        className={`ide-sidebar-backdrop ${sidebarOpen ? "backdrop-visible" : ""}`}
        aria-hidden="true"
        onClick={closeSidebar}
      />

      {/* Bottom navigation */}
      <nav
        className="ide-bottom-nav"
        aria-label="Mobile navigation"
      >
        <button
          className="ide-bottom-nav-item"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? (
            <X className="w-5 h-5" aria-hidden="true" />
          ) : (
            <Menu className="w-5 h-5" aria-hidden="true" />
          )}
          <span>Menu</span>
        </button>

        {BOTTOM_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`ide-bottom-nav-item ${mobilePanel === item.id ? "active" : ""}`}
            onClick={() => handleNavClick(item.id)}
            aria-label={item.label}
            aria-pressed={mobilePanel === item.id}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
