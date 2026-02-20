// ============================================================
// src/test/cliHistoryService.test.ts
// Unit tests for CliHistoryService.
//
// Run with:  node out/test/cliHistoryService.test.js
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import {
    CliHistoryService,
    CliHistoryEntry,
    CliHistoryFilter,
} from '../services/cliHistoryService';

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

function createService() {
    const ctx = createMockContext();
    const svc = new CliHistoryService(ctx as any);
    return { svc, ctx };
}

function makeParams(overrides: Partial<Omit<CliHistoryEntry, 'id' | 'timestamp'>> = {}) {
    return {
        command: 'stellar',
        args: ['contract', 'invoke', '--id', 'C123'],
        outcome: 'success' as const,
        durationMs: 100,
        source: 'manual' as const,
        ...overrides,
    };
}

// ── Tests ─────────────────────────────────────────────────────

async function testRecordCommand() {
    const { svc } = createService();
    const entry = await svc.recordCommand(makeParams());
    assert.ok(entry.id, 'entry should have an id');
    assert.ok(entry.timestamp, 'entry should have a timestamp');
    assert.strictEqual(entry.command, 'stellar');
    assert.strictEqual(entry.outcome, 'success');
    assert.strictEqual(entry.source, 'manual');
    console.log('  [ok] recordCommand stores entry with correct fields');
}

async function testGetEntry() {
    const { svc } = createService();
    const entry = await svc.recordCommand(makeParams());
    const found = svc.getEntry(entry.id);
    assert.ok(found, 'should find entry by id');
    assert.strictEqual(found!.id, entry.id);
    console.log('  [ok] getEntry retrieves by id');
}

async function testQueryHistoryFilterByOutcome() {
    const { svc } = createService();
    await svc.recordCommand(makeParams({ outcome: 'success' }));
    await svc.recordCommand(makeParams({ outcome: 'failure' }));
    const failures = svc.queryHistory({ outcome: 'failure' });
    assert.strictEqual(failures.length, 1);
    assert.strictEqual(failures[0].outcome, 'failure');
    console.log('  [ok] queryHistory filters by outcome');
}

async function testQueryHistoryFilterBySearchText() {
    const { svc } = createService();
    await svc.recordCommand(makeParams({ command: 'stellar', args: ['build'] }));
    await svc.recordCommand(makeParams({ command: 'stellar', args: ['deploy'] }));
    const results = svc.queryHistory({ searchText: 'deploy' });
    assert.strictEqual(results.length, 1);
    assert.ok(results[0].args.includes('deploy'));
    console.log('  [ok] queryHistory filters by searchText');
}

async function testMasking() {
    const { svc } = createService();
    const secretKey = 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const entry = await svc.recordCommand(makeParams({
        command: 'stellar',
        args: ['keys', 'add', '--secret-key', secretKey, 'mykey']
    }));

    const exported = JSON.parse(svc.exportHistory());
    const exportedEntry = exported.entries[0];
    assert.ok(!exportedEntry.args.includes(secretKey), 'secret key should be masked in exported history');
    assert.ok(exportedEntry.args.some((a: string) => a.includes('S***')), 'secret key should contain asterisks');
    console.log('  [ok] sensitive data is masked in export');
}

async function testHistoryTrimming() {
    const { svc } = createService();
    for (let i = 0; i < 110; i++) {
        await svc.recordCommand(makeParams());
    }
    const history = svc.queryHistory();
    assert.strictEqual(history.length, 100, 'history should be trimmed to max 100 entries');
    console.log('  [ok] history is trimmed to max entries');
}

async function testClearHistory() {
    const { svc } = createService();
    await svc.recordCommand(makeParams());
    await svc.clearHistory();
    assert.strictEqual(svc.queryHistory().length, 0);
    console.log('  [ok] clearHistory wipes all entries');
}

async function testDeleteEntry() {
    const { svc } = createService();
    const entry = await svc.recordCommand(makeParams());
    const ok = await svc.deleteEntry(entry.id);
    assert.strictEqual(ok, true);
    assert.strictEqual(svc.queryHistory().length, 0);
    console.log('  [ok] deleteEntry removes specific entry');
}

async function testSetLabel() {
    const { svc } = createService();
    const entry = await svc.recordCommand(makeParams());
    const ok = await svc.setLabel(entry.id, 'important-run');
    assert.strictEqual(ok, true);
    const updated = svc.getEntry(entry.id);
    assert.strictEqual(updated!.label, 'important-run');
    console.log('  [ok] setLabel updates entry label');
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
    const tests = [
        testRecordCommand,
        testGetEntry,
        testQueryHistoryFilterByOutcome,
        testQueryHistoryFilterBySearchText,
        testMasking,
        testHistoryTrimming,
        testClearHistory,
        testDeleteEntry,
        testSetLabel,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\ncliHistory unit tests');
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
