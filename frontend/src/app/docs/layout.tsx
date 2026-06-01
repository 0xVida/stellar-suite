"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  BookOpen,
  ChevronRight,
  Menu,
  X,
  ExternalLink,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { cn } from "@/lib/utils";

interface DocLink {
  label: string;
  href: string;
}

interface DocSection {
  title: string;
  links: DocLink[];
}

const NAV_SECTIONS: DocSection[] = [
  {
    title: "Getting Started",
    links: [
      { label: "Introduction", href: "/docs" },
      { label: "Installation", href: "/docs/installation" },
      { label: "Quick Start", href: "/docs/quick-start" },
      { label: "Configuration", href: "/docs/configuration" },
    ],
  },
  {
    title: "Soroban IDE",
    links: [
      { label: "Contract Editor", href: "/docs/ide/contract-editor" },
      { label: "Deployment Tools", href: "/docs/ide/deployment" },
      { label: "Simulation", href: "/docs/ide/simulation" },
      { label: "Debugging", href: "/docs/ide/debugging" },
    ],
  },
  {
    title: "Stellar Tools",
    links: [
      { label: "Soroban SDK", href: "/docs/tools/soroban-sdk" },
      { label: "Stellar CLI", href: "/docs/tools/stellar-cli" },
      { label: "Testnet Faucet", href: "/docs/tools/testnet-faucet" },
      { label: "Contract Inspector", href: "/docs/tools/contract-inspector" },
    ],
  },
  {
    title: "Guides",
    links: [
      { label: "Write Your First Contract", href: "/docs/guides/first-contract" },
      { label: "Token Contracts (SEP-41)", href: "/docs/guides/tokens" },
      { label: "NFT Contracts", href: "/docs/guides/nfts" },
      { label: "DeFi Protocols", href: "/docs/guides/defi" },
    ],
  },
  {
    title: "API Reference",
    links: [
      { label: "REST API", href: "/docs/api/rest" },
      { label: "WebSocket API", href: "/docs/api/websocket" },
      { label: "SDK Reference", href: "/docs/api/sdk" },
      { label: "Webhooks", href: "/docs/api/webhooks" },
    ],
  },
];

function Sidebar({
  onClose,
  isMobile,
}: {
  onClose?: () => void;
  isMobile?: boolean;
}) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return NAV_SECTIONS;
    return NAV_SECTIONS.map((section) => ({
      ...section,
      links: section.links.filter((l) => l.label.toLowerCase().includes(q)),
    })).filter((s) => s.links.length > 0);
  }, [searchQuery]);

  return (
    <aside
      className={cn(
        "flex flex-col h-full",
        isMobile ? "p-4" : "p-6"
      )}
    >
      {/* Logo / Title */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/docs"
          className="flex items-center gap-2 font-display font-bold text-foreground hover:text-primary transition-colors"
          onClick={onClose}
        >
          <BookOpen className="h-5 w-5 text-primary" />
          <span>Docs</span>
        </Link>
        {isMobile && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search docs..."
          className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
        />
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto space-y-6 pb-4">
        {filteredSections.length === 0 ? (
          <p className="text-xs font-body text-muted-foreground px-1">
            No results for &ldquo;{searchQuery}&rdquo;
          </p>
        ) : (
          filteredSections.map((section) => (
            <div key={section.title}>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-display mb-2 px-1">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.links.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-body transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        )}
                      >
                        {isActive && (
                          <ChevronRight className="h-3 w-3 shrink-0" />
                        )}
                        <span className={cn(!isActive && "pl-5")}>
                          {link.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>

      {/* Footer links */}
      <div className="border-t border-border pt-4 mt-2 space-y-1">
        <a
          href="https://developers.stellar.org"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 text-xs font-body text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/60"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          Stellar Developer Docs
        </a>
        <a
          href="https://soroban.stellar.org"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 text-xs font-body text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/60"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          Soroban Docs
        </a>
      </div>
    </aside>
  );
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-16 flex min-h-[calc(100vh-4rem)]">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex w-64 xl:w-72 shrink-0 border-r border-border sticky top-16 h-[calc(100vh-4rem)] overflow-hidden">
          <div className="w-full overflow-y-auto">
            <Sidebar />
          </div>
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="relative z-10 w-72 bg-background border-r border-border h-full overflow-y-auto">
              <Sidebar
                onClose={() => setSidebarOpen(false)}
                isMobile
              />
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Mobile top bar */}
          <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm sticky top-16 z-10">
            <button
              onClick={() => setSidebarOpen(true)}
              className="inline-flex items-center gap-2 text-sm font-semibold font-display text-muted-foreground hover:text-foreground transition-colors"
            >
              <Menu className="h-4 w-4" />
              Navigation
            </button>
          </div>

          {/* Page content */}
          <main
            id="main-content"
            className="flex-1 px-6 py-10 sm:px-8 sm:py-12 lg:px-12 max-w-3xl"
          >
            {children}
          </main>

          <Footer />
        </div>
      </div>
    </div>
  );
}
