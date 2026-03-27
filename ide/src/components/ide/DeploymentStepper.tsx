import { useEffect, useRef, useState } from "react";
import {
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
  Rocket,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DeploymentStep } from "@/store/useDeploymentStore";

// ─── Step definitions ────────────────────────────────────────────────────────

interface StepDef {
  key: DeploymentStep;
  label: string;
}

const DEPLOY_STEPS: StepDef[] = [
  { key: "simulating",    label: "Simulating transaction" },
  { key: "signing",       label: "Signing transaction"    },
  { key: "uploading",     label: "Uploading WASM"         },
  { key: "instantiating", label: "Instantiating contract" },
];

const ACTIVE_STEP_KEYS = DEPLOY_STEPS.map((s) => s.key);

/** Returns the 0-based index of the current step, or -1 if idle/success/error */
function stepIndex(step: DeploymentStep): number {
  return ACTIVE_STEP_KEYS.indexOf(step);
}

const RPC_TIMEOUT_MS = 20_000;

// ─── Icon helper ─────────────────────────────────────────────────────────────

function StepIcon({
  status,
}: {
  status: "done" | "active" | "pending" | "error";
}) {
  if (status === "done")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label="done" />;
  if (status === "active")
    return (
      <Loader2
        className="h-4 w-4 shrink-0 animate-spin text-primary"
        aria-label="in progress"
      />
    );
  if (status === "error")
    return <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-label="error" />;
  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-label="pending" />;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface DeploymentStepperProps {
  open: boolean;
  step: DeploymentStep;
  error: string | null;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DeploymentStepper({
  open,
  step,
  error,
  onClose,
}: DeploymentStepperProps) {
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start / clear the 20-second RPC timeout warning
  useEffect(() => {
    if (!open) {
      setShowTimeoutWarning(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }
    // Reset on every new deployment
    setShowTimeoutWarning(false);
    timeoutRef.current = setTimeout(() => {
      setShowTimeoutWarning(true);
    }, RPC_TIMEOUT_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [open]);

  // Clear warning once deployment resolves
  useEffect(() => {
    if (step === "success" || step === "error") {
      setShowTimeoutWarning(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, [step]);

  const currentIdx = stepIndex(step);
  const isTerminal = step === "success" || step === "error";
  const isIdle = step === "idle";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && isTerminal) onClose(); }}>
      <DialogContent
        className="sm:max-w-md bg-card border-border"
        // Prevent accidental dismissal mid-deploy
        onInteractOutside={(e) => { if (!isTerminal) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!isTerminal) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Rocket className="h-4 w-4 text-primary" />
            Deploying Contract
          </DialogTitle>
        </DialogHeader>

        {/* ── Step list ─────────────────────────────────────────────── */}
        <ul className="space-y-3 py-2" role="list" aria-label="Deployment progress">
          {DEPLOY_STEPS.map((s, idx) => {
            let status: "done" | "active" | "pending" | "error" = "pending";

            if (step === "error" && idx === currentIdx) {
              status = "error";
            } else if (step === "error" && idx < currentIdx) {
              status = "done";
            } else if (!isIdle && idx < currentIdx) {
              status = "done";
            } else if (idx === currentIdx) {
              status = "active";
            } else if (step === "success") {
              status = "done";
            }

            const isActiveSigning = s.key === "signing" && step === "signing";

            return (
              <li
                key={s.key}
                className={cn(
                  "flex items-start gap-3 rounded-md px-3 py-2 transition-colors duration-200",
                  status === "active" && "bg-primary/5 border border-primary/20",
                  status === "done" && "opacity-70",
                  status === "pending" && "opacity-40",
                )}
              >
                <span className="mt-px">
                  <StepIcon status={status} />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-xs font-medium font-mono",
                      status === "active" ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {s.label}
                  </span>
                  {/* Freighter signing hint */}
                  {isActiveSigning && (
                    <span className="animate-in fade-in slide-in-from-left-1 duration-300 text-[10px] text-yellow-400 font-mono">
                      Please approve in your extension
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* ── Success banner ────────────────────────────────────────── */}
        {step === "success" && (
          <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 flex items-center gap-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-400 font-mono">
              Contract deployed successfully!
            </p>
          </div>
        )}

        {/* ── Error banner ──────────────────────────────────────────── */}
        {step === "error" && error && (
          <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
            <XCircle className="h-4 w-4 text-destructive shrink-0 mt-px" />
            <p className="text-xs text-destructive font-mono break-all">{error}</p>
          </div>
        )}

        {/* ── Timeout warning ───────────────────────────────────────── */}
        {showTimeoutWarning && !isTerminal && (
          <div
            role="alert"
            className="animate-in fade-in duration-500 flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2"
          >
            <span className="text-amber-400 text-[10px] leading-relaxed font-mono">
              ⚠ The network RPC is taking longer than expected. This is normal — please wait.
            </span>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!isTerminal}
            onClick={onClose}
            className="w-full text-xs"
            data-testid="deploy-footer-btn"
          >
            {step === "success" ? "Close" : step === "error" ? "Dismiss" : "Deploying…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
