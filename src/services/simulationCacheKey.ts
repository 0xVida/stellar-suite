// src/services/simulationCacheKey.ts

function stableStringify(value: any): string {
  // Stable stringify for arrays/objects so cache keys are consistent
  const seen = new WeakSet<object>();

  const stringify = (v: any): any => {
    if (v === null || v === undefined) return v;
    if (typeof v !== 'object') return v;

    if (seen.has(v)) {
      return '[Circular]';
    }
    seen.add(v);

    if (Array.isArray(v)) {
      return v.map(stringify);
    }

    const keys = Object.keys(v).sort();
    const out: Record<string, any> = {};
    for (const k of keys) {
      out[k] = stringify(v[k]);
    }
    return out;
  };

  return JSON.stringify(stringify(value));
}

export type SimulationBackend = 'cli' | 'rpc';

export interface SimulationCacheKeyInput {
  backend: SimulationBackend;
  contractId: string;
  functionName: string;
  args: any[];
  // Backend-specific identity inputs:
  network?: string; // CLI + sometimes RPC context
  source?: string;  // CLI identity
  rpcUrl?: string;  // RPC endpoint
}

export function makeSimulationCacheKey(input: SimulationCacheKeyInput): string {
  // include version field so we can evolve the key safely
  const keyObj = {
    v: 1,
    backend: input.backend,
    contractId: input.contractId,
    functionName: input.functionName,
    args: input.args,
    network: input.network ?? '',
    source: input.source ?? '',
    rpcUrl: input.rpcUrl ?? '',
  };

  return `sim:${stableStringify(keyObj)}`;
}