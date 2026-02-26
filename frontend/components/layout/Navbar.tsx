"use client";

import Image from "next/image";
import Link from "next/link";
import { ContactDialog } from "../ContactDialog";

const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "Templates", href: "/#templates" },
  { label: "Compare", href: "/#compare" },
  { label: "Blog", href: "/blog" },
  { label: "Docs", href: "https://github.com/0xVida/stellar-suite#readme" },
];

export function Navbar() {
  return (
    <nav className="fixed top-0 z-40 w-full border-b border-border-subtle bg-cosmic-navy/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 md:px-12">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/icon.png"
            alt="Stellar Suite"
            width={24}
            height={24}
            priority
          />
          <span className="text-sm font-semibold text-stardust-white">
            Stellar Suite
          </span>
        </Link>

        {/* Links */}
        <div className="flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm text-muted-silver transition-colors hover:text-stardust-white"
              {...(link.href.startsWith("http")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {link.label}
            </Link>
          ))}

          {/* Contact trigger */}
          <ContactDialog
            trigger={
              <span className="text-sm text-muted-silver transition-colors hover:text-stardust-white cursor-pointer">
                Contact
              </span>
            }
          />
        </div>
      </div>
    </nav>
  );
}
