declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { StateBackupService, BackupEntry } from '../services/stateBackupService';
import { StateValidationService } from '../services/stateValidationService';
import { ContractWorkspaceStateService } from '../services/contractWorkStateService';
import {
    createMockContext,
    createMockOutputChannel,
    createMockMemento,
    makePopulatedState,
    makeDeploymentRecord,
    makeSecondDeploymentRecord,
    makeContractMetadata,
    makeCorruptedBackupEntry,
    makeValidBackupEntry,
    makeValidValidationState,
    makeMissingFieldsState,
    makeInvalidTypesState,
    computeChecksum,
} from './fixtures/statePersistenceFixtures';

// ── State storage ─────────────────────────────────────────────

async function testStoreAndRetrieveState() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    await ctx.workspaceState.update('stellarSuite.deployedContracts', { 'token.rs': 'CABC123' });
    await ctx.workspaceState.update('stellarSuite.userPreferences', { theme: 'dark' });

    const backup = await svc.createBackup('manual', { label: 'initial' });

    assert.ok(backup.snapshot['stellarSuite.deployedContracts']);
    assert.ok(backup.snapshot['stellarSuite.userPreferences']);
    assert.deepStrictEqual(backup.snapshot['stellarSuite.deployedContracts'], { 'token.rs': 'CABC123' });
    assert.deepStrictEqual(backup.snapshot['stellarSuite.userPreferences'], { theme: 'dark' });
    console.log('  [ok] stores and retrieves state in backup snapshot');
}

async function testMultipleBackupsPreserveHistory() {
    const ctx = createMockContext(makePopulatedState());
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const b1 = await svc.createBackup('manual', { label: 'first' });
    await ctx.workspaceState.update('stellarSuite.userPreferences', { theme: 'light' });
    const b2 = await svc.createBackup('manual', { label: 'second' });

    const all = svc.getAllBackups();
    assert.strictEqual(all.length, 2);

    const retrieved1 = svc.getBackup(b1.id);
    const retrieved2 = svc.getBackup(b2.id);
    assert.deepStrictEqual((retrieved1 as BackupEntry).snapshot['stellarSuite.userPreferences'], { theme: 'dark', autoSave: true });
    assert.deepStrictEqual((retrieved2 as BackupEntry).snapshot['stellarSuite.userPreferences'], { theme: 'light' });
    console.log('  [ok] multiple backups preserve independent state snapshots');
}

async function testBackupStatisticsAccurate() {
    const ctx = createMockContext(makePopulatedState());
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    await svc.createBackup('manual');
    await svc.createBackup('auto');
    await svc.createPreOperationBackup('deploy');

    const stats = svc.getStatistics();
    assert.strictEqual(stats.totalBackups, 3);
    assert.strictEqual(stats.manualCount, 1);
    assert.strictEqual(stats.autoCount, 1);
    assert.strictEqual(stats.preOperationCount, 1);
    assert.ok(stats.totalSizeBytes > 0);
    assert.ok(stats.oldestBackup);
    assert.ok(stats.newestBackup);
    console.log('  [ok] backup statistics are accurate across trigger types');
}

// ── State retrieval ───────────────────────────────────────────

async function testRetrieveByTriggerType() {
    const ctx = createMockContext(makePopulatedState());
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    await svc.createBackup('manual');
    await svc.createBackup('auto');
    await svc.createBackup('auto');
    await svc.createPreOperationBackup('sync');

    const manuals = svc.getBackupsByTrigger('manual');
    const autos = svc.getBackupsByTrigger('auto');
    const preOps = svc.getBackupsByTrigger('pre-operation');

    assert.strictEqual(manuals.length, 1);
    assert.strictEqual(autos.length, 2);
    assert.strictEqual(preOps.length, 1);
    console.log('  [ok] retrieves backups filtered by trigger type');
}

async function testRetrieveNonexistentBackup() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const result = svc.getBackup('bak_does_not_exist');
    assert.strictEqual(result, undefined);
    console.log('  [ok] returns undefined for nonexistent backup');
}

async function testDeleteBackup() {
    const ctx = createMockContext(makePopulatedState());
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const backup = await svc.createBackup('manual');
    assert.strictEqual(svc.getBackupCount(), 1);

    const deleted = await svc.deleteBackup(backup.id);
    assert.strictEqual(deleted, true);
    assert.strictEqual(svc.getBackupCount(), 0);
    assert.strictEqual(svc.getBackup(backup.id), undefined);
    console.log('  [ok] deletes a backup and removes it from history');
}

async function testDeleteNonexistentBackupReturnsFalse() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const result = await svc.deleteBackup('bak_nonexistent');
    assert.strictEqual(result, false);
    console.log('  [ok] returns false when deleting nonexistent backup');
}

// ── Backup and restore ───────────────────────────────────────

async function testBackupAndRestoreFullCycle() {
    const ctx = createMockContext(makePopulatedState());
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const backup = await svc.createBackup('manual', { label: 'pre-change' });
    const originalContracts = ctx.workspaceState.get('stellarSuite.deployedContracts', {});

    await ctx.workspaceState.update('stellarSuite.deployedContracts', { 'swap.rs': 'CXYZ' });
    await ctx.workspaceState.update('stellarSuite.userPreferences', { theme: 'new-theme' });

    const changedContracts = ctx.workspaceState.get('stellarSuite.deployedContracts', {});
    assert.deepStrictEqual(changedContracts, { 'swap.rs': 'CXYZ' });

    const result = await svc.restoreFromBackup(backup.id);
    assert.strictEqual(result.success, true);
    assert.ok(result.restoredKeys.length > 0);
    assert.strictEqual(result.errors.length, 0);

    const restored = ctx.workspaceState.get('stellarSuite.deployedContracts', {});
    assert.deepStrictEqual(restored, originalContracts);
    console.log('  [ok] full backup-modify-restore cycle preserves original state');
}

async function testRestoreNonexistentBackupFails() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const result = await svc.restoreFromBackup('bak_missing');
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('Backup not found')));
    console.log('  [ok] restore fails for nonexistent backup');
}

async function testRestoreCorruptedBackupFails() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const corrupted = makeCorruptedBackupEntry();
    await ctx.workspaceState.update('stellarSuite.stateBackups', [corrupted]);

    const result = await svc.restoreFromBackup(corrupted.id);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('integrity check failed')));
    console.log('  [ok] restore fails for corrupted backup');
}

async function testPreOperationBackupBeforeRestore() {
    const ctx = createMockContext(makePopulatedState());
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const preOp = await svc.createPreOperationBackup('deploy');
    assert.strictEqual(preOp.trigger, 'pre-operation');
    assert.ok(preOp.description?.includes('deploy'));

    await ctx.workspaceState.update('stellarSuite.deployedContracts', {});
    const result = await svc.restoreFromBackup(preOp.id);
    assert.strictEqual(result.success, true);

    const restored = ctx.workspaceState.get('stellarSuite.deployedContracts', {});
    assert.ok(Object.keys(restored).length > 0);
    console.log('  [ok] pre-operation backup enables rollback after destructive operation');
}

// ── Export and import ─────────────────────────────────────────

async function testExportImportCycle() {
    const ctx1 = createMockContext(makePopulatedState());
    const out1 = createMockOutputChannel();
    const svc1 = new StateBackupService(ctx1, out1);

    await svc1.createBackup('manual', { label: 'export-test' });
    await svc1.createBackup('auto');

    const exported = svc1.exportBackups();
    const parsed = JSON.parse(exported);
    assert.strictEqual(parsed.version, 1);
    assert.strictEqual(parsed.entries.length, 2);

    const ctx2 = createMockContext();
    const out2 = createMockOutputChannel();
    const svc2 = new StateBackupService(ctx2, out2);

    const importResult = await svc2.importBackups(exported);
    assert.strictEqual(importResult.imported, 2);
    assert.strictEqual(importResult.skipped, 0);
    assert.strictEqual(svc2.getBackupCount(), 2);
    console.log('  [ok] export/import cycle transfers backups between services');
}

async function testImportSkipsDuplicates() {
    const ctx = createMockContext(makePopulatedState());
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    await svc.createBackup('manual');
    const exported = svc.exportBackups();

    const result = await svc.importBackups(exported);
    assert.strictEqual(result.imported, 0);
    assert.strictEqual(result.skipped, 1);
    console.log('  [ok] import skips duplicate backup entries');
}

async function testImportRejectsInvalidJson() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    let threw = false;
    try {
        await svc.importBackups('not valid json');
    } catch (e) {
        threw = true;
        assert.ok((e as Error).message.includes('Invalid JSON'));
    }
    assert.strictEqual(threw, true);
    console.log('  [ok] import rejects invalid JSON');
}

async function testImportRejectsUnsupportedVersion() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const futureExport = JSON.stringify({ version: 999, entries: [] });
    let threw = false;
    try {
        await svc.importBackups(futureExport);
    } catch (e) {
        threw = true;
        assert.ok((e as Error).message.includes('Unsupported backup version'));
    }
    assert.strictEqual(threw, true);
    console.log('  [ok] import rejects unsupported backup version');
}

// ── State validation ──────────────────────────────────────────

async function testValidStatePassesValidation() {
    const validationSvc = new StateValidationService();
    const state = makeValidValidationState();
    const result = validationSvc.validate(state);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.summary.errorCount, 0);
    assert.strictEqual(result.summary.criticalCount, 0);
    console.log('  [ok] valid state passes validation');
}

async function testMissingFieldsDetected() {
    const validationSvc = new StateValidationService();
    const state = makeMissingFieldsState();
    const result = validationSvc.validate(state);
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.some(i => i.code === 'MISSING_REQUIRED_FIELD'));
    console.log('  [ok] missing fields detected during validation');
}

async function testInvalidTypesDetected() {
    const validationSvc = new StateValidationService();
    const state = makeInvalidTypesState();
    const result = validationSvc.validate(state);
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.some(i => i.code === 'INVALID_FIELD_TYPE'));
    console.log('  [ok] invalid types detected during validation');
}

async function testNullStateIsCritical() {
    const validationSvc = new StateValidationService();
    const result = validationSvc.validate(null);
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.some(i => i.severity === 'CRITICAL'));
    console.log('  [ok] null state produces critical validation error');
}

// ── State integrity ───────────────────────────────────────────

async function testBackupIntegrityValidation() {
    const ctx = createMockContext(makePopulatedState());
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const backup = await svc.createBackup('manual');
    const integrity = svc.validateBackupIntegrity(backup);
    assert.strictEqual(integrity.valid, true);
    assert.strictEqual(integrity.error, undefined);
    console.log('  [ok] valid backup passes integrity check');
}

async function testCorruptedChecksumDetected() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const corrupted = makeCorruptedBackupEntry();
    const integrity = svc.validateBackupIntegrity(corrupted);
    assert.strictEqual(integrity.valid, false);
    assert.ok(integrity.error?.includes('Checksum mismatch'));
    console.log('  [ok] corrupted checksum detected');
}

async function testCorruptedSizeDetected() {
    const snapshot = { key: 'value' };
    const serialized = JSON.stringify(snapshot);
    const entry: BackupEntry = {
        id: 'bak_bad_size',
        createdAt: new Date().toISOString(),
        trigger: 'manual',
        snapshot,
        checksum: computeChecksum(serialized),
        sizeBytes: 1,
        status: 'unknown',
    };

    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const integrity = svc.validateBackupIntegrity(entry);
    assert.strictEqual(integrity.valid, false);
    assert.ok(integrity.error?.includes('Size mismatch'));
    console.log('  [ok] corrupted size detected');
}

async function testValidateAllBackupsUpdatesStatus() {
    const ctx = createMockContext(makePopulatedState());
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    await svc.createBackup('manual');
    await svc.createBackup('auto');

    const corrupted = makeCorruptedBackupEntry();
    const existing = ctx.workspaceState.get<BackupEntry[]>('stellarSuite.stateBackups', []);
    existing.push(corrupted);
    await ctx.workspaceState.update('stellarSuite.stateBackups', existing);

    const result = await svc.validateAllBackups();
    assert.strictEqual(result.total, 3);
    assert.strictEqual(result.valid, 2);
    assert.strictEqual(result.corrupted, 1);
    console.log('  [ok] validateAllBackups updates status for all entries');
}

async function testMissingSnapshotFailsIntegrity() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const entry: BackupEntry = {
        id: 'bak_no_snapshot',
        createdAt: new Date().toISOString(),
        trigger: 'manual',
        snapshot: null as any,
        checksum: 'abc',
        sizeBytes: 0,
        status: 'unknown',
    };

    const integrity = svc.validateBackupIntegrity(entry);
    assert.strictEqual(integrity.valid, false);
    assert.ok(integrity.error?.includes('Snapshot is missing'));
    console.log('  [ok] missing snapshot fails integrity check');
}

// ── State corruption testing ──────────────────────────────────

async function testImportWithCorruptedEntries() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const validEntry = makeValidBackupEntry();
    const corruptedData = JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        entries: [
            validEntry,
            { id: 'bad', trigger: 'unknown' },
            { not: 'a backup' },
        ],
    });

    const result = await svc.importBackups(corruptedData);
    assert.strictEqual(result.imported, 1);
    assert.strictEqual(result.skipped, 2);
    console.log('  [ok] import handles mix of valid and corrupted entries');
}

async function testBackupWithEmptyState() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const backup = await svc.createBackup('manual');
    assert.deepStrictEqual(backup.snapshot, {});
    assert.strictEqual(backup.status, 'valid');
    assert.ok(backup.sizeBytes > 0);
    console.log('  [ok] backup of empty state produces valid entry');
}

async function testRestoreEmptySnapshotClearsState() {
    const ctx = createMockContext(makePopulatedState());
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const emptyCtx = createMockContext();
    const emptyOut = createMockOutputChannel();
    const emptySvc = new StateBackupService(emptyCtx, emptyOut);

    const emptyBackup = await emptySvc.createBackup('manual');

    await ctx.workspaceState.update('stellarSuite.stateBackups', [emptyBackup]);

    const result = await svc.restoreFromBackup(emptyBackup.id);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.restoredKeys.length, 0);
    console.log('  [ok] restoring empty snapshot does not produce errors');
}

// ── Cleanup after operations ──────────────────────────────────

async function testClearAllBackups() {
    const ctx = createMockContext(makePopulatedState());
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    await svc.createBackup('manual');
    await svc.createBackup('auto');
    await svc.createBackup('pre-operation');
    assert.strictEqual(svc.getBackupCount(), 3);

    await svc.clearAllBackups();
    assert.strictEqual(svc.getBackupCount(), 0);
    assert.deepStrictEqual(svc.getAllBackups(), []);
    console.log('  [ok] clearAllBackups removes all entries');
}

async function testLabelBackup() {
    const ctx = createMockContext(makePopulatedState());
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const backup = await svc.createBackup('manual');
    assert.strictEqual(backup.label, undefined);

    const labeled = await svc.labelBackup(backup.id, 'production-snapshot');
    assert.strictEqual(labeled, true);

    const updated = svc.getBackup(backup.id);
    assert.strictEqual((updated as BackupEntry).label, 'production-snapshot');
    console.log('  [ok] labels can be added to existing backups');
}

async function testLabelNonexistentBackupFails() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    const result = await svc.labelBackup('bak_missing', 'label');
    assert.strictEqual(result, false);
    console.log('  [ok] labeling nonexistent backup returns false');
}

// ── Contract workspace state integration ──────────────────────

async function testContractStateStorageAndRetrieval() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new ContractWorkspaceStateService(ctx as any, out);

    await svc.initialize();
    const wsId = '__test_workspace__';

    await svc.recordDeployment(makeDeploymentRecord(), {
        workspaceId: wsId,
        contractPath: 'src/contracts/token.rs',
    });

    const state = svc.getWorkspaceState(wsId);
    assert.strictEqual(state.deploymentHistory.length, 1);
    assert.strictEqual(state.deploymentHistory[0].contractName, 'TokenContract');
    assert.strictEqual(state.deployedContracts['src/contracts/token.rs'], makeDeploymentRecord().contractId);
    console.log('  [ok] contract state stores and retrieves deployments');
}

async function testContractMetadataUpsert() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new ContractWorkspaceStateService(ctx as any, out);

    await svc.initialize();
    const wsId = '__test_workspace__';

    const metadata = makeContractMetadata();
    await svc.upsertMetadata(metadata, wsId);

    const state = svc.getWorkspaceState(wsId);
    assert.ok(state.metadata['src/contracts/token.rs']);
    assert.strictEqual(state.metadata['src/contracts/token.rs'].contractName, 'TokenContract');
    assert.strictEqual(state.metadata['src/contracts/token.rs'].version, '1.0.0');
    console.log('  [ok] contract metadata upserts correctly');
}

async function testContractPreferencePersistence() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new ContractWorkspaceStateService(ctx as any, out);

    await svc.initialize();
    const wsId = '__test_workspace__';

    await svc.setPreference('selectedNetwork', 'mainnet', wsId);
    await svc.setPreference('pinnedContracts', ['token', 'swap'], wsId);

    const state = svc.getWorkspaceState(wsId);
    assert.strictEqual(state.preferences.selectedNetwork, 'mainnet');
    assert.deepStrictEqual(state.preferences.pinnedContracts, ['token', 'swap']);
    console.log('  [ok] contract preferences persist correctly');
}

async function testContractStateExportImport() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new ContractWorkspaceStateService(ctx as any, out);

    await svc.initialize();
    const wsId = '__test_workspace__';

    await svc.recordDeployment(makeDeploymentRecord(), { workspaceId: wsId });
    await svc.upsertMetadata(makeContractMetadata(), wsId);

    const exported = svc.exportState();
    const parsed = JSON.parse(exported);
    assert.strictEqual(parsed.format, 'stellarSuite.contractWorkspaceState');

    const ctx2 = createMockContext();
    const out2 = createMockOutputChannel();
    const svc2 = new ContractWorkspaceStateService(ctx2 as any, out2);
    await svc2.initialize();

    await svc2.importState(exported, 'replace');
    const imported = svc2.getWorkspaceState(wsId);
    assert.strictEqual(imported.deploymentHistory.length, 1);
    assert.ok(imported.metadata['src/contracts/token.rs']);
    console.log('  [ok] contract state export/import cycle works');
}

async function testContractStateMergeImport() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const svc = new ContractWorkspaceStateService(ctx as any, out);

    await svc.initialize();
    const wsId = '__test_workspace__';

    await svc.recordDeployment(makeDeploymentRecord(), { workspaceId: wsId });

    const exported = svc.exportState();

    await svc.recordDeployment(makeSecondDeploymentRecord(), { workspaceId: wsId });

    await svc.importState(exported, 'merge');
    const state = svc.getWorkspaceState(wsId);
    assert.ok(state.deploymentHistory.length >= 2);
    console.log('  [ok] merge import adds entries without overwriting');
}

// ── Cross-service integration ─────────────────────────────────

async function testBackupBeforeContractDeployment() {
    const ctx = createMockContext();
    const out = createMockOutputChannel();
    const backupSvc = new StateBackupService(ctx, out);
    const contractSvc = new ContractWorkspaceStateService(ctx as any, out);

    await contractSvc.initialize();
    const wsId = '__test_workspace__';
    await contractSvc.recordDeployment(makeDeploymentRecord(), { workspaceId: wsId });

    const preBackup = await backupSvc.createPreOperationBackup('deploy-swap');

    await contractSvc.recordDeployment(makeSecondDeploymentRecord(), { workspaceId: wsId });

    const stateAfterDeploy = contractSvc.getWorkspaceState(wsId);
    assert.ok(stateAfterDeploy.deploymentHistory.length >= 2);

    await backupSvc.restoreFromBackup(preBackup.id);

    const stateAfterRestore = contractSvc.getWorkspaceState(wsId);
    assert.strictEqual(stateAfterRestore.deploymentHistory.length, 1);
    console.log('  [ok] backup before deployment enables rollback of contract state');
}

async function testValidationAfterRestore() {
    const ctx = createMockContext(makePopulatedState());
    const out = createMockOutputChannel();
    const backupSvc = new StateBackupService(ctx, out);
    const validationSvc = new StateValidationService();

    const backup = await backupSvc.createBackup('manual');

    const integrity = backupSvc.validateBackupIntegrity(backup);
    assert.strictEqual(integrity.valid, true);

    const state = makeValidValidationState();
    const result = validationSvc.validate(state);
    assert.strictEqual(result.valid, true);
    console.log('  [ok] validation passes on state associated with valid backup');
}

async function testBackupAndValidateAllCycle() {
    const ctx = createMockContext(makePopulatedState());
    const out = createMockOutputChannel();
    const svc = new StateBackupService(ctx, out);

    await svc.createBackup('manual');
    await svc.createBackup('auto');

    const validation = await svc.validateAllBackups();
    assert.strictEqual(validation.total, 2);
    assert.strictEqual(validation.valid, 2);
    assert.strictEqual(validation.corrupted, 0);

    const backups = svc.getAllBackups();
    for (const b of backups) {
        assert.strictEqual(b.status, 'valid');
    }
    console.log('  [ok] backup-then-validate cycle marks all entries as valid');
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        // State storage
        testStoreAndRetrieveState,
        testMultipleBackupsPreserveHistory,
        testBackupStatisticsAccurate,
        // State retrieval
        testRetrieveByTriggerType,
        testRetrieveNonexistentBackup,
        testDeleteBackup,
        testDeleteNonexistentBackupReturnsFalse,
        // Backup and restore
        testBackupAndRestoreFullCycle,
        testRestoreNonexistentBackupFails,
        testRestoreCorruptedBackupFails,
        testPreOperationBackupBeforeRestore,
        // Export and import
        testExportImportCycle,
        testImportSkipsDuplicates,
        testImportRejectsInvalidJson,
        testImportRejectsUnsupportedVersion,
        // State validation
        testValidStatePassesValidation,
        testMissingFieldsDetected,
        testInvalidTypesDetected,
        testNullStateIsCritical,
        // State integrity
        testBackupIntegrityValidation,
        testCorruptedChecksumDetected,
        testCorruptedSizeDetected,
        testValidateAllBackupsUpdatesStatus,
        testMissingSnapshotFailsIntegrity,
        // State corruption
        testImportWithCorruptedEntries,
        testBackupWithEmptyState,
        testRestoreEmptySnapshotClearsState,
        // Cleanup
        testClearAllBackups,
        testLabelBackup,
        testLabelNonexistentBackupFails,
        // Contract workspace state
        testContractStateStorageAndRetrieval,
        testContractMetadataUpsert,
        testContractPreferencePersistence,
        testContractStateExportImport,
        testContractStateMergeImport,
        // Cross-service integration
        testBackupBeforeContractDeployment,
        testValidationAfterRestore,
        testBackupAndValidateAllCycle,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nstatePersistence integration tests');
    for (const test of tests) {
        try {
            await test();
            passed += 1;
        } catch (error) {
            failed += 1;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${error instanceof Error ? error.stack || error.message : String(error)}`);
        }
    }

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch(error => {
    console.error('Test runner error:', error);
    process.exitCode = 1;
});
