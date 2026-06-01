import type { NetworkKey } from "@/lib/networkConfig";

export const queryKeys = {
  rpcHealth: (network: NetworkKey) => ["rpc-health", network] as const,
  horizonRoot: (horizonUrl: string) => ["horizon-root", horizonUrl] as const,
  horizonFeeStats: (horizonUrl: string) =>
    ["horizon-fee-stats", horizonUrl] as const,
  networkOverview: () => ["network-overview"] as const,
} as const;
