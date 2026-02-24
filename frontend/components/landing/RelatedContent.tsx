import { getRelatedContent } from "@/lib/search/search-engine";
import type { ContentItem } from "@/lib/data/content";
import { Badge } from "@/components/ui/Badge";

interface RelatedContentProps {
  currentId: string;
  limit?: number;
}

export function RelatedContent({ currentId, limit = 3 }: RelatedContentProps) {
  const items: ContentItem[] = getRelatedContent(currentId, limit);

  if (items.length === 0) return null;

  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-silver">
        Related
      </h4>
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-[var(--radius)] border border-border-subtle bg-slate-gray/20 p-3 transition-colors hover:border-electric-cyan/20"
          >
            <div className="text-sm font-medium text-stardust-white">
              {item.title}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-silver line-clamp-2">
              {item.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {item.tags.slice(0, 3).map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
