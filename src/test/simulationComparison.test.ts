// ============================================================
// src/test/simulationComparison.test.ts
// Unit tests for simulation comparison service.
// Tests comparison logic, difference detection, similarity
// analysis, and export functionality.
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');
import { SimulationComparisonService } from '../services/simulationComparisonService';
import { SimulationHistoryEntry, SimulationOutcome } from '../services/simulationHistoryService';
import { StateDiff, StateSnapshot } from '../types/simulationState';

// ── Helper Functions ──────────────────────────────────────────

function createMockSimulation(overrides: Partial<SimulationHistoryEntry> = {}): SimulationHistoryEntry {
    return {
        id: overrides.id || 'sim-1',
        contractId: overrides.contractId || 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
        functionName: overrides.functionName || 'transfer',
        args: overrides.args || [{ type: 'address', value: 'addr1' }, { type: 'i128', value: 1000 }],
        outcome: overrides.outcome || 'success',
        result: overrides.result,
        error: overrides.error,
        errorType: overrides.errorType,
        resourceUsage: 'resourceUsage' in overrides ? overrides.resourceUsage : {
            cpuInstructions: 1000000,
            memoryBytes: 2048,
        },
        network: overrides.network || 'testnet',
        source: overrides.source || 'alice',
        method: overrides.method || 'cli',
        timestamp: overrides.timestamp || '2024-01-01T12:00:00Z',
        durationMs: overrides.durationMs || 100,
        label: overrides.label,
        stateSnapshotBefore: overrides.stateSnapshotBefore,
        stateSnapshotAfter: overrides.stateSnapshotAfter,
        stateDiff: overrides.stateDiff,
    };
}

function createMockStateDiff(overrides: Partial<StateDiff> = {}): StateDiff {
    return {
        before: overrides.before || { capturedAt: '2024-01-01T12:00:00Z', entries: [] },
        after: overrides.after || { capturedAt: '2024-01-01T12:00:01Z', entries: [] },
        created: overrides.created || [],
        modified: overrides.modified || [],
        deleted: overrides.deleted || [],
        unchangedKeys: overrides.unchangedKeys || [],
        summary: overrides.summary || {
            totalEntriesBefore: 0,
            totalEntriesAfter: 0,
            created: 0,
            modified: 0,
            deleted: 0,
            unchanged: 0,
            totalChanges: 0,
        },
        hasChanges: overrides.hasChanges ?? false,
    };
}

// ── Test Functions ────────────────────────────────────────────

async function testRequiresTwoSimulations() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation();

    try {
        service.compareSimulations([sim1]);
        assert.fail('Should have thrown error for single simulation');
    } catch (error: unknown) {
        assert.ok(error instanceof Error);
        assert.ok((error as Error).message.includes('At least 2 simulations'));
        console.log('  [ok] requires at least two simulations');
    }
}

async function testIdenticalSimulationsHighSimilarity() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({ id: 'sim-1' });
    const sim2 = createMockSimulation({ id: 'sim-2' });

    const result = service.compareSimulations([sim1, sim2]);

    assert.strictEqual(result.count, 2);
    assert.strictEqual(result.overallSimilarity, 100);
    assert.strictEqual(result.differences.length, 0);
    assert.ok(result.similarities.length > 0);
    console.log('  [ok] identical simulations show high similarity');
}

async function testDifferentOutcomesDetected() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({ id: 'sim-1', outcome: 'success' });
    const sim2 = createMockSimulation({ id: 'sim-2', outcome: 'failure', error: 'Test error' });

    const result = service.compareSimulations([sim1, sim2]);

    assert.ok(result.differences.some(d => d.metric === 'outcome' && d.severity === 'critical'));
    assert.strictEqual(result.outcomeComparison.allMatch, false);
    assert.strictEqual(result.outcomeComparison.distribution.success, 1);
    assert.strictEqual(result.outcomeComparison.distribution.failure, 1);
    console.log('  [ok] different outcomes detected as critical difference');
}

async function testResourceUsageComparison() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({
        id: 'sim-1',
        resourceUsage: { cpuInstructions: 1000000, memoryBytes: 2048 },
    });
    const sim2 = createMockSimulation({
        id: 'sim-2',
        resourceUsage: { cpuInstructions: 2000000, memoryBytes: 4096 },
    });

    const result = service.compareSimulations([sim1, sim2]);

    assert.ok(result.resourceComparison.cpuInstructions);
    assert.strictEqual(result.resourceComparison.cpuInstructions!.min, 1000000);
    assert.strictEqual(result.resourceComparison.cpuInstructions!.max, 2000000);
    assert.strictEqual(result.resourceComparison.cpuInstructions!.avg, 1500000);
    assert.ok(result.resourceComparison.cpuInstructions!.percentDifference > 0);
    console.log('  [ok] resource usage comparison calculates stats correctly');
}

async function testStateChangesComparison() {
    const service = new SimulationComparisonService();
    
    const stateDiff1 = createMockStateDiff({
        created: [
            { type: 'created', key: 'balance:alice', afterValue: 1000 },
        ],
        modified: [
            { type: 'modified', key: 'total_supply', beforeValue: 1000, afterValue: 2000 },
        ],
    });

    const stateDiff2 = createMockStateDiff({
        created: [
            { type: 'created', key: 'balance:alice', afterValue: 1000 },
        ],
        modified: [
            { type: 'modified', key: 'total_supply', beforeValue: 1000, afterValue: 3000 },
        ],
    });

    const sim1 = createMockSimulation({ id: 'sim-1', stateDiff: stateDiff1 });
    const sim2 = createMockSimulation({ id: 'sim-2', stateDiff: stateDiff2 });

    const result = service.compareSimulations([sim1, sim2]);

    assert.ok(result.stateComparison.commonChanges.some(c => c.key === 'balance:alice'));
    assert.ok(result.stateComparison.conflicts.some(c => c.key === 'total_supply'));
    assert.strictEqual(result.stateComparison.summary.totalCommonChanges, 1);
    assert.strictEqual(result.stateComparison.summary.totalConflicts, 1);
    console.log('  [ok] state changes comparison detects common changes and conflicts');
}

async function testParameterComparison() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({
        id: 'sim-1',
        contractId: 'contract-1',
        functionName: 'transfer',
    });
    const sim2 = createMockSimulation({
        id: 'sim-2',
        contractId: 'contract-2',
        functionName: 'transfer',
    });

    const result = service.compareSimulations([sim1, sim2]);

    assert.strictEqual(result.parameterComparison.contractIdMatches, false);
    assert.strictEqual(result.parameterComparison.functionNameMatches, true);
    assert.strictEqual(result.parameterComparison.uniqueContractIds.length, 2);
    console.log('  [ok] parameter comparison detects matching/differing parameters');
}

async function testTimingComparison() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({ id: 'sim-1', durationMs: 100 });
    const sim2 = createMockSimulation({ id: 'sim-2', durationMs: 150 });
    const sim3 = createMockSimulation({ id: 'sim-3', durationMs: 200 });

    const result = service.compareSimulations([sim1, sim2, sim3]);

    assert.strictEqual(result.timingComparison.min, 100);
    assert.strictEqual(result.timingComparison.max, 200);
    assert.strictEqual(result.timingComparison.avg, 150);
    assert.ok(result.timingComparison.percentDifference > 0);
    console.log('  [ok] timing comparison calculates duration statistics');
}

async function testDifferenceDetection() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({
        id: 'sim-1',
        outcome: 'success',
        resourceUsage: { cpuInstructions: 1000000, memoryBytes: 2048 },
    });
    const sim2 = createMockSimulation({
        id: 'sim-2',
        outcome: 'failure',
        error: 'Test error',
        resourceUsage: { cpuInstructions: 5000000, memoryBytes: 10240 },
    });

    const result = service.compareSimulations([sim1, sim2]);

    assert.ok(result.differences.length > 0);
    assert.ok(result.differences.some(d => d.metric === 'outcome'));
    assert.ok(result.differences.some(d => d.metric === 'resourceUsage'));
    console.log('  [ok] difference detection identifies multiple difference types');
}

async function testSimilarityDetection() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({
        id: 'sim-1',
        outcome: 'success',
        resourceUsage: { cpuInstructions: 1000000, memoryBytes: 2048 },
        durationMs: 100,
    });
    const sim2 = createMockSimulation({
        id: 'sim-2',
        outcome: 'success',
        resourceUsage: { cpuInstructions: 1000100, memoryBytes: 2050 },
        durationMs: 101,
    });

    const result = service.compareSimulations([sim1, sim2]);

    assert.ok(result.similarities.length > 0);
    assert.ok(result.similarities.some(s => s.metric === 'outcome'));
    assert.ok(result.similarities.some(s => s.metric === 'resourceUsage'));
    assert.ok(result.similarities.some(s => s.metric === 'timing'));
    console.log('  [ok] similarity detection identifies similar metrics');
}

async function testOverallSimilarityScore() {
    const service = new SimulationComparisonService();
    
    // Very similar simulations
    const sim1 = createMockSimulation({ id: 'sim-1' });
    const sim2 = createMockSimulation({ id: 'sim-2' });
    const result1 = service.compareSimulations([sim1, sim2]);
    assert.ok(result1.overallSimilarity >= 90);

    // Very different simulations
    const sim3 = createMockSimulation({
        id: 'sim-3',
        contractId: 'different-contract',
        functionName: 'different-function',
        outcome: 'failure',
        error: 'Error',
    });
    const sim4 = createMockSimulation({ id: 'sim-4' });
    const result2 = service.compareSimulations([sim3, sim4]);
    assert.ok(result2.overallSimilarity < 90);

    console.log('  [ok] overall similarity score reflects comparison accuracy');
}

async function testComparisonWithOptionalLabel() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({ id: 'sim-1' });
    const sim2 = createMockSimulation({ id: 'sim-2' });

    const result = service.compareSimulations([sim1, sim2], { label: 'Test Comparison' });

    assert.strictEqual(result.label, 'Test Comparison');
    console.log('  [ok] comparison accepts optional label');
}

async function testExportAsJson() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({ id: 'sim-1' });
    const sim2 = createMockSimulation({ id: 'sim-2' });

    const comparison = service.compareSimulations([sim1, sim2]);
    const exported = service.exportComparison(comparison, { format: 'json' });

    assert.ok(typeof exported === 'string');
    
    // Verify it's valid JSON
    const parsed = JSON.parse(exported);
    assert.ok(parsed.comparedAt);
    assert.strictEqual(parsed.count, 2);
    assert.ok(parsed.overallSimilarity !== undefined);
    console.log('  [ok] export as JSON produces valid JSON');
}

async function testExportAsMarkdown() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({ id: 'sim-1' });
    const sim2 = createMockSimulation({ id: 'sim-2' });

    const comparison = service.compareSimulations([sim1, sim2]);
    const exported = service.exportComparison(comparison, { format: 'markdown' });

    assert.ok(typeof exported === 'string');
    assert.ok(exported.includes('# Simulation Comparison Report'));
    assert.ok(exported.includes('## Summary'));
    console.log('  [ok] export as Markdown produces valid markdown');
}

async function testExportAsHtml() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({ id: 'sim-1' });
    const sim2 = createMockSimulation({ id: 'sim-2' });

    const comparison = service.compareSimulations([sim1, sim2]);
    const exported = service.exportComparison(comparison, { format: 'html' });

    assert.ok(typeof exported === 'string');
    assert.ok(exported.includes('<!DOCTYPE html>'));
    assert.ok(exported.includes('</html>'));
    console.log('  [ok] export as HTML produces valid HTML');
}

async function testCompareThreeOrMoreSimulations() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({ id: 'sim-1', resourceUsage: { cpuInstructions: 1000000 } });
    const sim2 = createMockSimulation({ id: 'sim-2', resourceUsage: { cpuInstructions: 1500000 } });
    const sim3 = createMockSimulation({ id: 'sim-3', resourceUsage: { cpuInstructions: 2000000 } });
    const sim4 = createMockSimulation({ id: 'sim-4', resourceUsage: { cpuInstructions: 2500000 } });

    const result = service.compareSimulations([sim1, sim2, sim3, sim4]);

    assert.strictEqual(result.count, 4);
    assert.strictEqual(result.resourceComparison.cpuInstructions!.min, 1000000);
    assert.strictEqual(result.resourceComparison.cpuInstructions!.max, 2500000);
    assert.strictEqual(result.resourceComparison.cpuInstructions!.avg, 1750000);
    console.log('  [ok] comparison supports 3+ simulations');
}

async function testMissingResourceUsageHandled() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({ id: 'sim-1', resourceUsage: undefined });
    const sim2 = createMockSimulation({ id: 'sim-2', resourceUsage: undefined });

    const result = service.compareSimulations([sim1, sim2]);

    assert.strictEqual(result.resourceComparison.cpuInstructions, undefined);
    assert.strictEqual(result.resourceComparison.memoryBytes, undefined);
    assert.strictEqual(result.resourceComparison.similarity, 100);
    console.log('  [ok] missing resource usage handled gracefully');
}

async function testMixedResourceUsage() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({ id: 'sim-1', resourceUsage: { cpuInstructions: 1000000 } });
    const sim2 = createMockSimulation({ id: 'sim-2', resourceUsage: undefined });
    const sim3 = createMockSimulation({ id: 'sim-3', resourceUsage: { cpuInstructions: 2000000 } });

    const result = service.compareSimulations([sim1, sim2, sim3]);

    assert.ok(result.resourceComparison.cpuInstructions);
    assert.strictEqual(result.resourceComparison.cpuInstructions!.min, 1000000);
    assert.strictEqual(result.resourceComparison.cpuInstructions!.max, 2000000);
    console.log('  [ok] mixed resource usage (some undefined) handled correctly');
}

async function testDifferentArgumentsDetected() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({ id: 'sim-1', args: [1, 2, 3] });
    const sim2 = createMockSimulation({ id: 'sim-2', args: [4, 5, 6] });

    const result = service.compareSimulations([sim1, sim2]);

    assert.strictEqual(result.parameterComparison.argsMatch, false);
    assert.ok(result.differences.some(d => d.metric === 'parameters'));
    console.log('  [ok] different arguments detected');
}

async function testSameArgumentsDetected() {
    const service = new SimulationComparisonService();
    const args = [{ type: 'i128', value: 100 }];
    const sim1 = createMockSimulation({ id: 'sim-1', args });
    const sim2 = createMockSimulation({ id: 'sim-2', args });

    const result = service.compareSimulations([sim1, sim2]);

    assert.strictEqual(result.parameterComparison.argsMatch, true);
    console.log('  [ok] same arguments detected');
}

async function testExportIncludesFullData() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({ id: 'sim-1' });
    const sim2 = createMockSimulation({ id: 'sim-2' });

    const comparison = service.compareSimulations([sim1, sim2]);
    const exported = service.exportComparison(comparison, {
        format: 'json',
        includeFullData: true,
    });

    const parsed = JSON.parse(exported);
    assert.ok(parsed.simulations);
    assert.strictEqual(parsed.simulations.length, 2);
    console.log('  [ok] export includes full simulation data when requested');
}

async function testExportExcludesStateSnapshots() {
    const service = new SimulationComparisonService();
    const sim1 = createMockSimulation({
        id: 'sim-1',
        stateSnapshotBefore: { capturedAt: '2024-01-01T12:00:00Z', entries: [] },
        stateSnapshotAfter: { capturedAt: '2024-01-01T12:00:01Z', entries: [] },
    });
    const sim2 = createMockSimulation({ id: 'sim-2' });

    const comparison = service.compareSimulations([sim1, sim2]);
    const exported = service.exportComparison(comparison, {
        format: 'json',
        includeFullData: true,
        includeStateSnapshots: false,
    });

    const parsed = JSON.parse(exported);
    assert.ok(parsed.simulations);
    assert.strictEqual(parsed.simulations[0].stateSnapshotBefore, undefined);
    assert.strictEqual(parsed.simulations[0].stateSnapshotAfter, undefined);
    console.log('  [ok] export can exclude state snapshots');
}

// ── Test Runner ───────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        testRequiresTwoSimulations,
        testIdenticalSimulationsHighSimilarity,
        testDifferentOutcomesDetected,
        testResourceUsageComparison,
        testStateChangesComparison,
        testParameterComparison,
        testTimingComparison,
        testDifferenceDetection,
        testSimilarityDetection,
        testOverallSimilarityScore,
        testComparisonWithOptionalLabel,
        testExportAsJson,
        testExportAsMarkdown,
        testExportAsHtml,
        testCompareThreeOrMoreSimulations,
        testMissingResourceUsageHandled,
        testMixedResourceUsage,
        testDifferentArgumentsDetected,
        testSameArgumentsDetected,
        testExportIncludesFullData,
        testExportExcludesStateSnapshots,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nSimulationComparisonService unit tests');
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
