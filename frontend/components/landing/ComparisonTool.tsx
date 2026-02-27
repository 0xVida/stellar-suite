import Link from "next/link";
import { COMPARISON_DATA } from "@/lib/data/features";
import { Section, SectionHeader } from "@/components/ui/Section";

export function ComparisonTool() {
  return (
    <Section id="compare" dark>
      <SectionHeader
        title="CLI vs Extension"
        subtitle="See how Stellar Kit simplifies every step of the development workflow."
      />

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-[var(--radius)] border border-border-subtle md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-slate-gray/30">
              <th className="px-4 py-3 text-left font-medium text-muted-silver">
                Task
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-silver">
                Stellar CLI
              </th>
              <th className="px-4 py-3 text-left font-medium text-electric-cyan">
                Stellar Kit
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON_DATA.map((row, i) => (
              <tr
                key={row.task}
                className={
                  i < COMPARISON_DATA.length - 1
                    ? "border-b border-border-subtle"
                    : ""
                }
              >
                <td className="px-4 py-3 font-medium text-stardust-white">
                  {row.task}
                </td>
                <td className="px-4 py-3">
                  <div className="text-muted-silver">{row.cli.steps}</div>
                  <code className="mt-1 block text-xs font-mono text-muted-silver/60">
                    {row.cli.command}
                  </code>
                  <div className="mt-1 text-xs text-muted-silver/40">
                    {row.cli.time}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-electric-cyan">{row.extension.steps}</div>
                  <div className="mt-1 text-xs text-stardust-white/80">
                    {row.extension.action}
                  </div>
                  <div className="mt-1 text-xs text-success/70">
                    {row.extension.time}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {COMPARISON_DATA.map((row) => (
          <div
            key={row.task}
            className="rounded-[var(--radius)] border border-border-subtle bg-slate-gray/20 p-4"
          >
            <div className="mb-3 text-sm font-medium text-stardust-white">
              {row.task}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-silver/50">
                  CLI
                </div>
                <div className="text-xs text-muted-silver">{row.cli.steps}</div>
                <div className="text-xs text-muted-silver/40">
                  {row.cli.time}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wider text-electric-cyan/50">
                  Extension
                </div>
                <div className="text-xs text-electric-cyan">
                  {row.extension.steps}
                </div>
                <div className="text-xs text-success/70">
                  {row.extension.time}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 text-center">
        <Link
          href="/features-comparison"
          className="inline-flex items-center justify-center rounded-md border border-electric-cyan/20 bg-electric-cyan/10 px-6 py-2 text-sm font-medium text-electric-cyan transition-colors hover:bg-electric-cyan/20"
        >
          View Full Comparison
        </Link>
      </div>
    </Section>
  );
}
