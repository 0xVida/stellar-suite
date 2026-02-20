// ============================================================
// src/test/resourceProfiling.test.ts
// Unit tests for ResourceProfilingService.
//
// Run with:  node out-test/test/resourceProfiling.test.js
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { ResourceProfilingService } from '../services/resourceProfilingService';
import {
    ResourceProfile,
    ResourceThresholds,
    ResourceUsageSnapshot,
} from '../types/resourceProfile';

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

function createService(thresholds?: ResourceThresholds) {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new ResourceProfilingService(ctx, out, thresholds);
    return { svc, ctx, out };
}

function makeProfileParams(overrides: Record<string, unknown> = {}) {
    return {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        functionName: 'hello',
        network: 'testnet',
        cpuInstructions: 10_000,
        memoryBytes: 4096,
        storageReads: 5,
        storageWrites: 2,
        executionTimeMs: 200,
        setupTimeMs: 20,
        storageTimeMs: 30,
        ...overrides,
    };
}

// ── Tests: Profile creation ──────────────────────────────────

async function testRecordProfile() {
    const { svc } = createService();
    const profile = await svc.recordProfile(makeProfileParams());

    assert.ok(profile.id, 'profile should have an id');
    assert.ok(profile.createdAt, 'profile should have a createdAt timestamp');
    assert.strictEqual(profile.contractId, 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    assert.strictEqual(profile.functionName, 'hello');
    assert.strictEqual(profile.network, 'testnet');
    assert.strictEqual(profile.usage.cpuInstructions, 10_000);
    assert.strictEqual(profile.usage.memoryBytes, 4096);
    assert.strictEqual(profile.usage.storageReads, 5);
    assert.strictEqual(profile.usage.storageWrites, 2);
    assert.strictEqual(profile.usage.executionTimeMs, 200);
    console.log('  [ok] recordProfile stores profile with correct fields');
}

async function testRecordProfileTimeBreakdown() {
    const { svc } = createService();
    const profile = await svc.recordProfile(makeProfileParams({
        executionTimeMs: 500,
        setupTimeMs: 50,
        storageTimeMs: 100,
    }));

    assert.strictEqual(profile.timeBreakdown.setupMs, 50);
    assert.strictEqual(profile.timeBreakdown.storageMs, 100);
    assert.strictEqual(profile.timeBreakdown.executionMs, 350); // 500 - 50 - 100
    assert.strictEqual(profile.timeBreakdown.totalMs, 500);
    console.log('  [ok] recordProfile computes time breakdown correctly');
}

async function testRecordProfileDefaultValues() {
    const { svc } = createService();
    const profile = await svc.recordProfile({
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        functionName: 'minimal',
        network: 'testnet',
    });

    assert.strictEqual(profile.usage.cpuInstructions, 0);
    assert.strictEqual(profile.usage.memoryBytes, 0);
    assert.strictEqual(profile.usage.storageReads, 0);
    assert.strictEqual(profile.usage.storageWrites, 0);
    assert.strictEqual(profile.usage.executionTimeMs, 0);
    assert.strictEqual(profile.timeBreakdown.totalMs, 0);
    console.log('  [ok] recordProfile uses zero defaults for missing values');
}

async function testRecordProfileWithSimulationId() {
    const { svc } = createService();
    const profile = await svc.recordProfile(makeProfileParams({
        simulationId: 'sim_abc123',
    }));

    assert.strictEqual(profile.simulationId, 'sim_abc123');
    console.log('  [ok] recordProfile stores simulationId');
}

async function testRecordProfileWithLabel() {
    const { svc } = createService();
    const profile = await svc.recordProfile(makeProfileParams({
        label: 'baseline run',
    }));

    assert.strictEqual(profile.label, 'baseline run');
    console.log('  [ok] recordProfile stores label');
}

// ── Tests: Retrieval ─────────────────────────────────────────

async function testGetProfile() {
    const { svc } = createService();
    const profile = await svc.recordProfile(makeProfileParams());
    const found = svc.getProfile(profile.id);

    assert.ok(found, 'should find profile by id');
    assert.strictEqual(found!.id, profile.id);
    console.log('  [ok] getProfile retrieves by id');
}

async function testGetProfileNotFound() {
    const { svc } = createService();
    const found = svc.getProfile('nonexistent');
    assert.strictEqual(found, undefined);
    console.log('  [ok] getProfile returns undefined for unknown id');
}

async function testGetAllProfiles() {
    const { svc } = createService();
    await svc.recordProfile(makeProfileParams({ functionName: 'fn1' }));
    await svc.recordProfile(makeProfileParams({ functionName: 'fn2' }));
    await svc.recordProfile(makeProfileParams({ functionName: 'fn3' }));

    const all = svc.getAllProfiles();
    assert.strictEqual(all.length, 3);
    console.log('  [ok] getAllProfiles returns all profiles');
}

async function testGetAllProfilesNewestFirst() {
    const { svc } = createService();
    await svc.recordProfile(makeProfileParams({ functionName: 'first' }));
    await svc.recordProfile(makeProfileParams({ functionName: 'second' }));

    const all = svc.getAllProfiles();
    // Newest should be first
    const t0 = new Date(all[0].createdAt).getTime();
    const t1 = new Date(all[1].createdAt).getTime();
    assert.ok(t0 >= t1, 'profiles should be sorted newest first');
    console.log('  [ok] getAllProfiles returns newest first');
}

async function testGetProfilesByContract() {
    const { svc } = createService();
    await svc.recordProfile(makeProfileParams({ contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }));
    await svc.recordProfile(makeProfileParams({ contractId: 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' }));
    await svc.recordProfile(makeProfileParams({ contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }));

    const results = svc.getProfilesByContract('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    assert.strictEqual(results.length, 2);
    console.log('  [ok] getProfilesByContract filters correctly');
}

async function testGetProfilesByFunction() {
    const { svc } = createService();
    const cid = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    await svc.recordProfile(makeProfileParams({ contractId: cid, functionName: 'mint' }));
    await svc.recordProfile(makeProfileParams({ contractId: cid, functionName: 'transfer' }));
    await svc.recordProfile(makeProfileParams({ contractId: cid, functionName: 'mint' }));

    const results = svc.getProfilesByFunction(cid, 'mint');
    assert.strictEqual(results.length, 2);
    console.log('  [ok] getProfilesByFunction filters correctly');
}

async function testGetProfileCount() {
    const { svc } = createService();
    assert.strictEqual(svc.getProfileCount(), 0);
    await svc.recordProfile(makeProfileParams());
    assert.strictEqual(svc.getProfileCount(), 1);
    await svc.recordProfile(makeProfileParams());
    assert.strictEqual(svc.getProfileCount(), 2);
    console.log('  [ok] getProfileCount tracks count');
}

// ── Tests: Deletion ──────────────────────────────────────────

async function testDeleteProfile() {
    const { svc } = createService();
    const profile = await svc.recordProfile(makeProfileParams());
    assert.strictEqual(svc.getProfileCount(), 1);

    const ok = await svc.deleteProfile(profile.id);
    assert.strictEqual(ok, true);
    assert.strictEqual(svc.getProfileCount(), 0);
    console.log('  [ok] deleteProfile removes profile');
}

async function testDeleteProfileNotFound() {
    const { svc } = createService();
    const ok = await svc.deleteProfile('nonexistent');
    assert.strictEqual(ok, false);
    console.log('  [ok] deleteProfile returns false for unknown id');
}

async function testClearProfiles() {
    const { svc } = createService();
    await svc.recordProfile(makeProfileParams());
    await svc.recordProfile(makeProfileParams());
    assert.strictEqual(svc.getProfileCount(), 2);

    await svc.clearProfiles();
    assert.strictEqual(svc.getProfileCount(), 0);
    console.log('  [ok] clearProfiles removes all profiles');
}

// ── Tests: Threshold warnings ────────────────────────────────

async function testNoWarningsBelowThresholds() {
    const { svc } = createService();
    const profile = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 1000,
        memoryBytes: 1024,
        storageReads: 2,
        storageWrites: 1,
        executionTimeMs: 100,
    }));

    assert.strictEqual(profile.warnings.length, 0);
    console.log('  [ok] no warnings when all metrics below thresholds');
}

async function testCpuWarning() {
    const { svc } = createService({
        cpu: { warning: 100, critical: 500 },
        memory: { warning: 999_999_999, critical: 999_999_999 },
        storage: { warning: 999, critical: 999 },
        time: { warning: 999_999, critical: 999_999 },
    });

    const profile = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 200,
    }));

    assert.strictEqual(profile.warnings.length, 1);
    assert.strictEqual(profile.warnings[0].category, 'cpu');
    assert.strictEqual(profile.warnings[0].severity, 'warning');
    assert.strictEqual(profile.warnings[0].actualValue, 200);
    assert.strictEqual(profile.warnings[0].threshold, 100);
    console.log('  [ok] CPU warning generated when exceeding warning threshold');
}

async function testCpuCritical() {
    const { svc } = createService({
        cpu: { warning: 100, critical: 500 },
        memory: { warning: 999_999_999, critical: 999_999_999 },
        storage: { warning: 999, critical: 999 },
        time: { warning: 999_999, critical: 999_999 },
    });

    const profile = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 600,
    }));

    assert.strictEqual(profile.warnings.length, 1);
    assert.strictEqual(profile.warnings[0].severity, 'critical');
    console.log('  [ok] CPU critical warning generated when exceeding critical threshold');
}

async function testMemoryWarning() {
    const { svc } = createService({
        cpu: { warning: 999_999_999, critical: 999_999_999 },
        memory: { warning: 1000, critical: 5000 },
        storage: { warning: 999, critical: 999 },
        time: { warning: 999_999, critical: 999_999 },
    });

    const profile = await svc.recordProfile(makeProfileParams({
        memoryBytes: 2000,
    }));

    assert.strictEqual(profile.warnings.length, 1);
    assert.strictEqual(profile.warnings[0].category, 'memory');
    assert.strictEqual(profile.warnings[0].severity, 'warning');
    console.log('  [ok] memory warning generated correctly');
}

async function testStorageWarning() {
    const { svc } = createService({
        cpu: { warning: 999_999_999, critical: 999_999_999 },
        memory: { warning: 999_999_999, critical: 999_999_999 },
        storage: { warning: 10, critical: 50 },
        time: { warning: 999_999, critical: 999_999 },
    });

    const profile = await svc.recordProfile(makeProfileParams({
        storageReads: 8,
        storageWrites: 5,
    }));

    // 8 + 5 = 13 > 10 warning threshold
    assert.strictEqual(profile.warnings.length, 1);
    assert.strictEqual(profile.warnings[0].category, 'storage');
    console.log('  [ok] storage warning generated for combined reads + writes');
}

async function testTimeWarning() {
    const { svc } = createService({
        cpu: { warning: 999_999_999, critical: 999_999_999 },
        memory: { warning: 999_999_999, critical: 999_999_999 },
        storage: { warning: 999, critical: 999 },
        time: { warning: 100, critical: 500 },
    });

    const profile = await svc.recordProfile(makeProfileParams({
        executionTimeMs: 200,
    }));

    assert.strictEqual(profile.warnings.length, 1);
    assert.strictEqual(profile.warnings[0].category, 'time');
    console.log('  [ok] time warning generated correctly');
}

async function testMultipleWarnings() {
    const { svc } = createService({
        cpu: { warning: 100, critical: 500 },
        memory: { warning: 100, critical: 500 },
        storage: { warning: 5, critical: 20 },
        time: { warning: 50, critical: 200 },
    });

    const profile = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 200,
        memoryBytes: 200,
        storageReads: 4,
        storageWrites: 3,
        executionTimeMs: 100,
    }));

    // cpu warning, memory warning, storage warning (4+3=7 > 5), time warning
    assert.strictEqual(profile.warnings.length, 4);
    const categories = profile.warnings.map((w: any) => w.category).sort();
    assert.deepStrictEqual(categories, ['cpu', 'memory', 'storage', 'time']);
    console.log('  [ok] multiple warnings generated across categories');
}

async function testEvaluateThresholdsDirect() {
    const { svc } = createService({
        cpu: { warning: 100, critical: 500 },
        memory: { warning: 999_999_999, critical: 999_999_999 },
        storage: { warning: 999, critical: 999 },
        time: { warning: 999_999, critical: 999_999 },
    });

    const usage: ResourceUsageSnapshot = {
        cpuInstructions: 200,
        memoryBytes: 0,
        storageReads: 0,
        storageWrites: 0,
        executionTimeMs: 0,
        timestamp: new Date().toISOString(),
    };

    const warnings = svc.evaluateThresholds(usage);
    assert.strictEqual(warnings.length, 1);
    assert.strictEqual(warnings[0].category, 'cpu');
    console.log('  [ok] evaluateThresholds works as standalone method');
}

async function testSetThresholds() {
    const { svc } = createService();
    const custom: ResourceThresholds = {
        cpu: { warning: 1, critical: 2 },
        memory: { warning: 1, critical: 2 },
        storage: { warning: 1, critical: 2 },
        time: { warning: 1, critical: 2 },
    };

    svc.setThresholds(custom);
    const retrieved = svc.getThresholds();

    assert.strictEqual(retrieved.cpu.warning, 1);
    assert.strictEqual(retrieved.cpu.critical, 2);
    console.log('  [ok] setThresholds and getThresholds work correctly');
}

async function testSetThresholdsDoesNotMutateOriginal() {
    const { svc } = createService();
    const custom: ResourceThresholds = {
        cpu: { warning: 1, critical: 2 },
        memory: { warning: 1, critical: 2 },
        storage: { warning: 1, critical: 2 },
        time: { warning: 1, critical: 2 },
    };

    svc.setThresholds(custom);
    custom.cpu.warning = 999;

    const retrieved = svc.getThresholds();
    assert.strictEqual(retrieved.cpu.warning, 1, 'should not be mutated');
    console.log('  [ok] setThresholds creates a defensive copy');
}

// ── Tests: Comparison ────────────────────────────────────────

async function testCompareProfiles() {
    const { svc } = createService();
    const baseline = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 10_000,
        memoryBytes: 4096,
        executionTimeMs: 200,
    }));
    const current = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 8_000,
        memoryBytes: 5120,
        executionTimeMs: 150,
    }));

    const comparison = svc.compareProfiles(baseline.id, current.id);
    assert.ok(comparison, 'comparison should not be undefined');
    assert.strictEqual(comparison!.baselineId, baseline.id);
    assert.strictEqual(comparison!.currentId, current.id);
    assert.strictEqual(comparison!.deltas.length, 5);

    // CPU improved (10000 → 8000)
    const cpuDelta = comparison!.deltas.find(d => d.metric === 'cpuInstructions');
    assert.ok(cpuDelta);
    assert.strictEqual(cpuDelta!.baselineValue, 10_000);
    assert.strictEqual(cpuDelta!.currentValue, 8_000);
    assert.strictEqual(cpuDelta!.absoluteChange, -2_000);
    assert.strictEqual(cpuDelta!.improved, true);

    // Memory regressed (4096 → 5120)
    const memDelta = comparison!.deltas.find(d => d.metric === 'memoryBytes');
    assert.ok(memDelta);
    assert.strictEqual(memDelta!.improved, false);
    assert.ok(memDelta!.absoluteChange > 0);

    console.log('  [ok] compareProfiles produces correct deltas');
}

async function testCompareProfilesNotFound() {
    const { svc } = createService();
    const result = svc.compareProfiles('nonexistent1', 'nonexistent2');
    assert.strictEqual(result, undefined);
    console.log('  [ok] compareProfiles returns undefined for missing profiles');
}

async function testCompareProfilesSummaryImproved() {
    const { svc } = createService();
    const baseline = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 10_000,
        memoryBytes: 4096,
        storageReads: 10,
        storageWrites: 5,
        executionTimeMs: 200,
    }));
    const current = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 5_000,
        memoryBytes: 2048,
        storageReads: 5,
        storageWrites: 2,
        executionTimeMs: 100,
    }));

    const comparison = svc.compareProfiles(baseline.id, current.id);
    assert.strictEqual(comparison!.summary.verdict, 'improved');
    assert.strictEqual(comparison!.summary.regressed, 0);
    assert.ok(comparison!.summary.improved > 0);
    console.log('  [ok] comparison summary shows "improved" when all metrics decrease');
}

async function testCompareProfilesSummaryRegressed() {
    const { svc } = createService();
    const baseline = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 5_000,
        memoryBytes: 2048,
        storageReads: 5,
        storageWrites: 2,
        executionTimeMs: 100,
    }));
    const current = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 10_000,
        memoryBytes: 4096,
        storageReads: 10,
        storageWrites: 5,
        executionTimeMs: 200,
    }));

    const comparison = svc.compareProfiles(baseline.id, current.id);
    assert.strictEqual(comparison!.summary.verdict, 'regressed');
    console.log('  [ok] comparison summary shows "regressed" when all metrics increase');
}

async function testCompareProfilesSummaryMixed() {
    const { svc } = createService();
    const baseline = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 10_000,
        memoryBytes: 2048,
    }));
    const current = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 5_000,
        memoryBytes: 4096,
    }));

    const comparison = svc.compareProfiles(baseline.id, current.id);
    assert.strictEqual(comparison!.summary.verdict, 'mixed');
    console.log('  [ok] comparison summary shows "mixed" for mixed changes');
}

async function testCompareProfilesSummaryUnchanged() {
    const { svc } = createService();
    const params = makeProfileParams();
    const baseline = await svc.recordProfile(params);
    const current = await svc.recordProfile(params);

    const comparison = svc.compareProfiles(baseline.id, current.id);
    assert.strictEqual(comparison!.summary.verdict, 'unchanged');
    assert.strictEqual(comparison!.summary.unchanged, 5);
    console.log('  [ok] comparison summary shows "unchanged" for identical profiles');
}

async function testCompareProfileDataDirect() {
    const { svc } = createService();
    const baseline = await svc.recordProfile(makeProfileParams({ cpuInstructions: 100 }));
    const current = await svc.recordProfile(makeProfileParams({ cpuInstructions: 200 }));

    const comparison = svc.compareProfileData(baseline, current);
    assert.strictEqual(comparison.baselineId, baseline.id);
    assert.strictEqual(comparison.currentId, current.id);
    console.log('  [ok] compareProfileData works with direct profile objects');
}

async function testCompareProfilesPercentageChange() {
    const { svc } = createService();
    const baseline = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 100,
    }));
    const current = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 150,
    }));

    const comparison = svc.compareProfiles(baseline.id, current.id);
    const cpuDelta = comparison!.deltas.find(d => d.metric === 'cpuInstructions');
    assert.ok(cpuDelta);
    assert.strictEqual(cpuDelta!.percentageChange, 50); // (150-100)/100 * 100 = 50%
    console.log('  [ok] percentage change calculated correctly');
}

async function testCompareProfilesZeroBaseline() {
    const { svc } = createService();
    const baseline = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 0,
    }));
    const current = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 100,
    }));

    const comparison = svc.compareProfiles(baseline.id, current.id);
    const cpuDelta = comparison!.deltas.find(d => d.metric === 'cpuInstructions');
    assert.ok(cpuDelta);
    assert.strictEqual(cpuDelta!.percentageChange, Infinity);
    console.log('  [ok] percentage change is Infinity when baseline is zero');
}

async function testCompareProfilesBothZero() {
    const { svc } = createService();
    const baseline = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 0,
    }));
    const current = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 0,
    }));

    const comparison = svc.compareProfiles(baseline.id, current.id);
    const cpuDelta = comparison!.deltas.find(d => d.metric === 'cpuInstructions');
    assert.ok(cpuDelta);
    assert.strictEqual(cpuDelta!.percentageChange, 0);
    assert.strictEqual(cpuDelta!.absoluteChange, 0);
    console.log('  [ok] both zero results in 0% change');
}

// ── Tests: Statistics ────────────────────────────────────────

async function testGetStatistics() {
    const { svc } = createService({
        cpu: { warning: 100, critical: 500 },
        memory: { warning: 999_999_999, critical: 999_999_999 },
        storage: { warning: 999, critical: 999 },
        time: { warning: 999_999, critical: 999_999 },
    });

    await svc.recordProfile(makeProfileParams({
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        functionName: 'fn1',
        cpuInstructions: 200,
        memoryBytes: 1000,
    }));
    await svc.recordProfile(makeProfileParams({
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        functionName: 'fn2',
        cpuInstructions: 400,
        memoryBytes: 2000,
    }));
    await svc.recordProfile(makeProfileParams({
        contractId: 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        functionName: 'fn1',
        cpuInstructions: 600,
        memoryBytes: 3000,
    }));

    const stats = svc.getStatistics();
    assert.strictEqual(stats.totalProfiles, 3);
    assert.strictEqual(stats.uniqueContracts, 2);
    assert.strictEqual(stats.uniqueFunctions, 3);
    assert.strictEqual(stats.averages.cpuInstructions, 400); // (200+400+600)/3
    assert.strictEqual(stats.averages.memoryBytes, 2000);    // (1000+2000+3000)/3
    assert.strictEqual(stats.peaks.cpuInstructions, 600);
    assert.strictEqual(stats.peaks.memoryBytes, 3000);
    assert.ok(stats.totalWarnings > 0, 'should have warnings from CPU threshold');
    console.log('  [ok] getStatistics returns correct aggregates');
}

async function testGetStatisticsEmpty() {
    const { svc } = createService();
    const stats = svc.getStatistics();

    assert.strictEqual(stats.totalProfiles, 0);
    assert.strictEqual(stats.uniqueContracts, 0);
    assert.strictEqual(stats.uniqueFunctions, 0);
    assert.strictEqual(stats.averages.cpuInstructions, 0);
    assert.strictEqual(stats.peaks.cpuInstructions, 0);
    assert.strictEqual(stats.totalWarnings, 0);
    assert.strictEqual(stats.warningsBySeverity.info, 0);
    assert.strictEqual(stats.warningsBySeverity.warning, 0);
    assert.strictEqual(stats.warningsBySeverity.critical, 0);
    console.log('  [ok] getStatistics handles empty state');
}

// ── Tests: Export / Import ───────────────────────────────────

async function testExportProfiles() {
    const { svc } = createService();
    await svc.recordProfile(makeProfileParams());

    const json = svc.exportProfiles();
    const parsed = JSON.parse(json);

    assert.ok(parsed.exportedAt);
    assert.strictEqual(parsed.version, 1);
    assert.ok(Array.isArray(parsed.profiles));
    assert.strictEqual(parsed.profiles.length, 1);
    assert.ok(Array.isArray(parsed.comparisons));
    assert.strictEqual(parsed.comparisons.length, 0);
    console.log('  [ok] exportProfiles produces valid JSON');
}

async function testExportProfilesWithComparisons() {
    const { svc } = createService();
    const p1 = await svc.recordProfile(makeProfileParams({ cpuInstructions: 100 }));
    const p2 = await svc.recordProfile(makeProfileParams({ cpuInstructions: 200 }));

    const comparison = svc.compareProfiles(p1.id, p2.id)!;
    const json = svc.exportProfiles([comparison]);
    const parsed = JSON.parse(json);

    assert.strictEqual(parsed.comparisons.length, 1);
    assert.strictEqual(parsed.comparisons[0].baselineId, p1.id);
    console.log('  [ok] exportProfiles includes comparisons');
}

async function testImportProfiles() {
    const { svc } = createService();
    await svc.recordProfile(makeProfileParams({ functionName: 'existing' }));

    const importData = JSON.stringify({
        version: 1,
        profiles: [
            {
                id: 'imported_1',
                contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                functionName: 'imported_fn',
                network: 'testnet',
                createdAt: new Date().toISOString(),
                usage: {
                    cpuInstructions: 100,
                    memoryBytes: 200,
                    storageReads: 1,
                    storageWrites: 0,
                    executionTimeMs: 50,
                    timestamp: new Date().toISOString(),
                },
                timeBreakdown: { setupMs: 10, executionMs: 30, storageMs: 10, totalMs: 50 },
                warnings: [],
            },
        ],
    });

    const result = await svc.importProfiles(importData);
    assert.strictEqual(result.imported, 1);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(svc.getProfileCount(), 2);
    console.log('  [ok] importProfiles merges new profiles');
}

async function testImportProfilesSkipsDuplicates() {
    const { svc } = createService();
    const profile = await svc.recordProfile(makeProfileParams());

    const importData = JSON.stringify({
        profiles: [
            {
                id: profile.id,
                contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                functionName: 'dup',
                network: 'testnet',
                createdAt: new Date().toISOString(),
                usage: {
                    cpuInstructions: 0, memoryBytes: 0, storageReads: 0,
                    storageWrites: 0, executionTimeMs: 0, timestamp: new Date().toISOString(),
                },
                timeBreakdown: { setupMs: 0, executionMs: 0, storageMs: 0, totalMs: 0 },
                warnings: [],
            },
        ],
    });

    const result = await svc.importProfiles(importData);
    assert.strictEqual(result.imported, 0);
    assert.strictEqual(result.skipped, 1);
    assert.strictEqual(svc.getProfileCount(), 1);
    console.log('  [ok] importProfiles skips duplicate ids');
}

async function testImportProfilesRejectsInvalidJson() {
    const { svc } = createService();
    let threw = false;
    try {
        await svc.importProfiles('not json');
    } catch (e) {
        threw = true;
        assert.ok((e as Error).message.includes('Invalid JSON'));
    }
    assert.ok(threw, 'should throw on invalid JSON');
    console.log('  [ok] importProfiles rejects invalid JSON');
}

async function testImportProfilesRejectsMissingArray() {
    const { svc } = createService();
    let threw = false;
    try {
        await svc.importProfiles(JSON.stringify({ noProfiles: true }));
    } catch (e) {
        threw = true;
        assert.ok((e as Error).message.includes('profiles'));
    }
    assert.ok(threw, 'should throw on missing profiles array');
    console.log('  [ok] importProfiles rejects missing profiles array');
}

async function testImportProfilesSkipsInvalidEntries() {
    const { svc } = createService();
    const importData = JSON.stringify({
        profiles: [
            { id: 'bad', contractId: 123 },
            {
                id: 'good',
                contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                functionName: 'fn',
                network: 'testnet',
                createdAt: new Date().toISOString(),
                usage: {
                    cpuInstructions: 0, memoryBytes: 0, storageReads: 0,
                    storageWrites: 0, executionTimeMs: 0, timestamp: new Date().toISOString(),
                },
                timeBreakdown: { setupMs: 0, executionMs: 0, storageMs: 0, totalMs: 0 },
                warnings: [],
            },
        ],
    });

    const result = await svc.importProfiles(importData);
    assert.strictEqual(result.imported, 1);
    assert.strictEqual(result.skipped, 1);
    console.log('  [ok] importProfiles skips invalid entries');
}

// ── Tests: Display formatting ────────────────────────────────

async function testFormatProfileBreakdown() {
    const { svc } = createService();
    const profile = await svc.recordProfile(makeProfileParams());

    const output = svc.formatProfileBreakdown(profile);
    assert.ok(output.includes('hello()'), 'should include function name');
    assert.ok(output.includes('CPU Instructions'), 'should include CPU label');
    assert.ok(output.includes('Memory Usage'), 'should include memory label');
    assert.ok(output.includes('Storage Reads'), 'should include storage reads');
    assert.ok(output.includes('Execution Time Breakdown'), 'should include time breakdown');
    console.log('  [ok] formatProfileBreakdown produces readable output');
}

async function testFormatProfileBreakdownWithWarnings() {
    const { svc } = createService({
        cpu: { warning: 100, critical: 500 },
        memory: { warning: 999_999_999, critical: 999_999_999 },
        storage: { warning: 999, critical: 999 },
        time: { warning: 999_999, critical: 999_999 },
    });

    const profile = await svc.recordProfile(makeProfileParams({
        cpuInstructions: 200,
    }));

    const output = svc.formatProfileBreakdown(profile);
    assert.ok(output.includes('Warnings'), 'should include warnings section');
    assert.ok(output.includes('cpu'), 'should reference cpu category');
    console.log('  [ok] formatProfileBreakdown includes warnings section');
}

async function testFormatComparison() {
    const { svc } = createService();
    const baseline = await svc.recordProfile(makeProfileParams({ cpuInstructions: 100 }));
    const current = await svc.recordProfile(makeProfileParams({ cpuInstructions: 200 }));

    const comparison = svc.compareProfiles(baseline.id, current.id)!;
    const output = svc.formatComparison(comparison);

    assert.ok(output.includes('Resource Comparison'), 'should include title');
    assert.ok(output.includes('Verdict'), 'should include verdict');
    assert.ok(output.includes('CPU Instructions'), 'should include CPU metric');
    console.log('  [ok] formatComparison produces readable output');
}

// ── Tests: Profile trimming ──────────────────────────────────

async function testProfileTrimming() {
    const { svc, ctx } = createService();

    // Seed 200 profiles directly
    const profiles: any[] = [];
    for (let i = 0; i < 200; i++) {
        profiles.push({
            id: `rp_${i}`,
            contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            functionName: 'fn',
            network: 'testnet',
            usage: {
                cpuInstructions: 0, memoryBytes: 0, storageReads: 0,
                storageWrites: 0, executionTimeMs: 0,
                timestamp: new Date().toISOString(),
            },
            timeBreakdown: { setupMs: 0, executionMs: 0, storageMs: 0, totalMs: 0 },
            warnings: [],
            createdAt: new Date(Date.now() + i).toISOString(),
        });
    }
    await ctx.workspaceState.update('stellarSuite.resourceProfiles', profiles);
    assert.strictEqual(svc.getProfileCount(), 200);

    // Adding one more should trim to 200
    await svc.recordProfile(makeProfileParams());
    assert.strictEqual(svc.getProfileCount(), 200);
    console.log('  [ok] profiles trim to max 200 entries');
}

// ── Tests: Output channel logging ────────────────────────────

async function testOutputChannelLogging() {
    const { svc, out } = createService();
    await svc.recordProfile(makeProfileParams());

    assert.ok(out.lines.length > 0, 'should log to output channel');
    assert.ok(out.lines.some((l: string) => l.includes('[ResourceProfile]')));
    console.log('  [ok] service logs to output channel');
}

async function testOutputChannelWarningCount() {
    const { svc, out } = createService({
        cpu: { warning: 100, critical: 500 },
        memory: { warning: 999_999_999, critical: 999_999_999 },
        storage: { warning: 999, critical: 999 },
        time: { warning: 999_999, critical: 999_999 },
    });

    await svc.recordProfile(makeProfileParams({ cpuInstructions: 200 }));

    assert.ok(out.lines.some((l: string) => l.includes('1 warning')));
    console.log('  [ok] log message includes warning count');
}

// ── Tests: Negative execution time guard ─────────────────────

async function testNegativeExecutionTimeGuard() {
    const { svc } = createService();
    const profile = await svc.recordProfile(makeProfileParams({
        executionTimeMs: 100,
        setupTimeMs: 60,
        storageTimeMs: 60,
    }));

    // 100 - 60 - 60 = -20, but should be clamped to 0
    assert.strictEqual(profile.timeBreakdown.executionMs, 0);
    console.log('  [ok] execution time clamped to zero when setup + storage > total');
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
    const tests = [
        // Profile creation
        testRecordProfile,
        testRecordProfileTimeBreakdown,
        testRecordProfileDefaultValues,
        testRecordProfileWithSimulationId,
        testRecordProfileWithLabel,
        // Retrieval
        testGetProfile,
        testGetProfileNotFound,
        testGetAllProfiles,
        testGetAllProfilesNewestFirst,
        testGetProfilesByContract,
        testGetProfilesByFunction,
        testGetProfileCount,
        // Deletion
        testDeleteProfile,
        testDeleteProfileNotFound,
        testClearProfiles,
        // Threshold warnings
        testNoWarningsBelowThresholds,
        testCpuWarning,
        testCpuCritical,
        testMemoryWarning,
        testStorageWarning,
        testTimeWarning,
        testMultipleWarnings,
        testEvaluateThresholdsDirect,
        testSetThresholds,
        testSetThresholdsDoesNotMutateOriginal,
        // Comparison
        testCompareProfiles,
        testCompareProfilesNotFound,
        testCompareProfilesSummaryImproved,
        testCompareProfilesSummaryRegressed,
        testCompareProfilesSummaryMixed,
        testCompareProfilesSummaryUnchanged,
        testCompareProfileDataDirect,
        testCompareProfilesPercentageChange,
        testCompareProfilesZeroBaseline,
        testCompareProfilesBothZero,
        // Statistics
        testGetStatistics,
        testGetStatisticsEmpty,
        // Export / Import
        testExportProfiles,
        testExportProfilesWithComparisons,
        testImportProfiles,
        testImportProfilesSkipsDuplicates,
        testImportProfilesRejectsInvalidJson,
        testImportProfilesRejectsMissingArray,
        testImportProfilesSkipsInvalidEntries,
        // Display formatting
        testFormatProfileBreakdown,
        testFormatProfileBreakdownWithWarnings,
        testFormatComparison,
        // Trimming
        testProfileTrimming,
        // Logging
        testOutputChannelLogging,
        testOutputChannelWarningCount,
        // Edge cases
        testNegativeExecutionTimeGuard,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nresourceProfiling unit tests');
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
