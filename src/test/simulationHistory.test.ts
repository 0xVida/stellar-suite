// ============================================================
// src/test/simulationHistory.test.ts
// Unit tests for SimulationHistoryService.
//
// Run with:  node out/test/simulationHistory.test.js
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import {
    SimulationHistoryService,
    SimulationHistoryEntry,
    SimulationHistoryFilter,
} from '../services/simulationHistoryService';

// ── Mock helpers ──────────────────────────────────────────────

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
        appendLine(value: string) { lines.push(value); },
        lines,
    };
}

function createService() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new SimulationHistoryService(ctx, out);
    return { svc, ctx, out };
}

function makeParams(overrides: Partial<Omit<SimulationHistoryEntry, 'id' | 'timestamp'>> = {}) {
    return {
        contractId: 'CABC123',
        functionName: 'hello',
        args: ['world'],
        outcome: 'success' as const,
        result: 42,
        network: 'testnet',
        source: 'dev',
        method: 'cli' as const,
        ...overrides,
    };
}

// ── Tests ─────────────────────────────────────────────────────

async function testRecordSimulation() {
    const { svc } = createService();
    const entry = await svc.recordSimulation(makeParams());
    assert.ok(entry.id, 'entry should have an id');
    assert.ok(entry.timestamp, 'entry should have a timestamp');
    assert.strictEqual(entry.contractId, 'CABC123');
    assert.strictEqual(entry.functionName, 'hello');
    assert.strictEqual(entry.outcome, 'success');
    assert.strictEqual(entry.result, 42);
    assert.strictEqual(entry.network, 'testnet');
    assert.strictEqual(entry.method, 'cli');
    console.log('  [ok] recordSimulation stores entry with correct fields');
}

async function testRecordFailure() {
    const { svc } = createService();
    const entry = await svc.recordSimulation(makeParams({
        outcome: 'failure',
        error: 'Something went wrong',
        errorType: 'CONTRACT_ERROR',
        result: 'should be ignored',
    }));
    assert.strictEqual(entry.outcome, 'failure');
    assert.strictEqual(entry.error, 'Something went wrong');
    assert.strictEqual(entry.errorType, 'CONTRACT_ERROR');
    assert.strictEqual(entry.result, undefined, 'result should be undefined on failure');
    console.log('  [ok] recordSimulation stores failure with error, clears result');
}

async function testGetEntry() {
    const { svc } = createService();
    const entry = await svc.recordSimulation(makeParams());
    const found = svc.getEntry(entry.id);
    assert.ok(found, 'should find entry by id');
    assert.strictEqual(found!.id, entry.id);
    console.log('  [ok] getEntry retrieves by id');
}

async function testGetEntryNotFound() {
    const { svc } = createService();
    const found = svc.getEntry('nonexistent');
    assert.strictEqual(found, undefined);
    console.log('  [ok] getEntry returns undefined for unknown id');
}

async function testGetAllEntries() {
    const { svc } = createService();
    await svc.recordSimulation(makeParams({ functionName: 'fn1' }));
    await svc.recordSimulation(makeParams({ functionName: 'fn2' }));
    await svc.recordSimulation(makeParams({ functionName: 'fn3' }));
    const all = svc.getAllEntries();
    assert.strictEqual(all.length, 3);
    // All three entries should be present
    const names = all.map(e => e.functionName).sort();
    assert.deepStrictEqual(names, ['fn1', 'fn2', 'fn3']);
    console.log('  [ok] getAllEntries returns all entries');
}

async function testQueryFilterByContractId() {
    const { svc } = createService();
    await svc.recordSimulation(makeParams({ contractId: 'AAA' }));
    await svc.recordSimulation(makeParams({ contractId: 'BBB' }));
    await svc.recordSimulation(makeParams({ contractId: 'AAA' }));
    const results = svc.queryHistory({ filter: { contractId: 'AAA' } });
    assert.strictEqual(results.length, 2);
    assert.ok(results.every(e => e.contractId === 'AAA'));
    console.log('  [ok] queryHistory filters by contractId');
}

async function testQueryFilterByOutcome() {
    const { svc } = createService();
    await svc.recordSimulation(makeParams({ outcome: 'success' }));
    await svc.recordSimulation(makeParams({ outcome: 'failure', error: 'err' }));
    await svc.recordSimulation(makeParams({ outcome: 'success' }));
    const failures = svc.queryHistory({ filter: { outcome: 'failure' } });
    assert.strictEqual(failures.length, 1);
    assert.strictEqual(failures[0].outcome, 'failure');
    console.log('  [ok] queryHistory filters by outcome');
}

async function testQueryFilterByFunctionName() {
    const { svc } = createService();
    await svc.recordSimulation(makeParams({ functionName: 'mint' }));
    await svc.recordSimulation(makeParams({ functionName: 'transfer' }));
    await svc.recordSimulation(makeParams({ functionName: 'mint' }));
    const results = svc.queryHistory({ filter: { functionName: 'mint' } });
    assert.strictEqual(results.length, 2);
    console.log('  [ok] queryHistory filters by functionName');
}

async function testQueryFilterByNetwork() {
    const { svc } = createService();
    await svc.recordSimulation(makeParams({ network: 'testnet' }));
    await svc.recordSimulation(makeParams({ network: 'mainnet' }));
    const results = svc.queryHistory({ filter: { network: 'mainnet' } });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].network, 'mainnet');
    console.log('  [ok] queryHistory filters by network');
}

async function testQueryFilterBySearchText() {
    const { svc } = createService();
    await svc.recordSimulation(makeParams({ functionName: 'hello', contractId: 'CABC' }));
    await svc.recordSimulation(makeParams({ functionName: 'transfer', contractId: 'CXYZ' }));
    const results = svc.queryHistory({ filter: { searchText: 'xyz' } });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].contractId, 'CXYZ');
    console.log('  [ok] queryHistory filters by searchText (case-insensitive)');
}

async function testQuerySortAscending() {
    const { svc } = createService();
    await svc.recordSimulation(makeParams({ functionName: 'a' }));
    await svc.recordSimulation(makeParams({ functionName: 'b' }));
    const results = svc.queryHistory({ sortBy: 'functionName', sortDirection: 'asc' });
    assert.strictEqual(results[0].functionName, 'a');
    assert.strictEqual(results[1].functionName, 'b');
    console.log('  [ok] queryHistory sorts ascending by functionName');
}

async function testQueryPagination() {
    const { svc } = createService();
    for (let i = 0; i < 10; i++) {
        await svc.recordSimulation(makeParams({ functionName: `fn${i}` }));
    }
    const page = svc.queryHistory({ limit: 3, offset: 2 });
    assert.strictEqual(page.length, 3);
    console.log('  [ok] queryHistory supports limit and offset');
}

async function testGetEntriesByContract() {
    const { svc } = createService();
    await svc.recordSimulation(makeParams({ contractId: 'X' }));
    await svc.recordSimulation(makeParams({ contractId: 'Y' }));
    const results = svc.getEntriesByContract('X');
    assert.strictEqual(results.length, 1);
    console.log('  [ok] getEntriesByContract convenience method');
}

async function testGetEntriesByFunction() {
    const { svc } = createService();
    await svc.recordSimulation(makeParams({ functionName: 'mint' }));
    await svc.recordSimulation(makeParams({ functionName: 'burn' }));
    const results = svc.getEntriesByFunction('burn');
    assert.strictEqual(results.length, 1);
    console.log('  [ok] getEntriesByFunction convenience method');
}

async function testLabelEntry() {
    const { svc } = createService();
    const entry = await svc.recordSimulation(makeParams());
    const ok = await svc.labelEntry(entry.id, 'my-label');
    assert.strictEqual(ok, true);
    const updated = svc.getEntry(entry.id);
    assert.strictEqual(updated!.label, 'my-label');
    console.log('  [ok] labelEntry updates label');
}

async function testLabelEntryNotFound() {
    const { svc } = createService();
    const ok = await svc.labelEntry('nonexistent', 'label');
    assert.strictEqual(ok, false);
    console.log('  [ok] labelEntry returns false for unknown id');
}

async function testDeleteEntry() {
    const { svc } = createService();
    const entry = await svc.recordSimulation(makeParams());
    assert.strictEqual(svc.getEntryCount(), 1);
    const ok = await svc.deleteEntry(entry.id);
    assert.strictEqual(ok, true);
    assert.strictEqual(svc.getEntryCount(), 0);
    console.log('  [ok] deleteEntry removes entry');
}

async function testDeleteEntryNotFound() {
    const { svc } = createService();
    const ok = await svc.deleteEntry('nonexistent');
    assert.strictEqual(ok, false);
    console.log('  [ok] deleteEntry returns false for unknown id');
}

async function testClearHistory() {
    const { svc } = createService();
    await svc.recordSimulation(makeParams());
    await svc.recordSimulation(makeParams());
    assert.strictEqual(svc.getEntryCount(), 2);
    await svc.clearHistory();
    assert.strictEqual(svc.getEntryCount(), 0);
    console.log('  [ok] clearHistory removes all entries');
}

async function testGetStatistics() {
    const { svc } = createService();
    await svc.recordSimulation(makeParams({ contractId: 'A', functionName: 'f1', outcome: 'success' }));
    await svc.recordSimulation(makeParams({ contractId: 'A', functionName: 'f2', outcome: 'failure', error: 'e' }));
    await svc.recordSimulation(makeParams({ contractId: 'B', functionName: 'f1', outcome: 'success' }));
    const stats = svc.getStatistics();
    assert.strictEqual(stats.totalSimulations, 3);
    assert.strictEqual(stats.successCount, 2);
    assert.strictEqual(stats.failureCount, 1);
    assert.strictEqual(stats.uniqueContracts, 2);
    assert.strictEqual(stats.uniqueFunctions, 3); // A::f1, A::f2, B::f1
    assert.ok(stats.firstSimulation);
    assert.ok(stats.lastSimulation);
    console.log('  [ok] getStatistics returns correct aggregates');
}

async function testGetStatisticsEmpty() {
    const { svc } = createService();
    const stats = svc.getStatistics();
    assert.strictEqual(stats.totalSimulations, 0);
    assert.strictEqual(stats.successCount, 0);
    assert.strictEqual(stats.failureCount, 0);
    assert.strictEqual(stats.uniqueContracts, 0);
    assert.strictEqual(stats.uniqueFunctions, 0);
    assert.strictEqual(stats.firstSimulation, undefined);
    assert.strictEqual(stats.lastSimulation, undefined);
    console.log('  [ok] getStatistics handles empty history');
}

async function testExportHistory() {
    const { svc } = createService();
    await svc.recordSimulation(makeParams());
    const json = svc.exportHistory();
    const parsed = JSON.parse(json);
    assert.ok(parsed.exportedAt);
    assert.ok(parsed.statistics);
    assert.ok(Array.isArray(parsed.entries));
    assert.strictEqual(parsed.entries.length, 1);
    console.log('  [ok] exportHistory produces valid JSON with entries and stats');
}

async function testImportHistory() {
    const { svc } = createService();
    await svc.recordSimulation(makeParams({ functionName: 'existing' }));

    const importData = JSON.stringify({
        entries: [
            {
                id: 'imported_1',
                contractId: 'IMP',
                functionName: 'imported_fn',
                args: [],
                outcome: 'success',
                network: 'testnet',
                source: 'dev',
                method: 'rpc',
                timestamp: new Date().toISOString(),
            },
        ],
    });

    const result = await svc.importHistory(importData);
    assert.strictEqual(result.imported, 1);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(svc.getEntryCount(), 2);
    console.log('  [ok] importHistory merges new entries');
}

async function testImportHistorySkipsDuplicates() {
    const { svc } = createService();
    const entry = await svc.recordSimulation(makeParams());

    const importData = JSON.stringify({
        entries: [
            {
                id: entry.id,
                contractId: 'DUP',
                functionName: 'dup',
                args: [],
                outcome: 'success',
                network: 'testnet',
                source: 'dev',
                method: 'cli',
                timestamp: new Date().toISOString(),
            },
        ],
    });

    const result = await svc.importHistory(importData);
    assert.strictEqual(result.imported, 0);
    assert.strictEqual(result.skipped, 1);
    assert.strictEqual(svc.getEntryCount(), 1);
    console.log('  [ok] importHistory skips duplicate ids');
}

async function testImportHistoryRejectsInvalidJson() {
    const { svc } = createService();
    let threw = false;
    try {
        await svc.importHistory('not json');
    } catch (e) {
        threw = true;
        assert.ok((e as Error).message.includes('Invalid JSON'));
    }
    assert.ok(threw, 'should throw on invalid JSON');
    console.log('  [ok] importHistory rejects invalid JSON');
}

async function testImportHistoryRejectsInvalidFormat() {
    const { svc } = createService();
    let threw = false;
    try {
        await svc.importHistory(JSON.stringify({ noEntries: true }));
    } catch (e) {
        threw = true;
        assert.ok((e as Error).message.includes('entries'));
    }
    assert.ok(threw, 'should throw on missing entries array');
    console.log('  [ok] importHistory rejects missing entries array');
}

async function testImportHistorySkipsInvalidEntries() {
    const { svc } = createService();
    const importData = JSON.stringify({
        entries: [
            { id: 'bad', contractId: 123 }, // invalid: contractId not string
            {
                id: 'good',
                contractId: 'OK',
                functionName: 'fn',
                args: [],
                outcome: 'success',
                network: 'testnet',
                source: 'dev',
                method: 'cli',
                timestamp: new Date().toISOString(),
            },
        ],
    });
    const result = await svc.importHistory(importData);
    assert.strictEqual(result.imported, 1);
    assert.strictEqual(result.skipped, 1);
    console.log('  [ok] importHistory skips invalid entries');
}

async function testHistoryTrimming() {
    const { svc, ctx } = createService();
    // Manually seed 500 entries
    const entries: any[] = [];
    for (let i = 0; i < 500; i++) {
        entries.push({
            id: `sim_${i}`,
            contractId: 'C',
            functionName: 'f',
            args: [],
            outcome: 'success',
            network: 'testnet',
            source: 'dev',
            method: 'cli',
            timestamp: new Date(Date.now() + i).toISOString(),
        });
    }
    await ctx.workspaceState.update('stellarSuite.simulationHistory', entries);
    assert.strictEqual(svc.getEntryCount(), 500);

    // Adding one more should trim to 500
    await svc.recordSimulation(makeParams());
    assert.strictEqual(svc.getEntryCount(), 500);
    console.log('  [ok] history trims to max 500 entries');
}

async function testDurationMs() {
    const { svc } = createService();
    const entry = await svc.recordSimulation(makeParams({ durationMs: 1234 }));
    assert.strictEqual(entry.durationMs, 1234);
    console.log('  [ok] durationMs is stored correctly');
}

async function testQueryFilterByDateRange() {
    const { svc, ctx } = createService();
    const now = Date.now();
    const entries: any[] = [
        { id: 'old', contractId: 'C', functionName: 'f', args: [], outcome: 'success', network: 'testnet', source: 'dev', method: 'cli', timestamp: new Date(now - 86400000).toISOString() },
        { id: 'mid', contractId: 'C', functionName: 'f', args: [], outcome: 'success', network: 'testnet', source: 'dev', method: 'cli', timestamp: new Date(now).toISOString() },
        { id: 'new', contractId: 'C', functionName: 'f', args: [], outcome: 'success', network: 'testnet', source: 'dev', method: 'cli', timestamp: new Date(now + 86400000).toISOString() },
    ];
    await ctx.workspaceState.update('stellarSuite.simulationHistory', entries);

    const results = svc.queryHistory({
        filter: {
            fromDate: new Date(now - 1000).toISOString(),
            toDate: new Date(now + 1000).toISOString(),
        },
    });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'mid');
    console.log('  [ok] queryHistory filters by date range');
}

async function testGetEntryCount() {
    const { svc } = createService();
    assert.strictEqual(svc.getEntryCount(), 0);
    await svc.recordSimulation(makeParams());
    assert.strictEqual(svc.getEntryCount(), 1);
    await svc.recordSimulation(makeParams());
    assert.strictEqual(svc.getEntryCount(), 2);
    console.log('  [ok] getEntryCount tracks count');
}

async function testOutputChannelLogging() {
    const { svc, out } = createService();
    await svc.recordSimulation(makeParams());
    assert.ok(out.lines.length > 0, 'should log to output channel');
    assert.ok(out.lines.some(l => l.includes('[SimHistory]')));
    console.log('  [ok] service logs to output channel');
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
    const tests = [
        testRecordSimulation,
        testRecordFailure,
        testGetEntry,
        testGetEntryNotFound,
        testGetAllEntries,
        testQueryFilterByContractId,
        testQueryFilterByOutcome,
        testQueryFilterByFunctionName,
        testQueryFilterByNetwork,
        testQueryFilterBySearchText,
        testQuerySortAscending,
        testQueryPagination,
        testGetEntriesByContract,
        testGetEntriesByFunction,
        testLabelEntry,
        testLabelEntryNotFound,
        testDeleteEntry,
        testDeleteEntryNotFound,
        testClearHistory,
        testGetStatistics,
        testGetStatisticsEmpty,
        testExportHistory,
        testImportHistory,
        testImportHistorySkipsDuplicates,
        testImportHistoryRejectsInvalidJson,
        testImportHistoryRejectsInvalidFormat,
        testImportHistorySkipsInvalidEntries,
        testHistoryTrimming,
        testDurationMs,
        testQueryFilterByDateRange,
        testGetEntryCount,
        testOutputChannelLogging,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nsimulationHistory unit tests');
    for (const test of tests) {
        try {
            await test();
            passed += 1;
        } catch (err) {
            failed += 1;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch(err => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
