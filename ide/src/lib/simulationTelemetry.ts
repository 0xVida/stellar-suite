/**
 * Lightweight simulation telemetry for the IDE runner loop.
 * Disabled mode is a no-op so benchmarks can measure overhead in isolation.
 */

export interface SimulationTelemetryEvent {
  transactionId: string;
  contractId: string;
  functionName: string;
  durationMs: number;
  success: boolean;
  ledgerKeyCount?: number;
}

let enabled = true;
const buffer: SimulationTelemetryEvent[] = [];
const MAX_BUFFER = 256;

export function setSimulationTelemetryEnabled(value: boolean): void {
  enabled = value;
}

export function isSimulationTelemetryEnabled(): boolean {
  return enabled;
}

export function recordSimulationTelemetry(event: SimulationTelemetryEvent): void {
  if (!enabled) return;
  buffer.push(event);
  if (buffer.length > MAX_BUFFER) {
    buffer.shift();
  }
}

export function getSimulationTelemetryBuffer(): readonly SimulationTelemetryEvent[] {
  return buffer;
}

export function clearSimulationTelemetryBuffer(): void {
  buffer.length = 0;
}

/** Minimal runner-loop step used by benchmarks and simulation flows. */
export function runSimulationRunnerStep(payload: {
  contractId: string;
  fn: string;
  argsHash: number;
}): { ok: boolean; resultHash: number } {
  let hash = payload.argsHash;
  for (let i = 0; i < 8; i++) {
    hash = (hash * 31 + payload.fn.charCodeAt(i % payload.fn.length)) | 0;
  }
  return { ok: true, resultHash: hash ^ payload.contractId.length };
}

export function runSimulationRunnerStepWithTelemetry(
  payload: { contractId: string; fn: string; argsHash: number },
  transactionId: string,
): { ok: boolean; resultHash: number } {
  const started = performance.now();
  const result = runSimulationRunnerStep(payload);
  recordSimulationTelemetry({
    transactionId,
    contractId: payload.contractId,
    functionName: payload.fn,
    durationMs: performance.now() - started,
    success: result.ok,
  });
  return result;
}
