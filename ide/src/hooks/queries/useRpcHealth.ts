"use client";

import { useQuery } from "@tanstack/react-query";
import { NETWORK_CONFIG, NetworkKey } from "@/lib/networkConfig";
import { queryKeys } from "./queryKeys";

export interface HealthResponse {
  status?: string;
  latest_ledger?: number;
  core_version?: string;
  ingest_latest_ledger?: number;
  oldest_ledger?: number;
  oldest_ledger_header?: string;
  latest_ledger_close_time?: number;
  network_ledger_version?: number;
  protocol_version?: number;
  queue_size?: number;
  current_ledger_protocol_version?: number;
  core_supported_protocol_version?: number;
  [key: string]: unknown;
}

async function fetchRpcHealth(network: NetworkKey): Promise<HealthResponse> {
  const rpcUrl =
    network === "local"
      ? "http://localhost:8000"
      : NETWORK_CONFIG[network].horizon;

  const response = await fetch(`${rpcUrl}/health`);

  if (!response.ok) {
    const err = new Error(
      `HTTP ${response.status}: ${response.statusText}`,
    ) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  return response.json();
}

export function useRpcHealth(network: NetworkKey) {
  return useQuery({
    queryKey: queryKeys.rpcHealth(network),
    queryFn: () => fetchRpcHealth(network),
    staleTime: 15_000,
  });
}
