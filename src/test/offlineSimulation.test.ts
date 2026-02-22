// ============================================================
// src/test/offlineSimulation.test.ts
// Comprehensive unit tests for offline simulation functionality.
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { ContractCacheService } from '../services/contractCacheService';
import { OfflineModeDetectionService } from '../services/offlineModeDetectionService';
import { OfflineSimulationService } from '../services/offlineSimulationService';
import { CachedContract } from '../types/offlineSimulation';

// ── Mock helpers ──────────────────────────────────────────────

function createMockContext() {
    const store: Record<string, unknown> = {};
    return {
        workspaceState: {
            get<T>(key: string, defaultValue?: T): T | undefined {
                return (store[key] as T) ?? defaultValue;
            },
            update(key: string, value: unknown): Promise<void> {
                store[key] = value;
                return Promise.resolve();
            },
            keys: () => Object.keys(store) as readonly string[],
        },
    };
}

function createMockOutputChannel() {
    return {
        appendLine: (_msg: string) => {
            // Silent
        },
    };
}

function createMockHistoryService() {
    return {
        addEntry: async (_entry: unknown) => {},
        getEntry: (_id: string) => null,
    };
}

// ── ContractCacheService Tests ────────────────────────────────

async function testCacheContract() {
    const context = createMockContext();
    const cacheService = new ContractCacheService(context as any, createMockOutputChannel());
    const contract: CachedContract = {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        network: 'testnet',
        source: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        functions: [
            {
                name: 'transfer',
                parameters: [
                    { name: 'to', type: 'Address' },
                    { name: 'amount', type: 'i128' },
                ],
                returnType: 'void',
            },
        ],
        cachedAt: new Date().toISOString(),
    };

    await cacheService.cacheContract(contract);
    const result = cacheService.getContract(
        contract.contractId,
        contract.network,
        contract.source
    );

    assert.strictEqual(result.found, true);
    assert.strictEqual(result.contract?.contractId, contract.contractId);
    console.log('  [ok] cacheContract stores contract and retrieves it');
}

async function testGetContractNotFound() {
    const context = createMockContext();
    const cacheService = new ContractCacheService(context as any, createMockOutputChannel());

    const result = cacheService.getContract(
        'CNONEXISTENT',
        'testnet',
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    );

    assert.strictEqual(result.found, false);
    assert.ok(result.error);
    console.log('  [ok] getContract returns not found for uncached contract');
}

async function testRemoveContract() {
    const context = createMockContext();
    const cacheService = new ContractCacheService(context as any, createMockOutputChannel());
    const contract: CachedContract = {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        network: 'testnet',
        source: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        functions: [],
        cachedAt: new Date().toISOString(),
    };

    await cacheService.cacheContract(contract);
    await cacheService.removeContract(
        contract.contractId,
        contract.network,
        contract.source
    );

    const result = cacheService.getContract(
        contract.contractId,
        contract.network,
        contract.source
    );

    assert.strictEqual(result.found, false);
    console.log('  [ok] removeContract deletes cached contract');
}

async function testGetCacheStats() {
    const context = createMockContext();
    const cacheService = new ContractCacheService(context as any, createMockOutputChannel());
    const contract: CachedContract = {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        network: 'testnet',
        source: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        functions: [],
        cachedAt: new Date().toISOString(),
    };

    await cacheService.cacheContract(contract);
    const stats = cacheService.getStats();

    assert.strictEqual(stats.totalCachedContracts, 1);
    assert.ok(stats.validEntries > 0);
    console.log('  [ok] getStats returns cache statistics');
}

async function testSearchContracts() {
    const context = createMockContext();
    const cacheService = new ContractCacheService(context as any, createMockOutputChannel());
    const contract: CachedContract = {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        network: 'testnet',
        source: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        functions: [{ name: 'transfer', parameters: [], returnType: 'void' }],
        cachedAt: new Date().toISOString(),
    };

    await cacheService.cacheContract(contract);
    const results = cacheService.searchContracts('transfer');

    assert.strictEqual(results.length, 1);
    assert.ok(results[0].functions.some((f) => f.name === 'transfer'));
    console.log('  [ok] searchContracts finds contracts by pattern');
}

async function testClearCache() {
    const context = createMockContext();
    const cacheService = new ContractCacheService(context as any, createMockOutputChannel());
    const contract: CachedContract = {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        network: 'testnet',
        source: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        functions: [],
        cachedAt: new Date().toISOString(),
    };

    await cacheService.cacheContract(contract);
    await cacheService.clearCache();

    const stats = cacheService.getStats();
    assert.strictEqual(stats.totalCachedContracts, 0);
    console.log('  [ok] clearCache removes all entries');
}

// ── OfflineModeDetectionService Tests ─────────────────────────

async function testDefaultOnlineMode() {
    const context = createMockContext();
    const offlineModeService = new OfflineModeDetectionService(
        context as any,
        createMockOutputChannel()
    );

    assert.strictEqual(offlineModeService.isOffline(), false);
    console.log('  [ok] defaults to online mode');
}

async function testSetOfflineMode() {
    const context = createMockContext();
    const offlineModeService = new OfflineModeDetectionService(
        context as any,
        createMockOutputChannel()
    );

    await offlineModeService.setOfflineMode(true, 'Test reason');
    assert.strictEqual(offlineModeService.isOffline(), true);

    const state = offlineModeService.getOfflineState();
    assert.strictEqual(state.networkStatus, 'offline');
    console.log('  [ok] setOfflineMode enables offline mode');
}

async function testSetOnlineMode() {
    const context = createMockContext();
    const offlineModeService = new OfflineModeDetectionService(
        context as any,
        createMockOutputChannel()
    );

    await offlineModeService.setOfflineMode(true);
    await offlineModeService.setOfflineMode(false);

    assert.strictEqual(offlineModeService.isOffline(), false);
    const state = offlineModeService.getOfflineState();
    assert.strictEqual(state.networkStatus, 'online');
    console.log('  [ok] setOfflineMode disables offline mode');
}

async function testTimeSinceLastOnlineCheck() {
    const context = createMockContext();
    const offlineModeService = new OfflineModeDetectionService(
        context as any,
        createMockOutputChannel()
    );

    await offlineModeService.setOfflineMode(false);
    const timeSinceCheck = offlineModeService.getTimeSinceLastOnlineCheck();

    assert.ok(timeSinceCheck >= 0, 'Time since check should be non-negative');
    console.log('  [ok] getTimeSinceLastOnlineCheck returns valid time');
}

async function testResetOfflineState() {
    const context = createMockContext();
    const offlineModeService = new OfflineModeDetectionService(
        context as any,
        createMockOutputChannel()
    );

    await offlineModeService.setOfflineMode(true);
    await offlineModeService.reset();

    assert.strictEqual(offlineModeService.isOffline(), false);
    console.log('  [ok] reset restores default state');
}

// ── OfflineSimulationService Tests ────────────────────────────

async function testValidateOfflineSimulationPossible() {
    const context = createMockContext();
    const cacheService = new ContractCacheService(context as any, createMockOutputChannel());
    const modeDetectionService = new OfflineModeDetectionService(
        context as any,
        createMockOutputChannel()
    );
    const historyService = createMockHistoryService() as any;
    const offlineService = new OfflineSimulationService(
        cacheService,
        modeDetectionService,
        historyService,
        createMockOutputChannel()
    );

    const contract: CachedContract = {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        network: 'testnet',
        source: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        functions: [
            {
                name: 'transfer',
                parameters: [{ name: 'amount', type: 'i128' }],
                returnType: 'void',
            },
        ],
        cachedAt: new Date().toISOString(),
    };

    await cacheService.cacheContract(contract);

    const validation = offlineService.validateOfflineSimulationPossible({
        contractId: contract.contractId,
        functionName: 'transfer',
        args: [100],
        network: contract.network,
        source: contract.source,
    });

    assert.strictEqual(validation.possible, true);
    console.log('  [ok] validateOfflineSimulationPossible validates cached contracts');
}

async function testSimulateOfflineUncachedContract() {
    const context = createMockContext();
    const cacheService = new ContractCacheService(context as any, createMockOutputChannel());
    const modeDetectionService = new OfflineModeDetectionService(
        context as any,
        createMockOutputChannel()
    );
    const historyService = createMockHistoryService() as any;
    const offlineService = new OfflineSimulationService(
        cacheService,
        modeDetectionService,
        historyService,
        createMockOutputChannel()
    );

    const result = await offlineService.simulateOffline({
        contractId: 'CNONEXISTENT',
        functionName: 'transfer',
        args: [],
        network: 'testnet',
        source: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });

    assert.ok('code' in result && result.code === 'CONTRACT_NOT_CACHED');
    console.log('  [ok] simulateOffline returns error for uncached contract');
}

async function testSimulateOfflineMissingFunction() {
    const context = createMockContext();
    const cacheService = new ContractCacheService(context as any, createMockOutputChannel());
    const modeDetectionService = new OfflineModeDetectionService(
        context as any,
        createMockOutputChannel()
    );
    const historyService = createMockHistoryService() as any;
    const offlineService = new OfflineSimulationService(
        cacheService,
        modeDetectionService,
        historyService,
        createMockOutputChannel()
    );

    const contract: CachedContract = {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        network: 'testnet',
        source: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        functions: [{ name: 'transfer', parameters: [], returnType: 'void' }],
        cachedAt: new Date().toISOString(),
    };

    await cacheService.cacheContract(contract);

    const result = await offlineService.simulateOffline({
        contractId: contract.contractId,
        functionName: 'nonexistent',
        args: [],
        network: contract.network,
        source: contract.source,
    });

    assert.ok('code' in result && result.code === 'FUNCTION_NOT_FOUND');
    console.log('  [ok] simulateOffline returns error for missing function');
}

async function testGetOfflineStatus() {
    const context = createMockContext();
    const cacheService = new ContractCacheService(context as any, createMockOutputChannel());
    const modeDetectionService = new OfflineModeDetectionService(
        context as any,
        createMockOutputChannel()
    );
    const historyService = createMockHistoryService() as any;
    const offlineService = new OfflineSimulationService(
        cacheService,
        modeDetectionService,
        historyService,
        createMockOutputChannel()
    );

    const contract: CachedContract = {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        network: 'testnet',
        source: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        functions: [],
        cachedAt: new Date().toISOString(),
    };

    await cacheService.cacheContract(contract);

    const status = offlineService.getOfflineStatus();

    assert.strictEqual(status.cachedContractCount, 1);
    assert.ok(typeof status.isOfflineMode === 'boolean');
    assert.ok(typeof status.canSimulateOffline === 'boolean');
    console.log('  [ok] getOfflineStatus returns valid status');
}

// ── Test runner ───────────────────────────────────────────────

(async () => {
    console.log('\nOffline Simulation unit tests');

    const tests = [
        // ContractCacheService
        testCacheContract,
        testGetContractNotFound,
        testRemoveContract,
        testGetCacheStats,
        testSearchContracts,
        testClearCache,

        // OfflineModeDetectionService
        testDefaultOnlineMode,
        testSetOfflineMode,
        testSetOnlineMode,
        testTimeSinceLastOnlineCheck,
        testResetOfflineState,

        // OfflineSimulationService
        testValidateOfflineSimulationPossible,
        testSimulateOfflineUncachedContract,
        testSimulateOfflineMissingFunction,
        testGetOfflineStatus,
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            await test();
            passed++;
        } catch (err) {
            console.log(`  [fail] ${test.name}`);
            console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
            failed++;
        }
    }

    console.log(`\n${tests.length} tests: ${passed} passed, ${failed} failed\n`);

    if (failed > 0) {
        process.exitCode = 1;
    }
})().catch((err) => {
    console.error('Test runner crashed:', err);
    process.exitCode = 1;
});
