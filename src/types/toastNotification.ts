// ============================================================
// src/types/toastNotification.ts
// Type definitions for toast notification system
// ============================================================

import * as vscode from 'vscode';

/**
 * Toast notification severity types
 */
export enum ToastType {
    Success = 'success',
    Error = 'error',
    Warning = 'warning',
    Info = 'info'
}

/**
 * Toast notification action button
 */
export interface ToastAction {
    /** Label text for the action button */
    label: string;
    /** Callback when action is clicked */
    callback: () => void | Promise<void>;
    /** Optional icon for the action button */
    icon?: string;
}

/**
 * Toast notification options
 */
export interface ToastOptions {
    /** Notification message */
    message: string;
    /** Notification type/severity */
    type: ToastType;
    /** Duration in milliseconds (0 = no auto-dismiss) */
    duration?: number;
    /** Action buttons */
    actions?: ToastAction[];
    /** Show close button */
    dismissible?: boolean;
    /** Unique identifier for the notification */
    id?: string;
    /** Priority for queue ordering (higher = shown first) */
    priority?: number;
    /** Group identifier for related notifications */
    group?: string;
    /** Progress indicator (0-100) */
    progress?: number;
    /** Icon to display */
    icon?: string;
}

/**
 * Internal toast notification with metadata
 */
export interface Toast extends ToastOptions {
    /** Unique identifier */
    id: string;
    /** Timestamp when created */
    timestamp: number;
    /** Whether notification is currently visible */
    visible: boolean;
    /** Timer for auto-dismiss */
    timer?: NodeJS.Timeout;
    /** Original options */
    options: ToastOptions;
}

/**
 * Toast queue configuration
 */
export interface ToastQueueConfig {
    /** Maximum number of visible toasts */
    maxVisible: number;
    /** Maximum total toasts in queue */
    maxQueued: number;
    /** Default duration for toasts (ms) */
    defaultDuration: number;
    /** Position on screen */
    position: ToastPosition;
    /** Enable animations */
    enableAnimations: boolean;
}

/**
 * Toast notification position
 */
export enum ToastPosition {
    TopRight = 'top-right',
    TopLeft = 'top-left',
    BottomRight = 'bottom-right',
    BottomLeft = 'bottom-left',
    TopCenter = 'top-center',
    BottomCenter = 'bottom-center'
}

/**
 * Toast notification event types
 */
export enum ToastEventType {
    Shown = 'shown',
    Dismissed = 'dismissed',
    ActionClicked = 'actionClicked',
    QueueChanged = 'queueChanged'
}

/**
 * Toast notification event
 */
export interface ToastEvent {
    type: ToastEventType;
    toast: Toast;
    actionLabel?: string;
}

/**
 * Toast notification statistics
 */
export interface ToastStatistics {
    /** Total notifications shown */
    totalShown: number;
    /** Currently visible count */
    currentlyVisible: number;
    /** Queued count */
    queued: number;
    /** Notifications by type */
    byType: Record<ToastType, number>;
}

/**
 * Toast notification service interface
 */
export interface IToastNotificationService {
    /**
     * Show a success notification
     */
    success(message: string, options?: Partial<ToastOptions>): Promise<string>;

    /**
     * Show an error notification
     */
    error(message: string, options?: Partial<ToastOptions>): Promise<string>;

    /**
     * Show a warning notification
     */
    warning(message: string, options?: Partial<ToastOptions>): Promise<string>;

    /**
     * Show an info notification
     */
    info(message: string, options?: Partial<ToastOptions>): Promise<string>;

    /**
     * Show a custom notification
     */
    show(options: ToastOptions): Promise<string>;

    /**
     * Dismiss a notification by ID
     */
    dismiss(id: string): void;

    /**
     * Dismiss all notifications
     */
    dismissAll(): void;

    /**
     * Dismiss notifications by group
     */
    dismissGroup(group: string): void;

    /**
     * Update an existing notification
     */
    update(id: string, options: Partial<ToastOptions>): void;

    /**
     * Get current statistics
     */
    getStatistics(): ToastStatistics;

    /**
     * Register event listener
     */
    onToastEvent(listener: (event: ToastEvent) => void): vscode.Disposable;

    /**
     * Clear all notifications and reset state
     */
    clear(): void;

    /**
     * Dispose resources
     */
    dispose(): void;
}
