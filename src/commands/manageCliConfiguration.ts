import * as vscode from 'vscode';
import {
    CliConfiguration,
    CliConfigurationProfile,
    normalizeCliConfiguration,
    validateCliConfiguration,
} from '../services/cliConfigurationService';
import {
    createCliConfigurationService,
    writeWorkspaceCliConfiguration,
} from '../services/cliConfigurationVscode';

const { Buffer } = require('buffer');

const NETWORK_OPTIONS = ['testnet', 'mainnet', 'futurenet', 'localnet'];

function formatValidationProblems(configuration: CliConfiguration): string | undefined {
    const validation = validateCliConfiguration(configuration);
    if (validation.valid) {
        return undefined;
    }
    return validation.errors.join('\n');
}

async function pickNetwork(currentValue: string): Promise<string | undefined> {
    const quickPickItems = [
        ...NETWORK_OPTIONS.map(network => ({
            label: network,
            value: network,
        })),
        {
            label: 'Custom...',
            value: '__custom__',
        },
    ];

    const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select network',
    });
    if (!selected) {
        return undefined;
    }

    if (selected.value !== '__custom__') {
        return selected.value;
    }

    return vscode.window.showInputBox({
        prompt: 'Enter custom network',
        value: currentValue,
        validateInput: (value: string) => value.trim().length > 0 ? null : 'Network cannot be empty.',
    });
}

async function promptRpcEndpoints(
    initial: any[],
    titlePrefix: string
): Promise<any[] | undefined> {
    const endpoints = [...initial];

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const items = [
            ...endpoints.map((ep, i) => ({
                label: `${ep.name || 'Endpoint'} (${ep.url})`,
                description: `Priority: ${ep.priority}, ${ep.enabled ? 'Enabled' : 'Disabled'}`,
                value: i
            })),
            { label: '$(add) Add Fallback Endpoint...', value: 'add' },
            { label: '$(check) Done', value: 'done' }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: `${titlePrefix}: Fallback RPC Endpoints`,
            placeHolder: 'Manage fallback endpoints for failover'
        });

        if (!selected || selected.value === 'done') {
            break;
        }

        if (selected.value === 'add') {
            const url = await vscode.window.showInputBox({
                prompt: 'Enter RPC URL',
                validateInput: v => v.match(/^https?:\/\/\S+$/) ? null : 'Invalid URL'
            });
            if (url) {
                const name = await vscode.window.showInputBox({ prompt: 'Enter name (optional)' });
                const priority = await vscode.window.showInputBox({
                    prompt: 'Enter priority (lower is higher priority)',
                    value: '10',
                    validateInput: v => isNaN(parseInt(v)) ? 'Must be a number' : null
                });

                endpoints.push({
                    url,
                    name: name || undefined,
                    priority: parseInt(priority || '10'),
                    enabled: true
                });
            }
        } else if (typeof selected.value === 'number') {
            const idx = selected.value;
            const ep = endpoints[idx];
            const action = await vscode.window.showQuickPick([
                { label: ep.enabled ? 'Disable' : 'Enable', value: 'toggle' },
                { label: 'Edit URL', value: 'edit-url' },
                { label: 'Edit Priority', value: 'edit-priority' },
                { label: 'Remove', value: 'remove' }
            ]);

            if (action?.value === 'toggle') {
                ep.enabled = !ep.enabled;
            } else if (action?.value === 'edit-url') {
                const newUrl = await vscode.window.showInputBox({ value: ep.url });
                if (newUrl) ep.url = newUrl;
            } else if (action?.value === 'edit-priority') {
                const newPrio = await vscode.window.showInputBox({ value: String(ep.priority) });
                if (newPrio) ep.priority = parseInt(newPrio);
            } else if (action?.value === 'remove') {
                endpoints.splice(idx, 1);
            }
        }
    }

    return endpoints;
}

async function promptConfiguration(
    initial: CliConfiguration,
    titlePrefix: string,
): Promise<CliConfiguration | undefined> {
    const cliPath = await vscode.window.showInputBox({
        title: `${titlePrefix}: CLI Path`,
        prompt: 'Path to Stellar CLI executable',
        value: initial.cliPath,
        validateInput: (value: string) => value.trim().length > 0 ? null : 'CLI path is required.',
    });
    if (cliPath === undefined) {
        return undefined;
    }

    const source = await vscode.window.showInputBox({
        title: `${titlePrefix}: Source`,
        prompt: 'Source account name',
        value: initial.source,
        validateInput: (value: string) => value.trim().length > 0 ? null : 'Source account is required.',
    });
    if (source === undefined) {
        return undefined;
    }

    const network = await pickNetwork(initial.network);
    if (network === undefined) {
        return undefined;
    }

    const useLocalCli = await vscode.window.showQuickPick(
        [
            { label: 'Use local CLI', value: true },
            { label: 'Use RPC endpoint', value: false },
        ],
        {
            title: `${titlePrefix}: Execution Mode`,
            placeHolder: 'Choose how commands should execute',
        }
    );
    if (!useLocalCli) {
        return undefined;
    }

    const rpcUrl = await vscode.window.showInputBox({
        title: `${titlePrefix}: Primary RPC URL`,
        prompt: 'Primary RPC endpoint URL',
        value: initial.rpcUrl,
        validateInput: (value: string) => value.trim().length > 0 ? null : 'RPC URL is required.',
    });
    if (rpcUrl === undefined) {
        return undefined;
    }

    const rpcEndpoints = await promptRpcEndpoints(initial.rpcEndpoints || [], titlePrefix);
    if (rpcEndpoints === undefined) {
        return undefined;
    }

    const automaticFailover = await vscode.window.showQuickPick(
        [
            { label: 'Enabled', value: true },
            { label: 'Disabled', value: false },
        ],
        {
            title: `${titlePrefix}: Automatic Failover`,
            placeHolder: 'Enable automatic failover to fallback endpoints?',
        }
    );
    if (automaticFailover === undefined) {
        return undefined;
    }

    const config = normalizeCliConfiguration({
        cliPath,
        source,
        network,
        useLocalCli: useLocalCli.value,
        rpcUrl,
        rpcEndpoints,
        automaticFailover: automaticFailover.value
    });

    const validationMessage = formatValidationProblems(config);
    if (validationMessage) {
        vscode.window.showErrorMessage(`Invalid configuration:\n${validationMessage}`);
        return undefined;
    }

    return config;
}

function printConfiguration(
    outputChannel: vscode.OutputChannel,
    profile: CliConfigurationProfile | undefined,
    configuration: CliConfiguration,
): void {
    outputChannel.clear();
    outputChannel.appendLine('=== Stellar Suite CLI Configuration ===');
    outputChannel.appendLine(`Active profile: ${profile ? `${profile.name} (${profile.id})` : 'Workspace settings (no profile)'}`);
    outputChannel.appendLine('');
    outputChannel.appendLine(JSON.stringify(configuration, null, 2));

    const validation = validateCliConfiguration(configuration);
    if (validation.errors.length > 0) {
        outputChannel.appendLine('');
        outputChannel.appendLine('Validation Errors:');
        for (const error of validation.errors) {
            outputChannel.appendLine(`- ${error}`);
        }
    }
    if (validation.warnings.length > 0) {
        outputChannel.appendLine('');
        outputChannel.appendLine('Warnings:');
        for (const warning of validation.warnings) {
            outputChannel.appendLine(`- ${warning}`);
        }
    }
}

export async function manageCliConfiguration(context: vscode.ExtensionContext): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel('Stellar Suite - CLI Configuration');
    const service = createCliConfigurationService(context);

    try {
        const action = await vscode.window.showQuickPick(
            [
                { label: 'View Active Configuration', value: 'view' },
                { label: 'Switch Active Profile', value: 'switch' },
                { label: 'Create Profile', value: 'create' },
                { label: 'Edit Active Profile', value: 'edit' },
                { label: 'Delete Profile', value: 'delete' },
                { label: 'Apply Active Config to Workspace Settings', value: 'apply' },
                { label: 'Export Profiles', value: 'export' },
                { label: 'Import Profiles', value: 'import' },
            ],
            {
                title: 'Stellar Suite CLI Configuration',
                placeHolder: 'Select an action',
            }
        );

        if (!action) {
            return;
        }

        if (action.value === 'view') {
            const resolved = await service.getResolvedConfiguration();
            printConfiguration(outputChannel, resolved.profile, resolved.configuration);
            outputChannel.show(true);
            return;
        }

        if (action.value === 'switch') {
            const profiles = await service.getProfiles();
            const selected = await vscode.window.showQuickPick(
                [
                    {
                        label: 'Workspace settings (no profile)',
                        description: 'Disable profile override',
                        value: '__none__',
                    },
                    ...profiles.map(profile => ({
                        label: profile.name,
                        description: profile.description || profile.id,
                        value: profile.id,
                    })),
                ],
                {
                    placeHolder: 'Select active profile',
                }
            );

            if (!selected) {
                return;
            }

            await service.setActiveProfile(selected.value === '__none__' ? undefined : selected.value);
            vscode.window.showInformationMessage(
                selected.value === '__none__'
                    ? 'Active CLI profile cleared. Using workspace settings.'
                    : `Active CLI profile set to "${selected.label}".`
            );
            return;
        }

        if (action.value === 'create') {
            const resolved = await service.getResolvedConfiguration();
            const name = await vscode.window.showInputBox({
                prompt: 'Profile name',
                validateInput: (value: string) => value.trim().length > 0 ? null : 'Profile name is required.',
            });
            if (!name) {
                return;
            }

            const description = await vscode.window.showInputBox({
                prompt: 'Profile description (optional)',
            });
            if (description === undefined) {
                return;
            }

            const maybeConfig = await promptConfiguration(resolved.configuration, 'Create Profile');
            if (!maybeConfig) {
                return;
            }

            const profile = await service.createProfile(name, maybeConfig, description);
            await service.setActiveProfile(profile.id);
            vscode.window.showInformationMessage(`Created profile "${profile.name}" and set it active.`);
            return;
        }

        if (action.value === 'edit') {
            const active = await service.getActiveProfile();
            if (!active) {
                vscode.window.showWarningMessage('No active profile selected. Use "Switch Active Profile" first.');
                return;
            }

            const resolved = await service.getResolvedConfiguration();
            const name = await vscode.window.showInputBox({
                prompt: 'Profile name',
                value: active.name,
                validateInput: (value: string) => value.trim().length > 0 ? null : 'Profile name is required.',
            });
            if (name === undefined) {
                return;
            }

            const description = await vscode.window.showInputBox({
                prompt: 'Profile description (optional)',
                value: active.description || '',
            });
            if (description === undefined) {
                return;
            }

            const maybeConfig = await promptConfiguration(resolved.configuration, 'Edit Active Profile');
            if (!maybeConfig) {
                return;
            }

            await service.updateProfile(active.id, {
                name,
                description,
                configuration: maybeConfig,
            });
            vscode.window.showInformationMessage(`Updated profile "${name}".`);
            return;
        }

        if (action.value === 'delete') {
            const profiles = await service.getProfiles();
            if (profiles.length === 0) {
                vscode.window.showInformationMessage('No CLI configuration profiles to delete.');
                return;
            }

            const selected = await vscode.window.showQuickPick(
                profiles.map(profile => ({
                    label: profile.name,
                    description: profile.description || profile.id,
                    value: profile.id,
                })),
                {
                    placeHolder: 'Select a profile to delete',
                }
            );
            if (!selected) {
                return;
            }

            const confirmation = await vscode.window.showWarningMessage(
                `Delete profile "${selected.label}"?`,
                'Delete',
                'Cancel'
            );
            if (confirmation !== 'Delete') {
                return;
            }

            await service.deleteProfile(selected.value);
            vscode.window.showInformationMessage(`Deleted profile "${selected.label}".`);
            return;
        }

        if (action.value === 'apply') {
            const resolved = await service.getResolvedConfiguration();
            if (!resolved.validation.valid) {
                vscode.window.showErrorMessage(`Cannot apply invalid configuration: ${resolved.validation.errors.join(' ')}`);
                return;
            }

            await writeWorkspaceCliConfiguration(resolved.configuration);
            vscode.window.showInformationMessage('Applied active CLI configuration to workspace settings.');
            return;
        }

        if (action.value === 'export') {
            const content = await service.exportProfiles();
            const targetUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('stellar-cli-profiles.json'),
                filters: { JSON: ['json'] },
                saveLabel: 'Export CLI Profiles',
            });
            if (!targetUri) {
                return;
            }

            await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf-8'));
            vscode.window.showInformationMessage(`CLI profiles exported to ${targetUri.fsPath}`);
            return;
        }

        if (action.value === 'import') {
            const selectedUris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                canSelectFiles: true,
                canSelectFolders: false,
                filters: { JSON: ['json'] },
                title: 'Import CLI Profiles',
            });
            if (!selectedUris || selectedUris.length === 0) {
                return;
            }

            const importMode = await vscode.window.showQuickPick(
                [
                    { label: 'Merge and keep existing IDs', value: 'merge' },
                    { label: 'Replace existing profiles with matching IDs', value: 'replace' },
                ],
                {
                    placeHolder: 'Choose import mode',
                }
            );
            if (!importMode) {
                return;
            }

            const activateImported = await vscode.window.showQuickPick(
                [
                    { label: 'Keep current active profile', value: false },
                    { label: 'Activate profile marked active in import file', value: true },
                ],
                {
                    placeHolder: 'Activation preference',
                }
            );
            if (!activateImported) {
                return;
            }

            const bytes = await vscode.workspace.fs.readFile(selectedUris[0]);
            const content = Buffer.from(bytes).toString('utf-8');
            const result = await service.importProfiles(content, {
                replaceExisting: importMode.value === 'replace',
                activateImportedProfile: activateImported.value,
            });

            vscode.window.showInformationMessage(
                `Import complete. Imported: ${result.imported}, replaced: ${result.replaced}, skipped: ${result.skipped}.`
            );
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[CLI Config] Error:', error);
        vscode.window.showErrorMessage(`CLI configuration error: ${message}`);
    }
}
