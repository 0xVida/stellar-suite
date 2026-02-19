
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
}

export interface DeploymentRecord {
    contractId: string;
    contractName: string;
    deployedAt: string;
    network: string;
    source: string;
}

export class SidebarViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'stellarSuite.contractsView';

    private _view?: vscode.WebviewView;
    private readonly outputChannel: vscode.OutputChannel;
    private readonly contextMenuService: ContractContextMenuService;
    private readonly reorderingService: ReorderingService;

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
                        contractId:   req.contractId,
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
                    const toPath   = message['toPath']   as string | undefined;

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
                            contracts:   reordered,
                            deployments: this._getDeploymentHistory(),
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
                            contracts:   this._lastContracts,
                            deployments: this._getDeploymentHistory(),
                        });
                    }
                    break;
                }

                case 'dnd:cancel': {
                    this.outputChannel.appendLine('[Reordering] Drag cancelled — restoring order');
                    this._view?.webview.postMessage({
                        type: 'update',
                        contracts:   this._lastContracts,
                        deployments: this._getDeploymentHistory(),
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

                default:
                    this.outputChannel.appendLine(`[Sidebar] Unknown message type: ${message.type}`);
            }
        });

        this.refresh();
    }

    public refresh() {
        if (!this._view) { return; }
        this.outputChannel.appendLine('[Sidebar] Refreshing contract data…');

        const discovered    = this._discoverContracts();
        const ordered       = this.reorderingService.applyOrder(discovered);
        this._lastContracts = ordered;

        const deployments = this._getDeploymentHistory();
        this._view.webview.postMessage({ type: 'update', contracts: ordered, deployments });
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

        const hidden          = this._context.workspaceState.get<string[]>('stellarSuite.hiddenContracts', []);
        const aliases         = this._context.workspaceState.get<Record<string, string>>('stellarSuite.contractAliases', {});
        const pinned          = this._context.workspaceState.get<string[]>('stellarSuite.pinnedContracts', []);
        const networkOverrides = this._context.workspaceState.get<Record<string, string>>('stellarSuite.contractNetworkOverrides', {});

        const contracts: ContractInfo[] = [];

        for (const folder of workspaceFolders) {
            const found = this._findContracts(folder.uri.fsPath);
            for (const c of found) {
                if (hidden.includes(c.path))          { continue; }
                if (aliases[c.path])                  { c.name    = aliases[c.path]; }
                c.isPinned = pinned.includes(c.path);
                if (networkOverrides[c.path])          { c.network = networkOverrides[c.path]; }
                contracts.push(c);
            }
        }

        this.outputChannel.appendLine(`[Sidebar] Discovered ${contracts.length} contract(s)`);
        return contracts;
    }

    private _findContracts(rootPath: string, depth = 0): ContractInfo[] {
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
            const cargoPath    = path.join(rootPath, 'Cargo.toml');
            const cargoContent = fs.readFileSync(cargoPath, 'utf-8');

            if (cargoContent.includes('soroban-sdk')) {
                const nameMatch    = cargoContent.match(/^\s*name\s*=\s*"([^"]+)"/m);
                const contractName = nameMatch ? nameMatch[1] : path.basename(rootPath);

                const wasmPath = path.join(rootPath, 'target', 'wasm32-unknown-unknown', 'release');
                const isBuilt  = fs.existsSync(wasmPath) &&
                    fs.readdirSync(wasmPath).some(f => f.endsWith('.wasm'));

                const deployedContracts = this._context.workspaceState.get<Record<string, string>>(
                    'stellarSuite.deployedContracts', {}
                );
                const contractId = deployedContracts[rootPath];
                const config     = vscode.workspace.getConfiguration('stellarSuite');

                results.push({
                    name:       contractName,
                    path:       cargoPath,
                    contractId,
                    isBuilt,
                    hasWasm:    isBuilt,
                    network:    config.get<string>('network', 'testnet'),
                    source:     config.get<string>('source',  'dev'),
                });
                return results;
            }
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) { continue; }
            if (['target', 'node_modules', '.git', 'out'].includes(entry.name)) { continue; }
            results.push(...this._findContracts(path.join(rootPath, entry.name), depth + 1));
        }

        return results;
    }

    private _getDeploymentHistory(): DeploymentRecord[] {
        return this._context.workspaceState.get<DeploymentRecord[]>('stellarSuite.deploymentHistory', []);
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
</style>
</head>
<body>

<!-- ── Header ─────────────────────────────────────────────── -->
<div class="header">
    <h1>Stellar Suite</h1>
    <div class="header-actions">
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

<!-- ── Context Menu ──────────────────────────────────────── -->
<div id="context-menu" role="menu" aria-label="Contract options"></div>

<!-- ── Toast Container ──────────────────────────────────── -->
<div id="toast-container" aria-live="polite"></div>

<script>
const vscode = acquireVsCodeApi();

// ── State ─────────────────────────────────────────────────────
let _contracts          = [];
let _activeMenuContract = null;
let _dragPath           = null;
let _dragEl             = null;
let _dropTargetEl       = null;

// ── Message receiver ──────────────────────────────────────────
window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
        case 'update':
            _contracts = msg.contracts || [];
            renderContracts(_contracts);
            renderDeployments(msg.deployments || []);
            break;
        case 'contextMenu:show':
            showContextMenu(msg);
            break;
        case 'actionFeedback':
            showToast(msg.feedback);
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
            </div>

            \${c.contractId ? \`<div class="contract-id" title="\${esc(c.contractId)}">ID: \${esc(c.contractId)}</div>\` : ''}
            \${c.deployedAt ? \`<div class="contract-meta">Deployed: \${esc(c.deployedAt)}</div>\` : ''}

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

// ── Helpers ───────────────────────────────────────────────────

function esc(str) {
    if (!str) { return ''; }
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
</script>
</body>
</html>`;
    }
}