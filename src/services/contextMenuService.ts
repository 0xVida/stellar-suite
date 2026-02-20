// ============================================================
// src/services/contextMenuService.ts
// Builds and evaluates the context menu for a given contract.
// Follows the pattern of other services in the extension.
// ============================================================

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    ContractInfo,
    ContextMenuAction,
    ContextMenuRequest,
    ContextMenuActionRequest,
    ActionFeedback,
    ContextMenuActionId,
} from '../types/contextMenu';
import { ContractTemplateService, TemplateDefinition } from './contractTemplateService';

// ── Custom action registry ────────────────────────────────────
// Allows other parts of the extension (or future plugins) to register
// additional context menu actions at runtime.

export interface CustomContextAction {
    action: ContextMenuAction;
    /** Insert before this action id, or omit to append at end */
    insertBefore?: string;
    /** Handler called when the action is invoked */
    handler: (contract: ContractInfo, context: vscode.ExtensionContext) => Promise<ActionFeedback>;
}

const _customActions: CustomContextAction[] = [];

export function registerCustomContextAction(registration: CustomContextAction): vscode.Disposable {
    _customActions.push(registration);
    return new vscode.Disposable(() => {
        const idx = _customActions.indexOf(registration);
        if (idx !== -1) { _customActions.splice(idx, 1); }
    });
}

// ── Context detection ─────────────────────────────────────────

/**
 * Given a right-click request from the webview, determine which
 * actions should be shown and whether each is enabled.
 */
export function resolveContextMenuActions(req: ContextMenuRequest): ContextMenuAction[] {
    const hasContractId = !!req.contractId;
    const isBuilt = req.isBuilt;
    const hasTemplateCategory = !!req.templateCategory &&
        req.templateCategory.toLowerCase() !== 'unknown';

    const actions: ContextMenuAction[] = [
        // ── Build / Deploy ────────────────────────────────────
        {
            id: 'build',
            label: 'Build Contract',
            icon: 'tools',
            shortcut: isBuilt ? undefined : undefined,
            enabled: true,
        },
        {
            id: 'deploy',
            label: 'Deploy Contract',
            icon: 'cloud-upload',
            enabled: isBuilt,
        },
        {
            id: 'simulate',
            label: 'Simulate Transaction',
            icon: 'play',
            enabled: hasContractId,
        },
        {
            id: 'inspect',
            label: 'Inspect Contract',
            icon: 'search',
            enabled: hasContractId,
            separatorBefore: false,
        },
        {
            id: 'templateActions',
            label: 'Template Actions…',
            icon: 'symbol-method',
            enabled: hasTemplateCategory,
        },

        // ── Clipboard / Navigation ────────────────────────────
        {
            id: 'copyContractId',
            label: 'Copy Contract ID',
            icon: 'copy',
            shortcut: 'Ctrl+Shift+C',
            enabled: hasContractId,
            separatorBefore: true,
        },
        {
            id: 'openContractFolder',
            label: 'Open Contract Folder',
            icon: 'folder-opened',
            enabled: true,
        },
        {
            id: 'viewDeploymentHistory',
            label: 'View Deployment History',
            icon: 'history',
            enabled: hasContractId,
        },

        // ── Management ────────────────────────────────────────
        {
            id: 'rename',
            label: 'Rename Contract',
            icon: 'pencil',
            shortcut: 'F2',
            enabled: true,
            separatorBefore: true,
        },
        {
            id: 'duplicate',
            label: 'Duplicate Contract',
            icon: 'files',
            enabled: true,
        },
        {
            id: 'pinContract',
            label: 'Pin to Top',
            icon: 'pin',
            enabled: true,
        },
        {
            id: 'setNetwork',
            label: 'Set Network…',
            icon: 'globe',
            enabled: true,
        },
        {
            id: 'assignTemplate',
            label: 'Assign Template…',
            icon: 'symbol-class',
            enabled: true,
        },

        // ── Danger zone ───────────────────────────────────────
        {
            id: 'delete',
            label: 'Remove from Workspace',
            icon: 'trash',
            enabled: true,
            destructive: true,
            separatorBefore: true,
        },
    ];

    // Inject custom actions
    for (const registration of _customActions) {
        const customItem = { ...registration.action };
        if (registration.insertBefore) {
            const idx = actions.findIndex(a => a.id === registration.insertBefore);
            if (idx !== -1) {
                actions.splice(idx, 0, customItem);
                continue;
            }
        }
        actions.push(customItem);
    }

    return actions;
}

// ── Action handlers ───────────────────────────────────────────

export class ContractContextMenuService {
    private readonly outputChannel: vscode.OutputChannel;
    private readonly templateService: ContractTemplateService;

    constructor(
        private readonly context: vscode.ExtensionContext,
        outputChannel: vscode.OutputChannel
    ) {
        this.outputChannel = outputChannel;
        this.templateService = new ContractTemplateService(this.outputChannel);
    }

    /**
     * Dispatch an action received from the webview to the correct handler.
     */
    async handleAction(req: ContextMenuActionRequest): Promise<ActionFeedback> {
        this.outputChannel.appendLine(`[ContextMenu] Action "${req.actionId}" on contract "${req.contractName}"`);

        const contract: ContractInfo = {
            name: req.contractName,
            path: req.contractPath,
            contractId: req.contractId,
            isBuilt: !!req.contractId,
            templateId: req.templateId,
            templateCategory: req.templateCategory,
        };

        try {
            // Check custom actions first
            const custom = _customActions.find(r => r.action.id === req.actionId);
            if (custom) {
                return await custom.handler(contract, this.context);
            }

            switch (req.actionId as ContextMenuActionId) {
                case 'build':             return await this.handleBuild(contract);
                case 'deploy':            return await this.handleDeploy(contract);
                case 'simulate':          return await this.handleSimulate(contract);
                case 'inspect':           return await this.handleInspect(contract);
                case 'copyContractId':    return await this.handleCopyContractId(contract);
                case 'openContractFolder':return await this.handleOpenContractFolder(contract);
                case 'viewDeploymentHistory': return await this.handleViewDeploymentHistory(contract);
                case 'rename':            return await this.handleRename(contract);
                case 'duplicate':         return await this.handleDuplicate(contract);
                case 'delete':            return await this.handleDelete(contract);
                case 'pinContract':       return await this.handlePin(contract);
                case 'setNetwork':        return await this.handleSetNetwork(contract);
                case 'assignTemplate':    return await this.handleAssignTemplate(contract);
                case 'templateActions':   return await this.handleTemplateActions(contract);
                default:
                    this.outputChannel.appendLine(`[ContextMenu] Unknown action: ${req.actionId}`);
                    return { type: 'error', message: `Unknown action: ${req.actionId}` };
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`[ContextMenu] ERROR in action "${req.actionId}": ${msg}`);
            return { type: 'error', message: `Action failed: ${msg}` };
        }
    }

    // ── Individual handlers ───────────────────────────────────

    private async handleBuild(contract: ContractInfo): Promise<ActionFeedback> {
        await vscode.commands.executeCommand('stellarSuite.buildContract');
        return { type: 'info', message: `Building ${contract.name}…`, refresh: true };
    }

    private async handleDeploy(contract: ContractInfo): Promise<ActionFeedback> {
        await vscode.commands.executeCommand('stellarSuite.deployContract');
        return { type: 'info', message: `Deploying ${contract.name}…`, refresh: true };
    }

    private async handleSimulate(contract: ContractInfo): Promise<ActionFeedback> {
        await vscode.commands.executeCommand('stellarSuite.simulateTransaction');
        return { type: 'info', message: `Opening simulation for ${contract.name}…` };
    }

    private async handleInspect(contract: ContractInfo): Promise<ActionFeedback> {
        if (!contract.contractId) {
            return { type: 'error', message: 'Contract must be deployed before it can be inspected.' };
        }
        await vscode.commands.executeCommand('stellarSuite.simulateTransaction');
        return { type: 'info', message: `Inspecting ${contract.name}…` };
    }

    private async handleCopyContractId(contract: ContractInfo): Promise<ActionFeedback> {
        if (!contract.contractId) {
            return { type: 'error', message: 'No contract ID available. Deploy the contract first.' };
        }
        await vscode.env.clipboard.writeText(contract.contractId);
        this.outputChannel.appendLine(`[ContextMenu] Copied contract ID: ${contract.contractId}`);
        return { type: 'success', message: `Contract ID copied to clipboard.` };
    }

    private async handleOpenContractFolder(contract: ContractInfo): Promise<ActionFeedback> {
        const folderUri = vscode.Uri.file(path.dirname(contract.path));
        await vscode.commands.executeCommand('revealFileInOS', folderUri);
        return { type: 'success', message: `Opened folder for ${contract.name}.` };
    }

    private async handleViewDeploymentHistory(contract: ContractInfo): Promise<ActionFeedback> {
        // Reads deployment history from workspace state (same key used by deployContract command)
        const history = this.context.workspaceState.get<Record<string, unknown>[]>(
            'stellarSuite.deploymentHistory', []
        );
        const contractHistory = history.filter(
            (d: Record<string, unknown>) => d['contractName'] === contract.name
        );

        if (contractHistory.length === 0) {
            return { type: 'info', message: `No deployment history found for ${contract.name}.` };
        }

        const panel = vscode.window.createWebviewPanel(
            'stellarSuite.deploymentHistory',
            `Deployment History – ${contract.name}`,
            vscode.ViewColumn.One,
            { enableScripts: false }
        );

        panel.webview.html = buildDeploymentHistoryHtml(contract.name, contractHistory);
        return { type: 'success', message: `Opened deployment history for ${contract.name}.` };
    }

    private async handleRename(contract: ContractInfo): Promise<ActionFeedback> {
        const newName = await vscode.window.showInputBox({
            title: 'Rename Contract',
            prompt: 'Enter a new display name for this contract',
            value: contract.name,
            validateInput: (v) => {
                if (!v.trim()) { return 'Name cannot be empty.'; }
                if (v.length > 64) { return 'Name must be 64 characters or fewer.'; }
                return undefined;
            },
        });

        if (!newName || newName.trim() === contract.name) {
            return { type: 'info', message: 'Rename cancelled.' };
        }

        // Persist the alias in workspace state
        const aliases = this.context.workspaceState.get<Record<string, string>>(
            'stellarSuite.contractAliases', {}
        );
        aliases[contract.path] = newName.trim();
        await this.context.workspaceState.update('stellarSuite.contractAliases', aliases);

        this.outputChannel.appendLine(`[ContextMenu] Renamed "${contract.name}" → "${newName.trim()}"`);
        return { type: 'success', message: `Renamed to "${newName.trim()}".`, refresh: true };
    }

    private async handleDuplicate(contract: ContractInfo): Promise<ActionFeedback> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return { type: 'error', message: 'No workspace folder open.' };
        }

        const srcDir = path.dirname(contract.path);
        const parentDir = path.dirname(srcDir);
        const baseName = path.basename(srcDir);

        const newName = await vscode.window.showInputBox({
            title: 'Duplicate Contract',
            prompt: 'Enter a name for the duplicated contract folder',
            value: `${baseName}-copy`,
            validateInput: (v) => {
                if (!v.trim()) { return 'Name cannot be empty.'; }
                const dest = path.join(parentDir, v.trim());
                if (fs.existsSync(dest)) { return `Directory "${v.trim()}" already exists.`; }
                return undefined;
            },
        });

        if (!newName) {
            return { type: 'info', message: 'Duplicate cancelled.' };
        }

        const destDir = path.join(parentDir, newName.trim());

        try {
            copyDirectorySync(srcDir, destDir);
            this.outputChannel.appendLine(`[ContextMenu] Duplicated "${srcDir}" → "${destDir}"`);
            return { type: 'success', message: `Duplicated contract to "${newName.trim()}".`, refresh: true };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.outputChannel.appendLine(`[ContextMenu] Duplicate error: ${msg}`);
            return { type: 'error', message: `Could not duplicate: ${msg}` };
        }
    }

    private async handleDelete(contract: ContractInfo): Promise<ActionFeedback> {
        const answer = await vscode.window.showWarningMessage(
            `Remove "${contract.name}" from the workspace view?`,
            { modal: true, detail: 'This removes it from the Stellar Suite sidebar. The files will not be deleted.' },
            'Remove',
            'Cancel'
        );

        if (answer !== 'Remove') {
            return { type: 'info', message: 'Remove cancelled.' };
        }

        // Store hidden contracts list in workspace state
        const hidden = this.context.workspaceState.get<string[]>(
            'stellarSuite.hiddenContracts', []
        );
        if (!hidden.includes(contract.path)) {
            hidden.push(contract.path);
        }
        await this.context.workspaceState.update('stellarSuite.hiddenContracts', hidden);

        this.outputChannel.appendLine(`[ContextMenu] Hidden contract "${contract.name}" (${contract.path})`);
        return { type: 'success', message: `"${contract.name}" removed from sidebar.`, refresh: true };
    }

    private async handlePin(contract: ContractInfo): Promise<ActionFeedback> {
        const pinned = this.context.workspaceState.get<string[]>(
            'stellarSuite.pinnedContracts', []
        );
        const idx = pinned.indexOf(contract.path);
        if (idx !== -1) {
            pinned.splice(idx, 1);
            await this.context.workspaceState.update('stellarSuite.pinnedContracts', pinned);
            return { type: 'success', message: `"${contract.name}" unpinned.`, refresh: true };
        } else {
            pinned.unshift(contract.path);
            await this.context.workspaceState.update('stellarSuite.pinnedContracts', pinned);
            return { type: 'success', message: `"${contract.name}" pinned to top.`, refresh: true };
        }
    }

    private async handleSetNetwork(contract: ContractInfo): Promise<ActionFeedback> {
        const networks = ['testnet', 'mainnet', 'futurenet', 'localnet'];
        const selected = await vscode.window.showQuickPick(networks, {
            title: `Set Network for ${contract.name}`,
            placeHolder: 'Select a network…',
        });

        if (!selected) {
            return { type: 'info', message: 'Network selection cancelled.' };
        }

        const overrides = this.context.workspaceState.get<Record<string, string>>(
            'stellarSuite.contractNetworkOverrides', {}
        );
        overrides[contract.path] = selected;
        await this.context.workspaceState.update('stellarSuite.contractNetworkOverrides', overrides);

        this.outputChannel.appendLine(`[ContextMenu] Set network for "${contract.name}" to "${selected}"`);
        return { type: 'success', message: `Network set to "${selected}" for ${contract.name}.`, refresh: true };
    }

    private async handleAssignTemplate(contract: ContractInfo): Promise<ActionFeedback> {
        const customTemplates = this.loadCustomTemplatesForWorkspace();
        const options = this.templateService.getTemplateAssignmentOptions(customTemplates);

        const picks: Array<vscode.QuickPickItem & { value: string }> = [
            ...options.map((option) => ({
                label: option.label,
                detail: option.description,
                description: `${option.source} · ${option.category}`,
                value: option.id,
            })),
            {
                label: 'Clear Manual Assignment',
                description: 'system',
                detail: 'Remove manual override and use automatic template detection.',
                value: '__clear__',
            },
        ];

        const selected = await vscode.window.showQuickPick(picks, {
            title: `Assign Template for ${contract.name}`,
            placeHolder: 'Choose a template category or clear manual assignment.',
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (!selected) {
            return { type: 'info', message: 'Template assignment cancelled.' };
        }

        const assignments = this.context.workspaceState.get<Record<string, string>>(
            'stellarSuite.manualTemplateAssignments',
            {}
        );

        if (selected.value === '__clear__') {
            delete assignments[contract.path];
            await this.context.workspaceState.update('stellarSuite.manualTemplateAssignments', assignments);
            return { type: 'success', message: `Manual template assignment cleared for ${contract.name}.`, refresh: true };
        }

        assignments[contract.path] = selected.value;
        await this.context.workspaceState.update('stellarSuite.manualTemplateAssignments', assignments);
        return { type: 'success', message: `Template set to "${selected.label}" for ${contract.name}.`, refresh: true };
    }

    private async handleTemplateActions(contract: ContractInfo): Promise<ActionFeedback> {
        const customTemplates = this.loadCustomTemplatesForWorkspace();
        const actions = this.templateService.getTemplateActions(
            contract.templateId,
            contract.templateCategory,
            customTemplates
        );

        if (!actions.length) {
            return {
                type: 'info',
                message: `No template actions available for ${contract.name}. Assign a template first.`,
            };
        }

        const picks = actions.map((action) => ({
            label: action.label,
            detail: action.description || `Action: ${action.id}`,
            actionId: action.id,
        }));

        const selected = await vscode.window.showQuickPick(picks, {
            title: `Template Actions — ${contract.name}`,
            placeHolder: 'Choose a template-specific workflow to launch.',
            matchOnDetail: true,
        });

        if (!selected) {
            return { type: 'info', message: 'Template action cancelled.' };
        }

        // Reuse the existing simulation flow as the execution surface.
        await vscode.commands.executeCommand('stellarSuite.simulateTransaction');
        return {
            type: 'info',
            message: `${selected.label} selected for ${contract.name}. Opened simulation flow.`,
        };
    }

    private loadCustomTemplatesForWorkspace(): TemplateDefinition[] {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const customTemplates: TemplateDefinition[] = [];
        const seenTemplateIds = new Set<string>();

        for (const folder of workspaceFolders) {
            const loaded = this.templateService.loadTemplateConfiguration(folder.uri.fsPath);
            for (const template of loaded.templates) {
                if (seenTemplateIds.has(template.id)) {
                    continue;
                }
                seenTemplateIds.add(template.id);
                customTemplates.push(template);
            }
        }

        return customTemplates;
    }
}

// ── Helpers ───────────────────────────────────────────────────

function copyDirectorySync(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        // Skip build artifacts
        if (['target', 'node_modules', '.git'].includes(entry.name)) { continue; }
        if (entry.isDirectory()) {
            copyDirectorySync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function buildDeploymentHistoryHtml(contractName: string, history: Record<string, unknown>[]): string {
    const rows = history.map(d => `
        <tr>
            <td class="id">${d['contractId'] ?? '–'}</td>
            <td>${d['network'] ?? '–'}</td>
            <td>${d['source'] ?? '–'}</td>
            <td>${d['deployedAt'] ?? '–'}</td>
        </tr>`).join('');

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deployment History</title>
<style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
           background: var(--vscode-editor-background); padding: 20px; }
    h2   { color: var(--vscode-textLink-foreground); margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th   { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--vscode-panel-border);
           color: var(--vscode-descriptionForeground); font-weight: 600; }
    td   { padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
    td.id { font-family: monospace; font-size: 11px; word-break: break-all; }
    tr:hover td { background: var(--vscode-list-hoverBackground); }
</style>
</head>
<body>
<h2>Deployment History — ${contractName}</h2>
<table>
<thead><tr><th>Contract ID</th><th>Network</th><th>Source</th><th>Deployed At</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`;
}
