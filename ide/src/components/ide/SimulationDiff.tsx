"use client";

import {
  AlertTriangle,
  ArrowRightLeft,
  Coins,
  Edit3,
  Equal,
  HelpCircle,
  Loader2,
  Minus,
  Plus,
  ShieldAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  LedgerChangeType,
  SimulationComparisonData,
  SimulationStateChange,
} from "@/lib/simulationDiff";

// ---------------------------------------------------------------------------
// Change-type styling config
// ---------------------------------------------------------------------------

const CHANGE_CONFIG: Record<
  LedgerChangeType,
  {
    icon: React.ReactNode;
    label: string;
    lineClass: string;
    markerClass: string;
    marker: string;
  }
> = {
  added: {
    icon: <Plus className="h-3 w-3" />,
    label: "Added",
    lineClass: "bg-emerald-500/10 border-l-2 border-emerald-500/50",
    markerClass: "text-emerald-500 font-bold",
    marker: "+",
  },
  removed: {
    icon: <Minus className="h-3 w-3" />,
    label: "Removed",
    lineClass: "bg-rose-500/10 border-l-2 border-rose-500/50",
    markerClass: "text-rose-500 font-bold",
    marker: "−",
  },
  modified: {
    icon: <Edit3 className="h-3 w-3" />,
    label: "Modified",
    lineClass: "bg-amber-500/10 border-l-2 border-amber-500/50",
    markerClass: "text-amber-500 font-bold",
    marker: "~",
  },
  unchanged: {
    icon: <Equal className="h-3 w-3" />,
    label: "Unchanged",
    lineClass: "bg-transparent border-l-2 border-transparent",
    markerClass: "text-muted-foreground/40",
    marker: " ",
  },
  unavailable: {
    icon: <HelpCircle className="h-3 w-3" />,
    label: "Affected",
    lineClass: "bg-transparent border-l-2 border-dashed border-border",
    markerClass: "text-muted-foreground",
    marker: "?",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const truncateXdr = (value: string | null, max = 52): string => {
  if (!value) return "(none)";
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

// ---------------------------------------------------------------------------
// Single diff row
// ---------------------------------------------------------------------------

function DiffRow({ change }: { change: SimulationStateChange }) {
  const config = CHANGE_CONFIG[change.changeType];

  return (
    <div className={`px-3 py-2 rounded-sm mb-1 ${config.lineClass}`}>
      <div className="flex items-start gap-2">
        <span
          className={`font-mono text-xs mt-0.5 w-3 shrink-0 select-none ${config.markerClass}`}
        >
          {config.marker}
        </span>

        <div className="min-w-0 flex-1">
          {/* Key label + drift badge */}
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="text-xs font-medium text-foreground">
              {change.keyLabel}
            </span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1.5 py-0 ${
                change.changeType === "added"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                  : change.changeType === "removed"
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-600"
                    : change.changeType === "modified"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                      : "border-border text-muted-foreground"
              }`}
            >
              {config.label}
            </Badge>
            {change.driftDetected && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 border-amber-500/30 bg-amber-500/10 text-amber-500"
              >
                Live State Drift
              </Badge>
            )}
          </div>

          {/* XDR diff lines */}
          {change.changeType === "modified" && (
            <div className="space-y-0.5 mt-0.5">
              <p className="text-[10px] font-mono text-rose-400 truncate leading-relaxed">
                − {truncateXdr(change.baselineLedgerEntryXdr)}
              </p>
              <p className="text-[10px] font-mono text-emerald-400 truncate leading-relaxed">
                + {truncateXdr(change.expectedLedgerEntryXdr)}
              </p>
            </div>
          )}

          {change.changeType === "added" && change.expectedLedgerEntryXdr && (
            <p className="text-[10px] font-mono text-emerald-400 truncate mt-0.5 leading-relaxed">
              + {truncateXdr(change.expectedLedgerEntryXdr)}
            </p>
          )}

          {change.changeType === "removed" && change.baselineLedgerEntryXdr && (
            <p className="text-[10px] font-mono text-rose-400 truncate mt-0.5 leading-relaxed">
              − {truncateXdr(change.baselineLedgerEntryXdr)}
            </p>
          )}

          {(change.changeType === "unavailable" ||
            change.changeType === "unchanged") &&
            change.currentLedgerEntryXdr && (
              <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5 leading-relaxed">
                {truncateXdr(change.currentLedgerEntryXdr)}
              </p>
            )}

          {/* Ledger key (abbreviated) */}
          <p className="text-[9px] font-mono text-muted-foreground/50 truncate mt-0.5">
            {truncateXdr(change.key, 40)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export interface SimulationDiffProps {
  open: boolean;
  comparison: SimulationComparisonData;
  fnName: string;
  contractId: string;
  isSubmitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SimulationDiff({
  open,
  comparison,
  fnName,
  contractId,
  isSubmitting = false,
  onConfirm,
  onCancel,
}: SimulationDiffProps) {
  const { summary, warningLevel, warningText, feeBreakdown, stateChanges } =
    comparison;

  const hasHighRisk = warningLevel === "high";
  const hasWarning = warningLevel !== "none" && Boolean(warningText);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !isSubmitting) onCancel();
      }}
    >
      <DialogContent className="max-w-lg flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ArrowRightLeft className="h-4 w-4 text-primary shrink-0" />
            Pre-flight Simulation Review
          </DialogTitle>
          <DialogDescription className="text-xs">
            Simulated ledger changes for{" "}
            <code className="font-mono bg-muted px-1 rounded">{fnName}</code>{" "}
            on{" "}
            <code className="font-mono text-[10px]">
              {contractId.slice(0, 8)}…
            </code>
            . Review before signing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3 min-h-0">
          {/* Warning banner */}
          {hasWarning && (
            <Alert
              className={`py-2 ${hasHighRisk ? "border-destructive/40" : "border-amber-500/30"}`}
            >
              {hasHighRisk ? (
                <ShieldAlert className="h-4 w-4 text-destructive" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
              <AlertTitle className="text-xs leading-none mb-1">
                {hasHighRisk ? "High Drift Warning" : "State Drift Detected"}
              </AlertTitle>
              <AlertDescription className="text-[11px]">
                {warningText}
              </AlertDescription>
            </Alert>
          )}

          {/* Summary row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-wrap gap-1">
              {summary.added > 0 && (
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                >
                  +{summary.added} added
                </Badge>
              )}
              {summary.removed > 0 && (
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 border-rose-500/30 bg-rose-500/10 text-rose-600"
                >
                  −{summary.removed} removed
                </Badge>
              )}
              {summary.modified > 0 && (
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 border-amber-500/30 bg-amber-500/10 text-amber-600"
                >
                  ~{summary.modified} modified
                </Badge>
              )}
              {summary.unchanged > 0 && (
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 text-muted-foreground"
                >
                  ={summary.unchanged} unchanged
                </Badge>
              )}
              {summary.drifted > 0 && (
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 border-amber-500/30 bg-amber-500/10 text-amber-500"
                >
                  {summary.drifted} drifted
                </Badge>
              )}
              {summary.total === 0 && (
                <span className="text-[10px] text-muted-foreground">
                  No ledger entries affected
                </span>
              )}
            </div>

            {feeBreakdown.estimatedTotalFee && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Coins className="h-3 w-3" />
                <span>~{feeBreakdown.estimatedTotalFee} stroops</span>
              </div>
            )}
          </div>

          {/* Diff list */}
          <ScrollArea className="flex-1 min-h-0 rounded-md border border-border bg-background/50 px-1 py-1">
            {stateChanges.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-[11px] text-muted-foreground">
                No ledger state changes returned by simulation.
              </div>
            ) : (
              stateChanges.map((change) => (
                <DiffRow key={change.key} change={change} />
              ))
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2 pt-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={isSubmitting}
            className={`text-xs ${hasHighRisk ? "bg-destructive/80 hover:bg-destructive" : ""}`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Signing…
              </>
            ) : hasHighRisk ? (
              "Sign & Submit Anyway"
            ) : (
              "Sign & Submit"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
