"use client";

import { useEffect, useState } from "react";

import { DeploymentStepper } from "@/components/ide/DeploymentStepper";
import type { DeploymentStep } from "@/store/useDeploymentStore";

const FLOW_STEPS: DeploymentStep[] = [
  "simulating",
  "signing",
  "uploading",
  "instantiating",
  "success",
];

export default function DeploymentStepperQaPage() {
  const [step, setStep] = useState<DeploymentStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");

    if (mode === "flow") {
      setError(null);
      setStep("simulating");
      setOpen(true);
      setAutoAdvance(true);
      return;
    }

    if (mode === "timeout") {
      setError(null);
      setStep("simulating");
      setOpen(true);
      setAutoAdvance(false);
      return;
    }

    if (mode === "uploading") {
      setError(null);
      setStep("uploading");
      setOpen(true);
      setAutoAdvance(false);
      return;
    }

    if (mode === "error") {
      setStep("error");
      setError("Mock instantiate failure: HostError(Contract, #12)");
      setOpen(true);
      setAutoAdvance(false);
    }
  }, []);

  useEffect(() => {
    if (!autoAdvance || !open) return;
    const index = FLOW_STEPS.indexOf(step);
    if (index < 0 || index >= FLOW_STEPS.length - 1) {
      return;
    }

    const timer = window.setTimeout(() => {
      setStep(FLOW_STEPS[index + 1]);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [autoAdvance, open, step]);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <h1 className="mb-4 text-xl font-semibold">Deployment Stepper QA</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Deterministic harness for Playwright deployment flow coverage.
      </p>

      <div className="mb-4 flex flex-wrap gap-2" data-testid="qa-controls">
        <button
          data-testid="qa-open"
          className="rounded border border-border px-3 py-1 text-sm"
          onClick={() => setOpen(true)}
        >
          Open
        </button>
        <button
          data-testid="qa-close"
          className="rounded border border-border px-3 py-1 text-sm"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
        <button
          data-testid="qa-start-flow"
          className="rounded border border-border px-3 py-1 text-sm"
          onClick={() => {
            setError(null);
            setStep("simulating");
            setOpen(true);
            setAutoAdvance(true);
          }}
        >
          Start Flow
        </button>
        <button
          data-testid="qa-fail"
          className="rounded border border-border px-3 py-1 text-sm"
          onClick={() => {
            setStep("error");
            setError("Mock instantiate failure: HostError(Contract, #12)");
            setOpen(true);
            setAutoAdvance(false);
          }}
        >
          Trigger Error
        </button>
      </div>

      <p className="text-xs text-muted-foreground" data-testid="qa-current-step">
        Current step: {step}
      </p>

      <DeploymentStepper
        open={open}
        step={step}
        error={error}
        contractId={step === "success" ? "CDEPLOYMENTSTEPPERMOCK1234567890" : null}
        pendingWasmHash={step === "error" ? "feedface" : null}
        onClose={() => setOpen(false)}
        onRetryInstantiate={() => {
          setError(null);
          setStep("instantiating");
          setAutoAdvance(true);
        }}
      />
    </main>
  );
}
