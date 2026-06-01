import { NETWORK_CONFIG, NetworkKey } from './networkConfig';

export interface FeeStats {
  last_ledger: string;
  last_ledger_base_fee: string;
  ledger_capacity_usage: string;
  fee_charged: {
    max: string;
    min: string;
    mode: string;
    p10: string;
    p20: string;
    p30: string;
    p40: string;
    p50: string;
    p60: string;
    p70: string;
    p80: string;
    p90: string;
    p95: string;
    p99: string;
  };
  max_fee: {
    max: string;
    min: string;
    mode: string;
    p10: string;
    p20: string;
    p30: string;
    p40: string;
    p50: string;
    p60: string;
    p70: string;
    p80: string;
    p90: string;
    p95: string;
    p99: string;
  };
}

export interface LedgerFeeData {
  sequence: number;
  base_fee: number | null;
  operation_count: number;
  tx_count: number | null;
  fee_pool: string;
  max_tx_set_size: number;
  timestamp: string;
}

export interface FeeRecommendation {
  low: number;
  average: number;
  high: number;
}

export interface FeeHistoryResult {
  history: LedgerFeeData[];
  stats: FeeStats;
}

export class FeeDataService {
  private static instance: FeeDataService;
  private cache: Map<string, { data: LedgerFeeData[]; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 1 minute cache

  static getInstance(): FeeDataService {
    if (!FeeDataService.instance) {
      FeeDataService.instance = new FeeDataService();
    }
    return FeeDataService.instance;
  }

  async getCurrentFeeStats(network: NetworkKey): Promise<FeeStats> {
    const horizonUrl = NETWORK_CONFIG[network].horizonUrl;
    const response = await fetch(`${horizonUrl}/fee_stats`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch fee stats: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getFeeHistory(network: NetworkKey, limit: number = 100): Promise<LedgerFeeData[]> {
    const cacheKey = `${network}-${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    const horizonUrl = NETWORK_CONFIG[network].horizonUrl;
    const response = await fetch(`${horizonUrl}/ledgers?order=desc&limit=${limit}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ledger history: ${response.statusText}`);
    }
    
    const data = await response.json();
    const ledgers = data._embedded?.records || [];
    
    const feeData: LedgerFeeData[] = ledgers.map((ledger: any) => ({
      sequence: parseInt(ledger.sequence),
      base_fee: ledger.base_fee ? parseInt(ledger.base_fee) : null,
      operation_count: ledger.operation_count || 0,
      tx_count: ledger.tx_count ? parseInt(ledger.tx_count) : null,
      fee_pool: ledger.fee_pool || "0",
      max_tx_set_size: ledger.max_tx_set_size || 1000,
      timestamp: ledger.closed_at || new Date().toISOString()
    })).reverse(); // Reverse to show chronological order

    this.cache.set(cacheKey, { data: feeData, timestamp: Date.now() });
    return feeData;
  }

  async getHistoricalFeeStats(network: NetworkKey, limit: number = 100): Promise<FeeHistoryResult> {
    const [history, stats] = await Promise.all([
      this.getFeeHistory(network, limit),
      this.getCurrentFeeStats(network)
    ]);

    return { history, stats };
  }

  calculateFeeRecommendations(feeHistory: LedgerFeeData[]): FeeRecommendation {
    if (feeHistory.length === 0) {
      return { low: 100, average: 100, high: 100 };
    }

    const recentFees = feeHistory.slice(-20); // Last 20 ledgers
    const validFees = recentFees
      .map(ledger => ledger.base_fee)
      .filter((fee): fee is number => fee !== null && fee > 0);

    if (validFees.length === 0) {
      return { low: 100, average: 100, high: 100 };
    }

    validFees.sort((a, b) => a - b);
    
    const low = validFees[Math.floor(validFees.length * 0.25)] || validFees[0];
    const average = validFees[Math.floor(validFees.length * 0.5)] || validFees[0];
    const high = validFees[Math.floor(validFees.length * 0.75)] || validFees[validFees.length - 1];

    return { low, average, high };
  }

  getFeeLevelColor(fee: number, recommendations: FeeRecommendation): string {
    if (fee <= recommendations.low) return '#10b981'; // green
    if (fee <= recommendations.average) return '#f59e0b'; // amber
    if (fee <= recommendations.high) return '#ef4444'; // red
    return '#dc2626'; // dark red
  }
}
