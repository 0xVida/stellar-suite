// ============================================================
// src/test/simulationReplay.test.ts
// Unit tests for SimulationReplayService.
//
// Run with:  node out-test/test/simulationReplay.test.js
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import {
    SimulationHistoryService,
    SimulationHistoryEntry,
} from '../services/simulationHistoryService';

import {
    SimulationReplayService,
    ReplayOverrides,
    ReplayResult,
    SimulationExecutor,
} from '../services/simulationReplayService';

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

function createServices() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const historyService = new SimulationHistoryService(ctx, out);
    const replayService = new SimulationReplayService(historyService, out);
    return { historyService, replayService, ctx, out };
}

function makeParams(overrides: Partial<Omit<SimulationHistoryEntry, 'id' | 'timestamp'>> = {}) {
    return {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        functionName: 'hello',
        args: [{ name: 'world' }],
        outcome: 'success' as const,
        result: 42,
        network: 'testnet',
        source: 'dev',
        method: 'cli' as const,
        durationMs: 150,
        ...overrides,
    };
}

function successExecutor(): SimulationExecutor {
    return async (_params) => ({
        success: true,
        result: 'replay-result',
        durationMs: 100,
        resourceUsage: { cpuInstructions: 5000, memoryBytes: 2048 },
    });
}

function failureExecutor(errorMsg: string = 'simulated failure'): SimulationExecutor {
    return async (_params) => ({
        success: false,
        error: errorMsg,
        errorType: 'CONTRACT_ERROR',
        durationMs: 50,
    });
}

function throwingExecutor(): SimulationExecutor {
    return async (_params) => {
        throw new Error('executor crashed');
    };
}

// ── Tests ─────────────────────────────────────────────────────

async function testReplaySimulationSuccess() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams());

    const result = await replayService.replaySimulation(entry.id, successExecutor());

    assert.strictEqual(result.originalEntryId, entry.id);
    assert.ok(result.newEntryId, 'should have a new entry ID');
    assert.notStrictEqual(result.newEntryId, entry.id, 'new entry should differ from original');
    assert.strictEqual(result.outcome, 'success');
    assert.strictEqual(result.result, 'replay-result');
    assert.ok(result.durationMs !== undefined);
    assert.strictEqual(result.comparison.outcomeChanged, false);
    assert.strictEqual(result.comparison.parametersModified, false);
    assert.strictEqual(result.comparison.modifiedFields.length, 0);
    console.log('  [ok] replaySimulation succeeds with original parameters');
}

async function testReplaySimulationFailure() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams({ outcome: 'success' }));

    const result = await replayService.replaySimulation(entry.id, failureExecutor());

    assert.strictEqual(result.outcome, 'failure');
    assert.strictEqual(result.error, 'simulated failure');
    assert.strictEqual(result.comparison.outcomeChanged, true);
    assert.strictEqual(result.comparison.originalOutcome, 'success');
    assert.strictEqual(result.comparison.replayOutcome, 'failure');
    console.log('  [ok] replaySimulation detects outcome change on failure');
}

async function testReplayRecordsInHistory() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams());
    assert.strictEqual(historyService.getEntryCount(), 1);

    const result = await replayService.replaySimulation(entry.id, successExecutor());

    assert.strictEqual(historyService.getEntryCount(), 2);
    const newEntry = historyService.getEntry(result.newEntryId);
    assert.ok(newEntry, 'replay should be recorded in history');
    assert.ok(newEntry!.label?.includes('Replay'), 'replay entry should have replay label');
    console.log('  [ok] replay records new entry in simulation history');
}

async function testReplayCarriesStateDiffMetadata() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams());

    const executor: SimulationExecutor = async () => ({
        success: true,
        result: 'ok',
        durationMs: 90,
        stateSnapshotBefore: {
            capturedAt: new Date().toISOString(),
            source: 'before',
            entries: [{ key: 'counter', value: 1 }],
        },
        stateSnapshotAfter: {
            capturedAt: new Date().toISOString(),
            source: 'after',
            entries: [{ key: 'counter', value: 2 }],
        },
        stateDiff: {
            before: {
                capturedAt: new Date().toISOString(),
                source: 'before',
                entries: [{ key: 'counter', value: 1 }],
            },
            after: {
                capturedAt: new Date().toISOString(),
                source: 'after',
                entries: [{ key: 'counter', value: 2 }],
            },
            created: [],
            modified: [{
                type: 'modified',
                key: 'counter',
                beforeValue: 1,
                afterValue: 2,
            }],
            deleted: [],
            unchangedKeys: [],
            summary: {
                totalEntriesBefore: 1,
                totalEntriesAfter: 1,
                created: 0,
                modified: 1,
                deleted: 0,
                unchanged: 0,
                totalChanges: 1,
            },
            hasChanges: true,
        },
    });

    const replay = await replayService.replaySimulation(entry.id, executor);
    assert.ok(replay.stateDiff, 'replay result should include state diff');
    assert.strictEqual(replay.stateDiff!.summary.totalChanges, 1);

    const stored = historyService.getEntry(replay.newEntryId);
    assert.ok(stored?.stateDiff, 'stored history should include state diff');
    assert.strictEqual(stored!.stateDiff!.summary.totalChanges, 1);
    console.log('  [ok] replay carries state snapshots and diff metadata through history');
}

async function testReplayNotFoundEntry() {
    const { replayService } = createServices();
    let threw = false;
    try {
        await replayService.replaySimulation('nonexistent', successExecutor());
    } catch (e) {
        threw = true;
        assert.ok((e as Error).message.includes('not found'));
    }
    assert.ok(threw, 'should throw for nonexistent entry');
    console.log('  [ok] replaySimulation throws for nonexistent entry');
}

async function testReplayWithOverrides() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams());

    const overrides: ReplayOverrides = {
        network: 'mainnet',
        source: 'prod',
    };

    const result = await replayService.replaySimulation(entry.id, successExecutor(), overrides);

    assert.strictEqual(result.parameters.network, 'mainnet');
    assert.strictEqual(result.parameters.source, 'prod');
    assert.strictEqual(result.parameters.contractId, entry.contractId, 'non-overridden fields preserved');
    assert.strictEqual(result.comparison.parametersModified, true);
    assert.ok(result.comparison.modifiedFields.includes('network'));
    assert.ok(result.comparison.modifiedFields.includes('source'));
    console.log('  [ok] replaySimulation applies overrides correctly');
}

async function testReplayWithArgsOverride() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams({ args: [{ name: 'original' }] }));

    const overrides: ReplayOverrides = {
        args: [{ name: 'modified' }],
    };

    const result = await replayService.replaySimulation(entry.id, successExecutor(), overrides);

    assert.deepStrictEqual(result.parameters.args, [{ name: 'modified' }]);
    assert.ok(result.comparison.modifiedFields.includes('args'));
    console.log('  [ok] replaySimulation applies args override');
}

async function testReplayWithSameArgsNotModified() {
    const { historyService, replayService } = createServices();
    const originalArgs = [{ name: 'world' }];
    const entry = await historyService.recordSimulation(makeParams({ args: originalArgs }));

    const overrides: ReplayOverrides = {
        args: [{ name: 'world' }],
    };

    const result = await replayService.replaySimulation(entry.id, successExecutor(), overrides);

    assert.strictEqual(result.comparison.parametersModified, false);
    assert.strictEqual(result.comparison.modifiedFields.length, 0);
    console.log('  [ok] identical args override not counted as modification');
}

async function testReplayWithExecutorException() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams());

    const result = await replayService.replaySimulation(entry.id, throwingExecutor());

    assert.strictEqual(result.outcome, 'failure');
    assert.ok(result.error?.includes('executor crashed'));
    assert.strictEqual(historyService.getEntryCount(), 2, 'failure should still be recorded');
    console.log('  [ok] replaySimulation handles executor exceptions gracefully');
}

async function testReplayWithCustomLabel() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams());

    const overrides: ReplayOverrides = { label: 'my-test-run' };
    const result = await replayService.replaySimulation(entry.id, successExecutor(), overrides);

    const newEntry = historyService.getEntry(result.newEntryId);
    assert.ok(newEntry!.label?.includes('my-test-run'));
    console.log('  [ok] replay uses custom label in history entry');
}

async function testResolveParameters() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams());

    const params = replayService.resolveParameters(entry, { network: 'futurenet' });

    assert.strictEqual(params.contractId, entry.contractId);
    assert.strictEqual(params.functionName, entry.functionName);
    assert.strictEqual(params.network, 'futurenet');
    assert.strictEqual(params.source, entry.source);
    assert.strictEqual(params.method, entry.method);
    console.log('  [ok] resolveParameters merges entry with overrides');
}

async function testResolveParametersNoOverrides() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams());

    const params = replayService.resolveParameters(entry);

    assert.strictEqual(params.contractId, entry.contractId);
    assert.strictEqual(params.functionName, entry.functionName);
    assert.strictEqual(params.network, entry.network);
    assert.deepStrictEqual(params.args, entry.args);
    console.log('  [ok] resolveParameters returns original values with no overrides');
}

async function testResolveParametersDeepCopiesArgs() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams({ args: [{ nested: 'value' }] }));

    const params = replayService.resolveParameters(entry);

    // Mutating resolved args should not affect the original entry
    (params.args[0] as any).nested = 'mutated';
    const refetched = historyService.getEntry(entry.id);
    assert.strictEqual((refetched!.args[0] as any).nested, 'value', 'original should be unchanged');
    console.log('  [ok] resolveParameters deep-copies args array');
}

async function testGetModifiedFields() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams());

    const fields = replayService.getModifiedFields(entry, {
        contractId: 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        functionName: 'transfer',
        network: 'mainnet',
    });

    assert.ok(fields.includes('contractId'));
    assert.ok(fields.includes('functionName'));
    assert.ok(fields.includes('network'));
    assert.strictEqual(fields.length, 3);
    console.log('  [ok] getModifiedFields detects changed fields');
}

async function testGetModifiedFieldsNoChanges() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams());

    const fields = replayService.getModifiedFields(entry, {});

    assert.strictEqual(fields.length, 0);
    console.log('  [ok] getModifiedFields returns empty for no overrides');
}

async function testGetModifiedFieldsSameValues() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams());

    const fields = replayService.getModifiedFields(entry, {
        contractId: entry.contractId,
        network: entry.network,
    });

    assert.strictEqual(fields.length, 0, 'same values should not count as modified');
    console.log('  [ok] getModifiedFields ignores overrides with same values');
}

async function testGetModifiedFieldsMethodChange() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams({ method: 'cli' }));

    const fields = replayService.getModifiedFields(entry, { method: 'rpc' });

    assert.ok(fields.includes('method'));
    console.log('  [ok] getModifiedFields detects method change');
}

async function testBatchReplaySuccess() {
    const { historyService, replayService } = createServices();
    const e1 = await historyService.recordSimulation(makeParams({ functionName: 'fn1' }));
    const e2 = await historyService.recordSimulation(makeParams({ functionName: 'fn2' }));
    const e3 = await historyService.recordSimulation(makeParams({ functionName: 'fn3' }));

    const result = await replayService.batchReplay(
        [e1.id, e2.id, e3.id],
        successExecutor()
    );

    assert.strictEqual(result.total, 3);
    assert.strictEqual(result.succeeded, 3);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(result.results.length, 3);
    assert.strictEqual(result.errors.length, 0);
    // Original 3 + 3 replays
    assert.strictEqual(historyService.getEntryCount(), 6);
    console.log('  [ok] batchReplay succeeds for all entries');
}

async function testBatchReplayWithMixedResults() {
    const { historyService, replayService } = createServices();
    const e1 = await historyService.recordSimulation(makeParams({ functionName: 'fn1' }));
    const e2 = await historyService.recordSimulation(makeParams({ functionName: 'fn2' }));

    let callCount = 0;
    const mixedExecutor: SimulationExecutor = async (_params) => {
        callCount++;
        if (callCount === 1) {
            return { success: true, result: 'ok', durationMs: 50 };
        }
        return { success: false, error: 'second failed', durationMs: 30 };
    };

    const result = await replayService.batchReplay([e1.id, e2.id], mixedExecutor);

    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.succeeded, 1);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.results.length, 2);
    console.log('  [ok] batchReplay handles mixed success/failure');
}

async function testBatchReplaySkipsMissing() {
    const { historyService, replayService } = createServices();
    const e1 = await historyService.recordSimulation(makeParams());

    const result = await replayService.batchReplay(
        [e1.id, 'nonexistent_1', 'nonexistent_2'],
        successExecutor()
    );

    assert.strictEqual(result.total, 3);
    assert.strictEqual(result.succeeded, 1);
    assert.strictEqual(result.skipped, 2);
    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(result.errors.length, 2);
    assert.ok(result.errors[0].includes('not found'));
    console.log('  [ok] batchReplay skips missing entries');
}

async function testBatchReplayWithOverrides() {
    const { historyService, replayService } = createServices();
    const e1 = await historyService.recordSimulation(makeParams({ network: 'testnet' }));
    const e2 = await historyService.recordSimulation(makeParams({ network: 'testnet' }));

    const result = await replayService.batchReplay(
        [e1.id, e2.id],
        successExecutor(),
        { network: 'mainnet' }
    );

    assert.strictEqual(result.succeeded, 2);
    for (const r of result.results) {
        assert.strictEqual(r.parameters.network, 'mainnet');
        assert.ok(r.comparison.parametersModified);
        assert.ok(r.comparison.modifiedFields.includes('network'));
    }
    console.log('  [ok] batchReplay applies overrides to all entries');
}

async function testBatchReplayEmptyList() {
    const { replayService } = createServices();

    const result = await replayService.batchReplay([], successExecutor());

    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.succeeded, 0);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(result.results.length, 0);
    console.log('  [ok] batchReplay handles empty entry list');
}

async function testBatchReplayWithThrowingExecutor() {
    const { historyService, replayService } = createServices();
    const e1 = await historyService.recordSimulation(makeParams());

    const result = await replayService.batchReplay([e1.id], throwingExecutor());

    // Throwing executor is caught inside replaySimulation, so it records a failure
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(result.results[0].outcome, 'failure');
    console.log('  [ok] batchReplay handles throwing executor');
}

async function testExportReplayResults() {
    const { historyService, replayService } = createServices();
    const e1 = await historyService.recordSimulation(makeParams());
    const e2 = await historyService.recordSimulation(makeParams({ outcome: 'failure', error: 'err' }));

    const r1 = await replayService.replaySimulation(e1.id, successExecutor());
    const r2 = await replayService.replaySimulation(e2.id, failureExecutor());

    const json = replayService.exportReplayResults([r1, r2]);
    const parsed = JSON.parse(json);

    assert.ok(parsed.exportedAt);
    assert.strictEqual(parsed.totalReplays, 2);
    assert.strictEqual(parsed.succeeded, 1);
    assert.strictEqual(parsed.failed, 1);
    assert.ok(Array.isArray(parsed.results));
    assert.strictEqual(parsed.results.length, 2);
    assert.ok(parsed.results[0].originalEntryId);
    assert.ok(parsed.results[0].newEntryId);
    console.log('  [ok] exportReplayResults produces valid JSON');
}

async function testExportReplayResultsEmpty() {
    const { replayService } = createServices();

    const json = replayService.exportReplayResults([]);
    const parsed = JSON.parse(json);

    assert.strictEqual(parsed.totalReplays, 0);
    assert.strictEqual(parsed.succeeded, 0);
    assert.strictEqual(parsed.failed, 0);
    assert.strictEqual(parsed.results.length, 0);
    console.log('  [ok] exportReplayResults handles empty results');
}

async function testExportReplayResultsOutcomeChanges() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams({ outcome: 'success' }));

    const result = await replayService.replaySimulation(entry.id, failureExecutor());

    const json = replayService.exportReplayResults([result]);
    const parsed = JSON.parse(json);

    assert.strictEqual(parsed.outcomeChanges, 1);
    assert.strictEqual(parsed.results[0].outcomeChanged, true);
    assert.strictEqual(parsed.results[0].originalOutcome, 'success');
    console.log('  [ok] exportReplayResults tracks outcome changes');
}

async function testReplayOutcomeUnchangedWhenBothSucceed() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams({ outcome: 'success' }));

    const result = await replayService.replaySimulation(entry.id, successExecutor());

    assert.strictEqual(result.comparison.outcomeChanged, false);
    assert.strictEqual(result.comparison.originalOutcome, 'success');
    assert.strictEqual(result.comparison.replayOutcome, 'success');
    console.log('  [ok] outcome unchanged when both succeed');
}

async function testReplayOutcomeUnchangedWhenBothFail() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams({
        outcome: 'failure',
        error: 'original error',
    }));

    const result = await replayService.replaySimulation(entry.id, failureExecutor('new error'));

    assert.strictEqual(result.comparison.outcomeChanged, false);
    assert.strictEqual(result.comparison.originalOutcome, 'failure');
    assert.strictEqual(result.comparison.replayOutcome, 'failure');
    console.log('  [ok] outcome unchanged when both fail');
}

async function testReplayOutcomeChangedFailToSuccess() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams({
        outcome: 'failure',
        error: 'was broken',
    }));

    const result = await replayService.replaySimulation(entry.id, successExecutor());

    assert.strictEqual(result.comparison.outcomeChanged, true);
    assert.strictEqual(result.comparison.originalOutcome, 'failure');
    assert.strictEqual(result.comparison.replayOutcome, 'success');
    console.log('  [ok] outcome change detected: failure → success');
}

async function testOutputChannelLogging() {
    const { historyService, replayService, out } = createServices();
    const entry = await historyService.recordSimulation(makeParams());

    await replayService.replaySimulation(entry.id, successExecutor());

    assert.ok(out.lines.some(l => l.includes('[Replay]')), 'should log replay messages');
    assert.ok(out.lines.some(l => l.includes('Replaying')));
    assert.ok(out.lines.some(l => l.includes('Completed')));
    console.log('  [ok] service logs replay activity to output channel');
}

async function testBatchReplayLogging() {
    const { historyService, replayService, out } = createServices();
    const e1 = await historyService.recordSimulation(makeParams());

    await replayService.batchReplay([e1.id], successExecutor());

    assert.ok(out.lines.some(l => l.includes('Batch complete')));
    console.log('  [ok] batch replay logs completion summary');
}

async function testReplayPreservesOriginalEntry() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams({
        functionName: 'original_fn',
        args: [{ key: 'original_val' }],
    }));

    await replayService.replaySimulation(entry.id, successExecutor(), {
        functionName: 'modified_fn',
        args: [{ key: 'modified_val' }],
    });

    const original = historyService.getEntry(entry.id);
    assert.ok(original, 'original entry should still exist');
    assert.strictEqual(original!.functionName, 'original_fn');
    assert.deepStrictEqual(original!.args, [{ key: 'original_val' }]);
    console.log('  [ok] replay does not mutate original history entry');
}

async function testReplayDurationFromExecutor() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams());

    const executor: SimulationExecutor = async () => ({
        success: true,
        result: 'ok',
        durationMs: 999,
    });

    const result = await replayService.replaySimulation(entry.id, executor);

    assert.strictEqual(result.durationMs, 999);
    console.log('  [ok] replay uses duration from executor when provided');
}

async function testReplayAllFieldOverrides() {
    const { historyService, replayService } = createServices();
    const entry = await historyService.recordSimulation(makeParams());

    const overrides: ReplayOverrides = {
        contractId: 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        functionName: 'transfer',
        args: [{ to: 'alice', amount: 100 }],
        network: 'mainnet',
        source: 'prod',
        method: 'rpc',
    };

    const result = await replayService.replaySimulation(entry.id, successExecutor(), overrides);

    assert.strictEqual(result.parameters.contractId, overrides.contractId);
    assert.strictEqual(result.parameters.functionName, overrides.functionName);
    assert.deepStrictEqual(result.parameters.args, overrides.args);
    assert.strictEqual(result.parameters.network, overrides.network);
    assert.strictEqual(result.parameters.source, overrides.source);
    assert.strictEqual(result.parameters.method, overrides.method);
    assert.strictEqual(result.comparison.modifiedFields.length, 6);
    console.log('  [ok] all parameter fields can be overridden');
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
    const tests = [
        testReplaySimulationSuccess,
        testReplaySimulationFailure,
        testReplayRecordsInHistory,
        testReplayCarriesStateDiffMetadata,
        testReplayNotFoundEntry,
        testReplayWithOverrides,
        testReplayWithArgsOverride,
        testReplayWithSameArgsNotModified,
        testReplayWithExecutorException,
        testReplayWithCustomLabel,
        testResolveParameters,
        testResolveParametersNoOverrides,
        testResolveParametersDeepCopiesArgs,
        testGetModifiedFields,
        testGetModifiedFieldsNoChanges,
        testGetModifiedFieldsSameValues,
        testGetModifiedFieldsMethodChange,
        testBatchReplaySuccess,
        testBatchReplayWithMixedResults,
        testBatchReplaySkipsMissing,
        testBatchReplayWithOverrides,
        testBatchReplayEmptyList,
        testBatchReplayWithThrowingExecutor,
        testExportReplayResults,
        testExportReplayResultsEmpty,
        testExportReplayResultsOutcomeChanges,
        testReplayOutcomeUnchangedWhenBothSucceed,
        testReplayOutcomeUnchangedWhenBothFail,
        testReplayOutcomeChangedFailToSuccess,
        testOutputChannelLogging,
        testBatchReplayLogging,
        testReplayPreservesOriginalEntry,
        testReplayDurationFromExecutor,
        testReplayAllFieldOverrides,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nsimulationReplay unit tests');
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
