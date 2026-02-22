const assert = require('assert');
import { StateConflictResolutionService } from '../services/stateConflictResolutionService';
import { ConflictResolutionStrategy, StateConflictType } from '../types/stateConflict';

async function testLocalWins() {
    const service = new StateConflictResolutionService();
    const state = { a: 1 };
    const conflicts = [{
        type: StateConflictType.CONCURRENT_MODIFICATION,
        path: 'a',
        localValue: 1,
        remoteValue: 2,
        localMetadata: { version: 1, updatedAt: '', clientId: 'A' },
        remoteMetadata: { version: 2, updatedAt: '', clientId: 'B' }
    }];

    const result = service.resolve(state, conflicts, ConflictResolutionStrategy.LOCAL_WINS);
    assert.strictEqual(result.resolvedState.a, 1);
    console.log('  [ok] resolves via LOCAL_WINS');
}

async function testRemoteWins() {
    const service = new StateConflictResolutionService();
    const state = { a: 1 };
    const conflicts = [{
        type: StateConflictType.CONCURRENT_MODIFICATION,
        path: 'a',
        localValue: 1,
        remoteValue: 2,
        localMetadata: { version: 1, updatedAt: '', clientId: 'A' },
        remoteMetadata: { version: 2, updatedAt: '', clientId: 'B' }
    }];

    const result = service.resolve(state, conflicts, ConflictResolutionStrategy.REMOTE_WINS);
    assert.strictEqual(result.resolvedState.a, 2);
    console.log('  [ok] resolves via REMOTE_WINS');
}

async function testMerge() {
    const service = new StateConflictResolutionService();
    const state = { a: { x: 1 } };
    const conflicts = [{
        type: StateConflictType.CONCURRENT_MODIFICATION,
        path: 'a',
        localValue: { x: 1, y: 3 },
        remoteValue: { x: 2, z: 4 },
        localMetadata: { version: 1, updatedAt: '', clientId: 'A' },
        remoteMetadata: { version: 2, updatedAt: '', clientId: 'B' }
    }];

    const result = service.resolve(state, conflicts, ConflictResolutionStrategy.MERGE);
    assert.strictEqual(result.resolvedState.a.x, 1); // Local wins on overlap
    assert.strictEqual(result.resolvedState.a.y, 3);
    assert.strictEqual(result.resolvedState.a.z, 4);
    console.log('  [ok] resolves via MERGE');
}

async function run() {
    console.log('\nStateConflictResolutionService unit tests');
    try {
        await testLocalWins();
        await testRemoteWins();
        await testMerge();
        console.log('\nAll tests passed!');
    } catch (e) {
        console.error('\nTests failed:');
        console.error(e);
        process.exit(1);
    }
}

run();
