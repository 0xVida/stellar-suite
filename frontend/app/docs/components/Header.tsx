"use client";

import Link from "next/link";
import { Menu, X, Github } from "lucide-react";
import SearchDialog from "./SearchDialog";

interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function Header({ sidebarOpen, onToggleSidebar }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-(--header-h) border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-lg text-muted-fg hover:text-foreground hover:bg-muted transition-colors lg:hidden"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Link href="/docs" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-lg hidden sm:inline">Stellar Suite Docs</span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <SearchDialog />
          <a
            href="https://github.com/0xVida/stellar-suite"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-muted-fg hover:text-foreground hover:bg-muted transition-colors"
            aria-label="GitHub repository"
          >
            <Github size={20} />
          </a>
        </div>
      </div>
    </header>
  );
}
