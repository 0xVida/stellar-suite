"use client";

type Props = {
  categories: string[];
  tags: string[];
  activeCategory: string;
  activeTag: string;
  onCategoryChange: (c: string) => void;
  onTagChange: (t: string) => void;
};

export function CategoryFilter({
  categories,
  tags,
  activeCategory,
  activeTag,
  onCategoryChange,
  onTagChange,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* Categories */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground font-display mr-1">
          Category
        </span>
        <button
          onClick={() => onCategoryChange("")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold font-display transition-all duration-200 border ${
            activeCategory === ""
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => onCategoryChange(activeCategory === cat ? "" : cat)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold font-display transition-all duration-200 border ${
              activeCategory === cat
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground font-display mr-1">
          Tag
        </span>
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => onTagChange(activeTag === tag ? "" : tag)}
            className={`rounded-md px-3 py-1 text-xs font-mono transition-all duration-200 border ${
              activeTag === tag
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            #{tag}
          </button>
        ))}
      </div>
    </div>
  );
}
