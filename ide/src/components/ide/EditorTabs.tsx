"use client";

import {
  Circle,
  FileCode,
  FileJson,
  FileText,
  Settings,
  X,
} from "lucide-react";
import { KeyboardEvent, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
import { useWorkspaceStore } from "@/store/workspaceStore";
import {
  Circle,
  FileCode,
  FileJson,
  FileText,
  Settings,
  X,
} from "lucide-react";
import { KeyboardEvent, useRef, useCallback } from "react";

export interface TabInfo {
  path: string[];
  name: string;
  unsaved?: boolean;
}

interface EditorTabsProps {
  tabs?: TabInfo[];
  activeTab?: string;
  onTabSelect?: (path: string[]) => void;
  onTabClose?: (path: string[]) => void;
}

// ---------------------------------------------------------------------------
// File icon resolver
// ---------------------------------------------------------------------------

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "rs") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5 shrink-0 text-orange-400"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm0-13a5 5 0 1 0 0 10A5 5 0 0 0 12 7zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
      </svg>
    );
  }
  if (ext === "toml")
    return (
      <Settings
        className="h-3.5 w-3.5 shrink-0 text-green-400"
        aria-hidden="true"
      />
    );
  if (ext === "json")
    return (
      <FileJson
        className="h-3.5 w-3.5 shrink-0 text-yellow-400"
        aria-hidden="true"
      />
    );
  if (["ts", "tsx", "js", "jsx"].includes(ext))
    return (
      <FileCode
        className="h-3.5 w-3.5 shrink-0 text-blue-400"
        aria-hidden="true"
      />
    );
  return (
    <FileText
      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// EditorTabs
// ---------------------------------------------------------------------------

export function EditorTabs({ onTabSelect, onTabClose }: EditorTabsProps) {
  const { openTabs, activeTabPath, setActiveTabPath, closeTab, unsavedFiles } = useWorkspaceStore();
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const tabsWithStatus = openTabs.map((t) => ({
    ...t,
    unsaved: unsavedFiles.has(t.path.join("/")),
  }));

  const activeTabKey = activeTabPath.join("/");

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>, path: string[]) => {
    const keys = tabsWithStatus.map((t) => t.path.join("/"));
    const currentIdx = keys.indexOf(path.join("/"));

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = tabsWithStatus[currentIdx + 1];
      if (next) {
        tabRefs.current.get(next.path.join("/"))?.focus();
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = tabsWithStatus[currentIdx - 1];
      if (prev) {
        tabRefs.current.get(prev.path.join("/"))?.focus();
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (onTabSelect) onTabSelect(path);
      else setActiveTabPath(path);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (onTabClose) onTabClose(path);
      else closeTab(path);
    }
  }, [tabsWithStatus, onTabSelect, onTabClose, setActiveTabPath, closeTab]);

  if (tabsWithStatus.length === 0) {
    return <div className="h-9 bg-secondary border-b border-border" aria-label="No open tabs" />;
  }

  return (
    <div
      role="tablist"
      aria-label="Open editor tabs"
      className="flex bg-secondary border-b border-border overflow-x-auto scrollbar-none"
    >
      {tabsWithStatus.map((tab) => {
        const key = tab.path.join("/");
        const isActive = key === activeTabKey;
        const isDirty = tab.unsaved;

        return (
          <button
            key={key}
            ref={(el) => {
              if (el) tabRefs.current.set(key, el);
              else tabRefs.current.delete(key);
            }}
            role="tab"
            aria-selected={isActive}
            aria-label={`${tab.name}${isDirty ? " (unsaved)" : ""}`}
            tabIndex={isActive ? 0 : -1}
            className={`group flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 md:py-2 text-[11px] md:text-xs font-mono border-r border-border transition-colors min-w-0 shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/60 ${
              isActive
                ? "bg-tab-active text-foreground border-t-2 border-t-primary"
                : "bg-tab-inactive text-muted-foreground hover:bg-tab-hover border-t-2 border-t-transparent"
            }`}
            onClick={() => {
              if (onTabSelect) onTabSelect(tab.path);
              else setActiveTabPath(tab.path);
            }}
            onKeyDown={(e) => handleKeyDown(e, tab.path)}
          >
            {/* File type icon */}
            <FileIcon name={tab.name} />

            {/* Filename */}
            <span className="truncate max-w-[80px] md:max-w-[120px]">
              {tab.name}
            </span>

            {/*
              Dirty indicator / close button:
              - When dirty: show filled dot; on hover swap to X
              - When clean: show X only on hover
            */}
            <span
              role="button"
              aria-label={`Close ${tab.name}`}
              className="shrink-0 rounded p-0.5 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                if (onTabClose) onTabClose(tab.path);
                else closeTab(tab.path);
              }}
            >
              {isDirty ? (
                <>
                  {/* Dot visible by default, hidden on group hover */}
                  <Circle
                    className="h-2 w-2 fill-primary text-primary group-hover:hidden"
                    aria-hidden="true"
                  />
                  {/* X hidden by default, shown on group hover */}
                  <X
                    className="h-3 w-3 hidden group-hover:block"
                    aria-hidden="true"
                  />
                </>
              ) : (
                <X
                  className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-hidden="true"
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
