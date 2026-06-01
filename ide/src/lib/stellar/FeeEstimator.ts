import { NETWORK_CONFIG, NetworkKey } from "@/lib/networkConfig";
import { FeeDataService, FeeStats } from "@/lib/feeDataService";

export type FeePriority = "low" | "medium" | "high";

export interface CongestionLevel {
  level: "low" | "moderate" | "high" | "critical";
  capacityUsage: number;
  label: string;
  color: string;
}

export interface FeeEstimate {
  priority: FeePriority;
  fee: number;
  label: string;
  description: string;
  estimatedWaitLedgers: number;
}

export interface FeeEstimatorResult {
  congestion: CongestionLevel;
  estimates: Record<FeePriority, FeeEstimate>;
  baseFee: number;
  fetchedAt: string;
  network: NetworkKey;
}

const PRIORITY_CONFIG: Record<FeePriority, { label: string; description: string; multiplier: number; waitLedgers: number }> = {
  low: {
    label: "Low",
    description: "Best effort — may be delayed during congestion",
    multiplier: 1.0,
    waitLedgers: 10,
  },
  medium: {
    label: "Medium",
    description: "Balanced cost and inclusion speed",
    multiplier: 1.5,
    waitLedgers: 3,
  },
  high: {
    label: "High",
    description: "Priority inclusion — recommended during high traffic",
    multiplier: 2.5,
    waitLedgers: 1,
  },
};

function parseCongestion(stats: FeeStats): CongestionLevel {
  const usage = parseFloat(stats.ledger_capacity_usage);

  if (usage < 0.3) {
    return { level: "low", capacityUsage: usage, label: "Low Congestion", color: "#10b981" };
  }
  if (usage < 0.6) {
    return { level: "moderate", capacityUsage: usage, label: "Moderate Congestion", color: "#f59e0b" };
  }
  if (usage < 0.85) {
    return { level: "high", capacityUsage: usage, label: "High Congestion", color: "#ef4444" };
  }
  return { level: "critical", capacityUsage: usage, label: "Critical Congestion", color: "#dc2626" };
}

function deriveBaseFee(stats: FeeStats): number {
  // Use p50 of fee_charged as the realistic baseline
  const p50 = parseInt(stats.fee_charged.p50, 10);
  const lastBase = parseInt(stats.last_ledger_base_fee, 10);
  return Math.max(p50, lastBase, 100);
}

function buildEstimates(baseFee: number, congestion: CongestionLevel): Record<FeePriority, FeeEstimate> {
  const congestionBoost = congestion.level === "critical" ? 1.5 : congestion.level === "high" ? 1.2 : 1.0;

  return (["low", "medium", "high"] as FeePriority[]).reduce((acc, priority) => {
    const cfg = PRIORITY_CONFIG[priority];
    const fee = Math.ceil(baseFee * cfg.multiplier * congestionBoost);
    acc[priority] = {
      priority,
      fee,
      label: cfg.label,
      description: cfg.description,
      estimatedWaitLedgers: congestion.level === "critical" && priority === "low"
        ? cfg.waitLedgers * 5
        : cfg.waitLedgers,
    };
    return acc;
  }, {} as Record<FeePriority, FeeEstimate>);
}

export class FeeEstimator {
  private static instance: FeeEstimator;
  private feeDataService: FeeDataService;
  private cache: Map<NetworkKey, { result: FeeEstimatorResult; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 15_000; // 15 seconds — fresher than feeDataService

  private constructor() {
    this.feeDataService = FeeDataService.getInstance();
  }

  static getInstance(): FeeEstimator {
    if (!FeeEstimator.instance) {
      FeeEstimator.instance = new FeeEstimator();
    }
    return FeeEstimator.instance;
  }

  async estimate(network: NetworkKey): Promise<FeeEstimatorResult> {
    const cached = this.cache.get(network);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.result;
    }

    const stats = await this.feeDataService.getCurrentFeeStats(network);
    const congestion = parseCongestion(stats);
    const baseFee = deriveBaseFee(stats);
    const estimates = buildEstimates(baseFee, congestion);

    const result: FeeEstimatorResult = {
      congestion,
      estimates,
      baseFee,
      fetchedAt: new Date().toISOString(),
      network,
    };

    this.cache.set(network, { result, timestamp: Date.now() });
    return result;
  }

  getFeeForPriority(result: FeeEstimatorResult, priority: FeePriority): number {
    return result.estimates[priority].fee;
  }

  invalidateCache(network?: NetworkKey): void {
    if (network) {
      this.cache.delete(network);
    } else {
      this.cache.clear();
    }
  }

  /** Returns Horizon fee_stats URL for the given network */
  static getHorizonFeeStatsUrl(network: NetworkKey): string {
    return `${NETWORK_CONFIG[network].horizonUrl}/fee_stats`;
  }
}
