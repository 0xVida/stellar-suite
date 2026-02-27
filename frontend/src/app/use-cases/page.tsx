"use client";

import Link from "next/link";
import {
  Sparkles,
  CreditCard,
  Shield,
  Users,
  Layers,
  TerminalSquare,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const USE_CASES = [
  {
    title: "DeFi primitives",
    description:
      "Launch pools, staking, and liquidity tooling without leaving VS Code.",
    icon: Layers,
  },
  {
    title: "NFT collections",
    description:
      "Mint, transfer, and manage metadata with battle-tested templates.",
    icon: Sparkles,
  },
  {
    title: "Payments & escrow",
    description:
      "Create milestone-based payouts and conditional releases for teams.",
    icon: CreditCard,
  },
  {
    title: "Governance",
    description:
      "Ship proposal and voting contracts with clear simulation previews.",
    icon: Users,
  },
  {
    title: "Security & multisig",
    description:
      "Deploy multisig wallets and enforce thresholds with confidence.",
    icon: Shield,
  },
  {
    title: "Developer tooling",
    description:
      "Build internal admin panels or dev utilities that talk to Soroban.",
    icon: TerminalSquare,
  },
];

const EXAMPLES = [
  {
    title: "NFT drop in one afternoon",
    steps: [
      "Generate a template from Stellar Kit",
      "Simulate mint + transfer flows",
      "Deploy to testnet and share the contract ID",
    ],
  },
  {
    title: "Escrow for creator payments",
    steps: [
      "Start from the escrow template",
      "Configure milestone release conditions",
      "Invite a third-party arbiter",
    ],
  },
  {
    title: "DAO governance rollout",
    steps: [
      "Deploy the voting contract",
      "Run live simulations of proposals",
      "Track deployments inside the sidebar",
    ],
  },
];

export default function UseCasesPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="pt-20 pb-12 px-4 sm:pt-24 sm:pb-14 sm:px-6 md:pt-32 md:pb-16 border-b border-border">
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-extrabold tracking-tight text-foreground leading-tight">
            Use cases &amp; examples
          </h1>
          <p className="mt-4 sm:mt-5 text-base sm:text-lg font-body text-muted-foreground max-w-2xl mx-auto">
            Stellar Kit powers teams shipping everything from DeFi primitives
            to community governance. These examples show how builders put the
            workflow to work.
          </p>
          <div className="mt-6 sm:mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/#use-cases" className="btn-outline text-sm sm:text-base touch-manipulation">
              Explore the live demo
            </Link>
            <Link href="/community" className="btn-primary text-sm sm:text-base touch-manipulation">
              Meet the community
            </Link>
          </div>
        </div>
      </section>

      <main id="main-content" className="py-12 px-4 sm:py-14 sm:px-6 md:py-16">
        <div className="mx-auto max-w-6xl space-y-16 sm:space-y-20">
          <section>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground mb-4 sm:mb-6">
              Common use cases
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {USE_CASES.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-border bg-card p-4 sm:p-6"
                >
                  <div className="inline-flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-primary/10 mb-3 sm:mb-4">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-base sm:text-lg font-display font-bold text-foreground mb-2">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground font-body leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 sm:gap-6">
              <div>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">
                  Project examples
                </h2>
                <p className="mt-2 sm:mt-3 text-xs sm:text-sm text-muted-foreground font-body">
                  A few real-world paths teams take from idea to deployment.
                </p>
              </div>
              <a
                href="https://github.com/0xVida/stellar-suite/tree/main/templates"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline text-sm sm:text-base touch-manipulation"
              >
                Browse templates
              </a>
            </div>
            <div className="mt-6 sm:mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {EXAMPLES.map((example) => (
                <div
                  key={example.title}
                  className="rounded-2xl border border-border/70 bg-background p-4 sm:p-6"
                >
                  <h3 className="text-sm sm:text-base font-display font-bold text-foreground mb-3 sm:mb-4">
                    {example.title}
                  </h3>
                  <ol className="space-y-2 sm:space-y-3 text-xs sm:text-sm text-muted-foreground font-body">
                    {example.steps.map((step) => (
                      <li key={step} className="flex gap-3">
                        <span className="mt-0.5 sm:mt-1 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-center">
            <div>
              <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                Ship faster with the sidebar
              </h2>
              <p className="mt-3 sm:mt-4 text-xs sm:text-sm text-muted-foreground font-body leading-relaxed">
                Build, deploy, and simulate contracts in minutes. Stellar Kit
                keeps the CLI, deployment history, and simulation results within
                reach.
              </p>
              <div className="mt-4 sm:mt-6 flex flex-wrap gap-3">
                <Link href="/#get-started" className="btn-primary text-sm sm:text-base touch-manipulation">
                  Get started
                </Link>
                <Link href="/blog" className="btn-outline text-sm sm:text-base touch-manipulation">
                  Read tutorials
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
              <div className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-muted-foreground font-display">
                What teams like
              </div>
              <ul className="mt-3 sm:mt-4 space-y-2 sm:space-y-3 text-xs sm:text-sm text-muted-foreground font-body">
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                  <span>One-click deployment without terminal context switching.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                  <span>Simulation previews that catch errors before chain submit.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                  <span>Template-driven scaffolding for common contract patterns.</span>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
