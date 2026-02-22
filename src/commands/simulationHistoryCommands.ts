// ============================================================
// src/commands/simulationHistoryCommands.ts
// Command palette commands for simulation history management.
// ============================================================

import * as vscode from 'vscode';
import { SimulationHistoryService, SimulationHistoryFilter } from '../services/simulationHistoryService';

/**
 * Register all simulation history commands with the extension context.
 */
export function registerSimulationHistoryCommands(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'stellarSuite.showSimulationHistory',
            () => showSimulationHistory(historyService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.clearSimulationHistory',
            () => clearSimulationHistory(historyService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.exportSimulationHistory',
            () => exportSimulationHistory(historyService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.importSimulationHistory',
            () => importSimulationHistory(historyService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.searchSimulationHistory',
            () => searchSimulationHistory(historyService)
        ),
    );
}

async function showSimulationHistory(service: SimulationHistoryService): Promise<void> {
    const stats = service.getStatistics();
    if (stats.totalSimulations === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No simulation history recorded yet.');
        return;
    }

    const entries = service.queryHistory({ limit: 30 });
    const items = entries.map(entry => ({
        label: `$(${entry.outcome === 'success' ? 'check' : 'error'}) ${entry.functionName}()`,
        description: `${entry.contractId.slice(0, 8)}…${entry.contractId.slice(-4)}`,
        detail: `${new Date(entry.timestamp).toLocaleString()} · ${entry.network} · ${entry.outcome}${entry.label ? ` · ${entry.label}` : ''}`,
        entry,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Simulation History (${stats.totalSimulations} total, ${stats.successCount} passed, ${stats.failureCount} failed)`,
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (!selected) { return; }

    // Show detail in an output channel
    const channel = vscode.window.createOutputChannel('Simulation Detail');
    const e = selected.entry;
    channel.clear();
    channel.appendLine(`Simulation: ${e.functionName}()`);
    channel.appendLine(`Contract:   ${e.contractId}`);
    channel.appendLine(`Outcome:    ${e.outcome}`);
    channel.appendLine(`Network:    ${e.network}`);
    channel.appendLine(`Source:     ${e.source}`);
    channel.appendLine(`Method:     ${e.method}`);
    channel.appendLine(`Timestamp:  ${e.timestamp}`);
    if (e.durationMs !== undefined) {
        channel.appendLine(`Duration:   ${e.durationMs}ms`);
    }
    if (e.label) {
        channel.appendLine(`Label:      ${e.label}`);
    }
    channel.appendLine('');
    channel.appendLine('── Arguments ──');
    channel.appendLine(JSON.stringify(e.args, null, 2));
    channel.appendLine('');
    if (e.outcome === 'success' && e.result !== undefined) {
        channel.appendLine('── Result ──');
        channel.appendLine(JSON.stringify(e.result, null, 2));
    }
    if (e.outcome === 'failure' && e.error) {
        channel.appendLine('── Error ──');
        channel.appendLine(e.error);
    }
    if (e.resourceUsage) {
        channel.appendLine('');
        channel.appendLine('── Resource Usage ──');
        if (e.resourceUsage.cpuInstructions !== undefined) {
            channel.appendLine(`CPU Instructions: ${e.resourceUsage.cpuInstructions.toLocaleString()}`);
        }
        if (e.resourceUsage.memoryBytes !== undefined) {
            channel.appendLine(`Memory: ${(e.resourceUsage.memoryBytes / 1024).toFixed(2)} KB`);
        }
    }
    if (e.stateDiff) {
        channel.appendLine('');
        channel.appendLine('── State Diff ──');
        channel.appendLine(`Entries Before: ${e.stateDiff.summary.totalEntriesBefore}`);
        channel.appendLine(`Entries After:  ${e.stateDiff.summary.totalEntriesAfter}`);
        channel.appendLine(`Created:        ${e.stateDiff.summary.created}`);
        channel.appendLine(`Modified:       ${e.stateDiff.summary.modified}`);
        channel.appendLine(`Deleted:        ${e.stateDiff.summary.deleted}`);
        channel.appendLine(`Unchanged:      ${e.stateDiff.summary.unchanged}`);
        channel.appendLine(`Total Changes:  ${e.stateDiff.summary.totalChanges}`);
    }
    channel.show(true);
}

async function clearSimulationHistory(service: SimulationHistoryService): Promise<void> {
    const count = service.getEntryCount();
    if (count === 0) {
        vscode.window.showInformationMessage('Stellar Suite: Simulation history is already empty.');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Clear all ${count} simulation history entries?`,
        { modal: true },
        'Clear'
    );

    if (confirm === 'Clear') {
        await service.clearHistory();
        vscode.window.showInformationMessage('Stellar Suite: Simulation history cleared.');
    }
}

async function exportSimulationHistory(service: SimulationHistoryService): Promise<void> {
    const count = service.getEntryCount();
    if (count === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No simulation history to export.');
        return;
    }

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('simulation-history.json'),
        filters: { 'JSON Files': ['json'] },
        title: 'Export Simulation History',
    });

    if (!uri) { return; }

    try {
        const data = service.exportHistory();
        await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf-8'));
        vscode.window.showInformationMessage(`Stellar Suite: Exported ${count} simulation history entries.`);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite: Export failed — ${msg}`);
    }
}

async function importSimulationHistory(service: SimulationHistoryService): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON Files': ['json'] },
        title: 'Import Simulation History',
    });

    if (!uris || uris.length === 0) { return; }

    try {
        const raw = await vscode.workspace.fs.readFile(uris[0]);
        const json = Buffer.from(raw).toString('utf-8');
        const result = await service.importHistory(json);
        vscode.window.showInformationMessage(
            `Stellar Suite: Imported ${result.imported} entries (${result.skipped} skipped).`
        );
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite: Import failed — ${msg}`);
    }
}

async function searchSimulationHistory(service: SimulationHistoryService): Promise<void> {
    const count = service.getEntryCount();
    if (count === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No simulation history to search.');
        return;
    }

    const filterType = await vscode.window.showQuickPick(
        [
            { label: '$(search) Free Text Search', value: 'text' },
            { label: '$(filter) Filter by Outcome', value: 'outcome' },
            { label: '$(globe) Filter by Network', value: 'network' },
            { label: '$(symbol-method) Filter by Function', value: 'function' },
        ],
        { placeHolder: 'Choose a search/filter method' }
    );

    if (!filterType) { return; }

    const filter: SimulationHistoryFilter = {};

    switch (filterType.value) {
        case 'text': {
            const text = await vscode.window.showInputBox({
                prompt: 'Search simulation history',
                placeHolder: 'Enter search text (matches contract ID, function, errors, labels)',
            });
            if (!text) { return; }
            filter.searchText = text;
            break;
        }
        case 'outcome': {
            const outcome = await vscode.window.showQuickPick(
                [
                    { label: '$(check) Success', value: 'success' as const },
                    { label: '$(error) Failure', value: 'failure' as const },
                ],
                { placeHolder: 'Filter by outcome' }
            );
            if (!outcome) { return; }
            filter.outcome = outcome.value;
            break;
        }
        case 'network': {
            const network = await vscode.window.showInputBox({
                prompt: 'Filter by network',
                placeHolder: 'e.g., testnet, mainnet, futurenet',
            });
            if (!network) { return; }
            filter.network = network.trim();
            break;
        }
        case 'function': {
            const fn = await vscode.window.showInputBox({
                prompt: 'Filter by function name',
                placeHolder: 'e.g., hello, transfer, mint',
            });
            if (!fn) { return; }
            filter.functionName = fn.trim();
            break;
        }
    }

    const entries = service.queryHistory({ filter, limit: 50 });
    if (entries.length === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No matching simulation history entries found.');
        return;
    }

    const items = entries.map(entry => ({
        label: `$(${entry.outcome === 'success' ? 'check' : 'error'}) ${entry.functionName}()`,
        description: `${entry.contractId.slice(0, 8)}…${entry.contractId.slice(-4)}`,
        detail: `${new Date(entry.timestamp).toLocaleString()} · ${entry.network} · ${entry.outcome}`,
        entry,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Found ${entries.length} matching entries`,
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (selected) {
        // Re-use the detail display from showSimulationHistory
        await vscode.commands.executeCommand('stellarSuite.showSimulationHistory');
    }
}
