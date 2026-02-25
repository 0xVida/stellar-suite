"use client";

import { useState } from "react";
import { Rocket, Play, FileCode, Terminal, Shield } from "lucide-react";

const tabs = [
  {
    label: "Deploy",
    icon: Rocket,
    description: "One-click deployment lets you push Soroban smart contracts to testnet or mainnet without leaving VS Code.",
    bullets: [
      { title: "One-click deploy:", text: "Select your target network and deploy instantly — no terminal commands needed." },
      { title: "Environment management:", text: "Switch between testnet, futurenet, and mainnet environments effortlessly." },
      { title: "Deploy history:", text: "Track every deployment with built-in logs and contract addresses." },
      { title: "Error handling:", text: "Get clear, actionable error messages right in your editor when deployments fail." },
    ],
  },
  {
    label: "Simulate",
    icon: Play,
    description: "Test transactions before committing them to the blockchain — simulate any contract invocation with real-time feedback.",
    bullets: [
      { title: "Transaction preview:", text: "See exactly what a transaction will do before you send it." },
      { title: "Gas estimation:", text: "Get accurate resource and fee estimates for every transaction." },
      { title: "Debug outputs:", text: "View detailed logs and return values from simulated contract calls." },
      { title: "Iterate faster:", text: "Catch bugs in seconds instead of waiting for on-chain failures." },
    ],
  },
  {
    label: "Build",
    icon: FileCode,
    description: "Scaffold, compile, and manage Soroban projects with built-in tooling that understands your contract structure.",
    bullets: [
      { title: "Project scaffolding:", text: "Create new Soroban projects from templates with a single command." },
      { title: "Auto-compile:", text: "Contracts are built automatically on save with real-time error reporting." },
      { title: "WASM management:", text: "Compiled WASM files are organized and ready for deployment." },
      { title: "Multi-contract support:", text: "Manage multiple contracts in a single workspace seamlessly." },
    ],
  },
  {
    label: "Test",
    icon: Shield,
    description: "Run your contract tests with integrated test runners and get results right in the editor.",
    bullets: [
      { title: "Inline test results:", text: "See pass/fail status next to each test function." },
      { title: "Coverage reports:", text: "Understand which parts of your contract are tested." },
      { title: "Watch mode:", text: "Tests re-run automatically as you edit your contracts." },
      { title: "Snapshot testing:", text: "Compare contract state before and after transactions." },
    ],
  },
  {
    label: "Manage",
    icon: Terminal,
    description: "Manage accounts, keys, identities, and network configurations — all from a visual interface.",
    bullets: [
      { title: "Account management:", text: "Create, fund, and manage Stellar accounts without the CLI." },
      { title: "Key management:", text: "Securely store and use signing keys within VS Code." },
      { title: "Network config:", text: "Configure custom RPC endpoints and network settings visually." },
      { title: "Contract interactions:", text: "Invoke deployed contracts with a graphical form interface." },
    ],
  },
];

const UseCasesSection = () => {
  const [active, setActive] = useState(0);
  const current = tabs[active];

  return (
    <section id="use-cases" className="section-padding">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-display font-extrabold tracking-tight text-foreground leading-tight">
            Endless ways to build on Stellar.
          </h2>
          <p className="mt-4 text-lg font-body text-muted-foreground max-w-2xl mx-auto">
            From deploying contracts to simulating transactions, Stellar Suite delivers the tools you need.
            Every workflow is faster, easier, and more intuitive.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-14">
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActive(i)}
              className={`rounded-full px-6 py-2.5 text-sm font-semibold font-display transition-all duration-200 border ${
                active === i
                  ? "border-foreground bg-background text-foreground shadow-sm"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div>
            <p className="font-body text-muted-foreground text-base leading-relaxed mb-8">
              {current.description}
            </p>
            <ul className="space-y-5">
              {current.bullets.map((b) => (
                <li key={b.title} className="flex items-start gap-3">
                  <span className="mt-2 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                  <span className="font-body text-muted-foreground leading-relaxed">
                    <strong className="text-foreground font-semibold">{b.title}</strong> {b.text}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-10">
              <a href="#get-started" className="btn-primary">
                Get started
              </a>
            </div>
          </div>

          {/* Visual card */}
          <div className="rounded-2xl bg-card-blue-light p-10 flex flex-col items-center justify-center min-h-[400px] border border-border">
            <div className="icon-box-lg rounded-2xl mb-5">
              <current.icon className="h-8 w-8" strokeWidth={1.8} />
            </div>
            <p className="text-xl font-display font-bold text-foreground">{current.label}</p>
            <p className="text-sm font-body text-muted-foreground mt-1.5">Visual workflow in VS Code</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default UseCasesSection;
