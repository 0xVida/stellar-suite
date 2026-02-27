"use client";

import Link from "next/link";
import { Users, HeartHandshake, GitPullRequest, Sparkles } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const COMMUNITY_STATS = [
  { label: "Open source contributors", value: "120+" },
  { label: "Templates in repo", value: "8" },
  { label: "Weekly installs", value: "1.2k" },
  { label: "Issues resolved", value: "300+" },
];

const CONTRIBUTION_PATHS = [
  {
    title: "Contribute code",
    description:
      "Pick an issue, open a PR, and ship improvements to the extension.",
    icon: GitPullRequest,
    href: "https://github.com/0xVida/stellar-suite/issues",
  },
  {
    title: "Share templates",
    description:
      "Submit contract templates to help new teams launch faster.",
    icon: Sparkles,
    href: "https://github.com/0xVida/stellar-suite#contributing",
  },
  {
    title: "Support developers",
    description:
      "Answer questions, write guides, and share workflows with the community.",
    icon: HeartHandshake,
    href: "https://github.com/0xVida/stellar-suite/discussions",
  },
];

const COMMUNITY_VALUES = [
  "Keep workflows simple and fast.",
  "Favor clarity over cleverness.",
  "Ship small improvements often.",
  "Document what we build.",
];

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="pt-32 pb-16 px-6 border-b border-border">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 mb-5">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-extrabold tracking-tight text-foreground leading-tight">
            Community &amp; Contributors
          </h1>
          <p className="mt-5 text-lg font-body text-muted-foreground max-w-2xl mx-auto">
            Stellar Kit is built in the open (repo: stellar-suite). Every release is shaped by
            builders who care about better Soroban workflows.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="https://github.com/0xVida/stellar-suite"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              Visit GitHub
            </a>
            <Link href="/use-cases" className="btn-outline">
              See use cases
            </Link>
          </div>
        </div>
      </section>

      <main id="main-content" className="py-16 px-6">
        <div className="mx-auto max-w-6xl space-y-20">
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {COMMUNITY_STATS.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-border bg-card p-6 text-center"
              >
                <p className="text-2xl font-display font-extrabold text-foreground">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-muted-foreground font-body">
                  {stat.label}
                </p>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                How we work together
              </h2>
              <p className="mt-4 text-base text-muted-foreground font-body leading-relaxed">
                We keep the bar high and the process lightweight. If a change
                improves developer flow, it is worth shipping.
              </p>
              <ul className="mt-6 space-y-3">
                {COMMUNITY_VALUES.map((value) => (
                  <li key={value} className="flex items-start gap-3">
                    <span className="mt-2 h-2 w-2 rounded-full bg-primary" />
                    <span className="text-sm text-muted-foreground font-body">
                      {value}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground font-display">
                Contributor snapshot
              </h3>
              <div className="mt-6 space-y-4">
                {[
                  {
                    title: "Core maintainers",
                    detail: "Own the roadmap, review PRs, and ship releases.",
                  },
                  {
                    title: "Template authors",
                    detail: "Provide reusable Soroban contract scaffolds.",
                  },
                  {
                    title: "QA & feedback",
                    detail: "Test builds, file bugs, and validate fixes.",
                  },
                ].map((item) => (
                  <div key={item.title}>
                    <p className="text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
                    <p className="text-sm text-muted-foreground font-body">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-6">
              Ways to contribute
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {CONTRIBUTION_PATHS.map((path) => (
                <a
                  key={path.title}
                  href={path.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-border bg-card p-6 hover:border-primary/50 transition-colors"
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 mb-4">
                    <path.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-display font-bold text-foreground mb-2">
                    {path.title}
                  </h3>
                  <p className="text-sm text-muted-foreground font-body leading-relaxed">
                    {path.description}
                  </p>
                </a>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-8 text-center">
            <h2 className="text-xl font-display font-bold text-foreground">
              Ready to build with us?
            </h2>
            <p className="mt-3 text-sm text-muted-foreground font-body">
              Browse issues, share feedback, or open a PR. Every contribution
              moves the ecosystem forward.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a
                href="https://github.com/0xVida/stellar-suite/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                Explore issues
              </a>
              <a
                href="https://github.com/0xVida/stellar-suite#contributing"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline"
              >
                Contributing guide
              </a>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
