// ============================================================
// src/commands/envVariableCommands.ts
// VS Code command handler for managing CLI environment
// variable profiles. Uses QuickPick menus following the
// pattern from manageCliConfiguration.ts.
// ============================================================

import * as vscode from 'vscode';
import {
    EnvVariableService,
    validateEnvVariable,
    validateEnvVariableProfile,
} from '../services/envVariableService';
import { EnvVariable, EnvVariableProfile, ENV_VAR_NAME_PATTERN } from '../types/envVariable';

const { Buffer } = require('buffer');

// ── Helpers ──────────────────────────────────────────────────

function formatVariableList(
    outputChannel: vscode.OutputChannel,
    profile: EnvVariableProfile | undefined,
    variables: Record<string, string>,
): void {
    outputChannel.appendLine('');
    outputChannel.appendLine('═══════════════════════════════════════════════');
    outputChannel.appendLine('  CLI Environment Variables');
    outputChannel.appendLine('═══════════════════════════════════════════════');

    if (profile) {
        outputChannel.appendLine(`  Profile : ${profile.name}`);
        if (profile.description) {
            outputChannel.appendLine(`  Desc    : ${profile.description}`);
        }
    } else {
        outputChannel.appendLine('  Profile : (none active)');
    }

    outputChannel.appendLine('───────────────────────────────────────────────');

    const entries = Object.entries(variables);
    if (entries.length === 0) {
        outputChannel.appendLine('  No environment variables configured.');
    } else {
        for (const [key, value] of entries) {
            const isSensitive = profile?.variables.find(v => v.name === key)?.sensitive;
            const displayValue = isSensitive ? '********' : value;
            outputChannel.appendLine(`  ${key} = ${displayValue}`);
        }
    }

    outputChannel.appendLine('═══════════════════════════════════════════════');
    outputChannel.appendLine('');
    outputChannel.show(true);
}

async function promptVariables(
    existing: EnvVariable[] = [],
): Promise<EnvVariable[] | undefined> {
    const variables: EnvVariable[] = [...existing];

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const items: vscode.QuickPickItem[] = [
            { label: '$(add) Add Variable', description: 'Add a new environment variable' },
        ];

        for (const v of variables) {
            const displayValue = v.sensitive ? '********' : v.value;
            items.push({
                label: v.name,
                description: `= ${displayValue}`,
                detail: v.sensitive ? '$(lock) Sensitive' : undefined,
            });
        }

        items.push(
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: '$(check) Done', description: 'Finish editing variables' },
            { label: '$(close) Cancel', description: 'Discard changes' },
        );

        const pick = await vscode.window.showQuickPick(items, {
            title: 'Environment Variables',
            placeHolder: 'Add, edit, or remove variables',
        });

        if (!pick || pick.label === '$(close) Cancel') {
            return undefined;
        }

        if (pick.label === '$(check) Done') {
            return variables;
        }

        if (pick.label === '$(add) Add Variable') {
            const name = await vscode.window.showInputBox({
                title: 'Variable Name',
                prompt: 'Enter the environment variable name (e.g., MY_API_KEY)',
                validateInput: (value: string) => {
                    if (!value.trim()) { return 'Name is required.'; }
                    if (!ENV_VAR_NAME_PATTERN.test(value.trim())) {
                        return 'Invalid name. Use letters, digits, or underscores (must start with letter or underscore).';
                    }
                    if (variables.some(v => v.name === value.trim())) {
                        return 'A variable with this name already exists.';
                    }
                    return undefined;
                },
            });
            if (!name) { continue; }

            const value = await vscode.window.showInputBox({
                title: `Value for ${name.trim()}`,
                prompt: 'Enter the variable value',
            });
            if (value === undefined) { continue; }

            const sensitive = await vscode.window.showQuickPick(
                [
                    { label: 'No', description: 'Value is not sensitive' },
                    { label: 'Yes', description: 'Mask value in UI and exports' },
                ],
                { title: 'Is this a sensitive value?' },
            );
            if (!sensitive) { continue; }

            variables.push({
                name: name.trim(),
                value,
                sensitive: sensitive.label === 'Yes',
            });
        } else {
            // Editing an existing variable
            const varName = pick.label;
            const varIndex = variables.findIndex(v => v.name === varName);
            if (varIndex === -1) { continue; }

            const action = await vscode.window.showQuickPick(
                [
                    { label: '$(edit) Edit Value', description: 'Change the variable value' },
                    { label: '$(trash) Remove', description: 'Remove this variable' },
                ],
                { title: `Variable: ${varName}` },
            );

            if (!action) { continue; }

            if (action.label === '$(trash) Remove') {
                variables.splice(varIndex, 1);
            } else {
                const newValue = await vscode.window.showInputBox({
                    title: `New value for ${varName}`,
                    prompt: 'Enter the new value',
                    value: variables[varIndex].sensitive ? '' : variables[varIndex].value,
                });
                if (newValue === undefined) { continue; }
                variables[varIndex] = { ...variables[varIndex], value: newValue };
            }
        }
    }
}

// ── Main command ─────────────────────────────────────────────

export function registerEnvVariableCommands(
    context: vscode.ExtensionContext,
    envService: EnvVariableService,
): void {
    const outputChannel = vscode.window.createOutputChannel('Stellar Suite — Env Variables');

    const manageCommand = vscode.commands.registerCommand(
        'stellarSuite.manageEnvVariables',
        async () => {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const activeProfile = await envService.getActiveProfile();
                const profiles = await envService.getProfiles();

                const actions: vscode.QuickPickItem[] = [
                    {
                        label: '$(eye) View Active Variables',
                        description: activeProfile ? activeProfile.name : '(none)',
                    },
                    { label: '$(add) Create Profile', description: 'Create a new env variable profile' },
                ];

                if (profiles.length > 0) {
                    actions.push(
                        { label: '$(arrow-swap) Switch Profile', description: 'Activate a different profile' },
                        { label: '$(edit) Edit Profile', description: 'Modify an existing profile' },
                        { label: '$(trash) Delete Profile', description: 'Remove a profile' },
                    );
                }

                actions.push(
                    { label: '', kind: vscode.QuickPickItemKind.Separator },
                    { label: '$(cloud-download) Import Profiles', description: 'Import from JSON file' },
                    { label: '$(cloud-upload) Export Profiles', description: 'Export to JSON file' },
                );

                const action = await vscode.window.showQuickPick(actions, {
                    title: 'Manage CLI Environment Variables',
                    placeHolder: 'Choose an action',
                });

                if (!action) { return; }

                // ── View ─────────────────────────────────────
                if (action.label.includes('View Active')) {
                    const vars = await envService.getResolvedVariables();
                    formatVariableList(outputChannel, activeProfile, vars);
                    return;
                }

                // ── Create ───────────────────────────────────
                if (action.label.includes('Create Profile')) {
                    const name = await vscode.window.showInputBox({
                        title: 'Profile Name',
                        prompt: 'Enter a name for the new environment variable profile',
                        validateInput: (v: string) => v.trim() ? undefined : 'Name is required.',
                    });
                    if (!name) { continue; }

                    const description = await vscode.window.showInputBox({
                        title: 'Profile Description (optional)',
                        prompt: 'Describe this profile',
                    });

                    const variables = await promptVariables();
                    if (!variables) { continue; }

                    try {
                        const profile = await envService.createProfile(name, variables, description);
                        const activate = await vscode.window.showInformationMessage(
                            `Profile "${profile.name}" created with ${profile.variables.length} variable(s).`,
                            'Activate', 'Later',
                        );
                        if (activate === 'Activate') {
                            await envService.setActiveProfile(profile.id);
                            vscode.window.showInformationMessage(`Profile "${profile.name}" is now active.`);
                        }
                    } catch (err) {
                        vscode.window.showErrorMessage(
                            `Failed to create profile: ${err instanceof Error ? err.message : String(err)}`,
                        );
                    }
                    continue;
                }

                // ── Switch ───────────────────────────────────
                if (action.label.includes('Switch Profile')) {
                    const items: vscode.QuickPickItem[] = [
                        { label: '$(close) None', description: 'Deactivate all profiles' },
                    ];
                    for (const p of profiles) {
                        const active = p.id === activeProfile?.id;
                        items.push({
                            label: `${active ? '$(check) ' : ''}${p.name}`,
                            description: `${p.variables.length} variable(s)${active ? ' (active)' : ''}`,
                            detail: p.description,
                        });
                    }

                    const pick = await vscode.window.showQuickPick(items, {
                        title: 'Switch Environment Variable Profile',
                    });
                    if (!pick) { continue; }

                    if (pick.label.includes('None')) {
                        await envService.setActiveProfile(undefined);
                        vscode.window.showInformationMessage('Environment variable profile deactivated.');
                    } else {
                        const cleanLabel = pick.label.replace('$(check) ', '');
                        const selected = profiles.find(p => p.name === cleanLabel);
                        if (selected) {
                            await envService.setActiveProfile(selected.id);
                            vscode.window.showInformationMessage(`Profile "${selected.name}" is now active.`);
                        }
                    }
                    continue;
                }

                // ── Edit ─────────────────────────────────────
                if (action.label.includes('Edit Profile')) {
                    const items = profiles.map(p => ({
                        label: p.name,
                        description: `${p.variables.length} variable(s)`,
                        detail: p.description,
                        profileId: p.id,
                    }));

                    const pick = await vscode.window.showQuickPick(items, {
                        title: 'Select Profile to Edit',
                    });
                    if (!pick) { continue; }

                    const existingProfile = profiles.find(p => p.id === (pick as any).profileId);
                    if (!existingProfile) { continue; }

                    const variables = await promptVariables(existingProfile.variables);
                    if (!variables) { continue; }

                    try {
                        await envService.updateProfile(existingProfile.id, { variables });
                        vscode.window.showInformationMessage(
                            `Profile "${existingProfile.name}" updated with ${variables.length} variable(s).`,
                        );
                    } catch (err) {
                        vscode.window.showErrorMessage(
                            `Failed to update profile: ${err instanceof Error ? err.message : String(err)}`,
                        );
                    }
                    continue;
                }

                // ── Delete ───────────────────────────────────
                if (action.label.includes('Delete Profile')) {
                    const items = profiles.map(p => ({
                        label: p.name,
                        description: `${p.variables.length} variable(s)`,
                        profileId: p.id,
                    }));

                    const pick = await vscode.window.showQuickPick(items, {
                        title: 'Select Profile to Delete',
                    });
                    if (!pick) { continue; }

                    const confirm = await vscode.window.showWarningMessage(
                        `Delete profile "${pick.label}"? This cannot be undone.`,
                        { modal: true },
                        'Delete',
                    );
                    if (confirm !== 'Delete') { continue; }

                    try {
                        await envService.deleteProfile((pick as any).profileId);
                        vscode.window.showInformationMessage(`Profile "${pick.label}" deleted.`);
                    } catch (err) {
                        vscode.window.showErrorMessage(
                            `Failed to delete profile: ${err instanceof Error ? err.message : String(err)}`,
                        );
                    }
                    continue;
                }

                // ── Import ───────────────────────────────────
                if (action.label.includes('Import')) {
                    const fileUri = await vscode.window.showOpenDialog({
                        canSelectFiles: true,
                        canSelectMany: false,
                        filters: { 'JSON Files': ['json'] },
                        title: 'Import Environment Variable Profiles',
                    });
                    if (!fileUri || fileUri.length === 0) { continue; }

                    try {
                        const content = Buffer.from(
                            await vscode.workspace.fs.readFile(fileUri[0]),
                        ).toString('utf-8');

                        const result = await envService.importProfiles(content, {
                            replaceExisting: false,
                            activateImportedProfile: true,
                        });

                        vscode.window.showInformationMessage(
                            `Imported ${result.imported} profile(s), ` +
                            `replaced ${result.replaced}, skipped ${result.skipped}.`,
                        );
                    } catch (err) {
                        vscode.window.showErrorMessage(
                            `Import failed: ${err instanceof Error ? err.message : String(err)}`,
                        );
                    }
                    continue;
                }

                // ── Export ───────────────────────────────────
                if (action.label.includes('Export')) {
                    const saveUri = await vscode.window.showSaveDialog({
                        defaultUri: vscode.Uri.file('stellar-env-profiles.json'),
                        filters: { 'JSON Files': ['json'] },
                        title: 'Export Environment Variable Profiles',
                    });
                    if (!saveUri) { continue; }

                    try {
                        const content = await envService.exportProfiles();
                        await vscode.workspace.fs.writeFile(
                            saveUri,
                            Buffer.from(content, 'utf-8'),
                        );
                        vscode.window.showInformationMessage('Environment variable profiles exported.');
                    } catch (err) {
                        vscode.window.showErrorMessage(
                            `Export failed: ${err instanceof Error ? err.message : String(err)}`,
                        );
                    }
                    continue;
                }
            }
        },
    );

    context.subscriptions.push(manageCommand);
}
