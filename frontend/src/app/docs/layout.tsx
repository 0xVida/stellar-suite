import React from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row mt-8 px-4 sm:px-6 lg:px-8 pb-12">
        <aside className="w-full md:w-64 md:flex-shrink-0 pr-8 border-r border-border mb-8 md:mb-0 hidden md:block">
          <div className="sticky top-24">
            <h3 className="font-semibold text-lg mb-4 text-foreground">Documentation</h3>
            <div className="mb-6">
              <input 
                type="search" 
                placeholder="Search docs..." 
                className="w-full px-4 py-2 border border-input rounded-md text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <nav className="space-y-1">
              <div className="pt-2 pb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Overview</p>
                <a href="/docs/getting-started" className="block text-sm py-1.5 text-foreground hover:text-primary transition-colors">Getting Started</a>
                <a href="/docs/architecture" className="block text-sm py-1.5 text-foreground hover:text-primary transition-colors">Architecture</a>
              </div>
              <div className="pt-4 pb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tools</p>
                <a href="/docs/stellar-sdk" className="block text-sm py-1.5 text-foreground hover:text-primary transition-colors">Stellar SDK</a>
                <a href="/docs/smart-contracts" className="block text-sm py-1.5 text-foreground hover:text-primary transition-colors">Smart Contracts (Soroban)</a>
                <a href="/docs/ide-features" className="block text-sm py-1.5 text-foreground hover:text-primary transition-colors">IDE Features</a>
              </div>
              <div className="pt-4 pb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Reference</p>
                <a href="/docs/api-reference" className="block text-sm py-1.5 text-foreground hover:text-primary transition-colors">API Reference</a>
                <a href="/docs/changelog" className="block text-sm py-1.5 text-foreground hover:text-primary transition-colors">Changelog</a>
              </div>
            </nav>
          </div>
        </aside>
        <main className="flex-1 md:pl-10 w-full prose prose-slate dark:prose-invert max-w-none">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
