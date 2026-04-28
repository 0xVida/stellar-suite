export type ProtocolVersion = 20 | 21 | 22 | 23;

export type OperationTag =
  | "invokeHostFunction"
  | "uploadContractWasm"
  | "createContract"
  | "extendFootprintTtl"
  | "restoreFootprint"
  | "bumpSequence"
  | "claimableBalance"
  | "liquidityPool"
  | "setOptions"
  | "payment"
  | "pathPayment"
  | "manageSellOffer"
  | "manageBuyOffer"
  | "changeTrust"
  | "accountMerge"
  | "manageData";

export interface OperationSpec {
  tag: OperationTag;
  supported: boolean;
  deprecated?: boolean;
  deprecatedSince?: ProtocolVersion;
  removedIn?: ProtocolVersion;
  notes?: string;
}

export interface SimulationRule {
  /** Minimum ledger entries allowed in a transaction footprint */
  minFootprintEntries: number;
  /** Maximum ledger entries allowed in a transaction footprint */
  maxFootprintEntries: number;
  /** Maximum instructions per transaction */
  maxInstructions: number;
  /** Maximum read bytes */
  maxReadBytes: number;
  /** Maximum write bytes */
  maxWriteBytes: number;
  /** Base fee in stroops */
  baseFee: number;
  /** Resource fee per instruction (in stroops) */
  feePerInstruction: number;
}

export interface ProtocolSpec {
  version: ProtocolVersion;
  label: string;
  releaseDate: string;
  sorobanSupported: boolean;
  operations: OperationSpec[];
  simulationRules: SimulationRule;
  deprecatedFeatures: string[];
  breakingChanges: string[];
}

export const SIMULATION_RULES: Record<ProtocolVersion, SimulationRule> = {
  20: {
    minFootprintEntries: 0,
    maxFootprintEntries: 40,
    maxInstructions: 100_000_000,
    maxReadBytes: 200_000,
    maxWriteBytes: 65_536,
    baseFee: 100,
    feePerInstruction: 25,
  },
  21: {
    minFootprintEntries: 0,
    maxFootprintEntries: 64,
    maxInstructions: 100_000_000,
    maxReadBytes: 200_000,
    maxWriteBytes: 65_536,
    baseFee: 100,
    feePerInstruction: 25,
  },
  22: {
    minFootprintEntries: 0,
    maxFootprintEntries: 100,
    maxInstructions: 150_000_000,
    maxReadBytes: 300_000,
    maxWriteBytes: 65_536,
    baseFee: 100,
    feePerInstruction: 20,
  },
  23: {
    minFootprintEntries: 0,
    maxFootprintEntries: 128,
    maxInstructions: 200_000_000,
    maxReadBytes: 512_000,
    maxWriteBytes: 131_072,
    baseFee: 100,
    feePerInstruction: 15,
  },
};

export const PROTOCOL_MATRIX: Record<ProtocolVersion, ProtocolSpec> = {
  20: {
    version: 20,
    label: "Protocol 20 (Soroban Launch)",
    releaseDate: "2023-09-20",
    sorobanSupported: true,
    simulationRules: SIMULATION_RULES[20],
    operations: [
      { tag: "invokeHostFunction", supported: true },
      { tag: "uploadContractWasm", supported: true },
      { tag: "createContract", supported: true },
      { tag: "extendFootprintTtl", supported: true },
      { tag: "restoreFootprint", supported: true },
      { tag: "bumpSequence", supported: true, deprecated: true, deprecatedSince: 20, notes: "Prefer sequence management via auth" },
      { tag: "claimableBalance", supported: true },
      { tag: "liquidityPool", supported: true },
      { tag: "setOptions", supported: true },
      { tag: "payment", supported: true },
      { tag: "pathPayment", supported: true },
      { tag: "manageSellOffer", supported: true },
      { tag: "manageBuyOffer", supported: true },
      { tag: "changeTrust", supported: true },
      { tag: "accountMerge", supported: true },
      { tag: "manageData", supported: true },
    ],
    deprecatedFeatures: ["bumpSequence — prefer auth-based sequence management"],
    breakingChanges: [],
  },
  21: {
    version: 21,
    label: "Protocol 21",
    releaseDate: "2024-06-01",
    sorobanSupported: true,
    simulationRules: SIMULATION_RULES[21],
    operations: [
      { tag: "invokeHostFunction", supported: true },
      { tag: "uploadContractWasm", supported: true },
      { tag: "createContract", supported: true },
      { tag: "extendFootprintTtl", supported: true },
      { tag: "restoreFootprint", supported: true },
      { tag: "bumpSequence", supported: true, deprecated: true, deprecatedSince: 20 },
      { tag: "claimableBalance", supported: true },
      { tag: "liquidityPool", supported: true },
      { tag: "setOptions", supported: true },
      { tag: "payment", supported: true },
      { tag: "pathPayment", supported: true },
      { tag: "manageSellOffer", supported: true },
      { tag: "manageBuyOffer", supported: true },
      { tag: "changeTrust", supported: true },
      { tag: "accountMerge", supported: true },
      { tag: "manageData", supported: true },
    ],
    deprecatedFeatures: ["bumpSequence — removed in a future protocol"],
    breakingChanges: ["Footprint entry limit increased to 64"],
  },
  22: {
    version: 22,
    label: "Protocol 22",
    releaseDate: "2025-01-01",
    sorobanSupported: true,
    simulationRules: SIMULATION_RULES[22],
    operations: [
      { tag: "invokeHostFunction", supported: true },
      { tag: "uploadContractWasm", supported: true },
      { tag: "createContract", supported: true },
      { tag: "extendFootprintTtl", supported: true },
      { tag: "restoreFootprint", supported: true },
      { tag: "bumpSequence", supported: false, deprecated: true, deprecatedSince: 20, removedIn: 22, notes: "Removed in Protocol 22" },
      { tag: "claimableBalance", supported: true },
      { tag: "liquidityPool", supported: true },
      { tag: "setOptions", supported: true },
      { tag: "payment", supported: true },
      { tag: "pathPayment", supported: true },
      { tag: "manageSellOffer", supported: true },
      { tag: "manageBuyOffer", supported: true },
      { tag: "changeTrust", supported: true },
      { tag: "accountMerge", supported: true },
      { tag: "manageData", supported: true },
    ],
    deprecatedFeatures: [],
    breakingChanges: [
      "bumpSequence operation removed",
      "Instruction limit raised to 150M",
      "feePerInstruction reduced to 20 stroops",
    ],
  },
  23: {
    version: 23,
    label: "Protocol 23 (Upcoming)",
    releaseDate: "2025-12-01",
    sorobanSupported: true,
    simulationRules: SIMULATION_RULES[23],
    operations: [
      { tag: "invokeHostFunction", supported: true },
      { tag: "uploadContractWasm", supported: true },
      { tag: "createContract", supported: true },
      { tag: "extendFootprintTtl", supported: true },
      { tag: "restoreFootprint", supported: true },
      { tag: "bumpSequence", supported: false, deprecated: true, removedIn: 22 },
      { tag: "claimableBalance", supported: true },
      { tag: "liquidityPool", supported: true },
      { tag: "setOptions", supported: true },
      { tag: "payment", supported: true },
      { tag: "pathPayment", supported: true },
      { tag: "manageSellOffer", supported: true },
      { tag: "manageBuyOffer", supported: true },
      { tag: "changeTrust", supported: true },
      { tag: "accountMerge", supported: true },
      { tag: "manageData", supported: true },
    ],
    deprecatedFeatures: [],
    breakingChanges: [
      "Instruction limit raised to 200M",
      "Write byte limit doubled to 128 KiB",
      "feePerInstruction reduced to 15 stroops",
    ],
  },
};

export const SUPPORTED_PROTOCOL_VERSIONS = Object.keys(PROTOCOL_MATRIX).map(Number) as ProtocolVersion[];
export const LATEST_PROTOCOL_VERSION: ProtocolVersion = 22;
export const UPCOMING_PROTOCOL_VERSION: ProtocolVersion = 23;

export function getProtocolSpec(version: ProtocolVersion): ProtocolSpec {
  return PROTOCOL_MATRIX[version];
}

export function getDeprecationWarnings(version: ProtocolVersion, usedOperations: string[]): string[] {
  const spec = PROTOCOL_MATRIX[version];
  const warnings: string[] = [];

  for (const opTag of usedOperations) {
    const opSpec = spec.operations.find((o) => o.tag === opTag);
    if (!opSpec) continue;
    if (!opSpec.supported) {
      warnings.push(`Operation "${opTag}" is NOT supported in Protocol ${version}.${opSpec.notes ? ` ${opSpec.notes}` : ""}`);
    } else if (opSpec.deprecated) {
      warnings.push(
        `Operation "${opTag}" is deprecated since Protocol ${opSpec.deprecatedSince ?? version}` +
          (opSpec.removedIn ? ` and will be removed in Protocol ${opSpec.removedIn}` : "") +
          (opSpec.notes ? `. ${opSpec.notes}` : "")
      );
    }
  }

  return warnings;
}

export function isOperationSupported(version: ProtocolVersion, tag: OperationTag): boolean {
  const spec = PROTOCOL_MATRIX[version];
  const op = spec.operations.find((o) => o.tag === tag);
  return op?.supported ?? false;
}

export function getSimulationRules(version: ProtocolVersion): SimulationRule {
  return SIMULATION_RULES[version];
}
