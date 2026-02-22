// ============================================================
// src/commands/replayCommands.ts
// Command palette commands for simulation replay functionality.
// ============================================================

import * as vscode from 'vscode';
import { SimulationHistoryService, SimulationHistoryEntry } from '../services/simulationHistoryService';
import {
    SimulationReplayService,
    ReplayOverrides,
    ReplayParameters,
    ReplayResult,
    SimulationExecutor,
} from '../services/simulationReplayService';
import { SorobanCliService } from '../services/sorobanCliService';
import { RpcService, SimulationResult } from '../services/rpcService';
import { RpcFallbackService } from '../services/rpcFallbackService';
import { SimulationPanel } from '../ui/simulationPanel';
import { SidebarViewProvider } from '../ui/sidebarView';
import { resolveCliConfigurationForCommand } from '../services/cliConfigurationVscode';
import { StateCaptureService } from '../services/stateCaptureService';
import { StateDiffService } from '../services/stateDiffService';

/**
 * Register all simulation replay commands with the extension context.
 */
export function registerReplayCommands(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService,
    replayService: SimulationReplayService,
    sidebarProvider?: SidebarViewProvider,
    fallbackService?: RpcFallbackService
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'stellarSuite.replaySimulation',
            () => replayFromHistory(context, historyService, replayService, sidebarProvider, fallbackService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.replayWithModifications',
            () => replayWithModifications(context, historyService, replayService, sidebarProvider, fallbackService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.batchReplaySimulations',
            () => batchReplaySimulations(context, historyService, replayService, sidebarProvider, fallbackService)
        ),
        vscode.commands.registerCommand(
            'stellarSuite.exportReplayResults',
            () => exportReplayResults(replayService)
        ),
    );
}

// ── Shared state for last batch results ──────────────────────

let lastReplayResults: ReplayResult[] = [];

// ── Command implementations ──────────────────────────────────

async function replayFromHistory(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService,
    replayService: SimulationReplayService,
    sidebarProvider?: SidebarViewProvider,
    fallbackService?: RpcFallbackService
): Promise<void> {
    const entry = await pickHistoryEntry(historyService, 'Select a simulation to replay');
    if (!entry) { return; }

    const executor = await buildExecutor(context, fallbackService);
    if (!executor) { return; }

    await executeReplay(context, replayService, entry, executor, {}, sidebarProvider);
}

async function replayWithModifications(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService,
    replayService: SimulationReplayService,
    sidebarProvider?: SidebarViewProvider,
    fallbackService?: RpcFallbackService
): Promise<void> {
    const entry = await pickHistoryEntry(historyService, 'Select a simulation to replay with modifications');
    if (!entry) { return; }

    const overrides = await collectOverrides(entry);
    if (!overrides) { return; }

    const executor = await buildExecutor(context, fallbackService);
    if (!executor) { return; }

    await executeReplay(context, replayService, entry, executor, overrides, sidebarProvider);
}

async function batchReplaySimulations(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService,
    replayService: SimulationReplayService,
    sidebarProvider?: SidebarViewProvider,
    fallbackService?: RpcFallbackService
): Promise<void> {
    const entries = historyService.queryHistory({ limit: 50 });
    if (entries.length === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No simulation history to replay.');
        return;
    }
    // ... rest of implementation (using executor with fallbackService)

    const items = entries.map(entry => ({
        label: `$(${entry.outcome === 'success' ? 'check' : 'error'}) ${entry.functionName}()`,
        description: `${entry.contractId.slice(0, 8)}…${entry.contractId.slice(-4)}`,
        detail: `${new Date(entry.timestamp).toLocaleString()} · ${entry.network} · ${entry.outcome}`,
        entry,
        picked: false,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select simulations to replay (multi-select)',
        canPickMany: true,
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (!selected || selected.length === 0) { return; }

    const confirm = await vscode.window.showWarningMessage(
        `Replay ${selected.length} simulation(s)?`,
        { modal: false },
        'Replay All'
    );

    if (confirm !== 'Replay All') { return; }

    const executor = await buildExecutor(context, fallbackService);
    if (!executor) { return; }

    const entryIds = selected.map(s => s.entry.id);

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Replaying Simulations',
            cancellable: false,
        },
        async (progress) => {
            progress.report({ increment: 0, message: `0/${entryIds.length} completed` });

            const batchResult = await replayService.batchReplay(entryIds, executor);

            lastReplayResults = batchResult.results;

            progress.report({ increment: 100, message: 'Complete' });

            const summary = [
                `${batchResult.succeeded} succeeded`,
                `${batchResult.failed} failed`,
                batchResult.skipped > 0 ? `${batchResult.skipped} skipped` : '',
            ].filter(Boolean).join(', ');

            const outcomeChanges = batchResult.results.filter(r => r.comparison.outcomeChanged).length;
            const changeNote = outcomeChanges > 0
                ? ` (${outcomeChanges} outcome change${outcomeChanges > 1 ? 's' : ''})`
                : '';

            vscode.window.showInformationMessage(
                `Stellar Suite: Batch replay complete — ${summary}${changeNote}`
            );

            // Update sidebar if available
            if (sidebarProvider && batchResult.results.length > 0) {
                sidebarProvider.refresh();
            }
        }
    );
}

async function exportReplayResults(replayService: SimulationReplayService): Promise<void> {
    if (lastReplayResults.length === 0) {
        vscode.window.showInformationMessage(
            'Stellar Suite: No replay results to export. Run a replay first.'
        );
        return;
    }

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('simulation-replay-results.json'),
        filters: { 'JSON Files': ['json'] },
        title: 'Export Replay Results',
    });

    if (!uri) { return; }

    try {
        const data = replayService.exportReplayResults(lastReplayResults);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf-8'));
        vscode.window.showInformationMessage(
            `Stellar Suite: Exported ${lastReplayResults.length} replay results.`
        );
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite: Export failed — ${msg}`);
    }
}

// ── Shared helpers ───────────────────────────────────────────

async function pickHistoryEntry(
    historyService: SimulationHistoryService,
    placeholder: string
): Promise<SimulationHistoryEntry | undefined> {
    const entries = historyService.queryHistory({ limit: 50 });
    if (entries.length === 0) {
        vscode.window.showInformationMessage('Stellar Suite: No simulation history available.');
        return undefined;
    }

    const items = entries.map(entry => ({
        label: `$(${entry.outcome === 'success' ? 'check' : 'error'}) ${entry.functionName}()`,
        description: `${entry.contractId.slice(0, 8)}…${entry.contractId.slice(-4)}`,
        detail: `${new Date(entry.timestamp).toLocaleString()} · ${entry.network} · ${entry.outcome}${entry.label ? ` · ${entry.label}` : ''}`,
        entry,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: placeholder,
        matchOnDescription: true,
        matchOnDetail: true,
    });

    return selected?.entry;
}

async function collectOverrides(
    entry: SimulationHistoryEntry
): Promise<ReplayOverrides | undefined> {
    const fieldChoices = [
        { label: '$(symbol-key) Contract ID', value: 'contractId', current: entry.contractId },
        { label: '$(symbol-method) Function Name', value: 'functionName', current: entry.functionName },
        { label: '$(json) Arguments', value: 'args', current: JSON.stringify(entry.args) },
        { label: '$(globe) Network', value: 'network', current: entry.network },
        { label: '$(person) Source', value: 'source', current: entry.source },
    ];

    const fieldsToModify = await vscode.window.showQuickPick(
        fieldChoices.map(f => ({
            ...f,
            description: `Current: ${truncate(f.current, 40)}`,
            picked: false,
        })),
        {
            placeHolder: 'Select parameters to modify (or press Enter to replay as-is)',
            canPickMany: true,
        }
    );

    // User cancelled
    if (fieldsToModify === undefined) { return undefined; }

    // No modifications selected — replay with original params
    if (fieldsToModify.length === 0) { return {}; }

    const overrides: ReplayOverrides = {};

    for (const field of fieldsToModify) {
        switch (field.value) {
            case 'contractId': {
                const value = await vscode.window.showInputBox({
                    prompt: 'Enter new contract ID',
                    value: entry.contractId,
                    validateInput: (v) => {
                        if (!v || v.trim().length === 0) { return 'Contract ID is required'; }
                        if (!v.match(/^C[A-Z0-9]{55}$/)) {
                            return 'Invalid contract ID format (should start with C and be 56 characters)';
                        }
                        return null;
                    },
                });
                if (value === undefined) { return undefined; }
                overrides.contractId = value;
                break;
            }
            case 'functionName': {
                const value = await vscode.window.showInputBox({
                    prompt: 'Enter new function name',
                    value: entry.functionName,
                    validateInput: (v) => (!v || v.trim().length === 0) ? 'Function name is required' : null,
                });
                if (value === undefined) { return undefined; }
                overrides.functionName = value;
                break;
            }
            case 'args': {
                const value = await vscode.window.showInputBox({
                    prompt: 'Enter new arguments as JSON array',
                    value: JSON.stringify(entry.args),
                    validateInput: (v) => {
                        try {
                            const parsed = JSON.parse(v);
                            if (!Array.isArray(parsed)) { return 'Arguments must be a JSON array'; }
                            return null;
                        } catch {
                            return 'Invalid JSON';
                        }
                    },
                });
                if (value === undefined) { return undefined; }
                overrides.args = JSON.parse(value);
                break;
            }
            case 'network': {
                const value = await vscode.window.showInputBox({
                    prompt: 'Enter new network',
                    value: entry.network,
                    validateInput: (v) => (!v || v.trim().length === 0) ? 'Network is required' : null,
                });
                if (value === undefined) { return undefined; }
                overrides.network = value.trim();
                break;
            }
            case 'source': {
                const value = await vscode.window.showInputBox({
                    prompt: 'Enter new source identity',
                    value: entry.source,
                    validateInput: (v) => (!v || v.trim().length === 0) ? 'Source is required' : null,
                });
                if (value === undefined) { return undefined; }
                overrides.source = value.trim();
                break;
            }
        }
    }

    return overrides;
}

async function buildExecutor(
    context: vscode.ExtensionContext,
    fallbackService?: RpcFallbackService
): Promise<SimulationExecutor | undefined> {
    const resolvedCliConfig = await resolveCliConfigurationForCommand(context);
    if (!resolvedCliConfig.validation.valid) {
        vscode.window.showErrorMessage(
            `CLI configuration is invalid: ${resolvedCliConfig.validation.errors.join(' ')}`
        );
        return undefined;
    }

    const config = resolvedCliConfig.configuration;

    return async (params: ReplayParameters) => {
        const startTime = Date.now();
        const stateCaptureService = new StateCaptureService();
        const stateDiffService = new StateDiffService();

        const buildStateDiff = (rawResult: unknown) => {
            const baselineBefore = stateCaptureService.captureBeforeState(undefined);
            const captured = stateCaptureService.captureSnapshots(rawResult);
            const before = captured.before.entries.length > 0 ? captured.before : baselineBefore;
            const after = captured.after;
            return {
                stateSnapshotBefore: before,
                stateSnapshotAfter: after,
                stateDiff: stateDiffService.calculateDiff(before, after),
            };
        };

        if (params.method === 'cli' || config.useLocalCli) {
            let actualCliPath = config.cliPath;
            let cliService = new SorobanCliService(actualCliPath, params.source);
            let cliAvailable = await cliService.isAvailable();

            if (!cliAvailable && config.cliPath === 'stellar') {
                const foundPath = await SorobanCliService.findCliPath();
                if (foundPath) {
                    actualCliPath = foundPath;
                    cliService = new SorobanCliService(actualCliPath, params.source);
                    cliAvailable = await cliService.isAvailable();
                }
            }

            if (!cliAvailable) {
                return {
                    success: false,
                    error: `Stellar CLI not found at "${config.cliPath}".`,
                    durationMs: Date.now() - startTime,
                };
            }

            const result = await cliService.simulateTransaction(
                params.contractId,
                params.functionName,
                params.args as any[],
                params.network
            );

            const stateData = buildStateDiff(result.rawResult ?? result.result);

            return {
                success: result.success,
                result: result.result,
                error: result.error,
                errorType: result.errorType,
                resourceUsage: result.resourceUsage,
                stateSnapshotBefore: stateData.stateSnapshotBefore,
                stateSnapshotAfter: stateData.stateSnapshotAfter,
                stateDiff: stateData.stateDiff,
                durationMs: Date.now() - startTime,
            };
        } else {
            let result: SimulationResult;
            if (fallbackService) {
                result = await fallbackService.simulateTransaction(
                    params.contractId,
                    params.functionName,
                    params.args as any[]
                );
            } else {
                const rpcService = new RpcService(config.rpcUrl);
                result = await rpcService.simulateTransaction(
                    params.contractId,
                    params.functionName,
                    params.args as any[]
                );
            }

            const stateData = buildStateDiff(result.rawResult ?? result.result);

            return {
                success: result.success,
                result: result.result,
                error: result.error,
                errorType: result.errorType,
                resourceUsage: result.resourceUsage,
                stateSnapshotBefore: stateData.stateSnapshotBefore,
                stateSnapshotAfter: stateData.stateSnapshotAfter,
                stateDiff: stateData.stateDiff,
                durationMs: Date.now() - startTime,
            };
        }
    };
}

async function executeReplay(
    context: vscode.ExtensionContext,
    replayService: SimulationReplayService,
    entry: SimulationHistoryEntry,
    executor: SimulationExecutor,
    overrides: ReplayOverrides,
    sidebarProvider?: SidebarViewProvider
): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Replaying Simulation',
            cancellable: false,
        },
        async (progress) => {
            progress.report({ increment: 0, message: 'Preparing replay...' });

            let result: ReplayResult;
            try {
                progress.report({ increment: 30, message: 'Executing simulation...' });
                result = await replayService.replaySimulation(entry.id, executor, overrides);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Stellar Suite: Replay failed — ${msg}`);
                return;
            }

            lastReplayResults = [result];
            progress.report({ increment: 100, message: 'Complete' });

            // Show results in simulation panel
            const panel = SimulationPanel.createOrShow(context);
            panel.updateResults(
                {
                    success: result.outcome === 'success',
                    result: result.result,
                    error: result.error,
                    stateSnapshotBefore: result.stateSnapshotBefore,
                    stateSnapshotAfter: result.stateSnapshotAfter,
                    stateDiff: result.stateDiff,
                },
                result.parameters.contractId,
                result.parameters.functionName,
                result.parameters.args as any[]
            );

            // Update sidebar
            if (sidebarProvider) {
                sidebarProvider.showSimulationResult(result.parameters.contractId, {
                    success: result.outcome === 'success',
                    result: result.result,
                    error: result.error,
                    stateSnapshotBefore: result.stateSnapshotBefore,
                    stateSnapshotAfter: result.stateSnapshotAfter,
                    stateDiff: result.stateDiff,
                });
            }

            // Show notification with comparison info
            const changeInfo = result.comparison.outcomeChanged
                ? ` (outcome changed: ${result.comparison.originalOutcome} → ${result.outcome})`
                : '';
            const modInfo = result.comparison.parametersModified
                ? ` [modified: ${result.comparison.modifiedFields.join(', ')}]`
                : '';

            if (result.outcome === 'success') {
                vscode.window.showInformationMessage(
                    `Stellar Suite: Replay succeeded${changeInfo}${modInfo}`
                );
            } else {
                vscode.window.showErrorMessage(
                    `Stellar Suite: Replay failed${changeInfo}${modInfo} — ${result.error}`
                );
            }
        }
    );
}

function truncate(str: string, maxLen: number): string {
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}
