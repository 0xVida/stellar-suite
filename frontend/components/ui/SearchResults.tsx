import type { SearchResult } from "@/lib/search/search-engine";
import { Badge } from "./Badge";

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  onTagClick?: (tag: string) => void;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi",
  );
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-electric-cyan/20 text-electric-cyan rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function SearchResults({ results, query, onTagClick }: SearchResultsProps) {
  if (results.length === 0 && query.trim()) {
    return (
      <div className="py-12 text-center">
        <div className="text-sm text-muted-silver">
          No results for &ldquo;{query}&rdquo;
        </div>
        <div className="mt-1 text-xs text-muted-silver/50">
          Try searching for &ldquo;token&rdquo;, &ldquo;deploy&rdquo;, or
          &ldquo;staking&rdquo;
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {query.trim() && (
        <div className="px-1 text-xs text-muted-silver/50">
          {results.length} result{results.length !== 1 ? "s" : ""}
        </div>
      )}
      {results.map((result) => (
        <div
          key={result.item.id}
          className="rounded-[var(--radius)] border border-border-subtle bg-slate-gray/20 p-4 transition-colors hover:border-electric-cyan/20"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-stardust-white">
              {highlightMatch(result.item.title, query)}
            </span>
            <Badge
              variant={result.item.type === "template" ? "cyan" : "blue"}
            >
              {result.item.type}
            </Badge>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-silver">
            {highlightMatch(result.item.description, query)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.item.tags.map((tag) => (
              <Badge
                key={tag}
                onClick={onTagClick ? () => onTagClick(tag) : undefined}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
