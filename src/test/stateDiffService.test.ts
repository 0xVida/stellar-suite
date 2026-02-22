declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { StateCaptureService } from '../services/stateCaptureService';
import { StateDiffService } from '../services/stateDiffService';

async function testCaptureDirectBeforeAfterSnapshots() {
    const capture = new StateCaptureService();

    const payload = {
        stateBefore: {
            entries: [
                { key: 'balance:alice', value: 10 },
                { key: 'supply', value: 100 }
            ]
        },
        stateAfter: {
            entries: [
                { key: 'balance:alice', value: 25 },
                { key: 'supply', value: 100 },
                { key: 'balance:bob', value: 5 }
            ]
        }
    };

    const snapshots = capture.captureSnapshots(payload);
    assert.strictEqual(snapshots.before.entries.length, 2);
    assert.strictEqual(snapshots.after.entries.length, 3);
    assert.strictEqual(snapshots.before.entries[0].key, 'balance:alice');
    assert.strictEqual(snapshots.after.entries[2].key, 'balance:bob');
    console.log('  [ok] captures direct before/after snapshots');
}

async function testCaptureFromStateChangesFallback() {
    const capture = new StateCaptureService();

    const payload = {
        stateChanges: [
            { key: 'counter', before: 1, after: 2 },
            { key: 'new:key', after: 'created' },
            { key: 'old:key', before: 'deleted' },
        ]
    };

    const before = capture.captureBeforeState(payload);
    const after = capture.captureAfterState(payload);

    assert.strictEqual(before.entries.length, 2, 'before should include records with before value');
    assert.strictEqual(after.entries.length, 2, 'after should include records with after value');
    assert.ok(before.entries.some(entry => entry.key === 'counter'));
    assert.ok(after.entries.some(entry => entry.key === 'new:key'));
    console.log('  [ok] captures snapshots from stateChanges fallback');
}

async function testCalculateDiffCreatedModifiedDeleted() {
    const capture = new StateCaptureService();
    const diffService = new StateDiffService();

    const payload = {
        stateBefore: {
            entries: [
                { key: 'balance:alice', value: 10 },
                { key: 'toDelete', value: true },
                { key: 'unchanged', value: 'same' },
            ]
        },
        stateAfter: {
            entries: [
                { key: 'balance:alice', value: 99 },
                { key: 'created', value: 1 },
                { key: 'unchanged', value: 'same' },
            ]
        }
    };

    const { before, after } = capture.captureSnapshots(payload);
    const diff = diffService.calculateDiff(before, after);

    assert.strictEqual(diff.created.length, 1);
    assert.strictEqual(diff.modified.length, 1);
    assert.strictEqual(diff.deleted.length, 1);
    assert.strictEqual(diff.summary.totalChanges, 3);
    assert.strictEqual(diff.summary.unchanged, 1);
    assert.strictEqual(diff.created[0].key, 'created');
    assert.strictEqual(diff.deleted[0].key, 'toDelete');
    assert.strictEqual(diff.modified[0].key, 'balance:alice');
    console.log('  [ok] calculates created/modified/deleted/unchanged diffs');
}

async function testCalculateDiffSupportsComplexObjects() {
    const diffService = new StateDiffService();

    const before = {
        capturedAt: new Date().toISOString(),
        source: 'test',
        entries: [
            { key: 'complex', value: { b: 2, a: 1, nested: { z: 9, y: 8 } } },
            { key: 'list', value: [1, 2, { x: 'y' }] },
        ]
    };

    const after = {
        capturedAt: new Date().toISOString(),
        source: 'test',
        entries: [
            { key: 'complex', value: { nested: { y: 8, z: 9 }, a: 1, b: 2 } },
            { key: 'list', value: [1, 2, { x: 'changed' }] },
        ]
    };

    const diff = diffService.calculateDiff(before, after);
    assert.strictEqual(diff.modified.length, 1, 'only list should be considered modified');
    assert.strictEqual(diff.modified[0].key, 'list');
    assert.strictEqual(diff.summary.unchanged, 1);
    console.log('  [ok] handles complex nested objects deterministically');
}

async function testExportStateDiff() {
    const diffService = new StateDiffService();

    const diff = diffService.calculateDiff(
        {
            capturedAt: new Date().toISOString(),
            source: 'before',
            entries: [{ key: 'a', value: 1 }],
        },
        {
            capturedAt: new Date().toISOString(),
            source: 'after',
            entries: [{ key: 'a', value: 2 }],
        }
    );

    const exported = diffService.exportStateDiff(diff, { includeSnapshots: true });
    const parsed = JSON.parse(exported);

    assert.ok(parsed.exportedAt);
    assert.strictEqual(parsed.summary.totalChanges, 1);
    assert.ok(parsed.snapshots.before);
    assert.ok(parsed.snapshots.after);
    assert.strictEqual(parsed.changes.modified.length, 1);
    console.log('  [ok] exports state diff payload with snapshots');
}

async function run() {
    const tests = [
        testCaptureDirectBeforeAfterSnapshots,
        testCaptureFromStateChangesFallback,
        testCalculateDiffCreatedModifiedDeleted,
        testCalculateDiffSupportsComplexObjects,
        testExportStateDiff,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nstateDiffService unit tests');
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
