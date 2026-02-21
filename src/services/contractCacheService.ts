// ============================================================
// src/services/contractCacheService.ts
// Manages local contract cache for offline simulation support.
// Handles caching, validation, and eviction of contract data.
// ============================================================

import {
    CachedContract,
    CacheResult,
    CacheStats,
    CachedFunction,
} from '../types/offlineSimulation';

// ── Minimal VS Code-compatible interfaces ──────────────────────

interface SimpleOutputChannel {
    appendLine(value: string): void;
}

interface SimpleWorkspaceState {
    get<T>(key: string, defaultValue?: T): T | undefined;
    update(key: string, value: unknown): Thenable<void>;
    keys(): readonly string[];
}

interface SimpleExtensionContext {
    workspaceState: SimpleWorkspaceState;
}

// ── Internal constants ────────────────────────────────────────

const CONTRACT_CACHE_KEY = 'stellarSuite.contractCache';
const MAX_CACHE_ENTRIES = 100;
const DEFAULT_CACHE_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Service class ─────────────────────────────────────────────

/**
 * ContractCacheService manages local caching of contract metadata and WASM files.
 *
 * Responsibilities:
 * - Storing contract data locally for offline access
 * - Validating cache freshness
 * - Limiting cache size and evicting stale entries
 * - Providing cache statistics and management
 */
export class ContractCacheService {
    private cache: Map<string, CachedContract> = new Map();
    private outputChannel: SimpleOutputChannel;

    constructor(
        private readonly context: SimpleExtensionContext,
        outputChannel?: SimpleOutputChannel
    ) {
        this.outputChannel = outputChannel ?? {
            appendLine: (_msg: string) => { /* no-op */ },
        };
        this.loadCacheFromStorage();
    }

    // ── Public API ────────────────────────────────────────────

    /**
     * Cache a contract for offline use.
     */
    public async cacheContract(contract: CachedContract): Promise<void> {
        const key = `${contract.contractId}:${contract.network}:${contract.source}`;

        try {
            // Enforce cache size limit
            if (this.cache.size >= MAX_CACHE_ENTRIES && !this.cache.has(key)) {
                this.evictLRU();
            }

            this.cache.set(key, {
                ...contract,
                cachedAt: new Date().toISOString(),
                validityMs: contract.validityMs ?? DEFAULT_CACHE_VALIDITY_MS,
            });

            await this.saveCacheToStorage();
            this.outputChannel.appendLine(`[ContractCache] Cached contract: ${key}`);
        } catch (error) {
            this.outputChannel.appendLine(
                `[ContractCache] Error caching contract: ${error instanceof Error ? error.message : String(error)}`
            );
            throw error;
        }
    }

    /**
     * Retrieve a cached contract by contract ID, network, and source.
     */
    public getContract(
        contractId: string,
        network: string,
        source: string
    ): CacheResult {
        const key = `${contractId}:${network}:${source}`;
        const contract = this.cache.get(key);

        if (!contract) {
            return {
                found: false,
                error: `Contract not found in cache: ${key}`,
            };
        }

        // Check cache validity
        if (this.isCacheExpired(contract)) {
            return {
                found: false,
                error: `Cached contract is expired: ${key}`,
            };
        }

        return { found: true, contract };
    }

    /**
     * Remove a contract from cache.
     */
    public async removeContract(
        contractId: string,
        network: string,
        source: string
    ): Promise<void> {
        const key = `${contractId}:${network}:${source}`;
        this.cache.delete(key);
        await this.saveCacheToStorage();
        this.outputChannel.appendLine(`[ContractCache] Removed contract: ${key}`);
    }

    /**
     * Clear entire cache.
     */
    public async clearCache(): Promise<void> {
        this.cache.clear();
        await this.context.workspaceState.update(CONTRACT_CACHE_KEY, undefined);
        this.outputChannel.appendLine('[ContractCache] Cache cleared');
    }

    /**
     * Get cache statistics.
     */
    public getStats(): CacheStats {
        const entries = Array.from(this.cache.values());
        const validEntries = entries.filter((c) => !this.isCacheExpired(c));
        const staleEntries = entries.filter((c) => this.isCacheExpired(c));

        const timestamps = entries.map((c) => c.cachedAt).sort();

        return {
            totalCachedContracts: this.cache.size,
            totalCacheSize: this.estimateCacheSize(),
            oldestCacheEntry: timestamps[0],
            newestCacheEntry: timestamps[timestamps.length - 1],
            validEntries: validEntries.length,
            staleEntries: staleEntries.length,
        };
    }

    /**
     * Search for contracts matching a pattern.
     */
    public searchContracts(pattern: string): CachedContract[] {
        const regex = new RegExp(pattern, 'i');
        return Array.from(this.cache.values()).filter(
            (c) => regex.test(c.contractId) || c.functions.some((f) => regex.test(f.name))
        );
    }

    /**
     * Update contract function metadata.
     */
    public async updateContractFunctions(
        contractId: string,
        network: string,
        source: string,
        functions: CachedFunction[]
    ): Promise<void> {
        const result = this.getContract(contractId, network, source);
        if (result.found && result.contract) {
            result.contract.functions = functions;
            await this.cacheContract(result.contract);
        }
    }

    /**
     * Get all cached contracts.
     */
    public getAllCachedContracts(): CachedContract[] {
        return Array.from(this.cache.values());
    }

    // ── Internal helpers ──────────────────────────────────────

    private isCacheExpired(contract: CachedContract): boolean {
        const cacheDuration = contract.validityMs ?? DEFAULT_CACHE_VALIDITY_MS;
        const cacheTime = new Date(contract.cachedAt).getTime();
        const currentTime = new Date().getTime();
        return currentTime - cacheTime > cacheDuration;
    }

    private evictLRU(): void {
        let lruKey: string | null = null;
        let lruTime = Infinity;

        for (const [key, contract] of this.cache.entries()) {
            const time = new Date(contract.cachedAt).getTime();
            if (time < lruTime) {
                lruTime = time;
                lruKey = key;
            }
        }

        if (lruKey) {
            this.cache.delete(lruKey);
            this.outputChannel.appendLine(`[ContractCache] Evicted LRU entry: ${lruKey}`);
        }
    }

    private estimateCacheSize(): number {
        let size = 0;
        for (const contract of this.cache.values()) {
            size += JSON.stringify(contract).length;
        }
        return size;
    }

    private async loadCacheFromStorage(): Promise<void> {
        try {
            const stored = this.context.workspaceState.get<Record<string, CachedContract>>(
                CONTRACT_CACHE_KEY,
                {}
            );
            if (stored) {
                this.cache = new Map(Object.entries(stored));
            }
        } catch (error) {
            this.outputChannel.appendLine(
                `[ContractCache] Error loading cache from storage: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async saveCacheToStorage(): Promise<void> {
        try {
            const cacheObject = Object.fromEntries(this.cache);
            await this.context.workspaceState.update(CONTRACT_CACHE_KEY, cacheObject);
        } catch (error) {
            this.outputChannel.appendLine(
                `[ContractCache] Error saving cache to storage: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}
