const assert = require('assert');
import { StateConflictDetectionService } from '../services/stateConflictDetectionService';
import { StateConflictType } from '../types/stateConflict';

async function testNoConflict() {
    const service = new StateConflictDetectionService();
    const meta = { version: 1, updatedAt: '2026-01-01', clientId: 'A' };
    const local = { a: 1 };
    const remote = { a: 1 };

    const conflicts = service.detectConflicts(local, remote, meta, meta);
    assert.strictEqual(conflicts.length, 0);
    console.log('  [ok] detects no conflict when states are identical');
}

async function testSimpleConflict() {
    const service = new StateConflictDetectionService();
    const localMeta = { version: 1, updatedAt: '2026-01-01', clientId: 'A' };
    const remoteMeta = { version: 2, updatedAt: '2026-01-02', clientId: 'B' };
    const local = { a: 1 };
    const remote = { a: 2 };

    const conflicts = service.detectConflicts(local, remote, localMeta, remoteMeta);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].path, 'a');
    assert.strictEqual(conflicts[0].localValue, 1);
    assert.strictEqual(conflicts[0].remoteValue, 2);
    console.log('  [ok] detects simple value conflict');
}

async function testDeepConflict() {
    const service = new StateConflictDetectionService();
    const localMeta = { version: 1, updatedAt: '2026-01-01', clientId: 'A' };
    const remoteMeta = { version: 2, updatedAt: '2026-01-02', clientId: 'B' };
    const local = { a: { b: 1 }, c: 3 };
    const remote = { a: { b: 2 }, c: 3 };

    const conflicts = service.detectConflicts(local, remote, localMeta, remoteMeta);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].path, 'a.b');
    console.log('  [ok] detects deep object conflict');
}

async function run() {
    console.log('\nStateConflictDetectionService unit tests');
    try {
        await testNoConflict();
        await testSimpleConflict();
        await testDeepConflict();
        console.log('\nAll tests passed!');
    } catch (e) {
        console.error('\nTests failed:');
        console.error(e);
        process.exit(1);
    }
}

run();
