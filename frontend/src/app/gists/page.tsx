"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, FileCode2, User, Calendar, Tag, X } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

interface GistSummary {
  id: string;
  title: string;
  description: string;
  author: string;
  date: string;
  language: string;
  tags: string[];
  lines: number;
}

const GISTS: GistSummary[] = [
  {
    id: "hello-world-soroban",
    title: "Hello World Soroban Contract",
    description:
      "A minimal Soroban smart contract that stores and retrieves a greeting string on the Stellar network.",
    author: "stellar-dev",
    date: "2026-05-15",
    language: "Rust",
    tags: ["soroban", "beginner", "storage"],
    lines: 40,
  },
  {
    id: "token-contract",
    title: "Stellar Token Contract (SEP-41)",
    description:
      "A compliant SEP-41 fungible token contract with mint, burn, and transfer capabilities.",
    author: "soroban-wizard",
    date: "2026-05-22",
    language: "Rust",
    tags: ["soroban", "token", "sep-41", "defi"],
    lines: 62,
  },
  {
    id: "nft-contract",
    title: "Non-Fungible Token (NFT) Contract",
    description:
      "A basic NFT contract on Soroban supporting minting, ownership queries, and transfers.",
    author: "nft-builder",
    date: "2026-05-28",
    language: "Rust",
    tags: ["soroban", "nft", "collectibles"],
    lines: 55,
  },
  {
    id: "multisig-wallet",
    title: "Multi-Signature Wallet",
    description:
      "A multi-signature wallet contract requiring M-of-N signers to authorize transactions.",
    author: "security-first",
    date: "2026-04-10",
    language: "Rust",
    tags: ["soroban", "wallet", "multisig", "security"],
    lines: 98,
  },
  {
    id: "amm-pool",
    title: "Automated Market Maker Pool",
    description:
      "A constant-product AMM liquidity pool for decentralized token swaps on Stellar.",
    author: "defi-arch",
    date: "2026-03-30",
    language: "Rust",
    tags: ["soroban", "defi", "amm", "liquidity"],
    lines: 134,
  },
  {
    id: "oracle-contract",
    title: "Price Oracle Contract",
    description:
      "An on-chain price oracle that aggregates and exposes asset prices to other contracts.",
    author: "data-feeds",
    date: "2026-04-18",
    language: "Rust",
    tags: ["soroban", "oracle", "defi", "price"],
    lines: 72,
  },
];

const ALL_TAGS = Array.from(new Set(GISTS.flatMap((g) => g.tags))).sort();

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function GistsPage() {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GISTS.filter((gist) => {
      const matchesQuery =
        !q ||
        gist.title.toLowerCase().includes(q) ||
        gist.author.toLowerCase().includes(q) ||
        gist.tags.some((t) => t.toLowerCase().includes(q)) ||
        gist.description.toLowerCase().includes(q);
      const matchesTag = !activeTag || gist.tags.includes(activeTag);
      return matchesQuery && matchesTag;
    });
  }, [query, activeTag]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-20 pb-8 px-4 sm:pt-24 sm:pb-12 sm:px-6 border-b border-border">
        <div className="mx-auto max-w-3xl text-center">
          <nav className="flex items-center justify-center gap-2 mb-6 text-xs sm:text-sm font-body text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-foreground">Gists</span>
          </nav>

          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 mb-5">
            <FileCode2 className="h-6 w-6 text-primary" />
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-extrabold tracking-tight text-foreground mb-3">
            Contract Gists
          </h1>
          <p className="text-base sm:text-lg font-body text-muted-foreground max-w-xl mx-auto mb-8">
            Browse, search, and share Soroban contract snippets from the
            community.
          </p>

          {/* Search */}
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, author, or tag..."
              className="w-full rounded-xl border border-border bg-card pl-10 pr-10 py-3 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      <main id="main-content" className="py-10 px-4 sm:py-14 sm:px-6">
        <div className="mx-auto max-w-5xl">
          {/* Tag filters */}
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              onClick={() => setActiveTag(null)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold font-display transition-all border ${
                activeTag === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              All
            </button>
            {ALL_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag((prev) => (prev === tag ? null : tag))}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold font-display transition-all border ${
                  activeTag === tag
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Results count */}
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground font-display mb-5">
            {filtered.length} gist{filtered.length !== 1 ? "s" : ""}
          </p>

          {/* Gist cards */}
          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted-foreground font-body">
                No gists match your search.
              </p>
              <button
                onClick={() => {
                  setQuery("");
                  setActiveTag(null);
                }}
                className="mt-3 text-primary text-sm underline underline-offset-4 hover:opacity-80 transition-opacity font-body"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-5">
              {filtered.map((gist) => (
                <Link
                  key={gist.id}
                  href={`/gists/${gist.id}`}
                  className="group flex flex-col rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                      <FileCode2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-display font-semibold text-foreground text-base leading-snug group-hover:text-primary transition-colors truncate">
                        {gist.title}
                      </h2>
                      <p className="text-xs font-body text-muted-foreground mt-0.5">
                        {gist.language} · {gist.lines} lines
                      </p>
                    </div>
                  </div>

                  <p className="text-sm font-body text-muted-foreground leading-relaxed mb-4 line-clamp-2">
                    {gist.description}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {gist.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-semibold font-display text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-4 mt-auto text-xs font-body text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {gist.author}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(gist.date)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
