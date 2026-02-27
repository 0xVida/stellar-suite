"use client";

import { FEATURE_COMPARISON_DATA } from "@/lib/data/features";
import { Section } from "@/components/ui/Section";
import { EXTENSION_ITEM_URL } from "@/lib/constants";
import { Terminal, Code2, CheckCircle2, XCircle } from "lucide-react";

export function FeaturesComparison() {
  return (
    <Section id="features-comparison" dark className="min-h-screen pt-32 pb-20">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-electric-cyan/10 text-electric-cyan text-sm font-medium mb-4">
            <Code2 className="w-4 h-4" />
            <span>VS Code Extension vs CLI</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-stardust-white md:text-5xl lg:text-6xl">
            Why Upgrade to Stellar Kit?
          </h1>
          <p className="text-lg text-muted-silver max-w-2xl mx-auto leading-relaxed">
            Discover how the Stellar Kit VS Code Extension transforms your development workflow, eliminating context switching and simplifying complex tasks compared to the standard CLI.
          </p>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-hidden rounded-2xl border border-border-subtle bg-slate-gray/20 shadow-2xl backdrop-blur-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-gray/50 border-b border-border-subtle">
                <th className="p-6 text-sm font-semibold text-muted-silver uppercase tracking-wider w-[30%]">Feature</th>
                <th className="p-6 text-sm font-semibold text-muted-silver uppercase tracking-wider w-[35%]">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4" />
                    Stellar CLI
                  </div>
                </th>
                <th className="p-6 text-sm font-semibold text-electric-cyan uppercase tracking-wider w-[35%] bg-electric-cyan/5 border-l border-border-subtle/50">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4" />
                    Stellar Kit Extension
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {FEATURE_COMPARISON_DATA.map((row, index) => (
                <tr 
                  key={index} 
                  className="hover:bg-slate-gray/30 transition-colors group"
                >
                  <td className="p-6 text-stardust-white font-medium">
                    {row.feature}
                  </td>
                  <td className="p-6 text-muted-silver">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-muted-silver/40 flex-shrink-0" />
                      {row.cli}
                    </div>
                  </td>
                  <td className="p-6 text-stardust-white bg-electric-cyan/5 group-hover:bg-electric-cyan/10 transition-colors border-l border-border-subtle/50">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-electric-cyan flex-shrink-0" />
                      {row.extension}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View (Cards) */}
        <div className="md:hidden space-y-6">
          {FEATURE_COMPARISON_DATA.map((row, index) => (
            <div 
              key={index}
              className="rounded-xl border border-border-subtle bg-slate-gray/20 p-6 space-y-4 shadow-lg"
            >
              <h3 className="text-lg font-semibold text-stardust-white border-b border-border-subtle pb-3 flex items-center gap-2">
                {row.feature}
              </h3>
              
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-silver uppercase tracking-wider mb-2">
                    <Terminal className="w-3 h-3" />
                    Stellar CLI
                  </div>
                  <div className="flex items-start gap-2 pl-2">
                    <XCircle className="w-4 h-4 text-muted-silver/50 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-muted-silver">
                      {row.cli}
                    </p>
                  </div>
                </div>
                
                <div className="bg-electric-cyan/5 -mx-2 p-3 rounded-lg border border-electric-cyan/10">
                  <div className="flex items-center gap-2 text-xs font-semibold text-electric-cyan uppercase tracking-wider mb-2">
                    <Code2 className="w-3 h-3" />
                    Stellar Kit
                  </div>
                  <div className="flex items-start gap-2 pl-2">
                    <CheckCircle2 className="w-4 h-4 text-electric-cyan mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-stardust-white font-medium">
                      {row.extension}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-16 text-center">
          <p className="text-muted-silver mb-6">Ready to improve your developer experience?</p>
          <a 
            href={EXTENSION_ITEM_URL} 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md bg-electric-cyan px-8 py-3 text-sm font-semibold text-cosmic-navy shadow-lg shadow-electric-cyan/20 transition-all hover:bg-electric-cyan/90 hover:shadow-electric-cyan/40 hover:-translate-y-0.5"
          >
            Install Extension
          </a>
        </div>
      </div>
    </Section>
  );
}
