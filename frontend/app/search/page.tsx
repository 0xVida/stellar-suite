"use client";

import { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { search, getAllTags, getContentByTag } from "@/lib/search/search-engine";
import { SearchInput } from "@/components/ui/SearchInput";
import { SearchResults } from "@/components/ui/SearchResults";
import { Badge } from "@/components/ui/Badge";

function SearchPageContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const results = useMemo(() => {
    if (activeTag) {
      return getContentByTag(activeTag).map((item) => ({
        item,
        score: 1,
        matchedFields: ["tags"],
      }));
    }
    return query.trim() ? search(query) : [];
  }, [query, activeTag]);

  const tags = getAllTags();

  function handleTagClick(tag: string) {
    setActiveTag(tag === activeTag ? null : tag);
    setQuery("");
  }

  return (
    <div className="min-h-screen bg-cosmic-navy px-6 pt-20 pb-12 md:px-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-semibold text-stardust-white">
          Search
        </h1>

        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            setActiveTag(null);
          }}
          autoFocus
        />

        {/* Tags */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map(({ tag, count }) => (
            <Badge
              key={tag}
              variant={tag === activeTag ? "cyan" : "default"}
              onClick={() => handleTagClick(tag)}
            >
              {tag}
              <span className="ml-1 text-muted-silver/40">{count}</span>
            </Badge>
          ))}
        </div>

        {/* Results */}
        <div className="mt-6">
          <SearchResults
            results={results}
            query={activeTag ?? query}
            onTagClick={handleTagClick}
          />
        </div>

        {/* Empty state */}
        {!query.trim() && !activeTag && (
          <div className="mt-12 text-center text-sm text-muted-silver/50">
            Type to search or click a tag to browse
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageContent />
    </Suspense>
  );
}
