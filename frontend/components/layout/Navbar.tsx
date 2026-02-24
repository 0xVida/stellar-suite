"use client";

import { useSearch } from "@/lib/context/search-context";
import Image from "next/image";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Templates", href: "#templates" },
  { label: "Compare", href: "#compare" },
  { label: "Docs", href: "https://github.com/0xVida/stellar-suite#readme" },
];

export function Navbar() {
  const { open } = useSearch();

  return (
    <nav className="fixed top-0 z-40 w-full border-b border-border-subtle bg-cosmic-navy/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 md:px-12">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5">
          <Image
            src="/images/logo.png"
            alt="Stellar Suite"
            width={24}
            height={24}
          />
          <span className="text-sm font-semibold text-stardust-white">
            Stellar Suite
          </span>
        </a>

        {/* Links */}
        <div className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm text-muted-silver transition-colors hover:text-stardust-white"
              {...(link.href.startsWith("http")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Search trigger */}
        <button
          onClick={open}
          className="flex items-center gap-2 rounded-[var(--radius)] border border-border-subtle bg-slate-gray/50 px-3 py-1.5 text-xs text-muted-silver transition-colors hover:border-electric-cyan/30 hover:text-stardust-white"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden rounded border border-border-subtle bg-cosmic-navy px-1 py-0.5 text-[10px] font-mono sm:inline">
            ⌘K
          </kbd>
        </button>
      </div>
    </nav>
  );
}
