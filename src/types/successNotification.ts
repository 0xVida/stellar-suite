// ============================================================
// src/types/successNotification.ts
// Types for success notifications with quick actions
// ============================================================

import * as vscode from 'vscode';

/**
 * Context for a success notification
 */
export interface SuccessNotificationContext {
    /** Type of operation that succeeded */
    operation: 'build' | 'deploy' | 'simulate' | 'export' | 'import' | 'custom';
    /** Success message to display */
    message: string;
    /** Optional contract name */
    contractName?: string;
    /** Optional contract ID (for deployments) */
    contractId?: string;
    /** Optional file path */
    filePath?: string;
    /** Optional data payload for actions */
    data?: Record<string, any>;
}

/**
 * Quick action definition
 */
export interface QuickAction {
    /** Unique action ID */
    id: string;
    /** Button label */
    label: string;
    /** Action handler */
    handler: (context: SuccessNotificationContext) => any;
    /** Whether to dismiss notification after action */
    dismissAfter?: boolean;
}

/**
 * Notification configuration
 */
export interface NotificationConfig {
    /** Whether to persist notification */
    persist?: boolean;
    /** Timeout in milliseconds (0 = no timeout) */
    timeout?: number;
    /** Custom quick actions */
    actions?: QuickAction[];
}

/**
 * Active notification tracking
 */
export interface ActiveNotification {
    /** Notification ID */
    id: string;
    /** Context */
    context: SuccessNotificationContext;
    /** Timestamp */
    timestamp: number;
    /** Disposable for cleanup */
    disposable?: vscode.Disposable;
}
