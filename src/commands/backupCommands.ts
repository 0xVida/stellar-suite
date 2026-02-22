// ============================================================
// src/commands/backupCommands.ts
// Command palette commands for workspace state backup and restore.
// ============================================================

import * as vscode from 'vscode';
import { StateBackupService, BackupEntry } from '../services/stateBackupService';

/**
 * Register all state backup commands with the extension context.
 */
export function registerBackupCommands(
    context: vscode.ExtensionContext,
    backupService: StateBackupService
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'stellarSuite.createBackup',
            () => createManualBackup(backupService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.restoreBackup',
            () => restoreFromBackup(backupService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.showBackupHistory',
            () => showBackupHistory(backupService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.deleteBackup',
            () => deleteBackup(backupService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.validateBackups',
            () => validateBackups(backupService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.clearAllBackups',
            () => clearAllBackups(backupService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.exportBackups',
            () => exportBackups(backupService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.importBackups',
            () => importBackups(backupService)
        ),
    );
}

// ── Command implementations ───────────────────────────────────

async function createManualBackup(service: StateBackupService): Promise<void> {
    const label = await vscode.window.showInputBox({
        title: 'Create Backup',
        prompt: 'Enter an optional label for this backup',
        placeHolder: 'e.g., before mainnet deploy',
    });

    // User cancelled the input box
    if (label === undefined) { return; }

    try {
        const entry = await service.createBackup('manual', {
            label: label || undefined,
        });
        vscode.window.showInformationMessage(
            `Stellar Suite: Backup created (${formatSize(entry.sizeBytes)}).`
        );
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite: Backup failed — ${msg}`);
    }
}

async function restoreFromBackup(service: StateBackupService): Promise<void> {
    const backups = service.getAllBackups();
    if (backups.length === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No backups available to restore.');
        return;
    }

    const items = backups.map(entry => ({
        label: formatBackupLabel(entry),
        description: formatBackupDescription(entry),
        detail: formatBackupDetail(entry),
        entry,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a backup to restore',
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (!selected) { return; }

    const confirm = await vscode.window.showWarningMessage(
        `Restore workspace state from backup "${selected.entry.id}"? This will overwrite current state.`,
        { modal: true },
        'Restore'
    );

    if (confirm !== 'Restore') { return; }

    try {
        const result = await service.restoreFromBackup(selected.entry.id);
        if (result.success) {
            vscode.window.showInformationMessage(
                `Stellar Suite: Restored ${result.restoredKeys.length} state keys from backup.`
            );
        } else {
            const errorSummary = result.errors.slice(0, 3).join('; ');
            vscode.window.showErrorMessage(
                `Stellar Suite: Restore completed with errors — ${errorSummary}`
            );
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite: Restore failed — ${msg}`);
    }
}

async function showBackupHistory(service: StateBackupService): Promise<void> {
    const stats = service.getStatistics();
    if (stats.totalBackups === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No backups recorded yet.');
        return;
    }

    const backups = service.getAllBackups();
    const items = backups.map(entry => ({
        label: formatBackupLabel(entry),
        description: formatBackupDescription(entry),
        detail: formatBackupDetail(entry),
        entry,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Backup History (${stats.totalBackups} total, ${formatSize(stats.totalSizeBytes)})`,
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (!selected) { return; }

    const channel = vscode.window.createOutputChannel('Backup Detail');
    const e = selected.entry;
    channel.clear();
    channel.appendLine(`Backup:      ${e.id}`);
    channel.appendLine(`Label:       ${e.label || '(none)'}`);
    channel.appendLine(`Created:     ${e.createdAt}`);
    channel.appendLine(`Trigger:     ${e.trigger}`);
    channel.appendLine(`Status:      ${e.status}`);
    channel.appendLine(`Size:        ${formatSize(e.sizeBytes)}`);
    channel.appendLine(`Checksum:    ${e.checksum}`);
    if (e.description) {
        channel.appendLine(`Description: ${e.description}`);
    }
    channel.appendLine('');
    channel.appendLine('── Snapshot Keys ──');
    const keys = Object.keys(e.snapshot);
    if (keys.length === 0) {
        channel.appendLine('  (empty snapshot)');
    } else {
        for (const key of keys) {
            const val = e.snapshot[key];
            const preview = JSON.stringify(val);
            const truncated = preview.length > 120 ? preview.slice(0, 117) + '...' : preview;
            channel.appendLine(`  ${key}: ${truncated}`);
        }
    }
    channel.show(true);
}

async function deleteBackup(service: StateBackupService): Promise<void> {
    const backups = service.getAllBackups();
    if (backups.length === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No backups to delete.');
        return;
    }

    const items = backups.map(entry => ({
        label: formatBackupLabel(entry),
        description: formatBackupDescription(entry),
        detail: formatBackupDetail(entry),
        entry,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a backup to delete',
        matchOnDescription: true,
    });

    if (!selected) { return; }

    const ok = await service.deleteBackup(selected.entry.id);
    if (ok) {
        vscode.window.showInformationMessage('Stellar Suite: Backup deleted.');
    } else {
        vscode.window.showErrorMessage('Stellar Suite: Failed to delete backup.');
    }
}

async function validateBackups(service: StateBackupService): Promise<void> {
    const count = service.getBackupCount();
    if (count === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No backups to validate.');
        return;
    }

    const result = await service.validateAllBackups();
    if (result.corrupted === 0) {
        vscode.window.showInformationMessage(
            `Stellar Suite: All ${result.total} backups are valid.`
        );
    } else {
        vscode.window.showWarningMessage(
            `Stellar Suite: ${result.corrupted} of ${result.total} backups have integrity issues.`
        );
    }
}

async function clearAllBackups(service: StateBackupService): Promise<void> {
    const count = service.getBackupCount();
    if (count === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No backups to clear.');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Clear all ${count} backups? This cannot be undone.`,
        { modal: true },
        'Clear'
    );

    if (confirm === 'Clear') {
        await service.clearAllBackups();
        vscode.window.showInformationMessage('Stellar Suite: All backups cleared.');
    }
}

async function exportBackups(service: StateBackupService): Promise<void> {
    const count = service.getBackupCount();
    if (count === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No backups to export.');
        return;
    }

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('stellar-suite-backups.json'),
        filters: { 'JSON Files': ['json'] },
        title: 'Export Backups',
    });

    if (!uri) { return; }

    try {
        const data = service.exportBackups();
        await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf-8'));
        vscode.window.showInformationMessage(
            `Stellar Suite: Exported ${count} backups.`
        );
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite: Export failed — ${msg}`);
    }
}

async function importBackups(service: StateBackupService): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON Files': ['json'] },
        title: 'Import Backups',
    });

    if (!uris || uris.length === 0) { return; }

    try {
        const raw = await vscode.workspace.fs.readFile(uris[0]);
        const json = Buffer.from(raw).toString('utf-8');
        const result = await service.importBackups(json);
        vscode.window.showInformationMessage(
            `Stellar Suite: Imported ${result.imported} backups (${result.skipped} skipped).`
        );
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite: Import failed — ${msg}`);
    }
}

// ── Formatting helpers ────────────────────────────────────────

function formatBackupLabel(entry: BackupEntry): string {
    const icon = entry.status === 'corrupted' ? '$(warning)' : '$(archive)';
    const name = entry.label || entry.id;
    return `${icon} ${name}`;
}

function formatBackupDescription(entry: BackupEntry): string {
    return `${entry.trigger} · ${formatSize(entry.sizeBytes)}`;
}

function formatBackupDetail(entry: BackupEntry): string {
    const date = new Date(entry.createdAt).toLocaleString();
    const keys = Object.keys(entry.snapshot).length;
    const desc = entry.description ? ` · ${entry.description}` : '';
    return `${date} · ${keys} keys · ${entry.status}${desc}`;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) { return `${bytes} B`; }
    if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
