import { ALL_POSTS } from "./post";
import { FAQ_CATEGORIES } from "./faq";
import { changelogData } from "./data/changelog";

export type SearchCategory = "page" | "blog" | "changelog" | "faq" | "docs";

export interface SearchResult {
  title: string;
  excerpt: string;
  link: string;
  category: SearchCategory;
}

const STATIC_PAGES: SearchResult[] = [
  {
    title: "Home",
    excerpt: "Everything you need to build on Soroban. A complete toolkit for VS Code.",
    link: "/",
    category: "page",
  },
  {
    title: "Features",
    excerpt: "One-click deploy, transaction simulation, contract scaffolding, and more.",
    link: "/#features",
    category: "page",
  },
  {
    title: "Use Cases",
    excerpt: "Endless ways to build on Stellar: deploy, simulate, build, test, and manage.",
    link: "/#use-cases",
    category: "page",
  },
  {
    title: "Get Started",
    excerpt: "Install Stellar Kit from the VS Code Marketplace and start building.",
    link: "/#get-started",
    category: "page",
  },
];

export function getSearchIndex(): SearchResult[] {
  const index: SearchResult[] = [...STATIC_PAGES];

  // Blog posts
  ALL_POSTS.forEach((post) => {
    index.push({
      title: post.title,
      excerpt: post.excerpt,
      link: `/blog/${post.slug}`,
      category: "blog",
    });
  });

  // Changelog
  changelogData.forEach((release) => {
    index.push({
      title: `Changelog v${release.version}`,
      excerpt: release.entries.flatMap((e) => e.items).join(" ").slice(0, 150) + "...",
      link: "/changelog",
      category: "changelog",
    });
  });

  // FAQ
  FAQ_CATEGORIES.forEach((cat) => {
    cat.items.forEach((item) => {
      index.push({
        title: item.question,
        excerpt: item.answer,
        link: `/faq#${item.id}`,
        category: "faq",
      });
    });
  });

  return index;
}

export function search(query: string): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  return getSearchIndex().filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.excerpt.toLowerCase().includes(q)
  );
}
