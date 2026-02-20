// ============================================================
// src/commands/resourceProfilingCommands.ts
// Command palette commands for resource usage profiling.
// ============================================================

import * as vscode from 'vscode';
import { ResourceProfilingService } from '../services/resourceProfilingService';
import { ResourceProfile, ResourceComparison } from '../types/resourceProfile';

/**
 * Register all resource profiling commands with the extension context.
 */
export function registerResourceProfilingCommands(
    context: vscode.ExtensionContext,
    profilingService: ResourceProfilingService
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'stellarSuite.showResourceProfile',
            () => showResourceProfile(profilingService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.compareResourceProfiles',
            () => compareResourceProfiles(profilingService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.exportResourceProfiles',
            () => exportResourceProfiles(profilingService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.importResourceProfiles',
            () => importResourceProfiles(profilingService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.showResourceStats',
            () => showResourceStats(profilingService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.clearResourceProfiles',
            () => clearResourceProfiles(profilingService)
        ),
    );
}

// ── Command implementations ──────────────────────────────────

async function showResourceProfile(service: ResourceProfilingService): Promise<void> {
    const profile = await pickProfile(service, 'Select a resource profile to view');
    if (!profile) { return; }

    const breakdown = service.formatProfileBreakdown(profile);

    const doc = await vscode.workspace.openTextDocument({
        content: breakdown,
        language: 'plaintext',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
}

async function compareResourceProfiles(service: ResourceProfilingService): Promise<void> {
    const baseline = await pickProfile(service, 'Select the BASELINE profile');
    if (!baseline) { return; }

    const current = await pickProfile(service, 'Select the CURRENT profile to compare');
    if (!current) { return; }

    if (baseline.id === current.id) {
        vscode.window.showWarningMessage('Stellar Suite: Cannot compare a profile with itself.');
        return;
    }

    const comparison = service.compareProfileData(baseline, current);
    const formatted = service.formatComparison(comparison);

    const doc = await vscode.workspace.openTextDocument({
        content: formatted,
        language: 'plaintext',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
}

async function exportResourceProfiles(service: ResourceProfilingService): Promise<void> {
    const profiles = service.getAllProfiles();
    if (profiles.length === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No resource profiles to export.');
        return;
    }

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('resource-profiles.json'),
        filters: { 'JSON Files': ['json'] },
        title: 'Export Resource Profiles',
    });

    if (!uri) { return; }

    try {
        const data = service.exportProfiles();
        await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf-8'));
        vscode.window.showInformationMessage(
            `Stellar Suite: Exported ${profiles.length} resource profile(s).`
        );
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite: Export failed — ${msg}`);
    }
}

async function importResourceProfiles(service: ResourceProfilingService): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON Files': ['json'] },
        title: 'Import Resource Profiles',
    });

    if (!uris || uris.length === 0) { return; }

    try {
        const raw = await vscode.workspace.fs.readFile(uris[0]);
        const json = Buffer.from(raw).toString('utf-8');
        const result = await service.importProfiles(json);
        vscode.window.showInformationMessage(
            `Stellar Suite: Imported ${result.imported} profile(s), skipped ${result.skipped}.`
        );
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite: Import failed — ${msg}`);
    }
}

async function showResourceStats(service: ResourceProfilingService): Promise<void> {
    const stats = service.getStatistics();

    if (stats.totalProfiles === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No resource profiles recorded yet.');
        return;
    }

    const lines = [
        'Resource Profiling Statistics',
        '═════════════════════════════════════════',
        `Total Profiles:      ${stats.totalProfiles}`,
        `Unique Contracts:    ${stats.uniqueContracts}`,
        `Unique Functions:    ${stats.uniqueFunctions}`,
        '',
        'Average Resource Usage:',
        `  CPU Instructions:  ${stats.averages.cpuInstructions.toLocaleString('en-US')}`,
        `  Memory:            ${stats.averages.memoryBytes.toLocaleString('en-US')} bytes`,
        `  Storage Reads:     ${stats.averages.storageReads}`,
        `  Storage Writes:    ${stats.averages.storageWrites}`,
        `  Execution Time:    ${stats.averages.executionTimeMs} ms`,
        '',
        'Peak Resource Usage:',
        `  CPU Instructions:  ${stats.peaks.cpuInstructions.toLocaleString('en-US')}`,
        `  Memory:            ${stats.peaks.memoryBytes.toLocaleString('en-US')} bytes`,
        `  Storage Reads:     ${stats.peaks.storageReads}`,
        `  Storage Writes:    ${stats.peaks.storageWrites}`,
        `  Execution Time:    ${stats.peaks.executionTimeMs} ms`,
        '',
        `Total Warnings:      ${stats.totalWarnings}`,
        `  Info:              ${stats.warningsBySeverity.info}`,
        `  Warning:           ${stats.warningsBySeverity.warning}`,
        `  Critical:          ${stats.warningsBySeverity.critical}`,
    ];

    const doc = await vscode.workspace.openTextDocument({
        content: lines.join('\n'),
        language: 'plaintext',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
}

async function clearResourceProfiles(service: ResourceProfilingService): Promise<void> {
    const count = service.getProfileCount();
    if (count === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No resource profiles to clear.');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Delete all ${count} resource profile(s)?`,
        { modal: true },
        'Delete All'
    );

    if (confirm !== 'Delete All') { return; }

    await service.clearProfiles();
    vscode.window.showInformationMessage('Stellar Suite: All resource profiles cleared.');
}

// ── Shared helpers ───────────────────────────────────────────

async function pickProfile(
    service: ResourceProfilingService,
    placeholder: string
): Promise<ResourceProfile | undefined> {
    const profiles = service.getAllProfiles();
    if (profiles.length === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No resource profiles available.');
        return undefined;
    }

    const items = profiles.map(p => ({
        label: `${p.functionName}()`,
        description: `${p.contractId.slice(0, 8)}…${p.contractId.slice(-4)}`,
        detail: [
            new Date(p.createdAt).toLocaleString(),
            `CPU: ${p.usage.cpuInstructions.toLocaleString('en-US')}`,
            `Mem: ${p.usage.memoryBytes.toLocaleString('en-US')}B`,
            `${p.usage.executionTimeMs}ms`,
            p.warnings.length > 0 ? `⚠ ${p.warnings.length}` : '',
            p.label ?? '',
        ].filter(Boolean).join(' · '),
        profile: p,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: placeholder,
        matchOnDescription: true,
        matchOnDetail: true,
    });

    return selected?.profile;
}
