"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const Navbar = () => {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="container mx-auto flex items-center justify-between py-4 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="text-xl font-display font-extrabold text-foreground tracking-tight">
            Stellar Suite
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
          <a href="#use-cases" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Use Cases</a>
          <a href="#get-started" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Get Started</a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://marketplace.visualstudio.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary !py-2.5 !px-6 !text-sm !rounded-lg"
          >
            Install Free
          </a>
        </div>

        <button onClick={() => setOpen(!open)} className="md:hidden text-foreground">
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-border bg-background px-6 py-4 flex flex-col gap-4">
          <a href="#features" onClick={() => setOpen(false)} className="text-sm font-medium text-muted-foreground">Features</a>
          <a href="#use-cases" onClick={() => setOpen(false)} className="text-sm font-medium text-muted-foreground">Use Cases</a>
          <a href="#get-started" onClick={() => setOpen(false)} className="text-sm font-medium text-muted-foreground">Get Started</a>
          <a href="https://marketplace.visualstudio.com" target="_blank" rel="noopener noreferrer" className="btn-primary !text-sm text-center">
            Install Free
          </a>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
