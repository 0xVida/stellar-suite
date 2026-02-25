"use client";

import { useState, useMemo } from "react";
import { Section, SectionHeader } from "@/components/ui/Section";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";

const OPERATIONS = [
  { id: "build", label: "Build", timeSavedPerOp: 25 },
  { id: "deploy", label: "Deploy", timeSavedPerOp: 105 },
  { id: "simulate", label: "Simulate", timeSavedPerOp: 50 },
  { id: "inspect", label: "Inspect ABI", timeSavedPerOp: 18 },
  { id: "signing", label: "Switch Identity", timeSavedPerOp: 27 },
];

export function CapabilityCalculator() {
  const [contracts, setContracts] = useState(3);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(["build", "deploy", "simulate"]),
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { secondsSaved, minutesSaved } = useMemo(() => {
    const perDay = OPERATIONS.filter((op) => selected.has(op.id)).reduce(
      (sum, op) => sum + op.timeSavedPerOp,
      0,
    );
    const total = perDay * contracts * 5; // 5 days/week
    return { secondsSaved: total, minutesSaved: Math.round(total / 60) };
  }, [contracts, selected]);

  return (
    <Section dark>
      <SectionHeader
        title="Calculate your time savings"
        subtitle="Estimate how much time Stellar Suite saves you each week."
      />

      <div className="grid gap-8 md:grid-cols-2">
        {/* Controls */}
        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm text-muted-silver">
              Contracts you work with:{" "}
              <span className="font-semibold text-stardust-white">
                {contracts}
              </span>
            </label>
            <input
              type="range"
              min={1}
              max={20}
              value={contracts}
              onChange={(e) => setContracts(Number(e.target.value))}
              className="w-full accent-electric-cyan"
            />
            <div className="mt-1 flex justify-between text-xs text-muted-silver/40">
              <span>1</span>
              <span>20</span>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm text-muted-silver">
              Operations you perform daily:
            </div>
            <div className="flex flex-wrap gap-2">
              {OPERATIONS.map((op) => (
                <button
                  key={op.id}
                  onClick={() => toggle(op.id)}
                  className={`rounded-[var(--radius)] border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selected.has(op.id)
                      ? "border-electric-cyan/30 bg-electric-cyan/10 text-electric-cyan"
                      : "border-border-subtle text-muted-silver hover:text-stardust-white"
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Result */}
        <div className="flex flex-col items-center justify-center rounded-[var(--radius)] border border-border-subtle bg-slate-gray/20 p-8 text-center">
          <div className="text-xs uppercase tracking-wider text-muted-silver/50">
            Estimated time saved per week
          </div>
          <div className="mt-3 text-4xl font-semibold text-electric-cyan">
            <AnimatedCounter target={minutesSaved} suffix=" min" />
          </div>
          <div className="mt-1 text-sm text-muted-silver">
            <AnimatedCounter target={secondsSaved} suffix="s" /> of CLI context
            switching eliminated
          </div>
          {minutesSaved > 60 && (
            <div className="mt-3 text-xs text-success/70">
              That&apos;s over {Math.floor(minutesSaved / 60)} hour
              {Math.floor(minutesSaved / 60) > 1 ? "s" : ""} per week
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
