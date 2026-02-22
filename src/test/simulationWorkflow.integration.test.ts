// ============================================================
// src/test/simulationWorkflow.integration.test.ts
// Integration tests for complete simulation workflow
//
// Run with: npm run test:simulation-workflow-integration
// Run with real CLI/RPC: STELLAR_SUITE_RUN_REAL_SIMULATION=1 npm run test:simulation-workflow-integration
// ============================================================

declare function require(name: string): any;
declare const process: {
    env: Record<string, string | undefined>;
    exitCode?: number;
};

const assert = require('assert');

import { SimulationHistoryService } from '../services/simulationHistoryService';
import { SimulationCacheCore } from '../services/simulationCacheCore';
import { StateDiffService } from '../services/stateDiffService';
import { StateCaptureService } from '../services/stateCaptureService';
import { makeSimulationCacheKey } from '../services/simulationCacheKey';
import { SimulationResult } from '../services/sorobanCliService';
import {
    SimulationFixtures,
    SimulationFixtureFactory,
} from './fixtures/simulationFixtures';

// ── Mock context helpers ──────────────────────────────────────

function createMockContext() {
    const store: Record<string, unknown> = {};
    return {
        workspaceState: {
            get<T>(key: string, defaultValue: T): T {
                return (store[key] as T) ?? defaultValue;
            },
            update(key: string, value: unknown): Promise<void> {
                store[key] = value;
                return Promise.resolve();
            },
        },
        _store: store,
    };
}

function createMockOutputChannel() {
    const lines: string[] = [];
    return {
        appendLine(value: string) {
            lines.push(value);
        },
        lines,
    };
}

// ── Test environment setup ────────────────────────────────────

interface TestEnvironment {
    historyService: SimulationHistoryService;
    cacheService: SimulationCacheCore<SimulationResult>;
    stateDiffService: StateDiffService;
    stateCaptureService: StateCaptureService;
    context: ReturnType<typeof createMockContext>;
    outputChannel: ReturnType<typeof createMockOutputChannel>;
}

function createTestEnvironment(): TestEnvironment {
    const context = createMockContext();
    const outputChannel = createMockOutputChannel();
    const historyService = new SimulationHistoryService(context, outputChannel);
    const cacheService = new SimulationCacheCore<SimulationResult>({
        enabled: true,
        ttlMs: 60000,
        maxEntries: 100,
    });
    const stateDiffService = new StateDiffService();
    const stateCaptureService = new StateCaptureService();

    return {
        historyService,
        cacheService,
        stateDiffService,
        stateCaptureService,
        context,
        outputChannel,
    };
}

// ── Integration Tests ─────────────────────────────────────────

async function testCompleteSimulationFlowSuccess() {
    const env = createTestEnvironment();

    // 1. Simulate parameter input
    const contractId = SimulationFixtures.TEST_CONTRACT_ID;
    const functionName = 'transfer';
    const args = [SimulationFixtures.TRANSFER_PARAMS];

    // 2. Execute simulation (mocked)
    const simulationResult = SimulationFixtureFactory.createSuccessResult({
        result: true,
        resourceUsage: {
            cpuInstructions: 1234567,
            memoryBytes: 8192,
        },
    });

    // 3. Capture state snapshots
    const stateBefore = SimulationFixtures.STATE_SNAPSHOT_BEFORE;
    const stateAfter = SimulationFixtures.STATE_SNAPSHOT_AFTER;
    const stateDiff = env.stateDiffService.calculateDiff(stateBefore, stateAfter);

    // 4. Record in history
    const historyEntry = await env.historyService.recordSimulation({
        contractId,
        functionName,
        args,
        outcome: 'success',
        result: simulationResult.result,
        resourceUsage: simulationResult.resourceUsage,
        network: 'testnet',
        source: 'dev',
        method: 'cli',
        durationMs: 1234,
        stateSnapshotBefore: stateBefore,
        stateSnapshotAfter: stateAfter,
        stateDiff,
    });

    // 5. Cache the result
    const cacheKey = makeSimulationCacheKey({
        backend: 'cli',
        contractId,
        functionName,
        args,
        network: 'testnet',
        source: 'dev',
    });
    env.cacheService.set(cacheKey, simulationResult);

    // ── Assertions ────────────────────────────────────────────

    // Verify history entry
    assert.ok(historyEntry.id, 'history entry should have an id');
    assert.strictEqual(historyEntry.contractId, contractId);
    assert.strictEqual(historyEntry.functionName, functionName);
    assert.strictEqual(historyEntry.outcome, 'success');
    assert.ok(historyEntry.result);
    assert.ok(historyEntry.resourceUsage);
    assert.ok(historyEntry.stateSnapshotBefore);
    assert.ok(historyEntry.stateSnapshotAfter);
    assert.ok(historyEntry.stateDiff);

    // Verify state diff
    assert.strictEqual(stateDiff.hasChanges, true);
    assert.strictEqual(stateDiff.modified.length, 2); // alice and bob balances changed
    assert.strictEqual(stateDiff.created.length, 0);
    assert.strictEqual(stateDiff.deleted.length, 0);

    // Verify cache
    const cachedResult = env.cacheService.get(cacheKey);
    assert.ok(cachedResult);
    assert.strictEqual(cachedResult!.success, true);
    assert.deepStrictEqual(cachedResult!.result, simulationResult.result);

    // Verify history retrieval
    const retrieved = env.historyService.getEntry(historyEntry.id);
    assert.ok(retrieved);
    assert.strictEqual(retrieved!.id, historyEntry.id);

    console.log('  [ok] complete simulation flow (success path)');
}

async function testCompleteSimulationFlowFailure() {
    const env = createTestEnvironment();

    const contractId = SimulationFixtures.TEST_CONTRACT_ID;
    const functionName = 'transfer';
    const args = [{ from: 'GABC123', to: 'GXYZ789', amount: 999999 }];

    // Simulate execution failure
    const simulationResult = SimulationFixtureFactory.createFailureResult(
        'insufficient balance',
        {
            errorType: 'execution',
            errorCode: 'CONTRACT_ERROR',
            errorSuggestions: ['Check account balance before transfer'],
        }
    );

    // Record failure in history
    const historyEntry = await env.historyService.recordSimulation({
        contractId,
        functionName,
        args,
        outcome: 'failure',
        error: simulationResult.error,
        errorType: simulationResult.errorType,
        network: 'testnet',
        source: 'dev',
        method: 'cli',
        durationMs: 567,
    });

    // ── Assertions ────────────────────────────────────────────

    assert.strictEqual(historyEntry.outcome, 'failure');
    assert.ok(historyEntry.error);
    assert.strictEqual(historyEntry.error, 'insufficient balance');
    assert.strictEqual(historyEntry.errorType, 'execution');
    assert.strictEqual(historyEntry.result, undefined, 'result should be undefined on failure');

    // Verify history query by outcome
    const failures = env.historyService.queryHistory({ filter: { outcome: 'failure' } });
    assert.strictEqual(failures.length, 1);
    assert.strictEqual(failures[0].id, historyEntry.id);

    console.log('  [ok] complete simulation flow (failure path)');
}

async function testSimulationCaching() {
    const env = createTestEnvironment();

    const contractId = SimulationFixtures.TEST_CONTRACT_ID;
    const functionName = 'transfer';
    const args = [SimulationFixtures.TRANSFER_PARAMS];

    const cacheKey = makeSimulationCacheKey({
        backend: 'cli',
        contractId,
        functionName,
        args,
        network: 'testnet',
        source: 'dev',
    });

    // First simulation - cache miss
    let cachedResult = env.cacheService.get(cacheKey);
    assert.strictEqual(cachedResult, undefined, 'cache should be empty initially');

    // Execute and cache
    const simulationResult = SimulationFixtureFactory.createSuccessResult();
    env.cacheService.set(cacheKey, simulationResult);

    // Second simulation - cache hit
    cachedResult = env.cacheService.get(cacheKey);
    assert.ok(cachedResult, 'result should be cached');
    assert.strictEqual(cachedResult!.success, true);
    assert.deepStrictEqual(cachedResult!.result, simulationResult.result);

    // Verify cache stats
    const stats = env.cacheService.getStats();
    assert.strictEqual(stats.hits, 1);
    assert.strictEqual(stats.misses, 1);
    assert.strictEqual(stats.sets, 1);

    console.log('  [ok] simulation result caching');
}

async function testSimulationCacheTTL() {
    const env = createTestEnvironment();

    // Create cache with short TTL
    const shortTtlCache = new SimulationCacheCore<SimulationResult>({
        enabled: true,
        ttlMs: 50, // 50ms TTL
        maxEntries: 100,
    });

    const cacheKey = makeSimulationCacheKey({
        backend: 'cli',
        contractId: SimulationFixtures.TEST_CONTRACT_ID,
        functionName: 'test',
        args: [],
        network: 'testnet',
        source: 'dev',
    });

    const result = SimulationFixtureFactory.createSuccessResult();
    shortTtlCache.set(cacheKey, result);

    // Immediate retrieval should work
    let cached = shortTtlCache.get(cacheKey);
    assert.ok(cached, 'cache should return result immediately');

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should be expired now
    cached = shortTtlCache.get(cacheKey);
    assert.strictEqual(cached, undefined, 'cache should expire after TTL');

    console.log('  [ok] simulation cache TTL expiration');
}

async function testSimulationCacheInvalidation() {
    const env = createTestEnvironment();

    const contractId = SimulationFixtures.TEST_CONTRACT_ID;

    // Cache multiple results for the same contract
    for (let i = 0; i < 3; i++) {
        const cacheKey = makeSimulationCacheKey({
            backend: 'cli',
            contractId,
            functionName: `fn${i}`,
            args: [],
            network: 'testnet',
            source: 'dev',
        });
        env.cacheService.set(cacheKey, SimulationFixtureFactory.createSuccessResult());
    }

    assert.strictEqual(env.cacheService.size(), 3);

    // Clear all cache
    env.cacheService.clear();
    assert.strictEqual(env.cacheService.size(), 0);

    console.log('  [ok] simulation cache invalidation');
}

async function testSimulationHistoryRecording() {
    const env = createTestEnvironment();

    // Record multiple simulations
    const simulations = [
        { ...SimulationFixtures.HISTORY_ENTRY_SUCCESS, functionName: 'transfer' },
        { ...SimulationFixtures.HISTORY_ENTRY_SUCCESS, functionName: 'mint' },
        { ...SimulationFixtures.HISTORY_ENTRY_FAILURE, functionName: 'burn' },
    ];

    for (const sim of simulations) {
        await env.historyService.recordSimulation(sim);
    }

    // Verify all recorded
    const allEntries = env.historyService.getAllEntries();
    assert.strictEqual(allEntries.length, 3);

    // Verify statistics
    const stats = env.historyService.getStatistics();
    assert.strictEqual(stats.totalSimulations, 3);
    assert.strictEqual(stats.successCount, 2);
    assert.strictEqual(stats.failureCount, 1);
    assert.strictEqual(stats.uniqueContracts, 1);
    assert.strictEqual(stats.uniqueFunctions, 3);

    console.log('  [ok] simulation history recording');
}

async function testSimulationHistoryQuery() {
    const env = createTestEnvironment();

    // Record simulations for different contracts
    await env.historyService.recordSimulation({
        ...SimulationFixtures.HISTORY_ENTRY_SUCCESS,
        contractId: SimulationFixtures.TEST_CONTRACT_ID,
        functionName: 'transfer',
    });
    await env.historyService.recordSimulation({
        ...SimulationFixtures.HISTORY_ENTRY_SUCCESS,
        contractId: SimulationFixtures.TEST_CONTRACT_ID_2,
        functionName: 'mint',
    });
    await env.historyService.recordSimulation({
        ...SimulationFixtures.HISTORY_ENTRY_FAILURE,
        contractId: SimulationFixtures.TEST_CONTRACT_ID,
        functionName: 'burn',
    });

    // Query by contract
    const contract1Entries = env.historyService.queryHistory({
        filter: { contractId: SimulationFixtures.TEST_CONTRACT_ID },
    });
    assert.strictEqual(contract1Entries.length, 2);

    // Query by function
    const transferEntries = env.historyService.queryHistory({
        filter: { functionName: 'transfer' },
    });
    assert.strictEqual(transferEntries.length, 1);

    // Query by outcome
    const failures = env.historyService.queryHistory({
        filter: { outcome: 'failure' },
    });
    assert.strictEqual(failures.length, 1);

    // Query with pagination
    const page1 = env.historyService.queryHistory({ limit: 2, offset: 0 });
    assert.strictEqual(page1.length, 2);

    const page2 = env.historyService.queryHistory({ limit: 2, offset: 2 });
    assert.strictEqual(page2.length, 1);

    console.log('  [ok] simulation history query and filtering');
}

async function testStateDiffCalculation() {
    const env = createTestEnvironment();

    const before = SimulationFixtures.STATE_SNAPSHOT_BEFORE;
    const after = SimulationFixtures.STATE_SNAPSHOT_AFTER;

    const diff = env.stateDiffService.calculateDiff(before, after);

    // Verify diff structure
    assert.ok(diff.hasChanges);
    assert.strictEqual(diff.modified.length, 2); // alice and bob balances
    assert.strictEqual(diff.created.length, 0);
    assert.strictEqual(diff.deleted.length, 0);
    assert.strictEqual(diff.unchangedKeys.length, 1); // total_supply

    // Verify modified entries
    const aliceChange = diff.modified.find(c => c.key === 'balance_alice');
    assert.ok(aliceChange);
    assert.strictEqual(aliceChange!.beforeValue, 1000);
    assert.strictEqual(aliceChange!.afterValue, 900);

    const bobChange = diff.modified.find(c => c.key === 'balance_bob');
    assert.ok(bobChange);
    assert.strictEqual(bobChange!.beforeValue, 500);
    assert.strictEqual(bobChange!.afterValue, 600);

    console.log('  [ok] state diff calculation (modified entries)');
}

async function testStateDiffWithCreation() {
    const env = createTestEnvironment();

    const before = SimulationFixtures.STATE_SNAPSHOT_BEFORE;
    const after = SimulationFixtures.STATE_SNAPSHOT_WITH_CREATION;

    const diff = env.stateDiffService.calculateDiff(before, after);

    assert.ok(diff.hasChanges);
    assert.strictEqual(diff.created.length, 1); // charlie balance
    assert.strictEqual(diff.modified.length, 1); // total_supply

    const created = diff.created[0];
    assert.strictEqual(created.key, 'balance_charlie');
    assert.strictEqual(created.afterValue, 100);

    console.log('  [ok] state diff calculation (created entries)');
}

async function testStateDiffWithDeletion() {
    const env = createTestEnvironment();

    const before = SimulationFixtures.STATE_SNAPSHOT_BEFORE;
    const after = SimulationFixtures.STATE_SNAPSHOT_WITH_DELETION;

    const diff = env.stateDiffService.calculateDiff(before, after);

    assert.ok(diff.hasChanges);
    assert.strictEqual(diff.deleted.length, 1); // bob balance
    assert.strictEqual(diff.modified.length, 1); // total_supply

    const deleted = diff.deleted[0];
    assert.strictEqual(deleted.key, 'balance_bob');
    assert.strictEqual(deleted.beforeValue, 500);

    console.log('  [ok] state diff calculation (deleted entries)');
}

async function testStateDiffExport() {
    const env = createTestEnvironment();

    const before = SimulationFixtures.STATE_SNAPSHOT_BEFORE;
    const after = SimulationFixtures.STATE_SNAPSHOT_AFTER;
    const diff = env.stateDiffService.calculateDiff(before, after);

    // Export without snapshots
    const exportedBasic = env.stateDiffService.exportStateDiff(diff);
    const parsedBasic = JSON.parse(exportedBasic);
    assert.ok(parsedBasic.exportedAt);
    assert.ok(parsedBasic.summary);
    assert.ok(parsedBasic.changes);
    assert.strictEqual(parsedBasic.snapshots, undefined);

    // Export with snapshots
    const exportedFull = env.stateDiffService.exportStateDiff(diff, { includeSnapshots: true });
    const parsedFull = JSON.parse(exportedFull);
    assert.ok(parsedFull.snapshots);
    assert.ok(parsedFull.snapshots.before);
    assert.ok(parsedFull.snapshots.after);

    console.log('  [ok] state diff export');
}

async function testSimulationHistoryExportImport() {
    const env = createTestEnvironment();

    // Record some simulations
    await env.historyService.recordSimulation(SimulationFixtures.HISTORY_ENTRY_SUCCESS);
    await env.historyService.recordSimulation(SimulationFixtures.HISTORY_ENTRY_FAILURE);

    // Export
    const exported = env.historyService.exportHistory();
    const parsed = JSON.parse(exported);
    assert.ok(parsed.exportedAt);
    assert.ok(parsed.statistics);
    assert.strictEqual(parsed.entries.length, 2);

    // Clear and import
    await env.historyService.clearHistory();
    assert.strictEqual(env.historyService.getEntryCount(), 0);

    const importResult = await env.historyService.importHistory(exported);
    assert.strictEqual(importResult.imported, 2);
    assert.strictEqual(importResult.skipped, 0);
    assert.strictEqual(env.historyService.getEntryCount(), 2);

    console.log('  [ok] simulation history export and import');
}

async function testSimulationCleanup() {
    const env = createTestEnvironment();

    // Record simulations
    const entry1 = await env.historyService.recordSimulation(SimulationFixtures.HISTORY_ENTRY_SUCCESS);
    const entry2 = await env.historyService.recordSimulation(SimulationFixtures.HISTORY_ENTRY_FAILURE);

    // Cache results
    const cacheKey1 = makeSimulationCacheKey({
        backend: 'cli',
        contractId: SimulationFixtures.TEST_CONTRACT_ID,
        functionName: 'transfer',
        args: [],
        network: 'testnet',
        source: 'dev',
    });
    env.cacheService.set(cacheKey1, SimulationFixtureFactory.createSuccessResult());

    // Verify data exists
    assert.strictEqual(env.historyService.getEntryCount(), 2);
    assert.strictEqual(env.cacheService.size(), 1);

    // Cleanup: delete specific history entry
    const deleted = await env.historyService.deleteEntry(entry1.id);
    assert.strictEqual(deleted, true);
    assert.strictEqual(env.historyService.getEntryCount(), 1);

    // Cleanup: clear all history
    await env.historyService.clearHistory();
    assert.strictEqual(env.historyService.getEntryCount(), 0);

    // Cleanup: clear cache
    env.cacheService.clear();
    assert.strictEqual(env.cacheService.size(), 0);

    console.log('  [ok] simulation cleanup (history and cache)');
}

async function testSimulationWithComplexParameters() {
    const env = createTestEnvironment();

    const contractId = SimulationFixtures.TEST_CONTRACT_ID;
    const functionName = 'complex_function';
    const args = [SimulationFixtures.COMPLEX_PARAMS];

    // Record simulation with complex parameters
    const entry = await env.historyService.recordSimulation({
        contractId,
        functionName,
        args,
        outcome: 'success',
        result: { status: 'ok' },
        network: 'testnet',
        source: 'dev',
        method: 'cli',
        durationMs: 1500,
    });

    // Verify complex args are stored correctly
    assert.ok(entry.args);
    assert.strictEqual(entry.args.length, 1);
    const storedArgs = entry.args[0] as any;
    assert.ok(storedArgs.nested);
    assert.strictEqual(storedArgs.nested.field1, 'value1');
    assert.strictEqual(storedArgs.nested.field2, 42);
    assert.deepStrictEqual(storedArgs.nested.array, [1, 2, 3]);
    assert.strictEqual(storedArgs.flag, true);

    // Verify cache key generation with complex params
    const cacheKey = makeSimulationCacheKey({
        backend: 'cli',
        contractId,
        functionName,
        args,
        network: 'testnet',
        source: 'dev',
    });
    assert.ok(cacheKey);
    assert.ok(cacheKey.length > 0);

    console.log('  [ok] simulation with complex parameters');
}

async function testSimulationErrorScenarios() {
    const env = createTestEnvironment();

    const errorScenarios = [
        {
            name: 'invalid contract',
            error: 'contract not found',
            errorType: 'validation' as const,
        },
        {
            name: 'invalid function',
            error: 'function not found',
            errorType: 'validation' as const,
        },
        {
            name: 'invalid arguments',
            error: 'invalid argument type',
            errorType: 'validation' as const,
        },
        {
            name: 'network timeout',
            error: 'connection timed out',
            errorType: 'network' as const,
        },
        {
            name: 'execution failed',
            error: 'contract execution failed',
            errorType: 'execution' as const,
        },
    ];

    for (const scenario of errorScenarios) {
        const entry = await env.historyService.recordSimulation({
            contractId: SimulationFixtures.TEST_CONTRACT_ID,
            functionName: 'test',
            args: [],
            outcome: 'failure',
            error: scenario.error,
            errorType: scenario.errorType,
            network: 'testnet',
            source: 'dev',
            method: 'cli',
            durationMs: 100,
        });

        assert.strictEqual(entry.outcome, 'failure');
        assert.ok(entry.error);
        assert.strictEqual(entry.errorType, scenario.errorType);
    }

    // Verify all errors recorded
    const failures = env.historyService.queryHistory({ filter: { outcome: 'failure' } });
    assert.strictEqual(failures.length, errorScenarios.length);

    console.log('  [ok] simulation error scenarios');
}

async function testSimulationResultVerification() {
    const env = createTestEnvironment();

    // Test successful result structure
    const successResult = SimulationFixtureFactory.createSuccessResult({
        result: { balance: 1000, status: 'ok' },
        resourceUsage: {
            cpuInstructions: 1234567,
            memoryBytes: 8192,
        },
    });

    assert.strictEqual(successResult.success, true);
    assert.ok(successResult.result);
    assert.ok(successResult.resourceUsage);
    assert.strictEqual(successResult.resourceUsage!.cpuInstructions, 1234567);
    assert.strictEqual(successResult.resourceUsage!.memoryBytes, 8192);

    // Test failure result structure
    const failureResult = SimulationFixtureFactory.createFailureResult('test error', {
        errorType: 'execution',
        errorCode: 'TEST_ERROR',
        errorSuggestions: ['suggestion 1', 'suggestion 2'],
    });

    assert.strictEqual(failureResult.success, false);
    assert.ok(failureResult.error);
    assert.strictEqual(failureResult.errorType, 'execution');
    assert.strictEqual(failureResult.errorCode, 'TEST_ERROR');
    assert.ok(failureResult.errorSuggestions);
    assert.strictEqual(failureResult.errorSuggestions!.length, 2);

    console.log('  [ok] simulation result verification');
}

async function testOptionalRealSimulationSmoke() {
    if (process.env.STELLAR_SUITE_RUN_REAL_SIMULATION !== '1') {
        console.log('  [skip] optional real simulation smoke test (set STELLAR_SUITE_RUN_REAL_SIMULATION=1)');
        return;
    }

    // This test would run against a real CLI/RPC endpoint
    // Implementation depends on having a test contract deployed
    console.log('  [skip] real simulation smoke test not implemented yet');
}

// ── Test Runner ───────────────────────────────────────────────

async function run() {
    const tests = [
        testCompleteSimulationFlowSuccess,
        testCompleteSimulationFlowFailure,
        testSimulationCaching,
        testSimulationCacheTTL,
        testSimulationCacheInvalidation,
        testSimulationHistoryRecording,
        testSimulationHistoryQuery,
        testStateDiffCalculation,
        testStateDiffWithCreation,
        testStateDiffWithDeletion,
        testStateDiffExport,
        testSimulationHistoryExportImport,
        testSimulationCleanup,
        testSimulationWithComplexParameters,
        testSimulationErrorScenarios,
        testSimulationResultVerification,
        testOptionalRealSimulationSmoke,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nsimulation workflow integration tests');
    for (const test of tests) {
        try {
            await test();
            passed += 1;
        } catch (error) {
            failed += 1;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${error instanceof Error ? error.stack || error.message : String(error)}`);
        }
    }

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch(error => {
    console.error('Test runner error:', error);
    process.exitCode = 1;
});
