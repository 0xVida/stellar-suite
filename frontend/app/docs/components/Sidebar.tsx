"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, Compass, BookOpen, Code2, Terminal } from "lucide-react";
import { navigation, NavItem } from "../data";

const iconMap: Record<string, React.ReactNode> = {
  "Getting Started": <Compass size={16} />,
  "Guides": <BookOpen size={16} />,
  "API Reference": <Code2 size={16} />,
  "Playground": <Terminal size={16} />,
};

function NavSection({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname?.startsWith(item.href + "#");
  const hasChildren = item.children && item.children.length > 0;
  const [expanded, setExpanded] = useState(isActive || pathname?.startsWith(item.href));

  return (
    <div className="mb-1">
      <div className="flex items-center">
        <Link
          href={item.href}
          className={`flex-1 flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            isActive
              ? "bg-accent/10 text-accent"
              : "text-muted-fg hover:text-foreground hover:bg-muted"
          }`}
        >
          {iconMap[item.title] || null}
          {item.title}
        </Link>
        {hasChildren && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-md text-muted-fg hover:text-foreground hover:bg-muted transition-colors"
            aria-label={expanded ? "Collapse section" : "Expand section"}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="ml-4 mt-0.5 pl-3 border-l border-border">
          {item.children!.map((child) => {
            const childActive = pathname + (typeof window !== "undefined" ? window.location.hash : "") === child.href;
            return (
              <Link
                key={child.href}
                href={child.href}
                className={`block px-3 py-1.5 text-sm rounded-md transition-colors ${
                  childActive
                    ? "text-accent font-medium"
                    : "text-muted-fg hover:text-foreground hover:bg-muted"
                }`}
              >
                {child.title}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed top-[var(--header-h)] left-0 z-40 h-[calc(100vh-var(--header-h))] w-[var(--sidebar-w)] border-r border-border bg-background overflow-y-auto transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="p-4" aria-label="Documentation navigation">
          {navigation.map((item) => (
            <NavSection key={item.href} item={item} />
          ))}
        </nav>
      </aside>
    </>
  );
}
