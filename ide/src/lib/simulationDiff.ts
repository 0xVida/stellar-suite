import { xdr } from "@stellar/stellar-sdk";

import type { CustomHeaders, NetworkKey } from "@/lib/networkConfig";
import { fetchWithRpcFailover } from "@/lib/rpcFailover";

export type LedgerChangeType = "added" | "removed" | "modified" | "unchanged" | "unavailable";
export type DriftWarningLevel = "none" | "low" | "medium" | "high";

export interface SimulationStateChange {
  key: string;
  keyLabel: string;
  currentLedgerEntryXdr: string | null;
  expectedLedgerEntryXdr: string | null;
  baselineLedgerEntryXdr: string | null;
  changeType: LedgerChangeType;
  driftDetected: boolean;
}

export interface SimulationFeeBreakdown {
  minResourceFee?: string;
  estimatedTotalFee?: string;
  baseFee?: string;
  refundableFee?: string;
  nonRefundableFee?: string;
}

export interface SimulationResourceBreakdown {
  instructions?: string;
  readBytes?: string;
  writeBytes?: string;
  readEntries?: string;
  writeEntries?: string;
  cpuInstructions?: number;
  memoryBytes?: number;
}

export interface SimulationComparisonData {
  affectedLedgerKeys: string[];
  stateChanges: SimulationStateChange[];
  latestLedger?: number;
  feeBreakdown: SimulationFeeBreakdown;
  resourceBreakdown: SimulationResourceBreakdown;
  summary: {
    total: number;
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
    unavailable: number;
    drifted: number;
  };
  warningLevel: DriftWarningLevel;
  warningText: string | null;
}

export interface CurrentLedgerEntrySnapshot {
  key: string;
  xdr: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const pickFirst = <T>(...values: T[]): T | undefined =>
  values.find((value) => value !== undefined && value !== null);

const getMember = (value: unknown, key: string) => {
  const record = asRecord(value);
  return record?.[key];
};

const getMemberOrCall = (value: unknown, key: string) => {
  const candidate = getMember(value, key);
  return typeof candidate === "function" ? (candidate as () => unknown)() : candidate;
};

const toBase64Xdr = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null && "toXDR" in value) {
    const xdrLike = value as { toXDR: (format?: string) => string | Buffer };
    const serialized = xdrLike.toXDR("base64");
    return typeof serialized === "string"
      ? serialized
      : Buffer.from(serialized).toString("base64");
  }

  return null;
};

const getSimulationRoot = (simulation: unknown) => {
  const root = asRecord(simulation);
  if (!root) return null;

  return (
    asRecord(root.result) ??
    asRecord(root.simulationResult) ??
    asRecord(root.simulation_result) ??
    root
  );
};

const normalizeBigIntLike = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  return undefined;
};

const describeLedgerKey = (keyXdr: string): string => {
  try {
    const ledgerKey = xdr.LedgerKey.fromXDR(keyXdr, "base64");
    return ledgerKey.switch().name;
  } catch {
    return "LedgerKey";
  }
};

export const extractAffectedLedgerKeys = (simulation: unknown): string[] => {
  const root = getSimulationRoot(simulation);
  if (!root) return [];

  const stateChangeCandidates = pickFirst(
    root.stateChanges,
    root.state_changes,
  );
  if (Array.isArray(stateChangeCandidates)) {
    const fromChanges = stateChangeCandidates
      .map((change) => {
        const record = asRecord(change);
        return toBase64Xdr(
          record?.key ??
            record?.ledgerKey ??
            record?.ledger_key,
        );
      })
      .filter((value): value is string => Boolean(value));

    if (fromChanges.length > 0) {
      return [...new Set(fromChanges)];
    }
  }

  const transactionDataCandidate = pickFirst(
    root.transactionData,
    root.transaction_data,
  );

  const transactionData = asRecord(transactionDataCandidate);
  const builtTransactionData = getMemberOrCall(transactionDataCandidate, "build");

  const footprint = pickFirst(
    getMemberOrCall(transactionData, "resources"),
    getMemberOrCall(builtTransactionData, "resources"),
    getMemberOrCall(transactionData, "footprint"),
    getMemberOrCall(builtTransactionData, "footprint"),
  );

  const readOnly = pickFirst(
    getMemberOrCall(footprint, "readOnly"),
    getMemberOrCall(footprint, "read_only"),
  );
  const readWrite = pickFirst(
    getMemberOrCall(footprint, "readWrite"),
    getMemberOrCall(footprint, "read_write"),
  );

  const rawKeys = [
    ...(Array.isArray(readOnly) ? readOnly : []),
    ...(Array.isArray(readWrite) ? readWrite : []),
  ];

  return [...new Set(rawKeys.map((entry) => toBase64Xdr(entry)).filter((value): value is string => Boolean(value)))];
};

const extractStateChanges = (simulation: unknown) => {
  const root = getSimulationRoot(simulation);
  if (!root) return [];

  const rawChanges = pickFirst(root.stateChanges, root.state_changes);
  if (!Array.isArray(rawChanges)) {
    return [];
  }

  return rawChanges
    .map((change) => {
      const record = asRecord(change);
      if (!record) return null;

      const key = toBase64Xdr(record.key ?? record.ledgerKey ?? record.ledger_key);
      if (!key) return null;

      const before = toBase64Xdr(
        record.before ??
          record.beforeValue ??
          record.before_value ??
          record.previous ??
          record.previousValue,
      );
      const after = toBase64Xdr(
        record.after ??
          record.afterValue ??
          record.after_value ??
          record.value ??
          record.val,
      );

      let changeType: LedgerChangeType = "unavailable";
      if (before === null && after !== null) {
        changeType = "added";
      } else if (before !== null && after === null) {
        changeType = "removed";
      } else if (before !== null && after !== null) {
        changeType = before === after ? "unchanged" : "modified";
      }

      return {
        key,
        keyLabel: describeLedgerKey(key),
        baselineLedgerEntryXdr: before,
        expectedLedgerEntryXdr: after,
        changeType,
      };
    })
    .filter(
      (
        change,
      ): change is {
        key: string;
        keyLabel: string;
        baselineLedgerEntryXdr: string | null;
        expectedLedgerEntryXdr: string | null;
        changeType: LedgerChangeType;
      } => change !== null,
    );
};

const extractFeeBreakdown = (simulation: unknown): SimulationFeeBreakdown => {
  const root = getSimulationRoot(simulation);
  if (!root) return {};

  const cost = asRecord(pickFirst(root.cost, root.fee, root.fees));
  const resourceUsage = asRecord(pickFirst(root.resourceUsage, root.resource_usage));

  return {
    minResourceFee: normalizeBigIntLike(
      pickFirst(
        root.minResourceFee,
        root.min_resource_fee,
        cost?.minResourceFee,
        cost?.min_resource_fee,
        resourceUsage?.minResourceFee,
        resourceUsage?.min_resource_fee,
      ),
    ),
    estimatedTotalFee: normalizeBigIntLike(
      pickFirst(root.estimatedFee, root.estimated_fee, cost?.estimatedFee, cost?.estimated_fee),
    ),
    baseFee: normalizeBigIntLike(pickFirst(root.baseFee, root.base_fee, cost?.baseFee, cost?.base_fee)),
    refundableFee: normalizeBigIntLike(
      pickFirst(root.refundableFee, root.refundable_fee, cost?.refundableFee, cost?.refundable_fee),
    ),
    nonRefundableFee: normalizeBigIntLike(
      pickFirst(
        root.nonRefundableFee,
        root.non_refundable_fee,
        cost?.nonRefundableFee,
        cost?.non_refundable_fee,
      ),
    ),
  };
};

const extractResourceBreakdown = (simulation: unknown): SimulationResourceBreakdown => {
  const root = getSimulationRoot(simulation);
  if (!root) return {};

  const resourceUsage = asRecord(pickFirst(root.resourceUsage, root.resource_usage));
  const cost = asRecord(pickFirst(root.cost, root.resources, root.resourceConfig));

  const cpuCandidate = pickFirst(resourceUsage?.cpuInstructions, resourceUsage?.cpu_instructions);
  const memoryCandidate = pickFirst(resourceUsage?.memoryBytes, resourceUsage?.memory_bytes);

  return {
    instructions: normalizeBigIntLike(pickFirst(root.instructions, root.instructionLeeway, cost?.instructions)),
    readBytes: normalizeBigIntLike(pickFirst(root.readBytes, root.read_bytes, cost?.readBytes, cost?.read_bytes)),
    writeBytes: normalizeBigIntLike(
      pickFirst(root.writeBytes, root.write_bytes, cost?.writeBytes, cost?.write_bytes),
    ),
    readEntries: normalizeBigIntLike(
      pickFirst(root.readEntries, root.read_entries, cost?.readEntries, cost?.read_entries),
    ),
    writeEntries: normalizeBigIntLike(
      pickFirst(root.writeEntries, root.write_entries, cost?.writeEntries, cost?.write_entries),
    ),
    cpuInstructions: typeof cpuCandidate === "number" ? cpuCandidate : undefined,
    memoryBytes: typeof memoryCandidate === "number" ? memoryCandidate : undefined,
  };
};

export const buildSimulationComparison = ({
  simulation,
  currentEntries,
  latestLedger,
}: {
  simulation: unknown;
  currentEntries: CurrentLedgerEntrySnapshot[];
  latestLedger?: number;
}): SimulationComparisonData => {
  const affectedLedgerKeys = extractAffectedLedgerKeys(simulation);
  const parsedStateChanges = extractStateChanges(simulation);
  const currentByKey = new Map(currentEntries.map((entry) => [entry.key, entry.xdr]));

  const stateChanges =
    parsedStateChanges.length > 0
      ? parsedStateChanges.map((change) => {
          const currentLedgerEntryXdr = currentByKey.get(change.key) ?? null;
          const driftDetected =
            change.baselineLedgerEntryXdr !== null
              ? currentLedgerEntryXdr !== change.baselineLedgerEntryXdr
              : false;

          return {
            ...change,
            currentLedgerEntryXdr,
            driftDetected,
          };
        })
      : affectedLedgerKeys.map((key) => ({
          key,
          keyLabel: describeLedgerKey(key),
          currentLedgerEntryXdr: currentByKey.get(key) ?? null,
          expectedLedgerEntryXdr: null,
          baselineLedgerEntryXdr: null,
          changeType: "unavailable" as const,
          driftDetected: false,
        }));

  const summary = stateChanges.reduce(
    (acc, change) => {
      acc.total += 1;
      acc[change.changeType] += 1;
      if (change.driftDetected) {
        acc.drifted += 1;
      }
      return acc;
    },
    {
      total: 0,
      added: 0,
      removed: 0,
      modified: 0,
      unchanged: 0,
      unavailable: 0,
      drifted: 0,
    },
  );

  let warningLevel: DriftWarningLevel = "none";
  let warningText: string | null = null;

  if (summary.drifted >= 2) {
    warningLevel = "high";
    warningText = `${summary.drifted} ledger entries changed since simulation. Re-run simulation before signing.`;
  } else if (summary.drifted === 1) {
    warningLevel = "medium";
    warningText = "Current on-chain state differs from the simulated baseline for 1 affected ledger entry.";
  } else if (summary.unavailable > 0) {
    warningLevel = "low";
    warningText = "Simulation did not expose full state-change payloads, so only affected keys could be checked.";
  }

  return {
    affectedLedgerKeys,
    stateChanges,
    latestLedger,
    feeBreakdown: extractFeeBreakdown(simulation),
    resourceBreakdown: extractResourceBreakdown(simulation),
    summary,
    warningLevel,
    warningText,
  };
};

export async function fetchCurrentLedgerEntriesForSimulation({
  simulation,
  rpcUrl,
  network,
  customHeaders,
}: {
  simulation: unknown;
  rpcUrl: string;
  network?: NetworkKey;
  customHeaders?: CustomHeaders;
}) {
  const keys = extractAffectedLedgerKeys(simulation);
  if (keys.length === 0) {
    return { entries: [] as CurrentLedgerEntrySnapshot[], latestLedger: undefined };
  }

  const { response } = await fetchWithRpcFailover({
    network,
    primaryUrl: rpcUrl,
    path: "/rpc",
    customHeaders,
    timeoutMs: 20_000,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "getLedgerEntries",
        params: {
          keys,
        },
      }),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch current ledger state: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    result?: {
      latestLedger?: number;
      latest_ledger?: number;
      entries?: Array<Record<string, unknown>>;
    };
    error?: {
      message?: string;
    };
  };

  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  const result = payload.result;
  const entries = Array.isArray(result?.entries)
    ? result.entries.map((entry, index) => ({
        key: typeof entry.key === "string" ? entry.key : keys[index] ?? "",
        xdr: typeof entry.xdr === "string" ? entry.xdr : null,
      }))
    : [];

  return {
    entries,
    latestLedger:
      typeof result?.latestLedger === "number"
        ? result.latestLedger
        : typeof result?.latest_ledger === "number"
          ? result.latest_ledger
          : undefined,
  };
}
