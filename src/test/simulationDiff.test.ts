// ============================================================
// src/test/simulationDiff.test.ts
// Unit tests for simulation diff service.
// Tests diff calculation, highlighting, navigation, and
// export functionality.
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');
import { SimulationDiffService } from '../services/simulationDiffService';
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

async function testCalculateBasicDiff() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1' });
    const to = createMockSimulation({ id: 'sim-2' });

    const diff = service.calculateDiff(from, to);

    assert.strictEqual(diff.fromId, 'sim-1');
    assert.strictEqual(diff.toId, 'sim-2');
    assert.ok(diff.generatedAt);
    assert.ok(diff.sections.length > 0);
    console.log('  [ok] calculate basic diff');
}

async function testIdenticalSimulationsNoChanges() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1' });
    const to = createMockSimulation({ id: 'sim-2' });

    const diff = service.calculateDiff(from, to);

    assert.strictEqual(diff.hasChanges, false);
    assert.strictEqual(diff.overallSeverity, 'minor');
    console.log('  [ok] identical simulations show no changes');
}

async function testOutcomeDiffDetected() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1', outcome: 'success' });
    const to = createMockSimulation({ id: 'sim-2', outcome: 'failure', error: 'Test error' });

    const diff = service.calculateDiff(from, to);

    assert.strictEqual(diff.hasChanges, true);
    assert.strictEqual(diff.outcomeDiff.hasChanges, true);
    assert.strictEqual(diff.outcomeDiff.severity, 'critical');
    assert.ok(diff.outcomeDiff.lines.some(l => l.type === 'deleted' && l.content.includes('success')));
    assert.ok(diff.outcomeDiff.lines.some(l => l.type === 'added' && l.content.includes('failure')));
    console.log('  [ok] outcome diff detected');
}

async function testResultDiffDetected() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1', result: 100 });
    const to = createMockSimulation({ id: 'sim-2', result: 200 });

    const diff = service.calculateDiff(from, to);

    assert.strictEqual(diff.resultDiff.hasChanges, true);
    assert.strictEqual(diff.resultDiff.severity, 'major');
    assert.strictEqual(diff.resultDiff.oldValue, 100);
    assert.strictEqual(diff.resultDiff.newValue, 200);
    console.log('  [ok] result diff detected');
}

async function testResourceDiffCalculated() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({
        id: 'sim-1',
        resourceUsage: { cpuInstructions: 1000000, memoryBytes: 2048 },
    });
    const to = createMockSimulation({
        id: 'sim-2',
        resourceUsage: { cpuInstructions: 2000000, memoryBytes: 4096 },
    });

    const diff = service.calculateDiff(from, to);

    assert.strictEqual(diff.resourceDiff.hasChanges, true);
    assert.ok(diff.resourceDiff.cpuDiff);
    assert.strictEqual(diff.resourceDiff.cpuDiff!.oldValue, 1000000);
    assert.strictEqual(diff.resourceDiff.cpuDiff!.newValue, 2000000);
    assert.strictEqual(diff.resourceDiff.cpuDiff!.absoluteChange, 1000000);
    assert.strictEqual(diff.resourceDiff.cpuDiff!.percentChange, 100);
    console.log('  [ok] resource diff calculated');
}

async function testStateDiffDetected() {
    const service = new SimulationDiffService();
    
    const stateDiff1 = createMockStateDiff({
        created: [
            { type: 'created', key: 'balance:alice', afterValue: 1000 },
        ],
    });

    const stateDiff2 = createMockStateDiff({
        created: [
            { type: 'created', key: 'balance:bob', afterValue: 2000 },
        ],
    });

    const from = createMockSimulation({ id: 'sim-1', stateDiff: stateDiff1 });
    const to = createMockSimulation({ id: 'sim-2', stateDiff: stateDiff2 });

    const diff = service.calculateDiff(from, to);

    assert.strictEqual(diff.stateDiff.hasChanges, true);
    assert.ok(diff.stateDiff.lines.some(l => l.type === 'deleted' && l.content.includes('balance:alice')));
    assert.ok(diff.stateDiff.lines.some(l => l.type === 'added' && l.content.includes('balance:bob')));
    console.log('  [ok] state diff detected');
}

async function testParametersDiffDetected() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1', contractId: 'contract-1', functionName: 'transfer' });
    const to = createMockSimulation({ id: 'sim-2', contractId: 'contract-2', functionName: 'mint' });

    const diff = service.calculateDiff(from, to);

    assert.strictEqual(diff.parametersDiff.hasChanges, true);
    assert.ok(diff.parametersDiff.lines.some(l => l.type === 'deleted' && l.content.includes('contract-1')));
    assert.ok(diff.parametersDiff.lines.some(l => l.type === 'added' && l.content.includes('contract-2')));
    console.log('  [ok] parameters diff detected');
}

async function testNavigationPointsCreated() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ 
        id: 'sim-1', 
        outcome: 'success',
        result: 100,
    });
    const to = createMockSimulation({ 
        id: 'sim-2', 
        outcome: 'failure',
        error: 'Error',
        result: 200,
    });

    const diff = service.calculateDiff(from, to);

    assert.ok(diff.navigationPoints.length > 0);
    assert.ok(diff.navigationPoints.some(p => p.section === 'outcome'));
    assert.ok(diff.navigationPoints.some(p => p.section === 'result'));
    console.log('  [ok] navigation points created');
}

async function testSeverityLevels() {
    const service = new SimulationDiffService();
    
    // Critical: outcome change
    const diff1 = service.calculateDiff(
        createMockSimulation({ id: 'sim-1', outcome: 'success' }),
        createMockSimulation({ id: 'sim-2', outcome: 'failure', error: 'Error' })
    );
    assert.strictEqual(diff1.overallSeverity, 'critical');

    // Major: large resource change (>50%)
    const diff2 = service.calculateDiff(
        createMockSimulation({ id: 'sim-3', resourceUsage: { cpuInstructions: 1000000 } }),
        createMockSimulation({ id: 'sim-4', resourceUsage: { cpuInstructions: 2000000 } })
    );
    assert.ok(['major', 'critical'].includes(diff2.overallSeverity));

    // Minor: no changes
    const diff3 = service.calculateDiff(
        createMockSimulation({ id: 'sim-5' }),
        createMockSimulation({ id: 'sim-6' })
    );
    assert.strictEqual(diff3.overallSeverity, 'minor');

    console.log('  [ok] severity levels calculated correctly');
}

async function testSummaryGeneration() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1', outcome: 'success' });
    const to = createMockSimulation({ id: 'sim-2', outcome: 'failure', error: 'Error' });

    const diff = service.calculateDiff(from, to);

    assert.ok(diff.summary.length > 0);
    assert.ok(diff.summary.includes('Changes detected'));
    console.log('  [ok] summary generated');
}

async function testExportAsJson() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1' });
    const to = createMockSimulation({ id: 'sim-2' });

    const diff = service.calculateDiff(from, to);
    const exported = service.exportDiff(diff, { format: 'json' });

    assert.ok(typeof exported === 'string');
    const parsed = JSON.parse(exported);
    assert.strictEqual(parsed.fromId, 'sim-1');
    assert.strictEqual(parsed.toId, 'sim-2');
    console.log('  [ok] export as JSON produces valid JSON');
}

async function testExportAsMarkdown() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1' });
    const to = createMockSimulation({ id: 'sim-2' });

    const diff = service.calculateDiff(from, to);
    const exported = service.exportDiff(diff, { format: 'markdown' });

    assert.ok(typeof exported === 'string');
    assert.ok(exported.includes('# Simulation Diff Report'));
    assert.ok(exported.includes('**From:**'));
    assert.ok(exported.includes('**To:**'));
    console.log('  [ok] export as Markdown produces valid markdown');
}

async function testExportAsHtml() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1' });
    const to = createMockSimulation({ id: 'sim-2' });

    const diff = service.calculateDiff(from, to);
    const exported = service.exportDiff(diff, { format: 'html' });

    assert.ok(typeof exported === 'string');
    assert.ok(exported.includes('<!DOCTYPE html>'));
    assert.ok(exported.includes('</html>'));
    assert.ok(exported.includes('Simulation Diff Report'));
    console.log('  [ok] export as HTML produces valid HTML');
}

async function testExportAsUnified() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1', outcome: 'success' });
    const to = createMockSimulation({ id: 'sim-2', outcome: 'failure', error: 'Error' });

    const diff = service.calculateDiff(from, to);
    const exported = service.exportDiff(diff, { format: 'unified' });

    assert.ok(typeof exported === 'string');
    assert.ok(exported.includes('diff --git'));
    assert.ok(exported.includes('---'));
    assert.ok(exported.includes('+++'));
    console.log('  [ok] export as unified diff format');
}

async function testExportWithFullData() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1' });
    const to = createMockSimulation({ id: 'sim-2' });

    const diff = service.calculateDiff(from, to);
    const exported = service.exportDiff(diff, {
        format: 'json',
        includeFullData: true,
    });

    const parsed = JSON.parse(exported);
    assert.ok(parsed.sections);
    assert.ok(parsed.navigationPoints);
    assert.ok(parsed.resultDiff);
    console.log('  [ok] export includes full data when requested');
}

async function testMarkdownSideBySideView() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1', result: 100 });
    const to = createMockSimulation({ id: 'sim-2', result: 200 });

    const diff = service.calculateDiff(from, to);
    const exported = service.exportDiff(diff, {
        format: 'markdown',
        viewMode: 'side-by-side',
    });

    assert.ok(exported.includes('|'));
    assert.ok(exported.includes('From (sim-1)'));
    assert.ok(exported.includes('To (sim-2)'));
    console.log('  [ok] markdown side-by-side view');
}

async function testHtmlSideBySideView() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1', result: 100 });
    const to = createMockSimulation({ id: 'sim-2', result: 200 });

    const diff = service.calculateDiff(from, to);
    const exported = service.exportDiff(diff, {
        format: 'html',
        viewMode: 'side-by-side',
    });

    assert.ok(exported.includes('side-by-side'));
    console.log('  [ok] HTML side-by-side view');
}

async function testResultTypeChange() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1', result: 'string result' });
    const to = createMockSimulation({ id: 'sim-2', result: 123 });

    const diff = service.calculateDiff(from, to);

    assert.strictEqual(diff.resultDiff.hasChanges, true);
    assert.strictEqual(diff.resultDiff.severity, 'major');
    assert.ok(diff.resultDiff.changeDescription.includes('type changed'));
    console.log('  [ok] result type change detected');
}

async function testMissingResourceUsageHandled() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1', resourceUsage: undefined });
    const to = createMockSimulation({ id: 'sim-2', resourceUsage: undefined });

    const diff = service.calculateDiff(from, to);

    assert.strictEqual(diff.resourceDiff.hasChanges, false);
    assert.strictEqual(diff.resourceDiff.cpuDiff, undefined);
    assert.strictEqual(diff.resourceDiff.memoryDiff, undefined);
    console.log('  [ok] missing resource usage handled gracefully');
}

async function testNoStateDiffHandled() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1', stateDiff: undefined });
    const to = createMockSimulation({ id: 'sim-2', stateDiff: undefined });

    const diff = service.calculateDiff(from, to);

    assert.strictEqual(diff.stateDiff.hasChanges, false);
    assert.ok(diff.stateDiff.lines.some(l => l.content.includes('No state changes')));
    console.log('  [ok] no state diff handled gracefully');
}

async function testArgumentsChange() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1', args: [1, 2, 3] });
    const to = createMockSimulation({ id: 'sim-2', args: [4, 5, 6] });

    const diff = service.calculateDiff(from, to);

    assert.strictEqual(diff.parametersDiff.hasChanges, true);
    assert.ok(diff.parametersDiff.lines.some(l => l.type === 'deleted' && l.content.includes('[1,2,3]')));
    assert.ok(diff.parametersDiff.lines.some(l => l.type === 'added' && l.content.includes('[4,5,6]')));
    console.log('  [ok] arguments change detected');
}

async function testDiffSectionStructure() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({ id: 'sim-1' });
    const to = createMockSimulation({ id: 'sim-2' });

    const diff = service.calculateDiff(from, to);

    // Should have standard sections
    assert.ok(diff.sections.some(s => s.section === 'outcome'));
    assert.ok(diff.sections.some(s => s.section === 'result'));
    assert.ok(diff.sections.some(s => s.section === 'resources'));
    assert.ok(diff.sections.some(s => s.section === 'state'));
    assert.ok(diff.sections.some(s => s.section === 'parameters'));
    console.log('  [ok] diff has all expected sections');
}

async function testLargeResourceChangeHighSeverity() {
    const service = new SimulationDiffService();
    const from = createMockSimulation({
        id: 'sim-1',
        resourceUsage: { cpuInstructions: 1000000 },
    });
    const to = createMockSimulation({
        id: 'sim-2',
        resourceUsage: { cpuInstructions: 10000000 }, // 10x increase
    });

    const diff = service.calculateDiff(from, to);

    assert.strictEqual(diff.resourceDiff.hasChanges, true);
    assert.ok(['major', 'critical'].includes(diff.resourceDiff.severity));
    console.log('  [ok] large resource change has high severity');
}

// ── Test Runner ───────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        testCalculateBasicDiff,
        testIdenticalSimulationsNoChanges,
        testOutcomeDiffDetected,
        testResultDiffDetected,
        testResourceDiffCalculated,
        testStateDiffDetected,
        testParametersDiffDetected,
        testNavigationPointsCreated,
        testSeverityLevels,
        testSummaryGeneration,
        testExportAsJson,
        testExportAsMarkdown,
        testExportAsHtml,
        testExportAsUnified,
        testExportWithFullData,
        testMarkdownSideBySideView,
        testHtmlSideBySideView,
        testResultTypeChange,
        testMissingResourceUsageHandled,
        testNoStateDiffHandled,
        testArgumentsChange,
        testDiffSectionStructure,
        testLargeResourceChangeHighSeverity,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nSimulationDiffService unit tests');
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
