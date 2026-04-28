const NETWORK_RPC_URLS: Record<string, string> = {
  testnet: "https://soroban-testnet.stellar.org",
  mainnet: "https://mainnet.stellar.gateway.fm",
  localnet: "http://localhost:8000/soroban/rpc",
  futurenet: "https://rpc-futurenet.stellar.org",
};

export interface LatestLedger {
  id: string;
  sequence: number;
  protocolVersion: string;
}

export interface LedgerEntry {
  key: string;
  xdr: string;
  lastModifiedLedgerSeq: number;
  liveUntilLedgerSeq?: number;
}

interface RpcResponse<T> {
  result: T;
  error?: { code: number; message: string };
}

interface GetLedgerEntriesResult {
  entries: LedgerEntry[] | null;
  latestLedger: number;
}

interface CacheRecord {
  data: unknown;
  timestamp: number;
}

const cache = new Map<string, CacheRecord>();
const CACHE_TTL_MS = 5_000;

async function rpcFetch<T>(
  network: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const cacheKey = `${network}::${method}::${JSON.stringify(params)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.timestamp < CACHE_TTL_MS) {
    return hit.data as T;
  }

  const url = NETWORK_RPC_URLS[network] ?? NETWORK_RPC_URLS.testnet;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const json: RpcResponse<T> = await res.json();
  if (json.error) {
    throw new Error(`RPC error (${json.error.code}): ${json.error.message}`);
  }

  cache.set(cacheKey, { data: json.result, timestamp: Date.now() });
  return json.result;
}

export async function fetchLatestLedger(network: string): Promise<LatestLedger> {
  return rpcFetch<LatestLedger>(network, "getLatestLedger");
}

export async function fetchLedgerEntries(
  network: string,
  keys: string[]
): Promise<{ entries: LedgerEntry[]; latestLedger: number }> {
  if (keys.length === 0) return { entries: [], latestLedger: 0 };
  const result = await rpcFetch<GetLedgerEntriesResult>(network, "getLedgerEntries", { keys });
  return {
    entries: result.entries ?? [],
    latestLedger: result.latestLedger,
  };
}

export function clearRpcCache(): void {
  cache.clear();
}

export function getRpcUrl(network: string): string {
  return NETWORK_RPC_URLS[network] ?? NETWORK_RPC_URLS.testnet;
}
