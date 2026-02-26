import Footer from "../../src/components/Footer";

export default Footer;
export { Footer };
"use client";

import { ContactDialog } from "../ContactDialog";

const PRODUCT_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "Templates", href: "/#templates" },
  { label: "Compare", href: "/#compare" },
];

const RESOURCE_LINKS = [
  { label: "Blog", href: "/blog" },
  {
    label: "Documentation",
    href: "https://github.com/0xVida/stellar-suite#readme",
  },
  {
    label: "VS Code Marketplace",
    href: "https://marketplace.visualstudio.com/",
  },
  { label: "Stellar Docs", href: "https://developers.stellar.org/" },
];

const COMMUNITY_LINKS = [
  { label: "GitHub", href: "https://github.com/0xVida/stellar-suite" },
  { label: "Issues", href: "https://github.com/0xVida/stellar-suite/issues" },
  {
    label: "Contributing",
    href: "https://github.com/0xVida/stellar-suite#contributing",
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-cosmic-navy">
      <div className="mx-auto max-w-6xl px-6 py-12 md:px-12">
        <div className="grid gap-8 sm:grid-cols-4">
          {/* Product */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-silver">
              Product
            </h4>
            <ul className="space-y-2">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-silver/70 transition-colors hover:text-stardust-white"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-silver">
              Resources
            </h4>
            <ul className="space-y-2">
              {RESOURCE_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-silver/70 transition-colors hover:text-stardust-white"
                    {...(link.href.startsWith("http")
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-silver">
              Community
            </h4>
            <ul className="space-y-2">
              {COMMUNITY_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-silver/70 transition-colors hover:text-stardust-white"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-silver">
              Support
            </h4>
            <ul className="space-y-2">
              <li>
                {/* ContactDialog renders inline as a plain text link */}
                <ContactDialog
                  trigger={
                    <span className="text-sm text-muted-silver/70 transition-colors hover:text-stardust-white cursor-pointer">
                      Contact us
                    </span>
                  }
                />
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border-subtle pt-6 text-center text-xs text-muted-silver/50">
          &copy; {new Date().getFullYear()} Stellar Suite. Built for the Stellar
          ecosystem.
        </div>
      </div>
    </footer>
  );
}
