import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  Rocket,
  Code2,
  Wrench,
  FileText,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Documentation — Stellar Suite",
  description:
    "The unified documentation portal for all Stellar developer tools in the Stellar Suite workspace.",
};

const QUICKLINKS = [
  {
    icon: <Rocket className="h-5 w-5" />,
    title: "Quick Start",
    description: "Deploy your first Soroban contract in minutes.",
    href: "/docs/quick-start",
  },
  {
    icon: <Code2 className="h-5 w-5" />,
    title: "Contract Editor",
    description: "Write and test Soroban contracts in the browser.",
    href: "/docs/ide/contract-editor",
  },
  {
    icon: <Wrench className="h-5 w-5" />,
    title: "Stellar Tools",
    description: "SDK, CLI, and tooling for Stellar development.",
    href: "/docs/tools/soroban-sdk",
  },
  {
    icon: <FileText className="h-5 w-5" />,
    title: "Guides",
    description: "Step-by-step tutorials for common use cases.",
    href: "/docs/guides/first-contract",
  },
];

export default function DocsPage() {
  return (
    <div>
      {/* Hero */}
      <div className="mb-10">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 mb-4">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-foreground mb-3">
          Stellar Suite Docs
        </h1>
        <p className="text-base font-body text-muted-foreground max-w-prose leading-relaxed">
          Everything you need to build, deploy, and manage Soroban smart
          contracts on the Stellar network. Use the sidebar to navigate by topic
          or start with one of the guides below.
        </p>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
        {QUICKLINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all duration-200"
          >
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
              {item.icon}
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-foreground text-sm mb-1 group-hover:text-primary transition-colors">
                {item.title}
              </h2>
              <p className="text-xs font-body text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-1 ml-auto" />
          </Link>
        ))}
      </div>

      {/* Overview */}
      <div className="prose-like space-y-6">
        <h2 className="text-xl font-display font-bold text-foreground">
          What is Stellar Suite?
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed text-sm">
          Stellar Suite is a unified developer workspace for building on the
          Stellar network. It includes an in-browser Soroban contract IDE,
          deployment pipelines, simulation tools, and a growing library of
          reusable contract templates.
        </p>

        <h2 className="text-xl font-display font-bold text-foreground">
          Core concepts
        </h2>
        <ul className="space-y-2 font-body text-sm text-muted-foreground list-disc list-inside">
          <li>
            <strong className="text-foreground">Soroban</strong> — the smart
            contract platform built on Stellar, written in Rust and compiled to
            WebAssembly.
          </li>
          <li>
            <strong className="text-foreground">Testnet</strong> — a sandbox
            environment where you can deploy and test contracts without spending
            real XLM.
          </li>
          <li>
            <strong className="text-foreground">Mainnet</strong> — the live
            Stellar network. Deployments here are permanent and require real XLM
            for fees.
          </li>
          <li>
            <strong className="text-foreground">SEP standards</strong> — Stellar
            Ecosystem Proposals define interoperability standards for tokens,
            wallets, and more.
          </li>
        </ul>

        <h2 className="text-xl font-display font-bold text-foreground">
          Prerequisites
        </h2>
        <p className="font-body text-muted-foreground leading-relaxed text-sm">
          You will need a basic understanding of Rust to write Soroban contracts.
          Familiarity with the Stellar network and blockchain fundamentals is
          helpful but not required to get started.
        </p>
      </div>
    </div>
  );
}
