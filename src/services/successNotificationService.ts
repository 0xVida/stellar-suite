// ============================================================
// src/services/successNotificationService.ts
// Service for displaying success notifications with quick actions
// ============================================================

import * as vscode from 'vscode';
import {
    SuccessNotificationContext,
    QuickAction,
    NotificationConfig,
    ActiveNotification,
} from '../types/successNotification';

export class SuccessNotificationService {
    private activeNotifications: Map<string, ActiveNotification> = new Map();
    private notificationCounter = 0;

    /**
     * Show a success notification with quick actions
     */
    async show(
        context: SuccessNotificationContext,
        config?: NotificationConfig
    ): Promise<void> {
        const actions = config?.actions || this.getDefaultActions(context);
        const actionLabels = actions.map(a => a.label);

        const id = `notification-${++this.notificationCounter}`;
        const notification: ActiveNotification = {
            id,
            context,
            timestamp: Date.now(),
        };

        this.activeNotifications.set(id, notification);

        // Show notification with action buttons
        const selected = await vscode.window.showInformationMessage(
            context.message,
            ...actionLabels
        );

        if (selected) {
            const action = actions.find(a => a.label === selected);
            if (action) {
                await action.handler(context);
                if (action.dismissAfter !== false) {
                    this.dismiss(id);
                }
            }
        } else {
            this.dismiss(id);
        }
    }

    /**
     * Get default quick actions based on operation type
     */
    private getDefaultActions(context: SuccessNotificationContext): QuickAction[] {
        switch (context.operation) {
            case 'build':
                return [
                    {
                        id: 'deploy',
                        label: 'Deploy',
                        handler: () => vscode.commands.executeCommand('stellarSuite.deployContract'),
                    },
                    {
                        id: 'viewOutput',
                        label: 'View Output',
                        handler: () => vscode.commands.executeCommand('stellarSuite.showOutput'),
                    },
                ];

            case 'deploy':
                return [
                    {
                        id: 'copyId',
                        label: 'Copy Contract ID',
                        handler: async (ctx) => {
                            if (ctx.contractId) {
                                await vscode.env.clipboard.writeText(ctx.contractId);
                                vscode.window.showInformationMessage('Contract ID copied to clipboard');
                            }
                        },
                    },
                    {
                        id: 'simulate',
                        label: 'Simulate',
                        handler: () => vscode.commands.executeCommand('stellarSuite.simulateTransaction'),
                    },
                ];

            case 'simulate':
                return [
                    {
                        id: 'viewHistory',
                        label: 'View History',
                        handler: () => vscode.commands.executeCommand('stellarSuite.viewSimulationHistory'),
                    },
                    {
                        id: 'export',
                        label: 'Export',
                        handler: () => vscode.commands.executeCommand('stellarSuite.exportSimulation'),
                    },
                ];

            case 'export':
                return [
                    {
                        id: 'openFile',
                        label: 'Open File',
                        handler: async (ctx) => {
                            if (ctx.filePath) {
                                const uri = vscode.Uri.file(ctx.filePath);
                                await vscode.window.showTextDocument(uri);
                            }
                        },
                    },
                ];

            case 'import':
                return [
                    {
                        id: 'refresh',
                        label: 'Refresh Sidebar',
                        handler: () => vscode.commands.executeCommand('stellarSuite.refreshSidebar'),
                    },
                ];

            default:
                return [];
        }
    }

    /**
     * Dismiss a notification
     */
    dismiss(id: string): void {
        const notification = this.activeNotifications.get(id);
        if (notification) {
            notification.disposable?.dispose();
            this.activeNotifications.delete(id);
        }
    }

    /**
     * Dismiss all active notifications
     */
    dismissAll(): void {
        for (const [id] of this.activeNotifications) {
            this.dismiss(id);
        }
    }

    /**
     * Get active notifications
     */
    getActive(): ActiveNotification[] {
        return Array.from(this.activeNotifications.values());
    }

    /**
     * Clean up old notifications (older than 5 minutes)
     */
    cleanup(): void {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes

        for (const [id, notification] of this.activeNotifications) {
            if (now - notification.timestamp > maxAge) {
                this.dismiss(id);
            }
        }
    }

    /**
     * Dispose service
     */
    dispose(): void {
        this.dismissAll();
    }
}
