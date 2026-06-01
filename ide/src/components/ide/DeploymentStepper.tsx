import { useEffect, useRef, useState } from "react";
import {
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
  Rocket,
  Copy,
  RefreshCw,
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
  /** The deployed contract ID shown on success. */
  contractId?: string | null;
  /** WASM hash retained after upload — enables retry-instantiate without re-upload. */
  pendingWasmHash?: string | null;
  onClose: () => void;
  /** Called when the user wants to retry only the instantiation step. */
  onRetryInstantiate?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DeploymentStepper({
  open,
  step,
  error,
  contractId,
  pendingWasmHash,
  onClose,
  onRetryInstantiate,
}: DeploymentStepperProps) {
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyContractId = () => {
    if (!contractId) return;
    void navigator.clipboard.writeText(contractId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
        data-testid="deployment-stepper"
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
                data-testid={`deploy-step-${s.key}`}
                data-status={status}
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
          <div data-testid="deploy-success" className="animate-in fade-in slide-in-from-bottom-1 duration-300 space-y-2">
            <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <p className="text-xs text-emerald-400 font-mono">
                Contract deployed successfully!
              </p>
            </div>
            {contractId && (
              <div className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
                <code className="flex-1 text-[11px] font-mono text-primary truncate" title={contractId}>
                  {contractId}
                </code>
                <button
                  onClick={handleCopyContractId}
                  aria-label="Copy contract ID"
                  className="shrink-0 p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                {copied && (
                  <span className="text-[10px] text-emerald-400 font-mono animate-in fade-in duration-150">
                    Copied!
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Error banner ──────────────────────────────────────────── */}
        {step === "error" && error && (
          <div data-testid="deploy-error" className="animate-in fade-in slide-in-from-bottom-1 duration-300 space-y-2">
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <XCircle className="h-4 w-4 text-destructive shrink-0 mt-px" />
              <p className="text-xs text-destructive font-mono break-all">{error}</p>
            </div>
            {/* Retry instantiation if WASM was already uploaded */}
            {pendingWasmHash && onRetryInstantiate && (
              <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                <span className="text-[10px] text-amber-300 font-mono flex-1">
                  WASM was uploaded successfully. You can retry contract instantiation without re-uploading.
                </span>
                <button
                  onClick={onRetryInstantiate}
                  data-testid="deploy-retry-instantiate"
                  className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-amber-300 hover:text-amber-200 transition-colors"
                  aria-label="Retry instantiation"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Timeout warning ───────────────────────────────────────── */}
        {showTimeoutWarning && !isTerminal && (
          <div
            role="alert"
            data-testid="deploy-timeout-warning"
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
