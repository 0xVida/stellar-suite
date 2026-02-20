// ============================================================
// src/test/stateBackup.test.ts
// Unit tests for StateBackupService.
//
// Run with:  node out-test/test/stateBackup.test.js
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import {
    StateBackupService,
    BackupEntry,
    BackupTrigger,
} from '../services/stateBackupService';

// ── Mock helpers ──────────────────────────────────────────────

function createMockContext(initialState: Record<string, unknown> = {}) {
    const store: Record<string, unknown> = { ...initialState };
    return {
        workspaceState: {
            get<T>(key: string, defaultValue: T): T {
                return (store[key] as T) ?? defaultValue;
            },
            update(key: string, value: unknown): Promise<void> {
                store[key] = value;
                return Promise.resolve();
            },
            keys(): readonly string[] {
                return Object.keys(store);
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

function createService(initialState: Record<string, unknown> = {}) {
    const ctx = createMockContext(initialState);
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);
    return { svc, ctx, out };
}

// ── Tests ─────────────────────────────────────────────────────

async function testCreateManualBackup() {
    const { svc } = createService({ 'stellarSuite.deploymentHistory': [{ id: 'dep1' }] });
    const entry = await svc.createBackup('manual', { label: 'test-backup' });
    assert.ok(entry.id, 'entry should have an id');
    assert.ok(entry.id.startsWith('bak_'), 'id should start with bak_');
    assert.ok(entry.createdAt, 'entry should have a timestamp');
    assert.strictEqual(entry.trigger, 'manual');
    assert.strictEqual(entry.label, 'test-backup');
    assert.strictEqual(entry.status, 'valid');
    assert.ok(entry.checksum, 'entry should have a checksum');
    assert.ok(entry.sizeBytes > 0, 'sizeBytes should be positive');
    assert.ok(entry.snapshot['stellarSuite.deploymentHistory'], 'snapshot should contain workspace keys');
    console.log('  [ok] createBackup stores manual backup with correct fields');
}

async function testCreateAutoBackup() {
    const { svc } = createService();
    const entry = await svc.createBackup('auto');
    assert.strictEqual(entry.trigger, 'auto');
    assert.strictEqual(entry.label, undefined);
    console.log('  [ok] createBackup stores auto backup');
}

async function testCreatePreOperationBackup() {
    const { svc } = createService();
    const entry = await svc.createPreOperationBackup('deploy');
    assert.strictEqual(entry.trigger, 'pre-operation');
    assert.ok(entry.description?.includes('deploy'));
    console.log('  [ok] createPreOperationBackup sets trigger and description');
}

async function testSnapshotExcludesBackupKey() {
    const { svc, ctx } = createService();
    // Create a backup so the backup storage key exists
    await svc.createBackup('manual');
    // Create another backup — its snapshot should NOT include the backup storage key
    const entry = await svc.createBackup('manual');
    assert.strictEqual(entry.snapshot['stellarSuite.stateBackups'], undefined,
        'snapshot should not include the backup storage key');
    console.log('  [ok] snapshot excludes internal backup storage key');
}

async function testGetBackup() {
    const { svc } = createService();
    const entry = await svc.createBackup('manual');
    const found = svc.getBackup(entry.id);
    assert.ok(found, 'should find backup by id');
    assert.strictEqual(found!.id, entry.id);
    console.log('  [ok] getBackup retrieves by id');
}

async function testGetBackupNotFound() {
    const { svc } = createService();
    const found = svc.getBackup('nonexistent');
    assert.strictEqual(found, undefined);
    console.log('  [ok] getBackup returns undefined for unknown id');
}

async function testGetAllBackups() {
    const { svc } = createService();
    await svc.createBackup('manual', { label: 'first' });
    await svc.createBackup('auto');
    await svc.createBackup('pre-operation', { description: 'before deploy' });
    const all = svc.getAllBackups();
    assert.strictEqual(all.length, 3);
    // Should be sorted newest first
    const timestamps = all.map(e => new Date(e.createdAt).getTime());
    for (let i = 1; i < timestamps.length; i++) {
        assert.ok(timestamps[i - 1] >= timestamps[i], 'should be sorted newest first');
    }
    console.log('  [ok] getAllBackups returns all entries sorted newest first');
}

async function testGetBackupsByTrigger() {
    const { svc } = createService();
    await svc.createBackup('manual');
    await svc.createBackup('auto');
    await svc.createBackup('manual');
    const manuals = svc.getBackupsByTrigger('manual');
    assert.strictEqual(manuals.length, 2);
    assert.ok(manuals.every(e => e.trigger === 'manual'));
    console.log('  [ok] getBackupsByTrigger filters correctly');
}

async function testDeleteBackup() {
    const { svc } = createService();
    const entry = await svc.createBackup('manual');
    assert.strictEqual(svc.getBackupCount(), 1);
    const ok = await svc.deleteBackup(entry.id);
    assert.strictEqual(ok, true);
    assert.strictEqual(svc.getBackupCount(), 0);
    console.log('  [ok] deleteBackup removes entry');
}

async function testDeleteBackupNotFound() {
    const { svc } = createService();
    const ok = await svc.deleteBackup('nonexistent');
    assert.strictEqual(ok, false);
    console.log('  [ok] deleteBackup returns false for unknown id');
}

async function testClearAllBackups() {
    const { svc } = createService();
    await svc.createBackup('manual');
    await svc.createBackup('auto');
    assert.strictEqual(svc.getBackupCount(), 2);
    await svc.clearAllBackups();
    assert.strictEqual(svc.getBackupCount(), 0);
    console.log('  [ok] clearAllBackups removes all entries');
}

async function testLabelBackup() {
    const { svc } = createService();
    const entry = await svc.createBackup('manual');
    const ok = await svc.labelBackup(entry.id, 'my-label');
    assert.strictEqual(ok, true);
    const updated = svc.getBackup(entry.id);
    assert.strictEqual(updated!.label, 'my-label');
    console.log('  [ok] labelBackup updates label');
}

async function testLabelBackupNotFound() {
    const { svc } = createService();
    const ok = await svc.labelBackup('nonexistent', 'label');
    assert.strictEqual(ok, false);
    console.log('  [ok] labelBackup returns false for unknown id');
}

async function testValidateBackupIntegrity() {
    const { svc } = createService({ 'some.key': 'value' });
    const entry = await svc.createBackup('manual');
    const result = svc.validateBackupIntegrity(entry);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.error, undefined);
    console.log('  [ok] validateBackupIntegrity passes for valid backup');
}

async function testValidateBackupIntegrityCorrupted() {
    const { svc } = createService({ 'some.key': 'value' });
    const entry = await svc.createBackup('manual');
    // Tamper with the snapshot
    entry.snapshot['some.key'] = 'tampered';
    const result = svc.validateBackupIntegrity(entry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('Checksum mismatch'));
    console.log('  [ok] validateBackupIntegrity detects corrupted snapshot');
}

async function testValidateBackupIntegrityMissingSnapshot() {
    const { svc } = createService();
    const entry = await svc.createBackup('manual');
    (entry as any).snapshot = null;
    const result = svc.validateBackupIntegrity(entry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('missing'));
    console.log('  [ok] validateBackupIntegrity detects missing snapshot');
}

async function testValidateAllBackups() {
    const { svc } = createService({ 'key': 'val' });
    await svc.createBackup('manual');
    await svc.createBackup('auto');
    const result = await svc.validateAllBackups();
    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.valid, 2);
    assert.strictEqual(result.corrupted, 0);
    console.log('  [ok] validateAllBackups reports correct counts');
}

async function testRestoreFromBackup() {
    const { svc, ctx } = createService({
        'stellarSuite.deploymentHistory': [{ id: 'dep1' }],
        'stellarSuite.configurations': { network: 'testnet' },
    });

    const backup = await svc.createBackup('manual');

    // Modify state after backup
    await ctx.workspaceState.update('stellarSuite.deploymentHistory', [{ id: 'dep2' }]);
    await ctx.workspaceState.update('stellarSuite.configurations', { network: 'mainnet' });

    // Verify state changed
    assert.deepStrictEqual(
        ctx.workspaceState.get('stellarSuite.configurations', {}),
        { network: 'mainnet' }
    );

    // Restore
    const result = await svc.restoreFromBackup(backup.id);
    assert.strictEqual(result.success, true);
    assert.ok(result.restoredKeys.length > 0);
    assert.strictEqual(result.errors.length, 0);

    // Verify state restored
    assert.deepStrictEqual(
        ctx.workspaceState.get('stellarSuite.configurations', {}),
        { network: 'testnet' }
    );
    console.log('  [ok] restoreFromBackup restores workspace state correctly');
}

async function testRestoreFromBackupNotFound() {
    const { svc } = createService();
    const result = await svc.restoreFromBackup('nonexistent');
    assert.strictEqual(result.success, false);
    assert.ok(result.errors[0].includes('not found'));
    console.log('  [ok] restoreFromBackup returns error for unknown id');
}

async function testRestoreFromCorruptedBackup() {
    const { svc, ctx } = createService({ 'key': 'val' });
    const backup = await svc.createBackup('manual');

    // Corrupt the stored backup by tampering with its checksum
    const entries = ctx.workspaceState.get<BackupEntry[]>('stellarSuite.stateBackups', []);
    entries[0].checksum = 'deadbeef';
    await ctx.workspaceState.update('stellarSuite.stateBackups', entries);

    const result = await svc.restoreFromBackup(backup.id);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors[0].includes('integrity'));
    console.log('  [ok] restoreFromBackup rejects corrupted backup');
}

async function testGetStatistics() {
    const { svc } = createService();
    await svc.createBackup('manual');
    await svc.createBackup('auto');
    await svc.createPreOperationBackup('deploy');
    const stats = svc.getStatistics();
    assert.strictEqual(stats.totalBackups, 3);
    assert.strictEqual(stats.manualCount, 1);
    assert.strictEqual(stats.autoCount, 1);
    assert.strictEqual(stats.preOperationCount, 1);
    assert.ok(stats.oldestBackup);
    assert.ok(stats.newestBackup);
    assert.ok(stats.totalSizeBytes > 0);
    console.log('  [ok] getStatistics returns correct aggregates');
}

async function testGetStatisticsEmpty() {
    const { svc } = createService();
    const stats = svc.getStatistics();
    assert.strictEqual(stats.totalBackups, 0);
    assert.strictEqual(stats.manualCount, 0);
    assert.strictEqual(stats.autoCount, 0);
    assert.strictEqual(stats.preOperationCount, 0);
    assert.strictEqual(stats.oldestBackup, undefined);
    assert.strictEqual(stats.newestBackup, undefined);
    assert.strictEqual(stats.totalSizeBytes, 0);
    console.log('  [ok] getStatistics handles empty state');
}

async function testGetBackupCount() {
    const { svc } = createService();
    assert.strictEqual(svc.getBackupCount(), 0);
    await svc.createBackup('manual');
    assert.strictEqual(svc.getBackupCount(), 1);
    await svc.createBackup('auto');
    assert.strictEqual(svc.getBackupCount(), 2);
    console.log('  [ok] getBackupCount tracks count');
}

async function testExportBackups() {
    const { svc } = createService({ 'key': 'value' });
    await svc.createBackup('manual', { label: 'export-test' });
    const json = svc.exportBackups();
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.version, 1);
    assert.ok(parsed.exportedAt);
    assert.ok(Array.isArray(parsed.entries));
    assert.strictEqual(parsed.entries.length, 1);
    assert.strictEqual(parsed.entries[0].label, 'export-test');
    console.log('  [ok] exportBackups produces valid JSON with entries');
}

async function testImportBackups() {
    const { svc } = createService();
    await svc.createBackup('manual', { label: 'existing' });

    const snapshot = { 'some.key': 'imported-value' };
    const serialized = JSON.stringify(snapshot);
    // Compute checksum the same way the service does (DJB2)
    let hash = 5381;
    for (let i = 0; i < serialized.length; i++) {
        hash = ((hash << 5) + hash + serialized.charCodeAt(i)) >>> 0;
    }
    const checksum = hash.toString(16).padStart(8, '0');

    const importData = JSON.stringify({
        version: 1,
        entries: [{
            id: 'imported_1',
            createdAt: new Date().toISOString(),
            trigger: 'manual',
            snapshot,
            checksum,
            sizeBytes: serialized.length,
            status: 'valid',
        }],
    });

    const result = await svc.importBackups(importData);
    assert.strictEqual(result.imported, 1);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(svc.getBackupCount(), 2);
    console.log('  [ok] importBackups merges new entries');
}

async function testImportBackupsSkipsDuplicates() {
    const { svc } = createService();
    const entry = await svc.createBackup('manual');

    const importData = JSON.stringify({
        version: 1,
        entries: [{
            id: entry.id,
            createdAt: new Date().toISOString(),
            trigger: 'manual',
            snapshot: {},
            checksum: 'abc',
            sizeBytes: 2,
            status: 'valid',
        }],
    });

    const result = await svc.importBackups(importData);
    assert.strictEqual(result.imported, 0);
    assert.strictEqual(result.skipped, 1);
    assert.strictEqual(svc.getBackupCount(), 1);
    console.log('  [ok] importBackups skips duplicate ids');
}

async function testImportBackupsRejectsInvalidJson() {
    const { svc } = createService();
    let threw = false;
    try {
        await svc.importBackups('not json');
    } catch (e) {
        threw = true;
        assert.ok((e as Error).message.includes('Invalid JSON'));
    }
    assert.ok(threw, 'should throw on invalid JSON');
    console.log('  [ok] importBackups rejects invalid JSON');
}

async function testImportBackupsRejectsInvalidFormat() {
    const { svc } = createService();
    let threw = false;
    try {
        await svc.importBackups(JSON.stringify({ noEntries: true }));
    } catch (e) {
        threw = true;
        assert.ok((e as Error).message.includes('entries'));
    }
    assert.ok(threw, 'should throw on missing entries array');
    console.log('  [ok] importBackups rejects missing entries array');
}

async function testImportBackupsSkipsInvalidEntries() {
    const { svc } = createService();

    const snapshot = { 'k': 'v' };
    const serialized = JSON.stringify(snapshot);
    let hash = 5381;
    for (let i = 0; i < serialized.length; i++) {
        hash = ((hash << 5) + hash + serialized.charCodeAt(i)) >>> 0;
    }
    const checksum = hash.toString(16).padStart(8, '0');

    const importData = JSON.stringify({
        version: 1,
        entries: [
            { id: 'bad', trigger: 123 }, // invalid: trigger not a valid string
            {
                id: 'good',
                createdAt: new Date().toISOString(),
                trigger: 'auto',
                snapshot,
                checksum,
                sizeBytes: serialized.length,
                status: 'valid',
            },
        ],
    });
    const result = await svc.importBackups(importData);
    assert.strictEqual(result.imported, 1);
    assert.strictEqual(result.skipped, 1);
    console.log('  [ok] importBackups skips invalid entries');
}

async function testImportBackupsRejectsUnsupportedVersion() {
    const { svc } = createService();
    let threw = false;
    try {
        await svc.importBackups(JSON.stringify({ version: 999, entries: [] }));
    } catch (e) {
        threw = true;
        assert.ok((e as Error).message.includes('Unsupported'));
    }
    assert.ok(threw, 'should throw on unsupported version');
    console.log('  [ok] importBackups rejects unsupported version');
}

async function testImportMarksCorruptedEntries() {
    const { svc } = createService();

    const importData = JSON.stringify({
        version: 1,
        entries: [{
            id: 'corrupted_1',
            createdAt: new Date().toISOString(),
            trigger: 'manual',
            snapshot: { 'key': 'value' },
            checksum: 'wrongchecksum',
            sizeBytes: 99,
            status: 'valid',
        }],
    });

    const result = await svc.importBackups(importData);
    assert.strictEqual(result.imported, 1);
    const imported = svc.getBackup('corrupted_1');
    assert.ok(imported);
    assert.strictEqual(imported!.status, 'corrupted');
    console.log('  [ok] importBackups marks entries with bad checksums as corrupted');
}

async function testBackupTrimming() {
    const { svc, ctx } = createService();
    // Manually seed 50 entries
    const entries: any[] = [];
    for (let i = 0; i < 50; i++) {
        const snapshot = { idx: i };
        const serialized = JSON.stringify(snapshot);
        let hash = 5381;
        for (let j = 0; j < serialized.length; j++) {
            hash = ((hash << 5) + hash + serialized.charCodeAt(j)) >>> 0;
        }
        entries.push({
            id: `bak_${i}`,
            createdAt: new Date(Date.now() + i).toISOString(),
            trigger: 'auto',
            snapshot,
            checksum: hash.toString(16).padStart(8, '0'),
            sizeBytes: serialized.length,
            status: 'valid',
        });
    }
    await ctx.workspaceState.update('stellarSuite.stateBackups', entries);
    assert.strictEqual(svc.getBackupCount(), 50);

    // Adding one more should trim to 50
    await svc.createBackup('manual');
    assert.strictEqual(svc.getBackupCount(), 50);
    console.log('  [ok] backup history trims to max 50 entries');
}

async function testOutputChannelLogging() {
    const { svc, out } = createService();
    await svc.createBackup('manual');
    assert.ok(out.lines.length > 0, 'should log to output channel');
    assert.ok(out.lines.some(l => l.includes('[Backup]')));
    console.log('  [ok] service logs to output channel');
}

async function testRestorePreservesBackupEntries() {
    const { svc, ctx } = createService({
        'stellarSuite.deploymentHistory': [{ id: 'dep1' }],
    });

    const backup = await svc.createBackup('manual');
    const backupCountBefore = svc.getBackupCount();

    // Restore should not wipe out the backup storage itself
    await svc.restoreFromBackup(backup.id);
    const backupCountAfter = svc.getBackupCount();
    assert.strictEqual(backupCountAfter, backupCountBefore,
        'backup entries should be preserved after restore');
    console.log('  [ok] restore preserves backup entries');
}

async function testEmptySnapshotBackup() {
    const { svc } = createService();
    const entry = await svc.createBackup('manual');
    assert.ok(entry.snapshot, 'snapshot should exist');
    assert.strictEqual(typeof entry.snapshot, 'object');
    const integrity = svc.validateBackupIntegrity(entry);
    assert.strictEqual(integrity.valid, true);
    console.log('  [ok] empty workspace produces valid backup');
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
    const tests = [
        testCreateManualBackup,
        testCreateAutoBackup,
        testCreatePreOperationBackup,
        testSnapshotExcludesBackupKey,
        testGetBackup,
        testGetBackupNotFound,
        testGetAllBackups,
        testGetBackupsByTrigger,
        testDeleteBackup,
        testDeleteBackupNotFound,
        testClearAllBackups,
        testLabelBackup,
        testLabelBackupNotFound,
        testValidateBackupIntegrity,
        testValidateBackupIntegrityCorrupted,
        testValidateBackupIntegrityMissingSnapshot,
        testValidateAllBackups,
        testRestoreFromBackup,
        testRestoreFromBackupNotFound,
        testRestoreFromCorruptedBackup,
        testGetStatistics,
        testGetStatisticsEmpty,
        testGetBackupCount,
        testExportBackups,
        testImportBackups,
        testImportBackupsSkipsDuplicates,
        testImportBackupsRejectsInvalidJson,
        testImportBackupsRejectsInvalidFormat,
        testImportBackupsSkipsInvalidEntries,
        testImportBackupsRejectsUnsupportedVersion,
        testImportMarksCorruptedEntries,
        testBackupTrimming,
        testOutputChannelLogging,
        testRestorePreservesBackupEntries,
        testEmptySnapshotBackup,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nstateBackup unit tests');
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
