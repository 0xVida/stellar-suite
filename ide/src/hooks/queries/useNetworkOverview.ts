"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

export interface NetworkOverviewConfig {
  name: string;
  horizonUrl: string;
  passphrase: string;
  color?: string;
}

export interface NetworkOverviewInfo extends NetworkOverviewConfig {
  status: "online" | "offline" | "error";
  ledgerHeight: number;
  protocolVersion: number;
  latestVersion?: string;
  baseReserve?: number;
  feeStats?: {
    min: number;
    max: number;
    avg: number;
  };
}

const DEFAULT_NETWORK_CONFIGS: NetworkOverviewConfig[] = [
  {
    name: "Mainnet",
    horizonUrl: "https://horizon.stellar.org",
    passphrase: "Public Global Stellar Network ; September 2015",
    color: "bg-green-500",
  },
  {
    name: "Testnet",
    horizonUrl: "https://horizon-testnet.stellar.org",
    passphrase: "Test SDF Network ; September 2015",
    color: "bg-blue-500",
  },
  {
    name: "Futurenet",
    horizonUrl: "https://horizon-futurenet.stellar.org",
    passphrase: "Test SDF Future Network ; October 2022",
    color: "bg-purple-500",
  },
];

async function fetchNetworkSnapshot(
  config: NetworkOverviewConfig,
): Promise<NetworkOverviewInfo> {
  try {
    const response = await fetch(`${config.horizonUrl}/`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const feeResponse = await fetch(`${config.horizonUrl}/fee_stats`).catch(
      () => null,
    );
    const feeData = feeResponse?.ok ? await feeResponse.json() : null;

    return {
      ...config,
      status: "online",
      ledgerHeight: data.ledger_sequence || 0,
      protocolVersion: data.protocol_version || 0,
      latestVersion: data.stellar_core_version || "Unknown",
      baseReserve: data.base_reserve_stroops || 0,
      feeStats: feeData
        ? {
            min: feeData.min_fee?.p50 || 0,
            max: feeData.max_fee?.p50 || 0,
            avg: feeData.fee_charged?.p50 || 0,
          }
        : undefined,
    };
  } catch {
    return {
      ...config,
      status: "offline",
      ledgerHeight: 0,
      protocolVersion: 0,
      latestVersion: "Unknown",
      baseReserve: 0,
      feeStats: undefined,
    };
  }
}

export function useNetworkOverview(
  configs: NetworkOverviewConfig[] = DEFAULT_NETWORK_CONFIGS,
) {
  return useQuery({
    queryKey: queryKeys.networkOverview(),
    queryFn: () => Promise.all(configs.map(fetchNetworkSnapshot)),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export { DEFAULT_NETWORK_CONFIGS };
