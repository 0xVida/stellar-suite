"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ArrowRight } from "lucide-react";
import { searchableContent } from "../data";

export default function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return searchableContent.filter(
      (item) =>
        item.title.toLowerCase().includes(lower) ||
        item.excerpt.toLowerCase().includes(lower) ||
        item.section.toLowerCase().includes(lower)
    );
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleOpen = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setQuery("");
    }
  };

  const navigate = (href: string) => {
    router.push(href);
    handleOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      navigate(results[selectedIndex].href);
    }
  };

  return (
    <>
      <button
        onClick={() => handleOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-muted-fg rounded-lg border border-border hover:border-accent/50 hover:bg-muted transition-colors"
        aria-label="Search documentation"
      >
        <Search size={16} />
        <span className="hidden sm:inline">Search docs...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-mono bg-muted rounded border border-border">
          <span className="text-xs">Ctrl</span>K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-100 flex items-start justify-center pt-[15vh]">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => handleOpen(false)}
          />
          <div className="relative w-full max-w-lg mx-4 bg-background rounded-xl border border-border shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 px-4 border-b border-border">
              <Search size={20} className="text-muted-fg shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Search documentation..."
                className="flex-1 py-4 text-base bg-transparent outline-none placeholder:text-muted-fg"
                aria-label="Search documentation"
              />
              <button
                onClick={() => handleOpen(false)}
                className="p-1 rounded-md text-muted-fg hover:text-foreground"
                aria-label="Close search"
              >
                <X size={20} />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {query && results.length === 0 && (
                <div className="px-4 py-8 text-center text-muted-fg text-sm">
                  No results found for &ldquo;{query}&rdquo;
                </div>
              )}
              {results.map((result, i) => (
                <button
                  key={result.href}
                  onClick={() => navigate(result.href)}
                  aria-label={`Go to ${result.title}`}
                  className={`w-full text-left px-4 py-3 rounded-lg flex items-center justify-between gap-3 transition-colors ${
                    i === selectedIndex ? "bg-accent/10 text-accent" : "hover:bg-muted"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{result.title}</div>
                    <div className="text-xs text-muted-fg truncate">{result.section} &mdash; {result.excerpt}</div>
                  </div>
                  <ArrowRight size={16} className="shrink-0 text-muted-fg" />
                </button>
              ))}
              {!query && (
                <div className="px-4 py-8 text-center text-muted-fg text-sm">
                  Type to search the documentation
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-xs text-muted-fg">
              <div className="flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono">&uarr;&darr;</kbd>
                <span>Navigate</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono">Enter</kbd>
                <span>Open</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono">Esc</kbd>
                <span>Close</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
