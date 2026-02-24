import { ALL_CONTENT, ContentItem } from "../data/content";

export interface SearchResult {
  item: ContentItem;
  score: number;
  matchedFields: string[];
}

type Index = Map<string, Set<string>>;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function buildIndex(items: ContentItem[]): Index {
  const index: Index = new Map();

  for (const item of items) {
    const fields = [
      item.title,
      item.description,
      item.tags.join(" "),
      item.keywords.join(" "),
      item.body ?? "",
      item.codeSnippet ?? "",
    ];

    const tokens = new Set(tokenize(fields.join(" ")));
    for (const token of tokens) {
      if (!index.has(token)) index.set(token, new Set());
      index.get(token)!.add(item.id);
    }
  }

  return index;
}

const itemMap = new Map(ALL_CONTENT.map((item) => [item.id, item]));
const index = buildIndex(ALL_CONTENT);

export function search(query: string, limit = 20): SearchResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const scores = new Map<string, { score: number; fields: Set<string> }>();

  for (const qt of queryTokens) {
    for (const [indexToken, ids] of index) {
      if (!indexToken.startsWith(qt)) continue;
      const isExact = indexToken === qt;

      for (const id of ids) {
        if (!scores.has(id)) scores.set(id, { score: 0, fields: new Set() });
        const entry = scores.get(id)!;
        const item = itemMap.get(id)!;

        const titleLower = item.title.toLowerCase();
        if (titleLower.includes(qt)) {
          entry.score += isExact ? 10 : 5;
          entry.fields.add("title");
        }
        if (item.tags.some((t) => t.toLowerCase().startsWith(qt))) {
          entry.score += isExact ? 6 : 3;
          entry.fields.add("tags");
        }
        if (item.keywords.some((k) => k.toLowerCase().startsWith(qt))) {
          entry.score += 3;
          entry.fields.add("keywords");
        }
        if (item.description.toLowerCase().includes(qt)) {
          entry.score += 2;
          entry.fields.add("description");
        }
        if (item.codeSnippet?.toLowerCase().includes(qt)) {
          entry.score += 1;
          entry.fields.add("code");
        }
      }
    }
  }

  return Array.from(scores.entries())
    .map(([id, { score, fields }]) => ({
      item: itemMap.get(id)!,
      score,
      matchedFields: Array.from(fields),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function getSuggestions(partial: string, limit = 6): SearchResult[] {
  return search(partial, limit);
}

export function getRelatedContent(
  currentId: string,
  limit = 4,
): ContentItem[] {
  const current = itemMap.get(currentId);
  if (!current) return [];

  const scored = ALL_CONTENT.filter((item) => item.id !== currentId).map(
    (item) => {
      const sharedTags = item.tags.filter((t) => current.tags.includes(t));
      const sameCategory = item.category === current.category ? 2 : 0;
      return { item, score: sharedTags.length * 3 + sameCategory };
    },
  );

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}

export function getAllTags(): { tag: string; count: number }[] {
  const tagCounts = new Map<string, number>();
  for (const item of ALL_CONTENT) {
    for (const tag of item.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export function getContentByTag(tag: string): ContentItem[] {
  return ALL_CONTENT.filter((item) =>
    item.tags.some((t) => t.toLowerCase() === tag.toLowerCase()),
  );
}
