import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeploymentStepper } from "@/components/ide/DeploymentStepper";
import type { DeploymentStep } from "@/store/useDeploymentStore";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderStepper(
  step: DeploymentStep,
  open = true,
  error: string | null = null,
  onClose = vi.fn()
) {
  return render(
    <DeploymentStepper open={open} step={step} error={error} onClose={onClose} />
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("DeploymentStepper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not render modal content when open=false", () => {
    renderStepper("idle", false);
    expect(screen.queryByText("Deploying Contract")).not.toBeInTheDocument();
  });

  it("renders all four step labels when open", () => {
    renderStepper("simulating");
    expect(screen.getByText("Simulating transaction")).toBeInTheDocument();
    expect(screen.getByText("Signing transaction")).toBeInTheDocument();
    expect(screen.getByText("Uploading WASM")).toBeInTheDocument();
    expect(screen.getByText("Instantiating contract")).toBeInTheDocument();
  });

  it("shows a spinner (Loader2) on the active step", () => {
    renderStepper("simulating");
    // Active step icon has aria-label "in progress"
    expect(screen.getByLabelText("in progress")).toBeInTheDocument();
  });

  it("marks previous steps as done when step advances", () => {
    renderStepper("uploading");
    // Simulating and Signing are done → two "done" aria-labels
    const doneIcons = screen.getAllByLabelText("done");
    expect(doneIcons.length).toBeGreaterThanOrEqual(2);
  });

  it("shows Freighter signing hint only during signing step", () => {
    const { rerender } = renderStepper("simulating");
    expect(
      screen.queryByText(/Please approve in your extension/i)
    ).not.toBeInTheDocument();

    rerender(
      <DeploymentStepper
        open
        step="signing"
        error={null}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByText(/Please approve in your extension/i)
    ).toBeInTheDocument();
  });

  it("shows success banner when step=success", () => {
    renderStepper("success");
    expect(
      screen.getByText(/Contract deployed successfully/i)
    ).toBeInTheDocument();
  });

  it("shows error banner with message when step=error", () => {
    renderStepper("error", true, "RPC connection refused");
    expect(screen.getByText("RPC connection refused")).toBeInTheDocument();
  });

  it("shows all steps as done when step=success", () => {
    renderStepper("success");
    const doneIcons = screen.getAllByLabelText("done");
    // 4 steps + 1 icon in the success banner = 5 done icons
    expect(doneIcons.length).toBeGreaterThanOrEqual(4);
  });

  it("Close button is disabled while deployment is in progress", () => {
    renderStepper("uploading");
    const closeBtn = screen.getByTestId("deploy-footer-btn");
    expect(closeBtn).toBeDisabled();
  });

  it("Close button is enabled after success", () => {
    renderStepper("success");
    const closeBtn = screen.getByTestId("deploy-footer-btn");
    expect(closeBtn).not.toBeDisabled();
  });

  it("Close button is enabled after error", () => {
    renderStepper("error", true, "Something went wrong");
    const closeBtn = screen.getByTestId("deploy-footer-btn");
    expect(closeBtn).not.toBeDisabled();
  });

  it("shows RPC timeout warning after 20 seconds", () => {
    renderStepper("uploading");
    expect(screen.queryByText(/taking longer than expected/i)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument();
  });

  it("clears timeout warning on success before 20 seconds", () => {
    const { rerender } = renderStepper("uploading");

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    rerender(
      <DeploymentStepper open step="success" error={null} onClose={vi.fn()} />
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.queryByText(/taking longer than expected/i)).not.toBeInTheDocument();
  });
});
