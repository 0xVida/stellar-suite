// src/app/blog/page.tsx
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getAllCategories, getAllPosts, getAllTags } from "@/lib/post";
import { CategoryFilter } from "@/components/CategoryFilter";
import { PostCard } from "@/components/ PostCard";

const allPosts = getAllPosts();
const allCategories = getAllCategories();
const allTags = getAllTags();

export default function BlogIndex() {
  const [activeCategory, setActiveCategory] = useState("");
  const [activeTag, setActiveTag] = useState("");

  const filtered = useMemo(() => {
    return allPosts.filter((p) => {
      const matchCat = activeCategory === "" || p.category === activeCategory;
      const matchTag = activeTag === "" || p.tags.includes(activeTag);
      return matchCat && matchTag;
    });
  }, [activeCategory, activeTag]);

  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-14 px-6 border-b border-border">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-2 mb-5">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors font-body"
            >
              Home
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-sm text-foreground font-body">Blog</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-extrabold tracking-tight text-foreground leading-tight">
            Blog
          </h1>
          <p className="mt-4 text-lg font-body text-muted-foreground max-w-xl">
            Release notes, tutorials, and updates from the Stellar Suite team.
          </p>

          {/* Filters */}
          <div className="mt-10">
            <CategoryFilter
              categories={allCategories}
              tags={allTags}
              activeCategory={activeCategory}
              activeTag={activeTag}
              onCategoryChange={(c) => {
                setActiveCategory(c);
                setActiveTag("");
              }}
              onTagChange={(t) => {
                setActiveTag(t);
                setActiveCategory("");
              }}
            />
          </div>
        </div>
      </section>

      {/* Posts */}
      <main id="main-content" className="py-16 px-6">
        <div className="mx-auto max-w-6xl">
          {filtered.length === 0 ? (
            <div className="text-center py-24">
              <p className="text-muted-foreground font-body text-lg">
                No posts match your filter.
              </p>
              <button
                onClick={() => {
                  setActiveCategory("");
                  setActiveTag("");
                }}
                className="mt-4 text-primary underline underline-offset-4 text-sm font-body hover:opacity-80 transition-opacity"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Featured (first) post — full width */}
              {featured && (
                <div className="grid grid-cols-1 lg:grid-cols-2">
                  <PostCard post={featured} featured />
                </div>
              )}

              {/* Remaining posts — 2-col grid */}
              {rest.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {rest.map((post) => (
                    <PostCard key={post.slug} post={post} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
