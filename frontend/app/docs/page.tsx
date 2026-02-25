import Link from "next/link";
import { Compass, BookOpen, Code2, Terminal } from "lucide-react";

const cards = [
  {
    title: "Getting Started",
    description: "Install Stellar Suite, configure your environment, and build your first smart contract.",
    href: "/docs/getting-started",
    icon: Compass,
  },
  {
    title: "Guides",
    description: "Step-by-step tutorials for building, deploying, simulating, and managing contracts.",
    href: "/docs/guides",
    icon: BookOpen,
  },
  {
    title: "API Reference",
    description: "Comprehensive reference for all commands, configuration options, and return types.",
    href: "/docs/api-reference",
    icon: Code2,
  },
  {
    title: "Playground",
    description: "Interactive code editor to experiment with Stellar Suite APIs in your browser.",
    href: "/docs/playground",
    icon: Terminal,
  },
];

export default function DocsHome() {
  return (
    <div className="animate-fade-in">
      <div className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Stellar Suite Documentation
        </h1>
        <p className="text-lg text-muted-fg max-w-2xl">
          Everything you need to build, deploy, and manage Soroban smart contracts on the
          Stellar network — directly from VS Code.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="group p-6 rounded-xl border border-border hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white transition-colors">
                  <Icon size={20} />
                </div>
                <h2 className="text-lg font-semibold">{card.title}</h2>
              </div>
              <p className="text-sm text-muted-fg leading-relaxed">{card.description}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-12 p-6 rounded-xl bg-muted border border-border">
        <h3 className="text-lg font-semibold mb-2">Quick Install</h3>
        <p className="text-sm text-muted-fg mb-4">
          Get started by installing the extension from the VS Code Marketplace:
        </p>
        <div className="rounded-lg bg-code-bg px-4 py-3 font-mono text-sm text-code-text">
          ext install stellar-suite.stellar-suite
        </div>
      </div>
    </div>
  );
}
