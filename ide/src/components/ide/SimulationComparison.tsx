"use client";

import { AlertTriangle, ArrowRightLeft, Coins, Cpu, Database, ShieldAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SimulationComparisonData, SimulationStateChange } from "@/lib/simulationDiff";

interface SimulationComparisonProps {
  comparison: SimulationComparisonData;
}

const CHANGE_STYLES: Record<
  SimulationStateChange["changeType"],
  { label: string; badgeClassName: string; cardClassName: string }
> = {
  added: {
    label: "Addition",
    badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
    cardClassName: "border-emerald-500/20",
  },
  removed: {
    label: "Deletion",
    badgeClassName: "border-rose-500/30 bg-rose-500/10 text-rose-600",
    cardClassName: "border-rose-500/20",
  },
  modified: {
    label: "Modified",
    badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-600",
    cardClassName: "border-amber-500/20",
  },
  unchanged: {
    label: "Unchanged",
    badgeClassName: "border-slate-500/30 bg-slate-500/10 text-slate-600",
    cardClassName: "border-border",
  },
  unavailable: {
    label: "Key Only",
    badgeClassName: "border-border bg-muted text-muted-foreground",
    cardClassName: "border-border",
  },
};

const formatNumber = (value: string | number | undefined) => {
  if (value === undefined) return "N/A";
  if (typeof value === "number") return value.toLocaleString();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : value;
};

const renderXdrBlock = (title: string, value: string | null, tone: "default" | "current" | "expected") => {
  const toneClassName =
    tone === "current"
      ? "border-slate-500/20"
      : tone === "expected"
        ? "border-primary/20"
        : "border-border";

  return (
    <div className={`rounded-md border ${toneClassName} bg-background/70 p-2`}>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-foreground">
        {value ?? "No XDR returned"}
      </pre>
    </div>
  );
};

export function SimulationComparison({ comparison }: SimulationComparisonProps) {
  const hasWarning = comparison.warningLevel !== "none" && comparison.warningText;

  return (
    <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Simulation Pre-flight Comparison
          </div>
          <p className="text-[11px] text-muted-foreground">
            Review simulated ledger changes against live state before signing.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {comparison.summary.total} keys
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {comparison.summary.drifted} drifted
          </Badge>
          {comparison.latestLedger !== undefined && (
            <Badge variant="outline" className="text-[10px]">
              ledger #{comparison.latestLedger.toLocaleString()}
            </Badge>
          )}
        </div>
      </div>

      {hasWarning && (
        <Alert className={comparison.warningLevel === "high" ? "border-destructive/40" : "border-amber-500/30"}>
          {comparison.warningLevel === "high" ? (
            <ShieldAlert className="h-4 w-4 text-destructive" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          )}
          <AlertTitle className="text-sm">
            {comparison.warningLevel === "high" ? "High Drift Warning" : "Pre-flight Warning"}
          </AlertTitle>
          <AlertDescription className="text-xs">{comparison.warningText}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Coins className="h-4 w-4" />
              Fee Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-md border border-border bg-background/70 p-2">
              <p className="text-muted-foreground">Min resource fee</p>
              <p className="font-mono text-foreground">{formatNumber(comparison.feeBreakdown.minResourceFee)}</p>
            </div>
            <div className="rounded-md border border-border bg-background/70 p-2">
              <p className="text-muted-foreground">Estimated total</p>
              <p className="font-mono text-foreground">{formatNumber(comparison.feeBreakdown.estimatedTotalFee)}</p>
            </div>
            <div className="rounded-md border border-border bg-background/70 p-2">
              <p className="text-muted-foreground">Base fee</p>
              <p className="font-mono text-foreground">{formatNumber(comparison.feeBreakdown.baseFee)}</p>
            </div>
            <div className="rounded-md border border-border bg-background/70 p-2">
              <p className="text-muted-foreground">Refundable</p>
              <p className="font-mono text-foreground">{formatNumber(comparison.feeBreakdown.refundableFee)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Cpu className="h-4 w-4" />
              Resource Limits
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-md border border-border bg-background/70 p-2">
              <p className="text-muted-foreground">CPU instructions</p>
              <p className="font-mono text-foreground">{formatNumber(comparison.resourceBreakdown.cpuInstructions)}</p>
            </div>
            <div className="rounded-md border border-border bg-background/70 p-2">
              <p className="text-muted-foreground">Memory bytes</p>
              <p className="font-mono text-foreground">{formatNumber(comparison.resourceBreakdown.memoryBytes)}</p>
            </div>
            <div className="rounded-md border border-border bg-background/70 p-2">
              <p className="text-muted-foreground">Read entries</p>
              <p className="font-mono text-foreground">{formatNumber(comparison.resourceBreakdown.readEntries)}</p>
            </div>
            <div className="rounded-md border border-border bg-background/70 p-2">
              <p className="text-muted-foreground">Write entries</p>
              <p className="font-mono text-foreground">{formatNumber(comparison.resourceBreakdown.writeEntries)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Database className="h-3.5 w-3.5" />
          Ledger Entry Changes
        </div>

        {comparison.stateChanges.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background/60 px-3 py-4 text-center text-[11px] text-muted-foreground">
            No affected ledger entries were returned by the simulation response.
          </div>
        ) : (
          comparison.stateChanges.map((change) => {
            const styles = CHANGE_STYLES[change.changeType];

            return (
              <div key={change.key} className={`rounded-md border bg-card/60 p-3 ${styles.cardClassName}`}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={`text-[10px] ${styles.badgeClassName}`}>
                        {styles.label}
                      </Badge>
                      {change.driftDetected && (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-600">
                          Live State Drift
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold text-foreground">{change.keyLabel}</p>
                    <p className="break-all font-mono text-[10px] text-muted-foreground">{change.key}</p>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  {renderXdrBlock("Current On-chain", change.currentLedgerEntryXdr, "current")}
                  {renderXdrBlock("Expected After Simulation", change.expectedLedgerEntryXdr, "expected")}
                </div>

                {change.baselineLedgerEntryXdr && (
                  <div className="mt-2">
                    {renderXdrBlock("Baseline At Simulation Time", change.baselineLedgerEntryXdr, "default")}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
