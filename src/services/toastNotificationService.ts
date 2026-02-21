// ============================================================
// src/services/toastNotificationService.ts
// Service for managing toast notifications
// ============================================================

import * as vscode from 'vscode';
import {
    ToastType,
    ToastOptions,
    Toast,
    ToastQueueConfig,
    ToastPosition,
    ToastEvent,
    ToastEventType,
    ToastStatistics,
    IToastNotificationService
} from '../types/toastNotification';

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_CONFIG: ToastQueueConfig = {
    maxVisible: 3,
    maxQueued: 10,
    defaultDuration: 5000,
    position: ToastPosition.BottomRight,
    enableAnimations: true
};

// ============================================================
// Toast Notification Service
// ============================================================

/**
 * Manages toast notifications with queuing and lifecycle management
 */
export class ToastNotificationService implements IToastNotificationService {
    private toasts: Map<string, Toast> = new Map();
    private queue: Toast[] = [];
    private visibleToasts: Set<string> = new Set();
    private config: ToastQueueConfig;
    private eventEmitter = new vscode.EventEmitter<ToastEvent>();
    private disposables: vscode.Disposable[] = [];
    private nextId = 1;
    private statistics: ToastStatistics = {
        totalShown: 0,
        currentlyVisible: 0,
        queued: 0,
        byType: {
            [ToastType.Success]: 0,
            [ToastType.Error]: 0,
            [ToastType.Warning]: 0,
            [ToastType.Info]: 0
        }
    };

    constructor(config?: Partial<ToastQueueConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.disposables.push(this.eventEmitter);
    }

    /**
     * Show a success notification
     */
    async success(message: string, options?: Partial<ToastOptions>): Promise<string> {
        return this.show({
            message,
            type: ToastType.Success,
            ...options
        });
    }

    /**
     * Show an error notification
     */
    async error(message: string, options?: Partial<ToastOptions>): Promise<string> {
        return this.show({
            message,
            type: ToastType.Error,
            duration: 0, // Errors don't auto-dismiss by default
            dismissible: true,
            ...options
        });
    }

    /**
     * Show a warning notification
     */
    async warning(message: string, options?: Partial<ToastOptions>): Promise<string> {
        return this.show({
            message,
            type: ToastType.Warning,
            ...options
        });
    }

    /**
     * Show an info notification
     */
    async info(message: string, options?: Partial<ToastOptions>): Promise<string> {
        return this.show({
            message,
            type: ToastType.Info,
            ...options
        });
    }

    /**
     * Show a custom notification
     */
    async show(options: ToastOptions): Promise<string> {
        // Generate unique ID if not provided
        const id = options.id || `toast-${this.nextId++}`;

        // Check if toast with same ID already exists
        if (this.toasts.has(id)) {
            this.update(id, options);
            return id;
        }

        // Create toast object
        const toast: Toast = {
            ...options,
            id,
            timestamp: Date.now(),
            visible: false,
            duration: options.duration ?? this.config.defaultDuration,
            dismissible: options.dismissible ?? true,
            priority: options.priority ?? 0,
            options
        };

        // Add to collection
        this.toasts.set(id, toast);
        this.queue.push(toast);

        // Update statistics
        this.statistics.byType[toast.type]++;
        this.statistics.queued = this.queue.length;

        // Process queue
        this.processQueue();

        // Emit event
        this.emitEvent({
            type: ToastEventType.QueueChanged,
            toast
        });

        return id;
    }

    /**
     * Dismiss a notification by ID
     */
    dismiss(id: string): void {
        const toast = this.toasts.get(id);
        if (!toast) {
            return;
        }

        // Clear timer if exists
        if (toast.timer) {
            clearTimeout(toast.timer);
            toast.timer = undefined;
        }

        // Remove from visible set
        if (this.visibleToasts.has(id)) {
            this.visibleToasts.delete(id);
            toast.visible = false;
            this.statistics.currentlyVisible = this.visibleToasts.size;
        }

        // Remove from queue
        const queueIndex = this.queue.findIndex(t => t.id === id);
        if (queueIndex !== -1) {
            this.queue.splice(queueIndex, 1);
        }

        // Remove from collection
        this.toasts.delete(id);

        // Update statistics
        this.statistics.queued = this.queue.length;

        // Emit event
        this.emitEvent({
            type: ToastEventType.Dismissed,
            toast
        });

        // Process queue to show next notification
        this.processQueue();
    }

    /**
     * Dismiss all notifications
     */
    dismissAll(): void {
        const toastIds = Array.from(this.toasts.keys());
        toastIds.forEach(id => this.dismiss(id));
    }

    /**
     * Dismiss notifications by group
     */
    dismissGroup(group: string): void {
        const toastIds = Array.from(this.toasts.values())
            .filter(toast => toast.group === group)
            .map(toast => toast.id);
        toastIds.forEach(id => this.dismiss(id));
    }

    /**
     * Update an existing notification
     */
    update(id: string, options: Partial<ToastOptions>): void {
        const toast = this.toasts.get(id);
        if (!toast) {
            return;
        }

        // Update properties
        Object.assign(toast, options);
        toast.options = { ...toast.options, ...options };

        // Reset timer if duration changed
        if (options.duration !== undefined) {
            if (toast.timer) {
                clearTimeout(toast.timer);
                toast.timer = undefined;
            }
            if (toast.visible && toast.duration !== undefined && toast.duration > 0) {
                this.startDismissTimer(toast);
            }
        }

        // Emit event
        this.emitEvent({
            type: ToastEventType.QueueChanged,
            toast
        });
    }

    /**
     * Get current statistics
     */
    getStatistics(): ToastStatistics {
        return { ...this.statistics };
    }

    /**
     * Register event listener
     */
    onToastEvent(listener: (event: ToastEvent) => void): vscode.Disposable {
        return this.eventEmitter.event(listener);
    }

    /**
     * Clear all notifications and reset state
     */
    clear(): void {
        this.dismissAll();
        this.statistics = {
            totalShown: 0,
            currentlyVisible: 0,
            queued: 0,
            byType: {
                [ToastType.Success]: 0,
                [ToastType.Error]: 0,
                [ToastType.Warning]: 0,
                [ToastType.Info]: 0
            }
        };
    }

    /**
     * Process the queue and show notifications
     */
    private processQueue(): void {
        // Calculate how many more toasts we can show
        const availableSlots = this.config.maxVisible - this.visibleToasts.size;
        if (availableSlots <= 0) {
            return;
        }

        // Get non-visible toasts from queue, sorted by priority
        const pendingToasts = this.queue
            .filter(toast => !toast.visible)
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
            .slice(0, availableSlots);

        // Show pending toasts
        pendingToasts.forEach(toast => {
            this.showToast(toast);
        });
    }

    /**
     * Show a toast notification
     */
    private showToast(toast: Toast): void {
        // Mark as visible
        toast.visible = true;
        this.visibleToasts.add(toast.id);

        // Update statistics
        this.statistics.totalShown++;
        this.statistics.currentlyVisible = this.visibleToasts.size;

        // Use VS Code native notifications as fallback
        this.showNativeNotification(toast);

        // Start dismiss timer if duration is set
        if (toast.duration !== undefined && toast.duration > 0) {
            this.startDismissTimer(toast);
        }

        // Emit event
        this.emitEvent({
            type: ToastEventType.Shown,
            toast
        });
    }

    /**
     * Show notification using VS Code's native notification system
     */
    private async showNativeNotification(toast: Toast): Promise<void> {
        const message = toast.message;
        const actions = (toast.actions || []).map(action => action.label);

        let selectedAction: string | undefined;

        try {
            switch (toast.type) {
                case ToastType.Success:
                    selectedAction = await vscode.window.showInformationMessage(message, ...actions);
                    break;
                case ToastType.Error:
                    selectedAction = await vscode.window.showErrorMessage(message, ...actions);
                    break;
                case ToastType.Warning:
                    selectedAction = await vscode.window.showWarningMessage(message, ...actions);
                    break;
                case ToastType.Info:
                default:
                    selectedAction = await vscode.window.showInformationMessage(message, ...actions);
                    break;
            }

            // Handle action callback
            if (selectedAction && toast.actions) {
                const action = toast.actions.find(a => a.label === selectedAction);
                if (action) {
                    await action.callback();
                    this.emitEvent({
                        type: ToastEventType.ActionClicked,
                        toast,
                        actionLabel: selectedAction
                    });
                }
            }
        } catch (error) {
            console.error('Failed to show notification:', error);
        }
    }

    /**
     * Start dismiss timer for a toast
     */
    private startDismissTimer(toast: Toast): void {
        if (!toast.duration || toast.duration <= 0) {
            return;
        }

        toast.timer = setTimeout(() => {
            this.dismiss(toast.id);
        }, toast.duration);
    }

    /**
     * Emit a toast event
     */
    private emitEvent(event: ToastEvent): void {
        this.eventEmitter.fire(event);
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        // Clear all timers
        this.toasts.forEach(toast => {
            if (toast.timer) {
                clearTimeout(toast.timer);
            }
        });

        // Clear collections
        this.toasts.clear();
        this.queue = [];
        this.visibleToasts.clear();

        // Dispose event emitter and other disposables
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}

/**
 * Create and initialize a toast notification service
 */
export function createToastNotificationService(
    config?: Partial<ToastQueueConfig>
): ToastNotificationService {
    return new ToastNotificationService(config);
}
