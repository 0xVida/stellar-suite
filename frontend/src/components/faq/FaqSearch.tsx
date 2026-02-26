"use client";

import { Search, X } from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  resultCount?: number;
};

export function FaqSearch({ value, onChange, resultCount }: Props) {
  return (
    <div className="relative w-full max-w-xl mx-auto">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search questions…"
        aria-label="Search frequently asked questions"
        className="w-full rounded-xl border border-border bg-background py-3 pl-11 pr-10 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {value && resultCount !== undefined && (
        <p
          className="mt-2 text-xs text-muted-foreground font-body text-center"
          aria-live="polite"
          aria-atomic="true"
        >
          {resultCount === 0
            ? "No results found — try different keywords."
            : `${resultCount} result${resultCount === 1 ? "" : "s"} found`}
        </p>
      )}
    </div>
  );
}
