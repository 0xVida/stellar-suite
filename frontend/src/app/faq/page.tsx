"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { FaqItem } from "@/components/faq/FaqItem";
import { FaqSearch } from "@/components/faq/FaqSearch";
import { FAQ_CATEGORIES, searchFaq } from "@/lib/faq";
import { HelpCircle, MessageSquare } from "lucide-react";
import ContactDialog from "@/components/ContactDialog";

const ALL_ID = "all";

export default function FaqPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(ALL_ID);

  const isSearching = query.trim().length > 0;

  const searchResults = useMemo(() => searchFaq(query), [query]);

  const visibleCategories = useMemo(() => {
    if (activeCategory === ALL_ID) return FAQ_CATEGORIES;
    return FAQ_CATEGORIES.filter((c) => c.id === activeCategory);
  }, [activeCategory]);

  const totalQuestions = FAQ_CATEGORIES.reduce((n, c) => n + c.items.length, 0);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="pt-20 pb-8 px-4 sm:pt-24 sm:pb-12 sm:px-6 md:pt-32 md:pb-14 border-b border-border">
        <div className="mx-auto max-w-3xl text-center">
          {/* Breadcrumb */}
          <nav className="flex items-center justify-center gap-2 mb-6 sm:mb-8 text-xs sm:text-sm font-body text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-foreground">FAQ</span>
          </nav>

          <div className="inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-primary/10 mb-4 sm:mb-5">
            <HelpCircle className="h-6 w-6 text-primary" />
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-extrabold tracking-tight text-foreground leading-tight">
            Frequently asked
            <br className="hidden sm:block" /> questions
          </h1>
          <p className="mt-3 sm:mt-4 text-base sm:text-lg font-body text-muted-foreground max-w-xl mx-auto">
            {totalQuestions} answers to the most common questions about Stellar
            Suite.
          </p>

          {/* Search */}
          <div className="mt-6 sm:mt-8 lg:mt-10">
            <FaqSearch
              value={query}
              onChange={(v) => {
                setQuery(v);
                if (v) setActiveCategory(ALL_ID);
              }}
              resultCount={isSearching ? searchResults.length : undefined}
            />
          </div>
        </div>
      </section>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main id="main-content" className="py-12 px-4 sm:py-14 sm:px-6 md:py-16">
        <div className="mx-auto max-w-3xl">
          {/* ── Search results ── */}
          {isSearching ? (
            <div>
              {searchResults.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-muted-foreground font-body text-base">
                    No results for{" "}
                    <strong className="text-foreground">&quot;{query}&quot;</strong>
                  </p>
                  <button
                    onClick={() => setQuery("")}
                    className="mt-3 text-primary text-sm underline underline-offset-4 hover:opacity-80 transition-opacity font-body"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground font-display mb-2">
                    Search results
                  </p>
                  {searchResults.map((item) => (
                    <FaqItem key={item.id} item={item} defaultOpen />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ── Category tabs + accordion ── */
            <div>
              {/* Category filter tabs */}
              <div
                className="flex flex-wrap gap-2 mb-6 sm:mb-8 lg:mb-10"
                role="tablist"
                aria-label="FAQ categories"
              >
                <button
                  role="tab"
                  aria-selected={activeCategory === ALL_ID}
                  onClick={() => setActiveCategory(ALL_ID)}
                  className={`rounded-full px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold font-display transition-all duration-200 border touch-manipulation ${
                    activeCategory === ALL_ID
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  All
                </button>
                {FAQ_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    role="tab"
                    aria-selected={activeCategory === cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`rounded-full px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold font-display transition-all duration-200 border touch-manipulation ${
                      activeCategory === cat.id
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Accordion sections */}
              <div className="flex flex-col gap-8 sm:gap-10 lg:gap-12">
                {visibleCategories.map((cat) => (
                  <section
                    key={cat.id}
                    aria-labelledby={`cat-heading-${cat.id}`}
                  >
                    <h2
                      id={`cat-heading-${cat.id}`}
                      className="text-xs sm:text-sm font-bold uppercase tracking-widest text-muted-foreground font-display mb-3 sm:mb-4"
                    >
                      {cat.label}
                    </h2>
                    <div className="flex flex-col gap-2 sm:gap-3">
                      {cat.items.map((item) => (
                        <FaqItem key={item.id} item={item} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}

          {/* ── CTA ── */}
          <div className="mt-16 sm:mt-20 rounded-2xl border border-border bg-card p-6 sm:p-8 text-center">
            <div className="inline-flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-primary/10 mb-3 sm:mb-4">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-display font-bold text-foreground text-base sm:text-lg mb-2">
              Still have questions?
            </h2>
            <p className="text-xs sm:text-sm font-body text-muted-foreground mb-4 sm:mb-6 max-w-sm mx-auto">
              Can&apos;t find what you&apos;re looking for? Our team is happy to help.
            </p>
            <ContactDialog
              trigger={
                <span className="btn-primary cursor-pointer text-sm sm:text-base">Contact us</span>
              }
            />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
