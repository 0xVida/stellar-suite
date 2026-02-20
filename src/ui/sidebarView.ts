
// ============================================================
// src/ui/sidebarView.ts
// WebviewView provider — context menu + drag-and-drop reordering.
// ============================================================

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    ContextMenuRequest,
    ContextMenuActionRequest,
    ActionFeedback,
} from '../types/contextMenu';
import {
    resolveContextMenuActions,
    ContractContextMenuService,
} from '../services/contextMenuService';
import { ReorderingService } from '../services/reorderingService';
import { ContractVersionTracker, ContractVersionState } from '../services/contractVersionTracker';
import { SimulationHistoryService, SimulationHistoryEntry, SimulationHistoryStats } from '../services/simulationHistoryService';
import { buildExportPayload, serializeExport, ExportableContract } from '../services/sidebarExportService';
import {
    ContractTemplateService,
    ContractTemplateSource,
    TemplateDefinition,
} from '../services/contractTemplateService';
import {
    parseExportFile,
    validateAndPreview,
    applyImport,
    formatImportPreview,
    ExistingContract,
} from '../services/sidebarImportService';
import { ImportSelection, ImportPreview } from '../types/sidebarExport';

export interface ContractInfo {
    name: string;
    path: string;
    contractId?: string;
    isBuilt: boolean;
    deployedAt?: string;
    network?: string;
    source?: string;
    isPinned?: boolean;
    hasWasm?: boolean;
    lastDeployed?: string;
    functions?: Array<{
        name: string;
        parameters: Array<{ name: string; type?: string }>;
    }>;
    /** Version declared in Cargo.toml. */
    localVersion?: string;
    /** Version that was active at the last deploy. */
    deployedVersion?: string;
    /** Whether localVersion and deployedVersion conflict. */
    hasVersionMismatch?: boolean;
    /** Short mismatch warning, if any. */
    versionMismatchMessage?: string;
    /** Template identifier (e.g. "token", "escrow", custom id). */
    templateId?: string;
    /** Template category for grouping / actions. */
    templateCategory?: string;
    /** Display label shown in the UI. */
    templateDisplayName?: string;
    /** Whether classification came from builtin, custom, or manual override. */
    templateSource?: ContractTemplateSource;
    /** Detection confidence from 0..1. */
    templateConfidence?: number;
    /** Pattern evidence used for this classification. */
    templateMatchedPatterns?: string[];
}

export interface DeploymentRecord {
    contractId: string;
    contractName: string;
    deployedAt: string;
    network: string;
    source: string;
}
type RefreshSource = 'auto' | 'manual' | 'system';

interface RefreshOptions {
    source?: RefreshSource;
    changedPaths?: string[];
}
export class SidebarViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'stellarSuite.contractsView';

    private _view?: vscode.WebviewView;
    private readonly outputChannel: vscode.OutputChannel;
    private readonly contextMenuService: ContractContextMenuService;
    private readonly reorderingService: ReorderingService;
    private readonly versionTracker: ContractVersionTracker;
    private readonly templateService: ContractTemplateService;
    private _simulationHistoryService?: SimulationHistoryService;

    // Cache the last-discovered list so drag messages can reference it
    private _lastContracts: ContractInfo[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        this.outputChannel = vscode.window.createOutputChannel('Stellar Suite');
        this.contextMenuService = new ContractContextMenuService(
            this._context,
            this.outputChannel
        );
        this.reorderingService = new ReorderingService(
            this._context,
            this.outputChannel
        );
        this.versionTracker = new ContractVersionTracker(
            this._context,
            this.outputChannel
        );
        this.templateService = new ContractTemplateService(this.outputChannel);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message: {
            type: string;
            [key: string]: unknown;
        }) => {
            this.outputChannel.appendLine(`[Sidebar] Received message: ${message.type}`);

            switch (message.type) {
                case 'build':
                    await vscode.commands.executeCommand('stellarSuite.buildContract');
                    break;

                case 'deploy':
                    await vscode.commands.executeCommand('stellarSuite.deployContract');
                    break;

                case 'simulate':
                    await vscode.commands.executeCommand('stellarSuite.simulateTransaction');
                    break;

                case 'refresh':
                    this.refresh();
                    break;

                // ── Context menu ──────────────────────────────
                case 'contextMenu:open': {
                    const req = message as unknown as { type: string } & ContextMenuRequest;
                    const actions = resolveContextMenuActions(req);
                    this.outputChannel.appendLine(
                        `[ContextMenu] Resolved ${actions.length} actions for "${req.contractName}"`
                    );
                    this._view?.webview.postMessage({
                        type: 'contextMenu:show',
                        actions,
                        contractName: req.contractName,
                        contractPath: req.contractPath,
                        contractId: req.contractId,
                        templateId: req.templateId,
                        templateCategory: req.templateCategory,
                        x: req.x,
                        y: req.y,
                    });
                    break;
                }

                case 'contextMenu:action': {
                    const req = message as unknown as { type: string } & ContextMenuActionRequest;
                    const feedback: ActionFeedback = await this.contextMenuService.handleAction(req);
                    this.outputChannel.appendLine(
                        `[ContextMenu] Action "${req.actionId}" result: ${feedback.type} – ${feedback.message}`
                    );
                    this._view?.webview.postMessage({ type: 'actionFeedback', feedback });
                    if (feedback.refresh) {
                        setTimeout(() => this.refresh(), 300);
                    }
                    break;
                }

                // ── Drag-and-drop ─────────────────────────────

                case 'dnd:reorder': {
                    const fromPath = message['fromPath'] as string | undefined;
                    const toPath = message['toPath'] as string | undefined;

                    if (!fromPath || !toPath) {
                        this.outputChannel.appendLine('[Reordering] ERROR: missing fromPath or toPath');
                        this._view?.webview.postMessage({
                            type: 'actionFeedback',
                            feedback: { type: 'error', message: 'Reorder failed: invalid drag payload.' },
                        });
                        break;
                    }

                    try {
                        await this.reorderingService.move(
                            this._lastContracts,
                            fromPath,
                            toPath
                        );
                        const reordered = this.reorderingService.applyOrder(this._lastContracts);
                        this._lastContracts = reordered;
                        this._view?.webview.postMessage({
                            type: 'update',
                            contracts: reordered,
                            deployments: this._getDeploymentHistory(),
                            versionStates: this._getVersionStates(reordered),
                        });
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        this.outputChannel.appendLine(`[Reordering] ERROR: ${msg}`);
                        this._view?.webview.postMessage({
                            type: 'actionFeedback',
                            feedback: { type: 'error', message: `Reorder failed: ${msg}` },
                        });
                        this._view?.webview.postMessage({
                            type: 'update',
                            contracts: this._lastContracts,
                            deployments: this._getDeploymentHistory(),
                            versionStates: this._getVersionStates(this._lastContracts),
                        });
                    }
                    break;
                }

                case 'dnd:cancel': {
                    this.outputChannel.appendLine('[Reordering] Drag cancelled — restoring order');
                    this._view?.webview.postMessage({
                        type: 'update',
                        contracts: this._lastContracts,
                        deployments: this._getDeploymentHistory(),
                        versionStates: this._getVersionStates(this._lastContracts),
                    });
                    break;
                }

                case 'dnd:reset': {
                    await this.reorderingService.resetOrder();
                    this.refresh();
                    this._view?.webview.postMessage({
                        type: 'actionFeedback',
                        feedback: { type: 'info', message: 'Contract order reset to default.' },
                    });
                    break;
                }

                // ── Version tracking ──────────────────────────

                case 'version:getHistory': {
                    const contractPath = message['contractPath'] as string | undefined;
                    if (!contractPath) { break; }
                    const history = this.versionTracker.getVersionHistory(contractPath);
                    this._view?.webview.postMessage({ type: 'version:history', contractPath, history });
                    break;
                }

                case 'version:tag': {
                    const contractPath = message['contractPath'] as string | undefined;
                    const entryId = message['entryId'] as string | undefined;
                    const label = message['label'] as string | undefined;
                    if (!contractPath || !entryId || !label) { break; }
                    const ok = await this.versionTracker.tagVersion(contractPath, entryId, label);
                    this._view?.webview.postMessage({
                        type: 'actionFeedback',
                        feedback: ok
                            ? { type: 'success', message: `Version tagged as "${label}".` }
                            : { type: 'error', message: 'Failed to tag version — entry not found.' },
                    });
                    break;
                }

                case 'version:clearHistory': {
                    const contractPath = message['contractPath'] as string | undefined;
                    if (!contractPath) { break; }
                    await this.versionTracker.clearVersionHistory(contractPath);
                    this.refresh();
                    this._view?.webview.postMessage({
                        type: 'actionFeedback',
                        feedback: { type: 'info', message: 'Version history cleared.' },
                    });
                    break;
                }

                // ── Simulation history ───────────────────────────

                case 'simHistory:getAll': {
                    const historyService = this._getSimulationHistoryService();
                    if (!historyService) { break; }
                    const filterObj = message['filter'] as Record<string, unknown> | undefined;
                    const entries = historyService.queryHistory({
                        filter: filterObj as any,
                        limit: 50,
                    });
                    const stats = historyService.getStatistics();
                    this._view?.webview.postMessage({
                        type: 'simHistory:data',
                        entries,
                        stats,
                    });
                    break;
                }

                case 'simHistory:label': {
                    const historyService = this._getSimulationHistoryService();
                    if (!historyService) { break; }
                    const entryId = message['entryId'] as string | undefined;
                    const label = message['label'] as string | undefined;
                    if (!entryId || !label) { break; }
                    const ok = await historyService.labelEntry(entryId, label);
                    this._view?.webview.postMessage({
                        type: 'actionFeedback',
                        feedback: ok
                            ? { type: 'success', message: `Simulation labeled "${label}".` }
                            : { type: 'error', message: 'Failed to label — entry not found.' },
                    });
                    break;
                }

                case 'simHistory:delete': {
                    const historyService = this._getSimulationHistoryService();
                    if (!historyService) { break; }
                    const deleteId = message['entryId'] as string | undefined;
                    if (!deleteId) { break; }
                    const deleted = await historyService.deleteEntry(deleteId);
                    this._view?.webview.postMessage({
                        type: 'actionFeedback',
                        feedback: deleted
                            ? { type: 'success', message: 'Simulation entry deleted.' }
                            : { type: 'error', message: 'Entry not found.' },
                    });
                    // Refresh the history panel
                    if (deleted) {
                        const refreshedEntries = historyService.queryHistory({ limit: 50 });
                        const refreshedStats = historyService.getStatistics();
                        this._view?.webview.postMessage({
                            type: 'simHistory:data',
                            entries: refreshedEntries,
                            stats: refreshedStats,
                        });
                    }
                    break;
                }

                case 'simHistory:clear': {
                    const historyService = this._getSimulationHistoryService();
                    if (!historyService) { break; }
                    await historyService.clearHistory();
                    this._view?.webview.postMessage({
                        type: 'simHistory:data',
                        entries: [],
                        stats: historyService.getStatistics(),
                    });
                    this._view?.webview.postMessage({
                        type: 'actionFeedback',
                        feedback: { type: 'info', message: 'Simulation history cleared.' },
                    });
                    break;
                }

                case 'simHistory:export': {
                    await vscode.commands.executeCommand('stellarSuite.exportSimulationHistory');
                    break;
                }

                // ── Export / Import ────────────────────────────

                case 'sidebar:export': {
                    this.outputChannel.appendLine('[Export] Starting sidebar export…');
                    try {
                        const workspaceId = vscode.workspace.workspaceFolders?.[0]?.name || 'unknown';
                        const payload = buildExportPayload({
                            contracts: this._lastContracts as ExportableContract[],
                            workspaceId,
                        });
                        const json = serializeExport(payload);

                        const uri = await vscode.window.showSaveDialog({
                            defaultUri: vscode.Uri.file(`stellar-suite-export-${Date.now()}.json`),
                            filters: { 'JSON Files': ['json'] },
                            title: 'Export Sidebar Contracts',
                        });
                        if (uri) {
                            await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf-8'));
                            this._view?.webview.postMessage({
                                type: 'actionFeedback',
                                feedback: { type: 'success', message: `Exported ${payload.contracts.length} contract(s).` },
                            });
                            this.outputChannel.appendLine(`[Export] Saved to ${uri.fsPath}`);
                        }
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        this.outputChannel.appendLine(`[Export] ERROR: ${msg}`);
                        this._view?.webview.postMessage({
                            type: 'actionFeedback',
                            feedback: { type: 'error', message: `Export failed: ${msg}` },
                        });
                    }
                    break;
                }

                case 'sidebar:import': {
                    this.outputChannel.appendLine('[Import] Starting sidebar import…');
                    try {
                        const uris = await vscode.window.showOpenDialog({
                            canSelectMany: false,
                            filters: { 'JSON Files': ['json'] },
                            title: 'Import Sidebar Contracts',
                        });
                        if (!uris || uris.length === 0) { break; }

                        const rawBytes = await vscode.workspace.fs.readFile(uris[0]);
                        const raw = Buffer.from(rawBytes).toString('utf-8');
                        const parsed = parseExportFile(raw);

                        const existing: ExistingContract[] = this._lastContracts.map(c => ({
                            id: c.contractId || `local:${c.name}`,
                            name: c.name,
                            address: c.contractId || '',
                            network: c.network || 'testnet',
                        }));

                        const validation = validateAndPreview(parsed, existing);

                        this._view?.webview.postMessage({
                            type: 'import:preview',
                            validation,
                            formattedPreview: formatImportPreview(validation.preview),
                        });

                        this.outputChannel.appendLine(
                            `[Import] Preview ready: ${validation.preview.newContracts.length} new, ` +
                            `${validation.preview.conflicts.length} conflict(s)`
                        );
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        this.outputChannel.appendLine(`[Import] ERROR: ${msg}`);
                        this._view?.webview.postMessage({
                            type: 'actionFeedback',
                            feedback: { type: 'error', message: `Import failed: ${msg}` },
                        });
                    }
                    break;
                }

                case 'import:apply': {
                    this.outputChannel.appendLine('[Import] Applying import selection…');
                    try {
                        const preview = message['preview'] as ImportPreview;
                        const selection = message['selection'] as ImportSelection;

                        if (!preview || !selection) {
                            this._view?.webview.postMessage({
                                type: 'actionFeedback',
                                feedback: { type: 'error', message: 'Import apply: missing preview or selection.' },
                            });
                            break;
                        }

                        const existing: ExistingContract[] = this._lastContracts.map(c => ({
                            id: c.contractId || `local:${c.name}`,
                            name: c.name,
                            address: c.contractId || '',
                            network: c.network || 'testnet',
                        }));

                        const result = await applyImport(
                            preview,
                            selection,
                            {
                                currentContracts: existing,
                                applyContracts: async (contracts) => {
                                    const deployed: Record<string, string> = {};
                                    for (const c of contracts) {
                                        if (c.address) { deployed[c.id] = c.address; }
                                    }
                                    await this._context.workspaceState.update('stellarSuite.importedContracts', contracts);
                                },
                            },
                        );

                        if (result.success) {
                            this._view?.webview.postMessage({
                                type: 'actionFeedback',
                                feedback: {
                                    type: 'success',
                                    message: `Import complete: ${result.importedCount} imported, ` +
                                        `${result.overwrittenCount} overwritten, ` +
                                        `${result.renamedCount} renamed, ` +
                                        `${result.skippedCount} skipped.`,
                                },
                            });
                            this.refresh();
                        } else {
                            this._view?.webview.postMessage({
                                type: 'actionFeedback',
                                feedback: { type: 'error', message: `Import failed: ${result.errors.join(', ')}` },
                            });
                        }
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        this.outputChannel.appendLine(`[Import] Apply ERROR: ${msg}`);
                        this._view?.webview.postMessage({
                            type: 'actionFeedback',
                            feedback: { type: 'error', message: `Import apply failed: ${msg}` },
                        });
                    }
                    break;
                }

                default:
                    this.outputChannel.appendLine(`[Sidebar] Unknown message type: ${message.type}`);
            }
        });

        this.refresh();
    }

    public refresh() {
        if (!this._view) { return; }
        this.outputChannel.appendLine('[Sidebar] Refreshing contract data…');

        const discovered = this._discoverContracts();
        const ordered = this.reorderingService.applyOrder(discovered);
        this._lastContracts = ordered;

        const deployments = this._getDeploymentHistory();
        const versionStates = this._getVersionStates(ordered);
        this._view.webview.postMessage({ type: 'update', contracts: ordered, deployments, versionStates });
    }

    /** Expose versionTracker for use by commands (e.g. deployContract). */
    public getVersionTracker(): ContractVersionTracker {
        return this.versionTracker;
    }

    public showDeploymentResult(deploymentInfo: unknown) {
        this.outputChannel.appendLine(`[Sidebar] Deployment result: ${JSON.stringify(deploymentInfo)}`);
        this.refresh();
    }

    public showSimulationResult(contractId: string, result: unknown) {
        this.outputChannel.appendLine(`[Sidebar] Simulation result for ${contractId}: ${JSON.stringify(result)}`);
        this.refresh();
    }

    // ── Contract discovery ────────────────────────────────────

    private _discoverContracts(): ContractInfo[] {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { return []; }

        const hidden = this._context.workspaceState.get<string[]>('stellarSuite.hiddenContracts', []);
        const aliases = this._context.workspaceState.get<Record<string, string>>('stellarSuite.contractAliases', {});
        const pinned = this._context.workspaceState.get<string[]>('stellarSuite.pinnedContracts', []);
        const networkOverrides = this._context.workspaceState.get<Record<string, string>>('stellarSuite.contractNetworkOverrides', {});
        const manualTemplateAssignments = this._context.workspaceState.get<Record<string, string>>(
            'stellarSuite.manualTemplateAssignments',
            {}
        );

        const contracts: ContractInfo[] = [];

        for (const folder of workspaceFolders) {
            const templateConfig = this.templateService.loadTemplateConfiguration(folder.uri.fsPath);
            if (templateConfig.warnings.length > 0) {
                for (const warning of templateConfig.warnings) {
                    this.outputChannel.appendLine(`[Template] ${warning}`);
                }
            }

            const found = this._findContracts(folder.uri.fsPath, 0, {
                customTemplates: templateConfig.templates,
                manualTemplateAssignments,
            });
            for (const c of found) {
                if (hidden.includes(c.path)) { continue; }
                if (aliases[c.path]) { c.name = aliases[c.path]; }
                c.isPinned = pinned.includes(c.path);
                if (networkOverrides[c.path]) { c.network = networkOverrides[c.path]; }
                contracts.push(c);
            }
        }

        this.outputChannel.appendLine(`[Sidebar] Discovered ${contracts.length} contract(s)`);
        return contracts;
    }

    private _findContracts(
        rootPath: string,
        depth = 0,
        options?: {
            customTemplates?: TemplateDefinition[];
            manualTemplateAssignments?: Record<string, string>;
        }
    ): ContractInfo[] {
        if (depth > 4) { return []; }
        const results: ContractInfo[] = [];

        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(rootPath, { withFileTypes: true });
        } catch {
            return [];
        }

        const hasCargoToml = entries.some(e => e.isFile() && e.name === 'Cargo.toml');

        if (hasCargoToml) {
            const cargoPath = path.join(rootPath, 'Cargo.toml');
            const cargoContent = fs.readFileSync(cargoPath, 'utf-8');

            if (cargoContent.includes('soroban-sdk')) {
                const nameMatch = cargoContent.match(/^\s*name\s*=\s*"([^"]+)"/m);
                const contractName = nameMatch ? nameMatch[1] : path.basename(rootPath);

                const wasmPath = path.join(rootPath, 'target', 'wasm32-unknown-unknown', 'release');
                const isBuilt = fs.existsSync(wasmPath) &&
                    fs.readdirSync(wasmPath).some(f => f.endsWith('.wasm'));

                const deployedContracts = this._context.workspaceState.get<Record<string, string>>(
                    'stellarSuite.deployedContracts', {}
                );
                const contractId = deployedContracts[rootPath];
                const config = vscode.workspace.getConfiguration('stellarSuite');

                // ── Version info ──────────────────────────────
                const versionState = this.versionTracker.getContractVersionState(
                    cargoPath, contractName
                );
                const templateResult = this.templateService.detectTemplate({
                    cargoTomlPath: cargoPath,
                    contractDir: rootPath,
                    contractName,
                    manualTemplateId: options?.manualTemplateAssignments?.[cargoPath],
                    customTemplates: options?.customTemplates || [],
                });

                results.push({
                    name: contractName,
                    path: cargoPath,
                    contractId,
                    isBuilt,
                    hasWasm: isBuilt,
                    network: config.get<string>('network', 'testnet'),
                    source: config.get<string>('source', 'dev'),
                    localVersion: versionState.localVersion,
                    deployedVersion: versionState.deployedVersion,
                    hasVersionMismatch: versionState.hasMismatch,
                    versionMismatchMessage: versionState.mismatch?.message,
                    templateId: templateResult.templateId,
                    templateCategory: templateResult.category,
                    templateDisplayName: templateResult.displayName,
                    templateSource: templateResult.source,
                    templateConfidence: templateResult.confidence,
                    templateMatchedPatterns: templateResult.matchedPatterns,
                });
                return results;
            }
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) { continue; }
            if (['target', 'node_modules', '.git', 'out'].includes(entry.name)) { continue; }
            results.push(...this._findContracts(path.join(rootPath, entry.name), depth + 1, options));
        }

        return results;
    }

    private _getDeploymentHistory(): DeploymentRecord[] {
        return this._context.workspaceState.get<DeploymentRecord[]>('stellarSuite.deploymentHistory', []);
    }

    private _getVersionStates(contracts: ContractInfo[]): ContractVersionState[] {
        return contracts.map(c =>
            this.versionTracker.getContractVersionState(c.path, c.name)
        );
    }

    private _getSimulationHistoryService(): SimulationHistoryService | undefined {
        // Lazily create a SimulationHistoryService scoped to the workspace
        if (!this._simulationHistoryService) {
            this._simulationHistoryService = new SimulationHistoryService(
                this._context,
                this.outputChannel
            );
        }
        return this._simulationHistoryService;
    }

    // ── HTML ──────────────────────────────────────────────────

    private _getHtmlForWebview(_webview: vscode.Webview): string {
        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>Stellar Suite</title>
<style>
/* ── Reset & Variables ──────────────────────────────────── */
* { box-sizing: border-box; margin: 0; padding: 0; }

:root {
    --color-bg:           var(--vscode-sideBar-background);
    --color-fg:           var(--vscode-foreground);
    --color-muted:        var(--vscode-descriptionForeground);
    --color-accent:       var(--vscode-textLink-foreground);
    --color-border:       var(--vscode-panel-border);
    --color-card:         var(--vscode-editor-background);
    --color-card-hover:   var(--vscode-list-hoverBackground);
    --color-btn-bg:       var(--vscode-button-background);
    --color-btn-fg:       var(--vscode-button-foreground);
    --color-btn-hover:    var(--vscode-button-hoverBackground);
    --color-danger:       var(--vscode-errorForeground, #f14c4c);
    --color-success:      #3fb950;
    --color-accent-dim:   rgba(88,166,255,0.15);
    --radius:             6px;
    --shadow:             0 4px 16px rgba(0,0,0,0.4);
}

body {
    font-family: var(--vscode-font-family);
    font-size:   var(--vscode-font-size, 13px);
    color:       var(--color-fg);
    background:  var(--color-bg);
    padding:     0;
    user-select: none;
}

/* ── Header ─────────────────────────────────────────────── */
.header {
    display:         flex;
    align-items:     center;
    justify-content: space-between;
    padding:         12px 14px 8px;
    gap:             6px;
}
.header h1 {
    font-size:      13px;
    font-weight:    700;
    letter-spacing: 0.5px;
    flex:           1;
}
.header-actions { display: flex; gap: 4px; }
.icon-btn {
    background:    transparent;
    border:        none;
    cursor:        pointer;
    color:         var(--color-muted);
    padding:       4px 6px;
    border-radius: 4px;
    font-size:     12px;
    white-space:   nowrap;
}
.icon-btn:hover { color: var(--color-fg); background: var(--color-card-hover); }

/* ── Section headings ───────────────────────────────────── */
.section-label {
    font-size:      11px;
    font-weight:    700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color:          var(--color-muted);
    padding:        8px 14px 4px;
}

/* ── Contract cards ─────────────────────────────────────── */
#contracts-list { padding: 0 8px 8px; }

.contract-card {
    background:    var(--color-card);
    border:        1px solid var(--color-border);
    border-radius: var(--radius);
    padding:       10px 12px;
    margin-bottom: 6px;
    cursor:        grab;
    transition:    border-color 0.15s, background 0.15s, opacity 0.15s, transform 0.15s;
    position:      relative;
}
.contract-card:hover  { border-color: var(--color-accent); background: var(--color-card-hover); }
.contract-card:active { cursor: grabbing; }

.contract-card.pinned::before {
    content:       '';
    position:      absolute;
    top: 0; left: 0;
    width:         3px;
    height:        100%;
    background:    var(--color-accent);
    border-radius: var(--radius) 0 0 var(--radius);
}

/* ── Drag states ─────────────────────────────────────────── */
.contract-card.dragging {
    opacity:      0.4;
    transform:    scale(0.98);
    cursor:       grabbing;
    border-style: dashed;
}
.contract-card.drop-target-above::before {
    content:       '';
    position:      absolute;
    top:           -4px;
    left:          0; right: 0;
    height:        3px;
    background:    var(--color-accent);
    border-radius: 2px;
    width:         100%;
    z-index:       10;
}
.contract-card.drop-target-below::after {
    content:       '';
    position:      absolute;
    bottom:        -4px;
    left:          0; right: 0;
    height:        3px;
    background:    var(--color-accent);
    border-radius: 2px;
    z-index:       10;
}

.drag-handle {
    display:       flex;
    align-items:   center;
    color:         var(--color-muted);
    padding-right: 8px;
    opacity:       0;
    transition:    opacity 0.1s;
    flex-shrink:   0;
    font-size:     14px;
    cursor:        grab;
    line-height:   1;
}
.contract-card:hover .drag-handle          { opacity: 1; }
.contract-card.pinned .drag-handle         { opacity: 0.3; cursor: not-allowed; }

/* ── Card layout ─────────────────────────────────────────── */
.card-header {
    display:       flex;
    align-items:   center;
    gap:           6px;
    margin-bottom: 6px;
}
.contract-name {
    font-weight:   600;
    color:         var(--color-accent);
    flex:          1;
    overflow:      hidden;
    text-overflow: ellipsis;
    white-space:   nowrap;
}

.badge {
    font-size:     10px;
    font-weight:   600;
    padding:       1px 6px;
    border-radius: 10px;
    white-space:   nowrap;
}
.badge-deployed  { background: rgba(63,185,80,.2);      color: var(--color-success); border: 1px solid rgba(63,185,80,.4); }
.badge-built     { background: var(--color-accent-dim); color: var(--color-accent);  border: 1px solid rgba(88,166,255,.3); }
.badge-not-built { background: rgba(255,255,255,.05);   color: var(--color-muted);   border: 1px solid var(--color-border); }
.badge-version   { background: rgba(180,120,255,.15);   color: #b478ff;              border: 1px solid rgba(180,120,255,.35); }
.badge-mismatch  { background: rgba(241,76,76,.15);     color: var(--color-danger);  border: 1px solid rgba(241,76,76,.4); }
.badge-template-token   { background: rgba(60, 170, 255, .16); color: #6ec3ff; border: 1px solid rgba(60, 170, 255, .35); }
.badge-template-escrow  { background: rgba(255, 164, 66, .14); color: #ffb86a; border: 1px solid rgba(255, 164, 66, .34); }
.badge-template-voting  { background: rgba(100, 195, 110, .15); color: #72d67d; border: 1px solid rgba(100, 195, 110, .34); }
.badge-template-custom  { background: rgba(187, 134, 252, .14); color: #c59bff; border: 1px solid rgba(187, 134, 252, .36); }
.badge-template-unknown { background: rgba(255,255,255,.05); color: var(--color-muted); border: 1px solid var(--color-border); }

.contract-meta {
    font-size:     11px;
    color:         var(--color-muted);
    margin-bottom: 8px;
    line-height:   1.5;
}
.contract-id {
    font-family:   monospace;
    font-size:     10px;
    color:         var(--color-muted);
    word-break:    break-all;
    margin-bottom: 6px;
    background:    rgba(255,255,255,.04);
    padding:       3px 5px;
    border-radius: 3px;
}

.card-actions { display: flex; gap: 5px; flex-wrap: wrap; }
.action-btn {
    background:    var(--color-btn-bg);
    color:         var(--color-btn-fg);
    border:        none;
    border-radius: 4px;
    padding:       4px 10px;
    font-size:     11px;
    font-weight:   500;
    cursor:        pointer;
    transition:    background 0.15s;
}
.action-btn:hover    { background: var(--color-btn-hover); }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.action-btn.secondary {
    background: transparent;
    border:     1px solid var(--color-border);
    color:      var(--color-fg);
}
.action-btn.secondary:hover { background: var(--color-card-hover); }

/* ── Context Menu ───────────────────────────────────────── */
#context-menu {
    position:      fixed;
    background:    var(--vscode-menu-background, var(--color-card));
    border:        1px solid var(--vscode-menu-border, var(--color-border));
    border-radius: var(--radius);
    box-shadow:    var(--shadow);
    min-width:     200px;
    max-width:     260px;
    z-index:       1000;
    overflow:      hidden;
    padding:       4px 0;
    display:       none;
    animation:     menuIn 0.08s ease;
}
@keyframes menuIn {
    from { opacity: 0; transform: scale(0.96) translateY(-4px); }
    to   { opacity: 1; transform: scale(1)    translateY(0);    }
}
#context-menu.visible { display: block; }

.menu-item {
    display:     flex;
    align-items: center;
    gap:         8px;
    padding:     6px 12px;
    cursor:      pointer;
    font-size:   13px;
    color:       var(--vscode-menu-foreground, var(--color-fg));
    white-space: nowrap;
}
.menu-item:hover             { background: var(--vscode-menu-selectionBackground, var(--color-card-hover)); }
.menu-item.disabled          { opacity: 0.4; cursor: not-allowed; pointer-events: none; }
.menu-item.destructive       { color: var(--color-danger); }
.menu-item.destructive:hover { background: rgba(241,76,76,.12); }
.menu-item .item-icon        { font-size: 14px; width: 16px; text-align: center; flex-shrink: 0; }
.menu-item .item-label       { flex: 1; }
.menu-item .item-shortcut    { font-size: 11px; color: var(--color-muted); margin-left: 8px; }
.menu-separator              { height: 1px; background: var(--color-border); margin: 3px 0; }

/* ── Toast ──────────────────────────────────────────────── */
#toast-container {
    position:       fixed;
    bottom:         16px;
    left:           50%;
    transform:      translateX(-50%);
    z-index:        2000;
    display:        flex;
    flex-direction: column;
    gap:            6px;
    pointer-events: none;
}
.toast {
    background:    var(--color-card);
    border:        1px solid var(--color-border);
    border-radius: var(--radius);
    padding:       8px 14px;
    font-size:     12px;
    display:       flex;
    align-items:   center;
    gap:           8px;
    box-shadow:    var(--shadow);
    animation:     toastIn 0.2s ease;
    white-space:   nowrap;
}
@keyframes toastIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0);   }
}
.toast.success { border-left: 3px solid var(--color-success); }
.toast.error   { border-left: 3px solid var(--color-danger);  }
.toast.info    { border-left: 3px solid var(--color-accent);  }

/* ── Import Preview Modal ──────────────────────────────────── */
#import-modal-overlay {
    position:   fixed;
    inset:      0;
    background: rgba(0,0,0,0.55);
    z-index:    3000;
    display:    none;
    align-items: center;
    justify-content: center;
}
#import-modal-overlay.visible { display: flex; }

#import-modal {
    background:    var(--color-card);
    border:        1px solid var(--color-border);
    border-radius: 8px;
    box-shadow:    var(--shadow);
    width:         320px;
    max-height:    90vh;
    display:       flex;
    flex-direction: column;
    overflow:      hidden;
    animation:     menuIn 0.12s ease;
}
.import-modal-header {
    display:        flex;
    align-items:    center;
    justify-content: space-between;
    padding:        10px 14px;
    border-bottom:  1px solid var(--color-border);
    font-weight:    700;
    font-size:      13px;
}
.import-modal-body {
    flex:       1;
    overflow-y: auto;
    padding:    10px 14px;
    font-size:  12px;
}
.import-modal-footer {
    display:        flex;
    justify-content: flex-end;
    gap:            8px;
    padding:        10px 14px;
    border-top:     1px solid var(--color-border);
}
.import-section { margin-bottom: 10px; }
.import-section-title {
    font-weight:    700;
    font-size:      11px;
    color:          var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom:  4px;
}
.import-item {
    display:       flex;
    align-items:   center;
    gap:           6px;
    padding:       4px 0;
    font-size:     12px;
}
.import-item label { flex: 1; cursor: pointer; }
.import-item select {
    font-size:     11px;
    background:    var(--color-bg);
    color:         var(--color-fg);
    border:        1px solid var(--color-border);
    border-radius: 4px;
    padding:       2px 4px;
}
.import-stat {
    display:     flex;
    justify-content: space-between;
    padding:     2px 0;
    color:       var(--color-muted);
}
.import-stat .val { color: var(--color-fg); font-weight: 600; }
.import-error-box {
    background:    rgba(241,76,76,.1);
    border:        1px solid rgba(241,76,76,.4);
    border-radius: var(--radius);
    padding:       6px 10px;
    font-size:     11px;
    color:         var(--color-danger);
    margin-bottom: 8px;
}
.import-warning-box {
    background:    rgba(255,200,50,.1);
    border:        1px solid rgba(255,200,50,.4);
    border-radius: var(--radius);
    padding:       6px 10px;
    font-size:     11px;
    color:         #d4a017;
    margin-bottom: 8px;
}

/* ── Version history panel ──────────────────────────────── */
#version-panel {
    position:      fixed;
    top:           0; right: 0; bottom: 0;
    width:         280px;
    background:    var(--color-card);
    border-left:   1px solid var(--color-border);
    box-shadow:    var(--shadow);
    z-index:       900;
    display:       none;
    flex-direction: column;
    overflow:      hidden;
}
#version-panel.visible { display: flex; }
.version-panel-header {
    display:         flex;
    align-items:     center;
    justify-content: space-between;
    padding:         10px 12px;
    background:      var(--color-bg);
    border-bottom:   1px solid var(--color-border);
    font-size:       12px;
    font-weight:     700;
}
.version-panel-body { flex: 1; overflow-y: auto; padding: 8px; }
.version-entry {
    background:    var(--color-bg);
    border:        1px solid var(--color-border);
    border-radius: var(--radius);
    padding:       7px 10px;
    margin-bottom: 5px;
    font-size:     11px;
}
.version-entry-ver  { font-weight: 700; color: var(--color-accent); margin-bottom: 2px; }
.version-entry-meta { color: var(--color-muted); margin-bottom: 3px; }
.version-entry-tag  { font-size: 10px; color: #b478ff; margin-bottom: 3px; }
.version-entry.deployed { border-left: 3px solid var(--color-success); }
.version-mismatch-banner {
    background:    rgba(241,76,76,.1);
    border:        1px solid rgba(241,76,76,.4);
    border-radius: var(--radius);
    padding:       6px 10px;
    font-size:     11px;
    color:         var(--color-danger);
    margin-bottom: 8px;
}

/* ── Deployments ────────────────────────────────────────── */
#deployments-list { padding: 0 8px 16px; }
.deployment-card {
    background:    var(--color-card);
    border:        1px solid var(--color-border);
    border-radius: var(--radius);
    padding:       8px 12px;
    margin-bottom: 5px;
    font-size:     12px;
}
.deployment-id   { font-family: monospace; font-size: 10px; color: var(--color-muted); word-break: break-all; }
.deployment-meta { color: var(--color-muted); margin-top: 2px; }

/* ── Empty state ────────────────────────────────────────── */
.empty-state {
    text-align:  center;
    padding:     28px 16px;
    color:       var(--color-muted);
    font-size:   12px;
    line-height: 1.6;
}
.empty-state .emoji { font-size: 28px; margin-bottom: 8px; }

/* ── Simulation History ────────────────────────────────── */
#sim-history-list { padding: 0 8px 16px; }
.sim-history-stats {
    font-size:     11px;
    color:         var(--color-muted);
    padding:       4px 14px 6px;
    display:       flex;
    gap:           10px;
    flex-wrap:     wrap;
}
.sim-history-stats .stat-value { font-weight: 600; color: var(--color-fg); }
.sim-history-card {
    background:    var(--color-card);
    border:        1px solid var(--color-border);
    border-radius: var(--radius);
    padding:       8px 12px;
    margin-bottom: 5px;
    font-size:     12px;
    transition:    border-color 0.15s;
}
.sim-history-card:hover { border-color: var(--color-accent); }
.sim-history-card.success { border-left: 3px solid var(--color-success); }
.sim-history-card.failure { border-left: 3px solid var(--color-danger); }
.sim-history-fn   { font-weight: 600; color: var(--color-accent); }
.sim-history-meta { font-size: 10px; color: var(--color-muted); margin-top: 2px; }
.sim-history-label { font-size: 10px; color: #b478ff; margin-top: 2px; }
.sim-history-error { font-size: 10px; color: var(--color-danger); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.sim-history-actions { display: flex; gap: 4px; margin-top: 5px; }
.sim-history-filter {
    padding:       4px 8px;
    display:       flex;
    gap:           4px;
    align-items:   center;
}
.sim-history-filter input {
    background:    var(--color-card);
    border:        1px solid var(--color-border);
    border-radius: 3px;
    color:         var(--color-fg);
    font-size:     11px;
    padding:       3px 6px;
    flex:          1;
    outline:       none;
    font-family:   inherit;
}
.sim-history-filter input:focus { border-color: var(--color-accent); }
.sim-history-filter select {
    background:    var(--color-card);
    border:        1px solid var(--color-border);
    border-radius: 3px;
    color:         var(--color-fg);
    font-size:     11px;
    padding:       3px 4px;
    outline:       none;
    font-family:   inherit;
}
</style>
</head>
<body>

<!-- ── Header ─────────────────────────────────────────────── -->
<div class="header">
    <h1>Stellar Suite</h1>
    <div class="header-actions">
        <button class="icon-btn" id="export-btn"      title="Export contracts">📤 Export</button>
        <button class="icon-btn" id="import-btn"      title="Import contracts">📥 Import</button>
        <button class="icon-btn" id="reset-order-btn" title="Reset contract order to default">↺ Reset order</button>
        <button class="icon-btn" id="refresh-btn"     title="Refresh contracts">↻ Refresh</button>
    </div>
</div>

<!-- ── Contracts section ─────────────────────────────────── -->
<div class="section-label">Contracts</div>
<div id="contracts-list">
    <div class="empty-state"><div class="emoji">🔍</div>Scanning for contracts…</div>
</div>

<!-- ── Deployments section ───────────────────────────────── -->
<div class="section-label">Deployments</div>
<div id="deployments-list">
    <div class="empty-state" style="padding:12px 16px">No deployments recorded.</div>
</div>

<!-- ── Simulation History section ──────────────────────── -->
<div class="section-label" style="display:flex;align-items:center;justify-content:space-between;padding-right:14px">
    Simulations
    <span style="display:flex;gap:4px">
        <button class="icon-btn" id="sim-history-load-btn" title="Load simulation history" style="font-size:11px;padding:2px 5px">↻</button>
        <button class="icon-btn" id="sim-history-export-btn" title="Export simulation history" style="font-size:11px;padding:2px 5px">⤓</button>
        <button class="icon-btn" id="sim-history-clear-btn" title="Clear simulation history" style="font-size:11px;padding:2px 5px;color:var(--color-danger)">✕</button>
    </span>
</div>
<div class="sim-history-filter" id="sim-history-filter">
    <input type="text" id="sim-history-search" placeholder="Search simulations…" />
    <select id="sim-history-outcome-filter">
        <option value="">All</option>
        <option value="success">Success</option>
        <option value="failure">Failure</option>
    </select>
</div>
<div id="sim-history-stats-bar" class="sim-history-stats"></div>
<div id="sim-history-list">
    <div class="empty-state" style="padding:12px 16px">Click ↻ to load simulation history.</div>
</div>

<!-- ── Version History Panel ────────────────────────────── -->
<div id="version-panel" role="complementary" aria-label="Version history">
    <div class="version-panel-header">
        <span id="version-panel-title">Version History</span>
        <button class="icon-btn" onclick="hideVersionPanel()" title="Close">✕</button>
    </div>
    <div class="version-panel-body" id="version-panel-body"></div>
</div>

<!-- ── Context Menu ──────────────────────────────────────── -->
<div id="context-menu" role="menu" aria-label="Contract options"></div>

<!-- ── Toast Container ──────────────────────────────────── -->
<div id="toast-container" aria-live="polite"></div>

<!-- ── Import Preview Modal ────────────────────────────────── -->
<div id="import-modal-overlay">
    <div id="import-modal">
        <div class="import-modal-header">
            <span>Import Preview</span>
            <button class="icon-btn" id="import-modal-close" title="Cancel">✕</button>
        </div>
        <div class="import-modal-body" id="import-modal-body"></div>
        <div class="import-modal-footer">
            <button class="action-btn secondary" id="import-cancel-btn">Cancel</button>
            <button class="action-btn" id="import-apply-btn">Apply Import</button>
        </div>
    </div>
</div>

<script>
const vscode = acquireVsCodeApi();

// ── State ─────────────────────────────────────────────────────
let _contracts          = [];
let _versionStates      = [];
let _activeMenuContract = null;
let _dragPath           = null;
let _dragEl             = null;
let _dropTargetEl       = null;

// ── Import state ──────────────────────────────────────────────
let _importPreview   = null;
let _importValidation = null;

// ── Message receiver ──────────────────────────────────────────
window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
        case 'update':
            _contracts     = msg.contracts     || [];
            _versionStates = msg.versionStates  || [];
            renderContracts(_contracts);
            renderDeployments(msg.deployments || []);
            renderVersionMismatches(_versionStates);
            break;
        case 'contextMenu:show':
            showContextMenu(msg);
            break;
        case 'actionFeedback':
            showToast(msg.feedback);
            break;
        case 'version:history':
            displayVersionHistory(msg.contractPath, msg.history || []);
            break;
        case 'simHistory:data':
            renderSimulationHistory(msg.entries || [], msg.stats || {});
            break;
        case 'import:preview':
            _importValidation = msg.validation;
            _importPreview    = msg.validation.preview;
            showImportPreviewModal(msg.validation);
            break;
    }
});

// ── Header buttons ────────────────────────────────────────────
document.getElementById('refresh-btn').addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
});
document.getElementById('reset-order-btn').addEventListener('click', () => {
    vscode.postMessage({ type: 'dnd:reset' });
});
document.getElementById('export-btn').addEventListener('click', () => {
    vscode.postMessage({ type: 'sidebar:export' });
});
document.getElementById('import-btn').addEventListener('click', () => {
    vscode.postMessage({ type: 'sidebar:import' });
});
document.getElementById('import-modal-close').addEventListener('click', hideImportModal);
document.getElementById('import-cancel-btn').addEventListener('click', hideImportModal);
document.getElementById('import-apply-btn').addEventListener('click', applyImportSelection);

// ── Import Preview Modal Logic ────────────────────────────────

function hideImportModal() {
    document.getElementById('import-modal-overlay').classList.remove('visible');
    _importPreview = null;
    _importValidation = null;
}

function showImportPreviewModal(validation) {
    const preview = validation.preview;
    const body = document.getElementById('import-modal-body');
    let html = '';

    html += '<div class="import-section">';
    html += '<div class="import-section-title">Summary</div>';
    html += \`<div class="import-stat"><span>Total in file</span><span class="val">\${preview.totalContracts}</span></div>\`;
    html += \`<div class="import-stat"><span>New</span><span class="val">\${preview.newContracts.length}</span></div>\`;
    html += \`<div class="import-stat"><span>Conflicts</span><span class="val">\${preview.conflicts.length}</span></div>\`;
    html += \`<div class="import-stat"><span>Invalid</span><span class="val">\${preview.invalidEntries.length}</span></div>\`;
    html += '</div>';

    if (!validation.valid) {
        html += '<div class="import-error-box">File has validation errors — some entries cannot be imported.</div>';
    }
    if (preview.warnings.length > 0) {
        html += '<div class="import-warning-box">' + preview.warnings.map(w => esc(w.message)).join('<br>') + '</div>';
    }

    if (preview.newContracts.length > 0) {
        html += '<div class="import-section">';
        html += '<div class="import-section-title">New Contracts</div>';
        for (const c of preview.newContracts) {
            html += \`<div class="import-item">\`;
            html += \`<input type="checkbox" id="imp-\${esc(c.id)}" data-import-id="\${esc(c.id)}" checked />\`;
            html += \`<label for="imp-\${esc(c.id)}">\${esc(c.name)} <small style="color:var(--color-muted)">(\${esc(c.network)})</small></label>\`;
            html += '</div>';
        }
        html += '</div>';
    }

    if (preview.conflicts.length > 0) {
        html += '<div class="import-section">';
        html += '<div class="import-section-title">Conflicts</div>';
        for (const cf of preview.conflicts) {
            const cid = cf.importedContract.id;
            html += \`<div class="import-item">\`;
            html += \`<input type="checkbox" id="imp-\${esc(cid)}" data-import-id="\${esc(cid)}" />\`;
            html += \`<label for="imp-\${esc(cid)}">\${esc(cf.importedContract.name)} <small style="color:var(--color-danger)">⚠ \${cf.reason === 'duplicate_id' ? 'ID conflict' : 'Address conflict'}</small></label>\`;
            html += \`<select data-conflict-id="\${esc(cid)}">\`;
            html += '<option value="skip">Skip</option>';
            html += '<option value="overwrite">Overwrite</option>';
            html += '<option value="rename">Rename</option>';
            html += '</select>';
            html += '</div>';
        }
        html += '</div>';
    }

    if (preview.invalidEntries.length > 0) {
        html += '<div class="import-section">';
        html += '<div class="import-section-title">Invalid (skipped)</div>';
        for (const inv of preview.invalidEntries) {
            const name = inv.contract.name || '#' + (inv.index + 1);
            html += \`<div class="import-item" style="color:var(--color-muted)">✘ \${esc(name)}: \${inv.issues.map(i => esc(i.message)).join('; ')}</div>\`;
        }
        html += '</div>';
    }

    body.innerHTML = html;
    document.getElementById('import-modal-overlay').classList.add('visible');
}

function applyImportSelection() {
    if (!_importPreview) { return; }

    const checkboxes = document.querySelectorAll('[data-import-id]');
    const selectedIds = [];
    checkboxes.forEach(cb => {
        if (cb.checked) { selectedIds.push(cb.dataset.importId); }
    });

    const conflictResolutions = {};
    const renamedNames = {};
    const selects = document.querySelectorAll('[data-conflict-id]');
    selects.forEach(sel => {
        const cid = sel.dataset.conflictId;
        conflictResolutions[cid] = sel.value;
        if (sel.value === 'rename') {
            const conflict = _importPreview.conflicts.find(c => c.importedContract.id === cid);
            renamedNames[cid] = (conflict ? conflict.importedContract.name : 'contract') + ' (imported)';
        }
    });

    vscode.postMessage({
        type: 'import:apply',
        preview: _importPreview,
        selection: { selectedIds, conflictResolutions, renamedNames },
    });

    hideImportModal();
}

// ── Keyboard ──────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (_dragPath) { cancelDrag(); } else { hideContextMenu(); }
    }
    if (e.key === 'F2' && _activeMenuContract) { invokeAction('rename'); }
});

document.addEventListener('click', (e) => {
    if (!document.getElementById('context-menu').contains(e.target)) {
        hideContextMenu();
    }
});

// ── Render contracts ──────────────────────────────────────────
function templateBadgeClass(contract) {
    if (!contract || !contract.templateCategory) { return 'badge badge-template-unknown'; }
    const category = String(contract.templateCategory).toLowerCase();
    if (category === 'token') { return 'badge badge-template-token'; }
    if (category === 'escrow') { return 'badge badge-template-escrow'; }
    if (category === 'voting') { return 'badge badge-template-voting'; }
    if (contract.templateSource === 'custom') { return 'badge badge-template-custom'; }
    return 'badge badge-template-unknown';
}

function templateActionTitle(contract) {
    if (!contract || !contract.templateCategory || contract.templateCategory === 'unknown') {
        return 'Assign a template to enable template-specific actions';
    }
    return 'Open template-specific actions';
}

function renderContracts(contracts) {
    const el = document.getElementById('contracts-list');
    if (!contracts.length) {
        el.innerHTML = \`<div class="empty-state">
            <div class="emoji">📂</div>
            No Soroban contracts detected.<br>
            Open a workspace containing a <code>Cargo.toml</code> with <code>soroban-sdk</code>.
        </div>\`;
        return;
    }

    el.innerHTML = contracts.map((c, idx) => \`
        <div class="contract-card\${c.isPinned ? ' pinned' : ''}"
             draggable="\${!c.isPinned}"
             data-path="\${esc(c.path)}"
             data-name="\${esc(c.name)}"
             data-contract-id="\${esc(c.contractId || '')}"
             data-is-built="\${c.isBuilt}"
             data-template-id="\${esc(c.templateId || 'unknown')}"
             data-template-category="\${esc(c.templateCategory || 'unknown')}"
             data-index="\${idx}"
             oncontextmenu="onContractRightClick(event, this)"
             ondragstart="onDragStart(event, this)"
             ondragend="onDragEnd(event, this)"
             ondragover="onDragOver(event, this)"
             ondragleave="onDragLeave(event, this)"
             ondrop="onDrop(event, this)"
             title="Right-click for options\${!c.isPinned ? ' · Drag to reorder' : ' · Pinned (unpin to reorder)'}">

            <div class="card-header">
                <span class="drag-handle" aria-hidden="true">\${c.isPinned ? '📌' : '⠿'}</span>
                <span class="contract-name">\${esc(c.name)}</span>
                \${c.contractId ? '<span class="badge badge-deployed">Deployed</span>' : ''}
                \${c.isBuilt
                    ? '<span class="badge badge-built">Built</span>'
                    : '<span class="badge badge-not-built">Not Built</span>'}
                <span class="\${templateBadgeClass(c)}" title="Template category">\${esc(c.templateDisplayName || 'Unknown')}</span>
                \${c.localVersion ? \`<span class="badge badge-version" title="Local version">v\${esc(c.localVersion)}</span>\` : ''}
                \${c.hasVersionMismatch ? '<span class="badge badge-mismatch" title="Version mismatch detected">⚠ Mismatch</span>' : ''}
            </div>

            \${c.contractId   ? \`<div class="contract-id" title="\${esc(c.contractId)}">ID: \${esc(c.contractId)}</div>\` : ''}
            \${c.deployedAt  ? \`<div class="contract-meta">Deployed: \${esc(c.deployedAt)}</div>\` : ''}
            <div class="contract-meta">Template: <strong>\${esc(c.templateDisplayName || 'Unknown')}</strong> · \${esc(c.templateSource || 'unknown')}</div>
            \${c.deployedVersion ? \`<div class="contract-meta" style="font-size:10px">Deployed version: <strong>v\${esc(c.deployedVersion)}</strong></div>\` : ''}
            \${c.hasVersionMismatch ? \`<div class="contract-meta" style="color:var(--color-danger);font-size:10px">⚠ \${esc(c.versionMismatchMessage || 'Version mismatch')}</div>\` : ''}

            <div class="card-actions">
                <button class="action-btn"
                        onclick="sendAction('build', this.closest('.contract-card'))"
                        title="Build contract">Build</button>
                <button class="action-btn secondary"
                        onclick="sendAction('simulate', this.closest('.contract-card'))"
                        \${!c.contractId ? 'disabled' : ''}
                        title="Simulate transaction">Simulate</button>
                <button class="action-btn secondary"
                        onclick="sendAction('inspect', this.closest('.contract-card'))"
                        \${!c.contractId ? 'disabled' : ''}
                        title="Inspect contract">Inspect</button>
                <button class="action-btn secondary"
                        onclick="showVersionHistory(\${esc(JSON.stringify(c.path))}, this.closest('.contract-card'))"
                        title="Show version history">History</button>
                <button class="action-btn secondary"
                        onclick="sendAction('templateActions', this.closest('.contract-card'))"
                        \${(!c.templateCategory || c.templateCategory === 'unknown') ? 'disabled' : ''}
                        title="\${templateActionTitle(c)}">Template</button>
            </div>
        </div>
    \`).join('');
}

function sendAction(actionId, card) {
    vscode.postMessage({
        type:         'contextMenu:action',
        actionId,
        contractName: card.dataset.name,
        contractPath: card.dataset.path,
        contractId:   card.dataset.contractId || undefined,
        templateId: card.dataset.templateId || undefined,
        templateCategory: card.dataset.templateCategory || undefined,
    });
}

// ── Render deployments ────────────────────────────────────────
function renderDeployments(deployments) {
    const el = document.getElementById('deployments-list');
    if (!deployments.length) {
        el.innerHTML = '<div class="empty-state" style="padding:12px 16px">No deployments recorded.</div>';
        return;
    }
    el.innerHTML = deployments.slice().reverse().slice(0, 10).map(d => \`
        <div class="deployment-card">
            <div class="deployment-id">\${esc(d.contractId)}</div>
            <div class="deployment-meta">\${esc(d.deployedAt)} · \${esc(d.network)} · \${esc(d.source)}</div>
        </div>
    \`).join('');
}

// ── Drag-and-drop ─────────────────────────────────────────────

function onDragStart(e, card) {
    if (card.classList.contains('pinned')) { e.preventDefault(); return; }
    _dragPath = card.dataset.path;
    _dragEl   = card;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', _dragPath);
    requestAnimationFrame(() => card.classList.add('dragging'));
}

function onDragEnd(e, card) {
    card.classList.remove('dragging');
    clearDropIndicators();
    _dragPath = null; _dragEl = null; _dropTargetEl = null;
}

function onDragOver(e, card) {
    if (!_dragPath || card.dataset.path === _dragPath) { return; }
    if (card.classList.contains('pinned'))             { return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDropIndicators();
    const rect  = card.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    card.classList.add(above ? 'drop-target-above' : 'drop-target-below');
    _dropTargetEl = card;
}

function onDragLeave(e, card) {
    if (!card.contains(e.relatedTarget)) {
        card.classList.remove('drop-target-above', 'drop-target-below');
        if (_dropTargetEl === card) { _dropTargetEl = null; }
    }
}

function onDrop(e, card) {
    e.preventDefault();
    const toPath = card.dataset.path;
    if (!_dragPath || !toPath || _dragPath === toPath || card.classList.contains('pinned')) {
        clearDropIndicators();
        return;
    }
    clearDropIndicators();
    reorderLocally(_dragPath, toPath);
    vscode.postMessage({ type: 'dnd:reorder', fromPath: _dragPath, toPath });
}

function cancelDrag() {
    if (_dragEl) { _dragEl.classList.remove('dragging'); }
    clearDropIndicators();
    _dragPath = null; _dragEl = null; _dropTargetEl = null;
    vscode.postMessage({ type: 'dnd:cancel' });
}

function clearDropIndicators() {
    document.querySelectorAll('.drop-target-above, .drop-target-below').forEach(el => {
        el.classList.remove('drop-target-above', 'drop-target-below');
    });
}

function reorderLocally(fromPath, toPath) {
    const fromIdx = _contracts.findIndex(c => c.path === fromPath);
    const toIdx   = _contracts.findIndex(c => c.path === toPath);
    if (fromIdx === -1 || toIdx === -1) { return; }
    const updated = [..._contracts];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    _contracts = updated;
    renderContracts(_contracts);
}

// ── Context menu ──────────────────────────────────────────────

function onContractRightClick(e, card) {
    e.preventDefault();
    e.stopPropagation();
    _activeMenuContract = {
        contractName: card.dataset.name,
        contractPath: card.dataset.path,
        contractId:   card.dataset.contractId || undefined,
        isBuilt:      card.dataset.isBuilt === 'true',
        templateId: card.dataset.templateId || undefined,
        templateCategory: card.dataset.templateCategory || undefined,
    };
    vscode.postMessage({ type: 'contextMenu:open', ..._activeMenuContract, x: e.clientX, y: e.clientY });
}

function showContextMenu(msg) {
    const menu = document.getElementById('context-menu');
    menu.innerHTML = msg.actions.map(action => {
        if (action.type === 'separator') { return '<div class="menu-separator"></div>'; }
        const sepHtml      = action.separatorBefore ? '<div class="menu-separator"></div>' : '';
        const classes      = ['menu-item', action.enabled ? '' : 'disabled', action.destructive ? 'destructive' : ''].filter(Boolean).join(' ');
        const iconHtml     = action.icon     ? \`<span class="item-icon codicon codicon-\${esc(action.icon)}"></span>\` : '<span class="item-icon"></span>';
        const shortcutHtml = action.shortcut ? \`<span class="item-shortcut">\${esc(action.shortcut)}</span>\` : '';
        return \`\${sepHtml}<div class="\${classes}" role="menuitem"
            aria-disabled="\${!action.enabled}" tabindex="\${action.enabled ? '0' : '-1'}"
            data-action-id="\${esc(action.id)}"
            onclick="onMenuItemClick(this)" onkeydown="onMenuItemKey(event,this)">
            \${iconHtml}<span class="item-label">\${esc(action.label)}</span>\${shortcutHtml}
        </div>\`;
    }).join('');
    const menuW = 220, menuH = menu.childElementCount * 34;
    menu.style.left = Math.min(msg.x, window.innerWidth  - menuW - 8) + 'px';
    menu.style.top  = Math.min(msg.y, window.innerHeight - menuH - 8) + 'px';
    menu.classList.add('visible');
    menu.querySelector('.menu-item:not(.disabled)')?.focus();
}

function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    menu.classList.remove('visible');
    menu.innerHTML = '';
}

function onMenuItemClick(el) {
    const actionId = el.dataset.actionId;
    if (!actionId || !_activeMenuContract) { return; }
    invokeAction(actionId);
}

function onMenuItemKey(e, el) {
    const items = [...document.querySelectorAll('#context-menu .menu-item:not(.disabled)')];
    const idx   = items.indexOf(el);
    if      (e.key === 'ArrowDown')               { e.preventDefault(); items[(idx + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp')                 { e.preventDefault(); items[(idx - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Enter' || e.key === ' ')  { e.preventDefault(); invokeAction(el.dataset.actionId); }
}

function invokeAction(actionId) {
    if (!_activeMenuContract) { return; }
    hideContextMenu();
    vscode.postMessage({ type: 'contextMenu:action', actionId, ...(_activeMenuContract) });
}

// ── Toast ─────────────────────────────────────────────────────

function showToast(feedback) {
    if (!feedback) { return; }
    const container = document.getElementById('toast-container');
    const toast     = document.createElement('div');
    toast.className = 'toast ' + (feedback.type || 'info');
    const icons     = { success: '✓', error: '✕', info: 'ℹ' };
    toast.textContent = (icons[feedback.type] || '') + ' ' + feedback.message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity    = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 320);
    }, 3500);
}
// ── Version mismatches banner ────────────────────────────────

function renderVersionMismatches(states) {
    const mismatches = (states || []).filter(s => s.hasMismatch);
    const existing   = document.getElementById('version-mismatches-banner');
    if (existing) { existing.remove(); }
    if (!mismatches.length) { return; }
    const banner = document.createElement('div');
    banner.id        = 'version-mismatches-banner';
    banner.className = 'version-mismatch-banner';
    banner.style.cssText = 'margin: 0 8px 8px;';
    banner.innerHTML = \`⚠ <strong>\${mismatches.length} version mismatch(es) detected.</strong>\` +
        mismatches.map(m => \`<div style="margin-top:4px">\${esc(m.contractName)}: local <strong>\${esc(m.localVersion)}</strong> vs deployed <strong>\${esc(m.deployedVersion)}</strong></div>\`).join('');
    const contractsList = document.getElementById('contracts-list');
    contractsList?.parentNode?.insertBefore(banner, contractsList);
}

// ── Version history panel ─────────────────────────────────────

function showVersionHistory(contractPath, card) {
    vscode.postMessage({ type: 'version:getHistory', contractPath });
}

function hideVersionPanel() {
    document.getElementById('version-panel').classList.remove('visible');
}

function displayVersionHistory(contractPath, history) {
    const panel     = document.getElementById('version-panel');
    const body      = document.getElementById('version-panel-body');
    const titleEl   = document.getElementById('version-panel-title');

    // Find contract name
    const contract  = _contracts.find(c => c.path === contractPath);
    titleEl.textContent = \`Version History — \${contract ? contract.name : contractPath}\`;

    if (!history.length) {
        body.innerHTML = '<div class="empty-state" style="padding:16px">No version history recorded.</div>';
    } else {
        const entries = [...history].reverse(); // newest first
        body.innerHTML = entries.map(e => \`
            <div class="version-entry\${e.isDeployed ? ' deployed' : ''}">
                <div class="version-entry-ver">v\${esc(e.version)}\${e.isDeployed ? ' 🚀' : ''}</div>
                \${e.label ? \`<div class="version-entry-tag">🏷 \${esc(e.label)}</div>\` : ''}
                <div class="version-entry-meta">\${new Date(e.recordedAt).toLocaleString()}</div>
                \${e.network    ? \`<div class="version-entry-meta">Network: \${esc(e.network)}</div>\` : ''}
                \${e.contractId ? \`<div class="version-entry-meta" style="font-size:10px;word-break:break-all">ID: \${esc(e.contractId)}</div>\` : ''}
                <div style="margin-top:6px;display:flex;gap:4px">
                    <button class="action-btn secondary" style="font-size:10px;padding:2px 7px"
                        onclick="promptTagVersion(\${JSON.stringify(contractPath)}, \${JSON.stringify(e.id)})">Tag</button>
                </div>
            </div>
        \`).join('');
    }

    panel.classList.add('visible');
}

function promptTagVersion(contractPath, entryId) {
    const label = prompt('Enter a label for this version (e.g. "Initial release", "Bug-fix"):');
    if (!label || !label.trim()) { return; }
    vscode.postMessage({ type: 'version:tag', contractPath, entryId, label: label.trim() });
    // Re-fetch history to reflect tag
    setTimeout(() => vscode.postMessage({ type: 'version:getHistory', contractPath }), 300);
}

// ── Simulation history ────────────────────────────────────────

let _simHistoryDebounce = null;

document.getElementById('sim-history-load-btn').addEventListener('click', () => {
    loadSimulationHistory();
});
document.getElementById('sim-history-export-btn').addEventListener('click', () => {
    vscode.postMessage({ type: 'simHistory:export' });
});
document.getElementById('sim-history-clear-btn').addEventListener('click', () => {
    vscode.postMessage({ type: 'simHistory:clear' });
});
document.getElementById('sim-history-search').addEventListener('input', (e) => {
    clearTimeout(_simHistoryDebounce);
    _simHistoryDebounce = setTimeout(() => loadSimulationHistory(), 300);
});
document.getElementById('sim-history-outcome-filter').addEventListener('change', () => {
    loadSimulationHistory();
});

function loadSimulationHistory() {
    const searchText = document.getElementById('sim-history-search').value.trim();
    const outcome    = document.getElementById('sim-history-outcome-filter').value;
    const filter     = {};
    if (searchText) { filter.searchText = searchText; }
    if (outcome)    { filter.outcome    = outcome; }
    vscode.postMessage({ type: 'simHistory:getAll', filter });
}

function renderSimulationHistory(entries, stats) {
    const statsBar = document.getElementById('sim-history-stats-bar');
    const listEl   = document.getElementById('sim-history-list');

    if (stats && stats.totalSimulations > 0) {
        statsBar.innerHTML =
            '<span>Total: <span class="stat-value">' + stats.totalSimulations + '</span></span>' +
            '<span>Passed: <span class="stat-value" style="color:var(--color-success)">' + stats.successCount + '</span></span>' +
            '<span>Failed: <span class="stat-value" style="color:var(--color-danger)">' + stats.failureCount + '</span></span>' +
            '<span>Contracts: <span class="stat-value">' + stats.uniqueContracts + '</span></span>';
    } else {
        statsBar.innerHTML = '';
    }

    if (!entries.length) {
        listEl.innerHTML = '<div class="empty-state" style="padding:12px 16px">No simulation history found.</div>';
        return;
    }

    listEl.innerHTML = entries.map(function(e) {
        var icon     = e.outcome === 'success' ? '\u2713' : '\u2717';
        var shortId  = e.contractId.length > 12 ? e.contractId.slice(0, 8) + '\u2026' + e.contractId.slice(-4) : e.contractId;
        var duration = e.durationMs !== undefined ? ' \u00b7 ' + e.durationMs + 'ms' : '';
        var html = '<div class="sim-history-card ' + esc(e.outcome) + '" data-entry-id="' + esc(e.id) + '">';
        html += '<div class="sim-history-fn">' + icon + ' ' + esc(e.functionName) + '()</div>';
        html += '<div class="sim-history-meta">' + esc(shortId) + ' \u00b7 ' + esc(e.network) + ' \u00b7 ' + esc(e.method) + duration + '</div>';
        html += '<div class="sim-history-meta">' + new Date(e.timestamp).toLocaleString() + '</div>';
        if (e.label) { html += '<div class="sim-history-label">\ud83c\udff7 ' + esc(e.label) + '</div>'; }
        if (e.outcome === 'failure' && e.error) { html += '<div class="sim-history-error" title="' + esc(e.error) + '">' + esc(e.error) + '</div>'; }
        html += '<div class="sim-history-actions">';
        html += '<button class="action-btn secondary" style="font-size:10px;padding:2px 7px" onclick="promptLabelSimulation(\'' + esc(e.id) + '\')">Label</button>';
        html += '<button class="action-btn secondary" style="font-size:10px;padding:2px 7px;color:var(--color-danger)" onclick="deleteSimulationEntry(\'' + esc(e.id) + '\')">Delete</button>';
        html += '</div></div>';
        return html;
    }).join('');
}

function promptLabelSimulation(entryId) {
    var label = prompt('Enter a label for this simulation:');
    if (!label || !label.trim()) { return; }
    vscode.postMessage({ type: 'simHistory:label', entryId: entryId, label: label.trim() });
    setTimeout(function() { loadSimulationHistory(); }, 300);
}

function deleteSimulationEntry(entryId) {
    vscode.postMessage({ type: 'simHistory:delete', entryId: entryId });
}

// ── Helpers ───────────────────────────────────────────────────

function esc(str) {
    if (!str) { return ''; }
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
<\/script>
<\/body>
<\/html>`;
    }
}
