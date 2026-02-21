// ============================================================
// src/types/offlineSimulation.ts
// Types and interfaces for offline simulation support
// ============================================================

import { SimulationHistoryEntry, SimulationOutcome } from '../services/simulationHistoryService';

/** Cached contract metadata for offline use. */
export interface CachedContract {
    /** Contract ID (address). */
    contractId: string;
    /** Contract source code (XDR or WASM). */
    wasmData?: Buffer | string;
    /** Contract spec/ABI. */
    spec?: Record<string, unknown>;
    /** Available functions. */
    functions: CachedFunction[];
    /** Timestamp when cached. */
    cachedAt: string;
    /** Network this contract was deployed to. */
    network: string;
    /** Source identity used. */
    source: string;
    /** Cache validity in milliseconds (default 7 days). */
    validityMs?: number;
}

/** Cached function information. */
export interface CachedFunction {
    name: string;
    parameters?: Array<{
        name: string;
        type: string;
    }>;
    returnType?: string;
}

/** Result of offline contract cache lookup. */
export interface CacheResult {
    found: boolean;
    contract?: CachedContract;
    error?: string;
}

/** Offline simulation parameters. */
export interface OfflineSimulationParams {
    contractId: string;
    functionName: string;
    args: unknown[];
    network: string;
    source: string;
}

/** Result of an offline simulation. */
export interface OfflineSimulationResult {
    contractId: string;
    functionName: string;
    args: unknown[];
    outcome: SimulationOutcome;
    result?: unknown;
    error?: string;
    errorType?: string;
    resourceUsage?: {
        cpuInstructions?: number;
        memoryBytes?: number;
    };
    executedAt: string;
    durationMs: number;
    source: 'offline-cache';
}

/** Offline mode state. */
export interface OfflineState {
    isOffline: boolean;
    lastOnlineCheck: string;
    networkStatus?: 'online' | 'offline' | 'degraded';
    failureReason?: string;
}

/** Options for offline simulation. */
export interface OfflineSimulationOptions {
    /** Allow cache hits to be used even if cached data is stale. */
    allowStaleCache?: boolean;
    /** Maximum cache age in milliseconds. */
    maxCacheAgeMs?: number;
    /** Automatically detect offline mode. */
    autoDetectOffline?: boolean;
    /** Fallback to similar cached contracts if exact match not found. */
    allowFuzzyMatching?: boolean;
}

/** Cache statistics. */
export interface CacheStats {
    totalCachedContracts: number;
    totalCacheSize: number;
    oldestCacheEntry?: string;
    newestCacheEntry?: string;
    validEntries: number;
    staleEntries: number;
}

/** Offline simulation validation error. */
export interface OfflineSimulationError {
    code:
        | 'CONTRACT_NOT_CACHED'
        | 'FUNCTION_NOT_FOUND'
        | 'FUNCTION_MISMATCH'
        | 'INVALID_PARAMS'
        | 'OFFLINE_MODE_REQUIRED'
        | 'CACHE_VALIDATION_FAILED'
        | 'SIMULATION_FAILED'
        | 'UNKNOWN';
    message: string;
    details?: Record<string, unknown>;
}
