// ============================================================
// src/ui/notificationPreferencesUI.ts
// UI for notification preferences: quick pick flow
// ============================================================

import * as vscode from 'vscode';
import { NotificationPreferencesService } from '../services/notificationPreferencesService';
import { NotificationPreferences, NotificationPresetId } from '../types/notificationPreferences';
import { ToastPosition } from '../types/toastNotification';

/** Quick pick item with an id for menu routing */
interface QuickPickItemWithId extends vscode.QuickPickItem {
    id: string;
}

const POSITION_LABELS: Record<ToastPosition, string> = {
    [ToastPosition.TopRight]: 'Top Right',
    [ToastPosition.TopLeft]: 'Top Left',
    [ToastPosition.BottomRight]: 'Bottom Right',
    [ToastPosition.BottomLeft]: 'Bottom Left',
    [ToastPosition.TopCenter]: 'Top Center',
    [ToastPosition.BottomCenter]: 'Bottom Center'
};

/**
 * Show the main notification preferences menu and handle sub-menus.
 */
export async function showNotificationPreferences(
    preferencesService: NotificationPreferencesService
): Promise<void> {
    const prefs = preferencesService.getPreferences();

    while (true) {
        const choice = await showMainMenu(prefs);
        if (!choice) break;

        switch (choice) {
            case 'preset':
                await pickPreset(preferencesService);
                break;
            case 'duration':
                await setDuration(preferencesService);
                break;
            case 'position':
                await setPosition(preferencesService);
                break;
            case 'types':
                await setTypes(preferencesService);
                break;
            case 'sound':
                await setSound(preferencesService);
                break;
            case 'actions':
                await setActions(preferencesService);
                break;
            case 'enabled':
                await setEnabled(preferencesService);
                break;
            case 'settings':
                await openSettings();
                break;
            case 'done':
                return;
        }
    }
}

async function showMainMenu(prefs: NotificationPreferences): Promise<string | undefined> {
    const enabledLabel = prefs.enabled ? '$(check) Enabled' : '$(close) Disabled';
    const durationSec = prefs.duration === 0 ? 'No auto-dismiss' : `${prefs.duration / 1000}s`;
    const positionLabel = POSITION_LABELS[prefs.position] ?? prefs.position;
    const soundLabel = prefs.soundEnabled ? 'On' : 'Off';
    const actionsLabel = prefs.actionsEnabled ? 'On' : 'Off';
    const typesSummary = [
        prefs.types.success ? 'Success' : null,
        prefs.types.error ? 'Error' : null,
        prefs.types.warning ? 'Warning' : null,
        prefs.types.info ? 'Info' : null
    ]
        .filter(Boolean)
        .join(', ') || 'None';

    const items: QuickPickItemWithId[] = [
        { label: '$(symbol-misc) Apply preset', description: 'Minimal, Normal, Verbose', detail: 'Use a built-in preset', id: 'preset' },
        { label: '$(watch) Duration', description: durationSec, detail: 'Default display time', id: 'duration' },
        { label: '$(location) Position', description: positionLabel, detail: 'Where toasts appear', id: 'position' },
        { label: '$(symbol-event) Notification types', description: typesSummary, detail: 'Success, Error, Warning, Info', id: 'types' },
        { label: '$(unmute) Sound', description: soundLabel, detail: 'Play sound (future use)', id: 'sound' },
        { label: '$(link) Action buttons', description: actionsLabel, detail: 'Show actions on toasts', id: 'actions' },
        { label: '$(bell) Notifications', description: enabledLabel, detail: 'Master on/off', id: 'enabled' },
        { label: '$(settings-gear) Open Settings', description: 'Edit in settings.json', detail: 'stellarSuite.notifications', id: 'settings' },
        { label: '$(check) Done', description: 'Close preferences', id: 'done' }
    ];

    const pick = await vscode.window.showQuickPick(items, {
        title: 'Notification Preferences',
        placeHolder: 'Choose an option',
        matchOnDescription: true,
        matchOnDetail: true
    });

    return pick?.id;
}

async function pickPreset(preferencesService: NotificationPreferencesService): Promise<void> {
    const presets = preferencesService.getPresets();
    const items = presets.map(p => ({
        label: `$(symbol-misc) ${p.label}`,
        description: p.description,
        detail: p.id,
        id: p.id
    }));

    const pick = await vscode.window.showQuickPick(items, {
        title: 'Apply preset',
        placeHolder: 'Select a preset'
    });

    if (!pick || !(pick as { id?: NotificationPresetId }).id) return;
    const id = (pick as { id: NotificationPresetId }).id;
    const ok = await preferencesService.applyPreset(id);
    if (ok) {
        vscode.window.showInformationMessage(`Notification preset "${id}" applied.`);
    } else {
        vscode.window.showErrorMessage(`Failed to apply preset "${id}".`);
    }
}

async function setDuration(preferencesService: NotificationPreferencesService): Promise<void> {
    const prefs = preferencesService.getPreferences();
    const current = prefs.duration;
    const options = [
        { label: 'No auto-dismiss (0)', value: 0 },
        { label: '3 seconds', value: 3000 },
        { label: '5 seconds', value: 5000 },
        { label: '10 seconds', value: 10000 },
        { label: 'Custom...', value: -1 }
    ];
    const pick = await vscode.window.showQuickPick(
        options.map(o => ({ ...o, label: `${o.label}${o.value === current ? ' (current)' : ''}` })),
        { title: 'Notification duration', placeHolder: 'Select duration' }
    );
    if (!pick) return;
    let duration: number;
    if ((pick as { value: number }).value === -1) {
        const input = await vscode.window.showInputBox({
            title: 'Duration (ms)',
            value: String(current),
            validateInput: (v) => {
                const n = parseInt(v, 10);
                if (isNaN(n) || n < 0 || n > 300000) return 'Enter 0–300000';
                return null;
            }
        });
        if (input === undefined) return;
        duration = parseInt(input, 10);
    } else {
        duration = (pick as { value: number }).value;
    }
    const result = await preferencesService.setPreferences({ duration });
    if (result.valid) {
        vscode.window.showInformationMessage(`Duration set to ${duration === 0 ? 'no auto-dismiss' : duration + ' ms'}.`);
    } else {
        vscode.window.showErrorMessage(result.errors.join(' '));
    }
}

async function setPosition(preferencesService: NotificationPreferencesService): Promise<void> {
    const prefs = preferencesService.getPreferences();
    const positions = Object.values(ToastPosition);
    const pick = await vscode.window.showQuickPick(
        positions.map(p => ({
            label: POSITION_LABELS[p],
            description: p === prefs.position ? '(current)' : undefined,
            value: p
        })),
        { title: 'Notification position', placeHolder: 'Select position' }
    );
    if (!pick || !(pick as { value: ToastPosition }).value) return;
    const position = (pick as { value: ToastPosition }).value;
    const result = await preferencesService.setPreferences({ position });
    if (result.valid) {
        vscode.window.showInformationMessage(`Position set to ${POSITION_LABELS[position]}.`);
    } else {
        vscode.window.showErrorMessage(result.errors.join(' '));
    }
}

async function setTypes(preferencesService: NotificationPreferencesService): Promise<void> {
    const prefs = preferencesService.getPreferences();
    const types = [
        { key: 'success' as const, label: 'Success' },
        { key: 'error' as const, label: 'Error' },
        { key: 'warning' as const, label: 'Warning' },
        { key: 'info' as const, label: 'Info' }
    ];
    const choices = await vscode.window.showQuickPick(
        types.map(t => ({
            label: (prefs.types[t.key] ? '$(check) ' : '$(close) ') + t.label,
            description: prefs.types[t.key] ? 'On' : 'Off',
            key: t.key,
            toggle: true
        })),
        {
            title: 'Notification types',
            placeHolder: 'Select type to toggle (toggle again to change)',
            canPickMany: false
        }
    );
    if (!choices || !(choices as { key: keyof NotificationPreferences['types'] }).key) return;
    const key = (choices as { key: keyof NotificationPreferences['types'] }).key;
    const next = { ...prefs.types, [key]: !prefs.types[key] };
    const result = await preferencesService.setPreferences({ types: next });
    if (result.valid) {
        await setTypes(preferencesService);
    } else {
        vscode.window.showErrorMessage(result.errors.join(' '));
    }
}

async function setSound(preferencesService: NotificationPreferencesService): Promise<void> {
    const prefs = preferencesService.getPreferences();
    const next = !prefs.soundEnabled;
    await preferencesService.setPreferences({ soundEnabled: next });
    vscode.window.showInformationMessage(`Notification sound ${next ? 'enabled' : 'disabled'}.`);
}

async function setActions(preferencesService: NotificationPreferencesService): Promise<void> {
    const prefs = preferencesService.getPreferences();
    const next = !prefs.actionsEnabled;
    await preferencesService.setPreferences({ actionsEnabled: next });
    vscode.window.showInformationMessage(`Action buttons ${next ? 'enabled' : 'disabled'}.`);
}

async function setEnabled(preferencesService: NotificationPreferencesService): Promise<void> {
    const prefs = preferencesService.getPreferences();
    const next = !prefs.enabled;
    await preferencesService.setPreferences({ enabled: next });
    vscode.window.showInformationMessage(`Notifications ${next ? 'enabled' : 'disabled'}.`);
}

async function openSettings(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'stellarSuite.notifications');
}
