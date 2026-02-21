// ============================================================
// src/services/toastNotificationVscode.ts
// VS Code-specific toast notification service factory
// ============================================================

import * as vscode from 'vscode';
import { ToastNotificationService } from './toastNotificationService';
import { ToastQueueConfig, ToastPosition } from '../types/toastNotification';

/**
 * Create a toast notification service configured for VS Code
 */
export function createToastNotificationService(
    context: vscode.ExtensionContext
): ToastNotificationService {
    // Get configuration from workspace settings
    const config = vscode.workspace.getConfiguration('stellarSuite.notifications');

    const maxVisible = config.get<number>('maxVisible', 3);
    const maxQueued = config.get<number>('maxQueued', 10);
    const defaultDuration = config.get<number>('defaultDuration', 5000);
    const position = config.get<ToastPosition>('position', ToastPosition.BottomRight);
    const enableAnimations = config.get<boolean>('enableAnimations', true);

    const queueConfig: ToastQueueConfig = {
        maxVisible,
        maxQueued,
        defaultDuration,
        position,
        enableAnimations
    };

    const service = new ToastNotificationService(queueConfig);

    // Register for disposal
    context.subscriptions.push(service);

    // Listen for configuration changes
    const configListener = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('stellarSuite.notifications')) {
            // Configuration changed - could reload service or update settings
            vscode.window.showInformationMessage(
                'Toast notification settings updated. Reload window for changes to take effect.',
                'Reload'
            ).then(selection => {
                if (selection === 'Reload') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }
    });

    context.subscriptions.push(configListener);

    return service;
}
