import { bench, describe, expect } from "vitest";

import {
  clearSimulationTelemetryBuffer,
  runSimulationRunnerStep,
  runSimulationRunnerStepWithTelemetry,
  setSimulationTelemetryEnabled,
} from "@/lib/simulationTelemetry";

const TX_COUNT = 200;
const MAX_OVERHEAD_MS_PER_TX = 2;

function buildPayloads(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    contractId: `C${(i % 7).toString(16).repeat(8)}`,
    fn: `invoke_${i % 12}`,
    argsHash: i * 9973,
  }));
}

const payloads = buildPayloads(TX_COUNT);

describe("simulation telemetry overhead", () => {
  bench("runner loop — telemetry disabled", () => {
    setSimulationTelemetryEnabled(false);
    clearSimulationTelemetryBuffer();

    for (let i = 0; i < TX_COUNT; i++) {
      runSimulationRunnerStep(payloads[i]);
    }
  });

  bench("runner loop — telemetry enabled", () => {
    setSimulationTelemetryEnabled(true);
    clearSimulationTelemetryBuffer();

    for (let i = 0; i < TX_COUNT; i++) {
      runSimulationRunnerStepWithTelemetry(payloads[i], `tx-${i}`);
    }
  });

  bench("per-transaction overhead budget (<2ms)", () => {
    setSimulationTelemetryEnabled(false);
    const baselineStart = performance.now();
    for (let i = 0; i < TX_COUNT; i++) {
      runSimulationRunnerStep(payloads[i]);
    }
    const baselineMs = performance.now() - baselineStart;

    setSimulationTelemetryEnabled(true);
    clearSimulationTelemetryBuffer();
    const telemetryStart = performance.now();
    for (let i = 0; i < TX_COUNT; i++) {
      runSimulationRunnerStepWithTelemetry(payloads[i], `budget-${i}`);
    }
    const telemetryMs = performance.now() - telemetryStart;

    const overheadPerTx = (telemetryMs - baselineMs) / TX_COUNT;
    expect(overheadPerTx).toBeLessThan(MAX_OVERHEAD_MS_PER_TX);
  });
});
