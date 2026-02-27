"use client";

import { useState } from "react";
import { Section, SectionHeader } from "@/components/ui/Section";

type DemoStep = "idle" | "building" | "built" | "deploying" | "deployed";

const CONTRACTS = [
  { name: "token_contract", path: "contracts/token" },
  { name: "nft_contract", path: "contracts/nft" },
  { name: "escrow_contract", path: "contracts/escrow" },
];

export function DemoSection() {
  const [step, setStep] = useState<DemoStep>("idle");
  const [activeContract, setActiveContract] = useState(0);

  function runDemo() {
    setStep("building");
    setTimeout(() => setStep("built"), 1200);
    setTimeout(() => setStep("deploying"), 2200);
    setTimeout(() => setStep("deployed"), 3400);
    setTimeout(() => setStep("idle"), 5400);
  }

  return (
    <Section dark>
      <SectionHeader
        title="See it in action"
        subtitle="A dedicated sidebar right inside VS Code — discover contracts, build, deploy, and simulate without switching context."
      />

      {/* VS Code mockup */}
      <div className="overflow-hidden rounded-[var(--radius)] border border-border-subtle bg-cosmic-navy">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-border-subtle bg-slate-gray/50 px-4 py-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-error/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
          </div>
          <span className="text-xs text-muted-silver/60 font-mono">
            Stellar Kit — VS Code
          </span>
          <div className="w-12" />
        </div>

        <div className="flex min-h-[340px]">
          {/* Sidebar */}
          <div className="w-64 shrink-0 border-r border-border-subtle bg-slate-gray/20 p-4">
            <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-silver">
              Contracts
            </div>
            <div className="space-y-1">
              {CONTRACTS.map((c, i) => (
                <button
                  key={c.name}
                  onClick={() => setActiveContract(i)}
                  className={`flex w-full items-center gap-2 rounded-[var(--radius)] px-3 py-1.5 text-left text-xs transition-colors ${
                    i === activeContract
                      ? "bg-electric-cyan/10 text-electric-cyan"
                      : "text-muted-silver hover:text-stardust-white"
                  }`}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  {c.name}
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-2">
              <button
                onClick={runDemo}
                disabled={step !== "idle"}
                className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius)] bg-electric-cyan px-3 py-1.5 text-xs font-medium text-cosmic-navy transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {step === "building" ? "Building..." : step === "deploying" ? "Deploying..." : "Build & Deploy"}
              </button>
              <button className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius)] border border-border-subtle px-3 py-1.5 text-xs text-muted-silver transition-colors hover:text-stardust-white">
                Simulate
              </button>
            </div>
          </div>

          {/* Editor area */}
          <div className="flex-1 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-mono text-muted-silver/60">
                {CONTRACTS[activeContract].path}/src/lib.rs
              </span>
              {step !== "idle" && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    step === "deployed"
                      ? "bg-success/10 text-success"
                      : step === "built"
                        ? "bg-stellar-blue/10 text-stellar-blue"
                        : "bg-electric-cyan/10 text-electric-cyan"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      step === "deployed"
                        ? "bg-success"
                        : step === "built"
                          ? "bg-stellar-blue"
                          : "bg-electric-cyan animate-pulse"
                    }`}
                  />
                  {step === "building" && "Compiling to WASM..."}
                  {step === "built" && "Build complete"}
                  {step === "deploying" && "Deploying to testnet..."}
                  {step === "deployed" && "Deployed successfully"}
                </span>
              )}
            </div>

            {/* Simulated code lines */}
            <div className="space-y-1 font-mono text-xs">
              <div className="text-muted-silver/30">
                <span className="mr-3 inline-block w-4 text-right">1</span>
                <span className="text-stellar-blue">use</span>{" "}
                <span className="text-stardust-white">soroban_sdk</span>
                <span className="text-muted-silver">::</span>
                <span className="text-stardust-white">&#123;contract, contractimpl, Env, Address&#125;</span>;
              </div>
              <div className="text-muted-silver/30">
                <span className="mr-3 inline-block w-4 text-right">2</span>
              </div>
              <div className="text-muted-silver/30">
                <span className="mr-3 inline-block w-4 text-right">3</span>
                <span className="text-muted-silver italic">{`// ${CONTRACTS[activeContract].name}`}</span>
              </div>
              <div className="text-muted-silver/30">
                <span className="mr-3 inline-block w-4 text-right">4</span>
                <span className="text-stellar-blue">pub struct</span>{" "}
                <span className="text-electric-cyan">Contract</span>;
              </div>
              <div className="text-muted-silver/30">
                <span className="mr-3 inline-block w-4 text-right">5</span>
              </div>
              <div className="text-muted-silver/30">
                <span className="mr-3 inline-block w-4 text-right">6</span>
                #[<span className="text-electric-cyan">contractimpl</span>]
              </div>
              <div className="text-muted-silver/30">
                <span className="mr-3 inline-block w-4 text-right">7</span>
                <span className="text-stellar-blue">impl</span>{" "}
                <span className="text-electric-cyan">Contract</span> &#123;
              </div>
              <div className="text-muted-silver/30">
                <span className="mr-3 inline-block w-4 text-right">8</span>
                {"    "}
                <span className="text-stellar-blue">pub fn</span>{" "}
                <span className="text-stardust-white">initialize</span>(
                <span className="text-electric-cyan">env</span>:{" "}
                <span className="text-electric-cyan">Env</span>) &#123; ... &#125;
              </div>
              <div className="text-muted-silver/30">
                <span className="mr-3 inline-block w-4 text-right">9</span>
                &#125;
              </div>
            </div>

            {/* Terminal output when running */}
            {step !== "idle" && (
              <div className="mt-4 rounded-[var(--radius)] border border-border-subtle bg-cosmic-navy p-3">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-silver/50">
                  Output
                </div>
                <div className="space-y-0.5 font-mono text-xs text-muted-silver">
                  {(step === "building" || step === "built" || step === "deploying" || step === "deployed") && (
                    <div>
                      <span className="text-electric-cyan">$</span> stellar contract build
                    </div>
                  )}
                  {(step === "built" || step === "deploying" || step === "deployed") && (
                    <div className="text-success">
                      ✓ Compiled to target/wasm32/release/{CONTRACTS[activeContract].name}.wasm
                    </div>
                  )}
                  {(step === "deploying" || step === "deployed") && (
                    <div>
                      <span className="text-electric-cyan">$</span> stellar contract deploy --network testnet
                    </div>
                  )}
                  {step === "deployed" && (
                    <div className="text-success">
                      ✓ Contract deployed: CDLZ...X4WR
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
