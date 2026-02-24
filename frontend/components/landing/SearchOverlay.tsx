"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearch } from "@/lib/context/search-context";
import { search, getSuggestions, getAllTags } from "@/lib/search/search-engine";
import { SearchInput } from "@/components/ui/SearchInput";
import { SearchSuggestions } from "@/components/ui/SearchSuggestions";
import { SearchResults } from "@/components/ui/SearchResults";
import { Badge } from "@/components/ui/Badge";

export function SearchOverlay() {
  const { isOpen, close } = useSearch();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = useMemo(
    () => (query.trim() ? getSuggestions(query) : []),
    [query],
  );
  const results = useMemo(
    () => (query.trim().length >= 2 ? search(query) : []),
    [query],
  );
  const tags = useMemo(() => getAllTags(), []);

  const handleTagClick = useCallback((tag: string) => {
    setQuery(tag);
    setActiveIndex(-1);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1,
        );
      } else if (e.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
        setQuery(suggestions[activeIndex].item.title);
        setActiveIndex(-1);
      }
    },
    [suggestions, activeIndex],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-cosmic-navy/80 backdrop-blur-sm pt-[15vh]"
      onClick={close}
    >
      <div
        className="w-full max-w-xl px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-[var(--radius)] border border-border-subtle bg-slate-gray p-4 shadow-lg shadow-cosmic-navy/50">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setActiveIndex(-1);
            }}
            autoFocus
            onKeyDown={handleKeyDown}
          />

          {/* Suggestions dropdown */}
          {query.trim() && suggestions.length > 0 && results.length === 0 && (
            <SearchSuggestions
              suggestions={suggestions}
              activeIndex={activeIndex}
              onSelect={(s) => {
                setQuery(s.item.title);
                setActiveIndex(-1);
              }}
            />
          )}

          {/* Full results */}
          {results.length > 0 && (
            <div className="mt-4 max-h-[50vh] overflow-y-auto">
              <SearchResults
                results={results}
                query={query}
                onTagClick={handleTagClick}
              />
            </div>
          )}

          {/* Tag cloud when no query */}
          {!query.trim() && (
            <div className="mt-4">
              <div className="mb-2 text-xs text-muted-silver/50">
                Browse by tag
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.slice(0, 16).map(({ tag, count }) => (
                  <Badge
                    key={tag}
                    variant="cyan"
                    onClick={() => handleTagClick(tag)}
                  >
                    {tag}
                    <span className="ml-1 text-muted-silver/40">{count}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Hint */}
          <div className="mt-3 flex items-center justify-between text-[10px] text-muted-silver/30">
            <span>
              <kbd className="rounded border border-border-subtle bg-cosmic-navy px-1 py-0.5 font-mono">
                ↑↓
              </kbd>{" "}
              navigate{" "}
              <kbd className="ml-1 rounded border border-border-subtle bg-cosmic-navy px-1 py-0.5 font-mono">
                ↵
              </kbd>{" "}
              select
            </span>
            <span>
              <kbd className="rounded border border-border-subtle bg-cosmic-navy px-1 py-0.5 font-mono">
                esc
              </kbd>{" "}
              close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
