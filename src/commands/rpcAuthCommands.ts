// ============================================================
// src/commands/rpcAuthCommands.ts
// VS Code command handler for managing RPC Authentication profiles.
// ============================================================

import * as vscode from 'vscode';
import { RpcAuthService } from '../services/rpcAuthService';
import { AuthMethodType, RpcAuthProfile } from '../types/rpcAuth';

// ── Helpers ──────────────────────────────────────────────────

function formatProfileList(
    outputChannel: vscode.OutputChannel,
    activeProfile: RpcAuthProfile | undefined,
    profiles: RpcAuthProfile[]
): void {
    outputChannel.appendLine('');
    outputChannel.appendLine('═══════════════════════════════════════════════');
    outputChannel.appendLine('  RPC Authentication Profiles');
    outputChannel.appendLine('═══════════════════════════════════════════════');

    if (activeProfile) {
        outputChannel.appendLine(`  Active Profile: ${activeProfile.name} [${activeProfile.type}]`);
    } else {
        outputChannel.appendLine('  Active Profile: (none)');
    }

    outputChannel.appendLine('───────────────────────────────────────────────');

    if (profiles.length === 0) {
        outputChannel.appendLine('  No auth profiles configured.');
    } else {
        for (const p of profiles) {
            const isActive = activeProfile?.id === p.id;
            const prefix = isActive ? '→ ' : '  ';
            let details = `[${p.type}]`;
            if (p.type === 'basic') details += ` (User: ${p.username})`;
            if (p.type === 'custom-header') details += ` (Header: ${p.headerName})`;
            outputChannel.appendLine(`${prefix}${p.name} ${details}`);
        }
    }

    outputChannel.appendLine('═══════════════════════════════════════════════');
    outputChannel.appendLine('');
    outputChannel.show(true);
}

// ── Main Command ─────────────────────────────────────────────

export function registerRpcAuthCommands(
    context: vscode.ExtensionContext,
    rpcAuthService: RpcAuthService,
    onActiveProfileChanged: () => void
): void {
    const outputChannel = vscode.window.createOutputChannel('Stellar Suite — RPC Auth');

    const manageCommand = vscode.commands.registerCommand(
        'stellarSuite.manageRpcAuth',
        async () => {
            while (true) {
                const activeProfile = await rpcAuthService.getActiveProfile();
                const profiles = await rpcAuthService.getProfiles();

                const actions: vscode.QuickPickItem[] = [
                    {
                        label: '$(eye) View Profiles',
                        description: activeProfile ? `Active: ${activeProfile.name}` : '(none active)',
                    },
                    { label: '$(add) Create Profile', description: 'Create a new RPC auth profile' },
                ];

                if (profiles.length > 0) {
                    actions.push(
                        { label: '$(arrow-swap) Switch Profile', description: 'Activate a different profile' },
                        { label: '$(edit) Edit Profile', description: 'Modify an existing profile' },
                        { label: '$(trash) Delete Profile', description: 'Remove a profile and its secrets' }
                    );
                }

                actions.push(
                    { label: '', kind: vscode.QuickPickItemKind.Separator },
                    { label: '$(close) Cancel', description: 'Close menu' }
                );

                const action = await vscode.window.showQuickPick(actions, {
                    title: 'Manage RPC Authentication',
                    placeHolder: 'Choose an action',
                });

                if (!action || action.label.includes('Cancel')) {
                    return;
                }

                // ── View ─────────────────────────────────────
                if (action.label.includes('View Profiles')) {
                    formatProfileList(outputChannel, activeProfile, profiles);
                    return; // Exit loop after viewing
                }

                // ── Create ───────────────────────────────────
                if (action.label.includes('Create Profile')) {
                    const name = await vscode.window.showInputBox({
                        title: 'Profile Name',
                        prompt: 'Enter a name for the new RPC Auth profile',
                        validateInput: (v: string) => v.trim() ? undefined : 'Name is required.',
                    });
                    if (!name) continue;

                    const typeItem = await vscode.window.showQuickPick(
                        [
                            { label: 'API Key', description: 'Sent as X-Api-Key header', typeId: 'api-key' },
                            { label: 'Bearer Token', description: 'Sent as Authorization: Bearer <token>', typeId: 'bearer-token' },
                            { label: 'Basic Auth', description: 'Sent as Authorization: Basic <base64(user:pass)>', typeId: 'basic' },
                            { label: 'Custom Header', description: 'Sent as a custom HTTP header', typeId: 'custom-header' },
                        ],
                        { title: 'Select Authentication Type' }
                    );
                    if (!typeItem) continue;

                    const type = (typeItem as any).typeId as AuthMethodType;
                    let username: string | undefined;
                    let headerName: string | undefined;

                    if (type === 'basic') {
                        username = await vscode.window.showInputBox({
                            title: 'Username',
                            prompt: 'Enter the username for Basic Auth',
                            validateInput: (v: string) => v.trim() ? undefined : 'Username is required.',
                        });
                        if (!username) continue;
                    } else if (type === 'custom-header') {
                        headerName = await vscode.window.showInputBox({
                            title: 'Header Name',
                            prompt: 'Enter the custom HTTP header name (e.g., X-My-Auth)',
                            validateInput: (v: string) => v.trim() ? undefined : 'Header name is required.',
                        });
                        if (!headerName) continue;
                    }

                    const secretLabel = type === 'basic' ? 'Password' : 'Token / Key / Secret Value';
                    const secret = await vscode.window.showInputBox({
                        title: secretLabel,
                        prompt: `Enter the ${secretLabel.toLowerCase()} (stored securely in OS keychain)`,
                        password: true, // This masks the input
                        validateInput: (v: string) => v.trim() ? undefined : `${secretLabel} is required.`,
                    });
                    if (!secret) continue;

                    try {
                        const profile = await rpcAuthService.createProfile(name, type, secret, username, headerName);

                        const activate = await vscode.window.showInformationMessage(
                            `RPC Auth Profile "${profile.name}" created securely.`,
                            'Activate', 'Later'
                        );
                        if (activate === 'Activate') {
                            await rpcAuthService.setActiveProfile(profile.id);
                            onActiveProfileChanged();
                            vscode.window.showInformationMessage(`Profile "${profile.name}" is now active.`);
                        }
                    } catch (err) {
                        vscode.window.showErrorMessage(
                            `Failed to create profile: ${err instanceof Error ? err.message : String(err)}`
                        );
                    }
                    continue;
                }

                // ── Switch ───────────────────────────────────
                if (action.label.includes('Switch Profile')) {
                    const items: vscode.QuickPickItem[] = [
                        { label: '$(close) None', description: 'Deactivate RPC authentication' },
                    ];
                    for (const p of profiles) {
                        const active = p.id === activeProfile?.id;
                        items.push({
                            label: `${active ? '$(check) ' : ''}${p.name}`,
                            description: p.type,
                            profileId: p.id,
                        } as any);
                    }

                    const pick = await vscode.window.showQuickPick(items, {
                        title: 'Switch RPC Auth Profile',
                    });
                    if (!pick) continue;

                    if (pick.label.includes('None')) {
                        await rpcAuthService.setActiveProfile(undefined);
                        onActiveProfileChanged();
                        vscode.window.showInformationMessage('RPC authentication deactivated.');
                    } else {
                        const selectedId = (pick as any).profileId;
                        const selected = profiles.find(p => p.id === selectedId);
                        if (selected) {
                            await rpcAuthService.setActiveProfile(selected.id);
                            onActiveProfileChanged();
                            vscode.window.showInformationMessage(`RPC Auth Profile "${selected.name}" is now active.`);
                        }
                    }
                    continue;
                }

                // ── Edit ─────────────────────────────────────
                if (action.label.includes('Edit Profile')) {
                    const items = profiles.map(p => ({
                        label: p.name,
                        description: p.type,
                        profileId: p.id,
                    }));

                    const pick = await vscode.window.showQuickPick(items, {
                        title: 'Select Profile to Edit',
                    });
                    if (!pick) continue;

                    const existingProfile = profiles.find(p => p.id === (pick as any).profileId);
                    if (!existingProfile) continue;

                    const newName = await vscode.window.showInputBox({
                        title: 'Profile Name',
                        value: existingProfile.name,
                        prompt: 'Update profile name',
                        validateInput: (v: string) => v.trim() ? undefined : 'Name is required.',
                    });
                    if (!newName) continue;

                    let newUsername = existingProfile.username;
                    let newHeaderName = existingProfile.headerName;

                    if (existingProfile.type === 'basic') {
                        const uname = await vscode.window.showInputBox({
                            title: 'Username',
                            value: existingProfile.username,
                            prompt: 'Update username',
                            validateInput: (v: string) => v.trim() ? undefined : 'Username is required.',
                        });
                        if (!uname) continue;
                        newUsername = uname;
                    } else if (existingProfile.type === 'custom-header') {
                        const hname = await vscode.window.showInputBox({
                            title: 'Header Name',
                            value: existingProfile.headerName,
                            prompt: 'Update custom header name',
                            validateInput: (v: string) => v.trim() ? undefined : 'Header name is required.',
                        });
                        if (!hname) continue;
                        newHeaderName = hname;
                    }

                    const updateSecretAnswer = await vscode.window.showQuickPick(
                        ['Keep existing secret', 'Update secret/password'],
                        { title: 'Update Credentials?' }
                    );
                    if (!updateSecretAnswer) continue;

                    let newSecret: string | undefined;
                    if (updateSecretAnswer === 'Update secret/password') {
                        const secretLabel = existingProfile.type === 'basic' ? 'Password' : 'Token / Key / Secret Value';
                        const s = await vscode.window.showInputBox({
                            title: `New ${secretLabel}`,
                            prompt: `Enter the new ${secretLabel.toLowerCase()}`,
                            password: true,
                            validateInput: (v: string) => v.trim() ? undefined : 'Secret cannot be empty if updating.',
                        });
                        if (!s) continue;
                        newSecret = s;
                    }

                    try {
                        await rpcAuthService.updateProfile(existingProfile.id, {
                            name: newName,
                            username: newUsername,
                            headerName: newHeaderName,
                            secret: newSecret,
                        });
                        if (activeProfile?.id === existingProfile.id) {
                            onActiveProfileChanged(); // Refresh headers if we edited the active one
                        }
                        vscode.window.showInformationMessage(`RPC Auth Profile "${newName}" updated.`);
                    } catch (err) {
                        vscode.window.showErrorMessage(
                            `Failed to update profile: ${err instanceof Error ? err.message : String(err)}`
                        );
                    }
                    continue;
                }

                // ── Delete ───────────────────────────────────
                if (action.label.includes('Delete Profile')) {
                    const items = profiles.map(p => ({
                        label: p.name,
                        description: p.type,
                        profileId: p.id,
                    }));

                    const pick = await vscode.window.showQuickPick(items, {
                        title: 'Select Profile to Delete',
                    });
                    if (!pick) continue;

                    const confirm = await vscode.window.showWarningMessage(
                        `Delete profile "${pick.label}" and permanently remove its stored secret?`,
                        { modal: true },
                        'Delete'
                    );
                    if (confirm !== 'Delete') continue;

                    try {
                        const wasActive = activeProfile?.id === (pick as any).profileId;
                        await rpcAuthService.deleteProfile((pick as any).profileId);
                        if (wasActive) {
                            onActiveProfileChanged();
                        }
                        vscode.window.showInformationMessage(`RPC Auth Profile "${pick.label}" deleted.`);
                    } catch (err) {
                        vscode.window.showErrorMessage(
                            `Failed to delete profile: ${err instanceof Error ? err.message : String(err)}`
                        );
                    }
                    continue;
                }
            }
        }
    );

    context.subscriptions.push(manageCommand);
}
