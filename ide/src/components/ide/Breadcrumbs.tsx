'use client';

import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
} from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FileCode,
  Search,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { FileNode } from '@/lib/sample-contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BreadcrumbSegment {
  name: string;
  path: string[];
  isFile: boolean;
  siblings: FileNode[];
}

// ---------------------------------------------------------------------------
// Icon helper
// ---------------------------------------------------------------------------

function NodeIcon({ node, className }: { node: FileNode; className?: string }) {
  const base = className ?? 'h-3 w-3 shrink-0';
  if (node.children) return <Folder className={`${base} text-primary/70`} />;
  const ext = node.name?.split('.').pop()?.toLowerCase();
  if (ext === 'rs' || ext === 'toml')
    return <FileCode className={`${base} text-orange-400/80`} />;
  return <File className={`${base} text-muted-foreground`} />;
}

// ---------------------------------------------------------------------------
// Per-segment dropdown
// ---------------------------------------------------------------------------

interface BreadcrumbDropdownProps {
  segment: BreadcrumbSegment;
  isActive: boolean;
  isLast: boolean;
  onNavigate: (path: string[], name: string, isFile: boolean) => void;
}

const BreadcrumbDropdown = forwardRef<
  HTMLButtonElement,
  BreadcrumbDropdownProps
>(function BreadcrumbDropdown(
  { segment, isActive, isLast, onNavigate }: BreadcrumbDropdownProps,
  ref: React.Ref<HTMLButtonElement>,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input when the dropdown opens; reset on close
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => searchRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
    setQuery('');
  }, [open]);

  // Sorted siblings: folders first, then alphabetical
  const sorted = useMemo(
    () =>
      [...segment.siblings].sort((a, b) => {
        if (a.children && !b.children) return -1;
        if (!a.children && b.children) return 1;
        return (a.name ?? '').localeCompare(b.name ?? '');
      }),
    [segment.siblings],
  );

  // Filtered by search query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((n) => n.name?.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);

  // Prevent Radix from swallowing keystrokes while focus is inside the input
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === 'Escape') setOpen(false);
    },
    [],
  );

  return (
    <div className="flex items-center gap-0.5">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        {/* Trigger — forwardRef exposes this button so the parent can focus it */}
        <DropdownMenuTrigger asChild>
          <button
            ref={ref}
            aria-label={`${segment.name}, breadcrumb segment. Press Enter to open navigation menu.`}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={`group flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors
              focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50
              ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
          >
            {segment.isFile ? (
              <FileCode className="h-3 w-3 shrink-0" aria-hidden="true" />
            ) : (
              <Folder className="h-3 w-3 shrink-0" aria-hidden="true" />
            )}
            <span>{segment.name}</span>
            <ChevronDown
              aria-hidden="true"
              className={`h-2.5 w-2.5 shrink-0 transition-transform duration-150
                ${open ? 'rotate-180' : ''}
                ${isActive ? 'opacity-50' : 'opacity-0 group-hover:opacity-50'}`}
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="w-52 p-0 overflow-hidden"
          role="listbox"
          aria-label={`Siblings of ${segment.name}`}
          // Prevent focus jumping back to trigger after selection
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* ── Search ── */}
          <div
            className="flex items-center gap-1.5 border-b border-border px-2 py-1.5"
            // Keep clicks inside the search row from closing the menu
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Search className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Filter…"
              aria-label={`Filter siblings of ${segment.name}`}
              className="flex-1 bg-transparent text-xs text-foreground
                placeholder:text-muted-foreground/60 outline-none"
            />
          </div>

          {/* ── File list ── */}
          <div
            className="max-h-60 overflow-y-auto py-0.5"
            role="group"
            aria-label="Files and folders"
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground" role="status">
                No matches
              </p>
            ) : (
              filtered.map((sibling) => {
                const siblingPath = [
                  ...segment.path.slice(0, -1),
                  sibling.name!,
                ];
                const isCurrent = sibling.name === segment.name;

                return (
                  <DropdownMenuItem
                    key={sibling.name}
                    role="option"
                    aria-selected={isCurrent}
                    onSelect={() => {
                      if (!isCurrent) {
                        onNavigate(siblingPath, sibling.name!, !sibling.children);
                      }
                      setOpen(false);
                    }}
                    className={`flex items-center gap-2 text-xs font-mono mx-0.5 rounded
                      ${isCurrent ? 'bg-accent/60 text-foreground font-medium' : ''}`}
                  >
                    <NodeIcon node={sibling} />
                    <span className="flex-1 truncate">{sibling.name}</span>
                    {isCurrent && (
                      <span
                        className="text-[10px] text-primary"
                        aria-label="current"
                        aria-hidden="true"
                      >
                        ●
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Separator — keep lucide class so tests can query it */}
      {!isLast && (
        <ChevronRight
          className="lucide-chevron-right h-3 w-3 text-muted-foreground/40 shrink-0"
          aria-hidden="true"
        />
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Root breadcrumb bar
// ---------------------------------------------------------------------------

export function Breadcrumbs() {
  const { activeTabPath, files, setActiveTabPath, addTab } = useWorkspaceStore();

  // Ref to the first segment's trigger button for keyboard shortcut focus
  const firstTriggerRef = useRef<HTMLButtonElement>(null);

  // Build segments from the active path
  const segments = useMemo(() => {
    const result: BreadcrumbSegment[] = [];
    if (activeTabPath.length === 0) return result;

    const walk = (
      nodes: FileNode[],
      parts: string[],
      current: string[] = [],
    ): void => {
      if (!parts.length) return;
      const [head, ...tail] = parts;
      const node = nodes.find((n) => n.name === head);
      if (!node) return;

      const fullPath = [...current, head];
      result.push({
        name: head,
        path: fullPath,
        isFile: !node.children,
        siblings: nodes,
      });

      if (node.children && tail.length) walk(node.children, tail, fullPath);
    };

    walk(files, activeTabPath);
    return result;
  }, [activeTabPath, files]);

  // Navigate to a sibling file/folder
  const handleNavigate = useCallback(
    (path: string[], name: string, isFile: boolean) => {
      if (isFile) {
        addTab(path, name);
        setActiveTabPath(path);
      }
    },
    [addTab, setActiveTabPath],
  );

  // Keyboard shortcut: Ctrl+Shift+. (Windows/Linux) or Cmd+Shift+. (Mac)
  // Focuses the first breadcrumb trigger so the user can keyboard-navigate from there
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = /mac/i.test(navigator.userAgent);
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (modKey && e.shiftKey && e.key === '.') {
        e.preventDefault();
        firstTriggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  if (segments.length === 0) return null;

  return (
    <nav
      aria-label="File path breadcrumbs — press Ctrl+Shift+. to focus"
      className="flex items-center gap-0.5 px-3 py-1 bg-muted/20 border-b border-border
        text-xs font-mono overflow-x-auto scrollbar-none"
    >
      {segments.map((segment, index) => (
        <BreadcrumbDropdown
          key={segment.path.join('/')}
          ref={index === 0 ? firstTriggerRef : undefined}
          segment={segment}
          isActive={index === segments.length - 1}
          isLast={index === segments.length - 1}
          onNavigate={handleNavigate}
        />
      ))}
    </nav>
  );
}
