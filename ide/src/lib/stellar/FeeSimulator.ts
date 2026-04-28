/**
 * src/lib/stellar/FeeSimulator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fee Strategy Simulation for Congested Networks — Issue #654
 *
 * Simulates how different fee strategies affect transaction inclusion
 * probability on the Stellar network under varying congestion levels.
 *
 * Models supported:
 *  • conservative  – bids at the p50 of recently-charged fees
 *  • moderate      – bids at p75
 *  • aggressive    – bids at p95
 *  • custom        – caller supplies an explicit max_fee in stroops
 *
 * Usage:
 *   const sim = new FeeSimulator(feeStats);
 *   const result = sim.simulate("aggressive");
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { FeeStats } from "@/lib/feeDataService";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Named fee estimation strategies. */
export type FeeStrategyModel = "conservative" | "moderate" | "aggressive" | "custom";

/** Congestion tier derived from `ledger_capacity_usage`. */
export type CongestionLevel = "low" | "medium" | "high" | "critical";

/** Per-strategy simulation result. */
export interface FeeSimulationResult {
  strategy: FeeStrategyModel;
  /** Proposed max_fee in stroops. */
  proposedFee: number;
  /** Estimated probability of inclusion in the next ledger (0–1). */
  inclusionProbability: number;
  /** Human-readable label for UI priority badges. */
  priorityLabel: "Low" | "Medium" | "High" | "Critical";
  /** Hex colour token matching the priority level. */
  priorityColor: string;
  /** Estimated ledger wait time at current congestion (seconds). */
  estimatedWaitSeconds: number;
  /** Active congestion tier used for the estimate. */
  congestionLevel: CongestionLevel;
  /** Breakdown of percentile anchors used. */
  percentileAnchors: PercentileAnchors;
}

/** The percentile values extracted from Horizon's fee_stats payload. */
export interface PercentileAnchors {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  baseFee: number;
}

/** Options for a custom-fee simulation run. */
export interface CustomFeeOptions {
  /** Explicit max_fee in stroops (required when strategy === "custom"). */
  maxFeeStroops: number;
}

/** Full simulation report covering all built-in strategies. */
export interface FeeSimulationReport {
  network: string;
  generatedAt: string;
  congestionLevel: CongestionLevel;
  capacityUsage: number;
  percentileAnchors: PercentileAnchors;
  results: FeeSimulationResult[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal constants
// ─────────────────────────────────────────────────────────────────────────────

const STELLAR_BASE_FEE_STROOPS = 100;

/** Colour tokens for each priority level (matches Tailwind/CSS variables). */
const PRIORITY_COLORS: Record<string, string> = {
  Low: "#10b981",      // green-500
  Medium: "#f59e0b",   // amber-500
  High: "#ef4444",     // red-500
  Critical: "#dc2626", // red-600
};

/**
 * Inclusion probability curves per congestion tier.
 * Maps normalised fee ratio (proposed / p99) → probability.
 */
const INCLUSION_CURVE: Record<
  CongestionLevel,
  (ratio: number) => number
> = {
  low: (r) => Math.min(0.99, 0.7 + r * 0.29),
  medium: (r) => Math.min(0.97, 0.45 + r * 0.52),
  high: (r) => Math.min(0.94, 0.25 + r * 0.69),
  critical: (r) => Math.min(0.90, 0.10 + r * 0.80),
};

/** Estimated ledger wait in seconds per congestion tier given an inclusion probability. */
function estimateWait(congestion: CongestionLevel, probability: number): number {
  const ledgerSeconds = 5; // ~5 s per ledger on Stellar
  if (probability >= 0.9) return ledgerSeconds;
  if (probability >= 0.75) return ledgerSeconds * 2;
  if (probability >= 0.5) return ledgerSeconds * 4;
  const multipler: Record<CongestionLevel, number> = {
    low: 6,
    medium: 10,
    high: 20,
    critical: 40,
  };
  return ledgerSeconds * multipler[congestion];
}

// ─────────────────────────────────────────────────────────────────────────────
// FeeSimulator
// ─────────────────────────────────────────────────────────────────────────────

export class FeeSimulator {
  private readonly anchors: PercentileAnchors;
  private readonly congestion: CongestionLevel;
  private readonly capacityUsage: number;

  /**
   * @param feeStats   Live fee_stats payload fetched from Horizon.
   */
  constructor(feeStats: FeeStats) {
    this.anchors = FeeSimulator.extractAnchors(feeStats);
    this.capacityUsage = parseFloat(feeStats.ledger_capacity_usage ?? "0");
    this.congestion = FeeSimulator.classifyCongestion(this.capacityUsage);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Simulate a single fee strategy.
   *
   * @param strategy   Built-in model name, or "custom".
   * @param options    Required when strategy === "custom".
   */
  simulate(
    strategy: FeeStrategyModel,
    options?: CustomFeeOptions
  ): FeeSimulationResult {
    const proposedFee = this.resolveProposedFee(strategy, options);
    const inclusionProbability = this.computeInclusionProbability(proposedFee);
    const { priorityLabel, priorityColor } = this.derivePriority(inclusionProbability);
    const estimatedWaitSeconds = estimateWait(this.congestion, inclusionProbability);

    return {
      strategy,
      proposedFee,
      inclusionProbability,
      priorityLabel,
      priorityColor,
      estimatedWaitSeconds,
      congestionLevel: this.congestion,
      percentileAnchors: this.anchors,
    };
  }

  /**
   * Simulate all built-in strategies and return a full report.
   *
   * @param networkLabel   Human-readable network name for the report header.
   */
  simulateAll(networkLabel = "testnet"): FeeSimulationReport {
    const strategies: FeeStrategyModel[] = ["conservative", "moderate", "aggressive"];
    return {
      network: networkLabel,
      generatedAt: new Date().toISOString(),
      congestionLevel: this.congestion,
      capacityUsage: this.capacityUsage,
      percentileAnchors: this.anchors,
      results: strategies.map((s) => this.simulate(s)),
    };
  }

  /** Returns the current congestion classification. */
  getCongestionLevel(): CongestionLevel {
    return this.congestion;
  }

  /** Returns the extracted percentile anchors for external use (e.g. charts). */
  getPercentileAnchors(): PercentileAnchors {
    return { ...this.anchors };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private resolveProposedFee(
    strategy: FeeStrategyModel,
    options?: CustomFeeOptions
  ): number {
    const { p50, p75, p95 } = this.anchors;
    switch (strategy) {
      case "conservative":
        return Math.max(STELLAR_BASE_FEE_STROOPS, p50);
      case "moderate":
        return Math.max(STELLAR_BASE_FEE_STROOPS, p75);
      case "aggressive":
        return Math.max(STELLAR_BASE_FEE_STROOPS, p95);
      case "custom": {
        if (!options?.maxFeeStroops) {
          throw new Error('maxFeeStroops is required for the "custom" strategy.');
        }
        if (options.maxFeeStroops < STELLAR_BASE_FEE_STROOPS) {
          throw new Error(
            `maxFeeStroops must be ≥ ${STELLAR_BASE_FEE_STROOPS} (Stellar base fee).`
          );
        }
        return options.maxFeeStroops;
      }
    }
  }

  private computeInclusionProbability(proposedFee: number): number {
    const { p99 } = this.anchors;
    // Avoid division by zero for networks with static fees
    const p99Safe = p99 > 0 ? p99 : STELLAR_BASE_FEE_STROOPS;
    const ratio = proposedFee / p99Safe;
    const curve = INCLUSION_CURVE[this.congestion];
    return Math.round(curve(ratio) * 1000) / 1000;
  }

  private derivePriority(probability: number): {
    priorityLabel: FeeSimulationResult["priorityLabel"];
    priorityColor: string;
  } {
    let priorityLabel: FeeSimulationResult["priorityLabel"];
    if (probability >= 0.9) priorityLabel = "Critical"; // highest priority = most likely included
    else if (probability >= 0.75) priorityLabel = "High";
    else if (probability >= 0.5) priorityLabel = "Medium";
    else priorityLabel = "Low";

    return { priorityLabel, priorityColor: PRIORITY_COLORS[priorityLabel] };
  }

  // ── Static helpers ─────────────────────────────────────────────────────────

  private static extractAnchors(feeStats: FeeStats): PercentileAnchors {
    const fc = feeStats.fee_charged;
    return {
      p50: parseInt(fc.p50 ?? "100", 10) || STELLAR_BASE_FEE_STROOPS,
      p75: parseInt(fc.p70 ?? fc.p50 ?? "100", 10) || STELLAR_BASE_FEE_STROOPS,
      p90: parseInt(fc.p90 ?? "100", 10) || STELLAR_BASE_FEE_STROOPS,
      p95: parseInt(fc.p95 ?? "100", 10) || STELLAR_BASE_FEE_STROOPS,
      p99: parseInt(fc.p99 ?? "100", 10) || STELLAR_BASE_FEE_STROOPS,
      baseFee: parseInt(feeStats.last_ledger_base_fee ?? "100", 10) || STELLAR_BASE_FEE_STROOPS,
    };
  }

  static classifyCongestion(capacityUsage: number): CongestionLevel {
    if (capacityUsage < 0.4) return "low";
    if (capacityUsage < 0.7) return "medium";
    if (capacityUsage < 0.9) return "high";
    return "critical";
  }

  /**
   * Convenience factory — fetches live fee_stats from Horizon and constructs
   * a ready-to-use FeeSimulator instance.
   *
   * @param horizonUrl   e.g. "https://horizon-testnet.stellar.org"
   */
  static async fromNetwork(horizonUrl: string): Promise<FeeSimulator> {
    const response = await fetch(`${horizonUrl}/fee_stats`);
    if (!response.ok) {
      throw new Error(`Horizon fee_stats request failed: ${response.statusText}`);
    }
    const feeStats: FeeStats = await response.json();
    return new FeeSimulator(feeStats);
  }
}
