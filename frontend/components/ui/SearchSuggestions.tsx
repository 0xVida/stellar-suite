import type { SearchResult } from "@/lib/search/search-engine";
import { Badge } from "./Badge";

interface SearchSuggestionsProps {
  suggestions: SearchResult[];
  activeIndex: number;
  onSelect: (item: SearchResult) => void;
}

export function SearchSuggestions({
  suggestions,
  activeIndex,
  onSelect,
}: SearchSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-1 overflow-hidden rounded-[var(--radius)] border border-border-subtle bg-slate-gray">
      {suggestions.map((suggestion, i) => (
        <button
          key={suggestion.item.id}
          onClick={() => onSelect(suggestion)}
          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
            i === activeIndex
              ? "bg-electric-cyan/10 text-stardust-white"
              : "text-muted-silver hover:bg-slate-gray/80"
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="truncate font-medium text-stardust-white">
              {suggestion.item.title}
            </div>
            <div className="truncate text-xs text-muted-silver">
              {suggestion.item.description}
            </div>
          </div>
          <Badge
            variant={suggestion.item.type === "template" ? "cyan" : "blue"}
          >
            {suggestion.item.type}
          </Badge>
        </button>
      ))}
    </div>
  );
}
