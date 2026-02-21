// ============================================================
// src/services/notificationPreferencesService.ts
// Service for notification preferences: storage, validation, presets
// ============================================================

import {
    NotificationPreferences,
    NotificationPreset,
    NotificationPresetId,
    PreferenceValidationResult
} from '../types/notificationPreferences';
import { ToastPosition, ToastType, ToastQueueConfig } from '../types/toastNotification';

/** Workspace state key for stored notification preferences */
export const NOTIFICATION_PREFERENCES_KEY = 'stellarSuite.notificationPreferences';

/** Minimum duration (ms) */
const MIN_DURATION = 0;
/** Maximum duration (ms) */
const MAX_DURATION = 300_000;
/** Minimum max visible toasts */
const MIN_MAX_VISIBLE = 1;
/** Maximum max visible toasts */
const MAX_MAX_VISIBLE = 10;
/** Minimum max queued toasts */
const MIN_MAX_QUEUED = 1;
/** Maximum max queued toasts */
const MAX_MAX_QUEUED = 50;

const DEFAULT_TYPES = {
    success: true,
    error: true,
    warning: true,
    info: true
};

/** Default preferences (normal preset) */
export const DEFAULT_PREFERENCES: NotificationPreferences = {
    enabled: true,
    types: { ...DEFAULT_TYPES },
    duration: 5000,
    position: ToastPosition.BottomRight,
    soundEnabled: false,
    actionsEnabled: true,
    maxVisible: 3,
    maxQueued: 10,
    enableAnimations: true
};

/** Built-in presets */
export const NOTIFICATION_PRESETS: NotificationPreset[] = [
    {
        id: 'minimal',
        label: 'Minimal',
        description: 'Only errors, few toasts, no sound or actions',
        preferences: {
            enabled: true,
            types: { success: false, error: true, warning: false, info: false },
            duration: 5000,
            position: ToastPosition.BottomRight,
            soundEnabled: false,
            actionsEnabled: false,
            maxVisible: 1,
            maxQueued: 3,
            enableAnimations: false
        }
    },
    {
        id: 'normal',
        label: 'Normal',
        description: 'Balanced: all types, moderate duration and queue',
        preferences: { ...DEFAULT_PREFERENCES }
    },
    {
        id: 'verbose',
        label: 'Verbose',
        description: 'All types, longer duration, sound and actions enabled',
        preferences: {
            enabled: true,
            types: { ...DEFAULT_TYPES },
            duration: 10000,
            position: ToastPosition.BottomRight,
            soundEnabled: true,
            actionsEnabled: true,
            maxVisible: 5,
            maxQueued: 20,
            enableAnimations: true
        }
    }
];

/** Minimal store interface for preferences (testable without VS Code) */
export interface NotificationPreferencesStore {
    get(key: string): unknown;
    update(key: string, value: unknown): Thenable<void>;
}

/**
 * Validates notification preferences and returns errors if any.
 */
export function validateNotificationPreferences(
    prefs: Partial<NotificationPreferences>
): PreferenceValidationResult {
    const errors: string[] = [];

    if (typeof prefs.duration === 'number') {
        if (prefs.duration < MIN_DURATION || prefs.duration > MAX_DURATION) {
            errors.push(
                `duration must be between ${MIN_DURATION} and ${MAX_DURATION} ms`
            );
        }
    }

    if (typeof prefs.maxVisible === 'number') {
        if (prefs.maxVisible < MIN_MAX_VISIBLE || prefs.maxVisible > MAX_MAX_VISIBLE) {
            errors.push(
                `maxVisible must be between ${MIN_MAX_VISIBLE} and ${MAX_MAX_VISIBLE}`
            );
        }
    }

    if (typeof prefs.maxQueued === 'number') {
        if (prefs.maxQueued < MIN_MAX_QUEUED || prefs.maxQueued > MAX_MAX_QUEUED) {
            errors.push(
                `maxQueued must be between ${MIN_MAX_QUEUED} and ${MAX_MAX_QUEUED}`
            );
        }
    }

    if (prefs.position !== undefined) {
        const validPositions: string[] = Object.values(ToastPosition);
        if (!validPositions.includes(prefs.position)) {
            errors.push(`position must be one of: ${validPositions.join(', ')}`);
        }
    }

    if (prefs.types !== undefined) {
        const requiredKeys: (keyof NotificationPreferences['types'])[] = [
            'success',
            'error',
            'warning',
            'info'
        ];
        for (const k of requiredKeys) {
            const v = prefs.types[k];
            if (typeof v !== 'boolean') {
                errors.push(`types.${k} must be a boolean`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Notification preferences service: storage, validation, presets.
 */
export class NotificationPreferencesService {
    private store: NotificationPreferencesStore;
    private changeEmitter: { fire: () => void; event: (listener: () => void) => { dispose: () => void } };

    constructor(store: NotificationPreferencesStore) {
        this.store = store;
        this.changeEmitter = this.createChangeEmitter();
    }

    private createChangeEmitter(): {
        fire: () => void;
        event: (listener: () => void) => { dispose: () => void };
    } {
        const listeners: Array<() => void> = [];
        return {
            fire: () => listeners.forEach(l => l()),
            event: (listener: () => void) => {
                listeners.push(listener);
                return {
                    dispose: () => {
                        const i = listeners.indexOf(listener);
                        if (i !== -1) listeners.splice(i, 1);
                    }
                };
            }
        };
    }

    /**
     * Subscribe to preference changes (e.g. to refresh toast config).
     */
    onDidChangePreferences(listener: () => void): { dispose: () => void } {
        return this.changeEmitter.event(listener);
    }

    /**
     * Get current preferences. Merges stored overrides with defaults.
     * Does not read VS Code workspace configuration; caller can merge that.
     */
    getPreferences(): NotificationPreferences {
        const stored = this.store.get(NOTIFICATION_PREFERENCES_KEY) as
            | Partial<NotificationPreferences>
            | undefined;
        if (!stored || typeof stored !== 'object') {
            return { ...DEFAULT_PREFERENCES };
        }
        return this.mergeWithDefaults(stored);
    }

    /**
     * Save preferences. Validates before saving. Returns validation result.
     */
    async setPreferences(
        prefs: Partial<NotificationPreferences>
    ): Promise<PreferenceValidationResult> {
        const result = validateNotificationPreferences(prefs);
        if (!result.valid) {
            return result;
        }
        const current = this.getPreferences();
        const merged = this.mergeWithDefaults({ ...current, ...prefs });
        await this.store.update(NOTIFICATION_PREFERENCES_KEY, merged);
        this.changeEmitter.fire();
        return result;
    }

    /**
     * Get built-in presets.
     */
    getPresets(): NotificationPreset[] {
        return [...NOTIFICATION_PRESETS];
    }

    /**
     * Apply a preset by ID and save to storage.
     */
    async applyPreset(presetId: NotificationPresetId): Promise<boolean> {
        const preset = NOTIFICATION_PRESETS.find(p => p.id === presetId);
        if (!preset) {
            return false;
        }
        const prefs: NotificationPreferences = {
            ...preset.preferences,
            presetId: preset.id
        };
        await this.store.update(NOTIFICATION_PREFERENCES_KEY, prefs);
        this.changeEmitter.fire();
        return true;
    }

    /**
     * Validate preferences without saving.
     */
    validate(prefs: Partial<NotificationPreferences>): PreferenceValidationResult {
        return validateNotificationPreferences(prefs);
    }

    /**
     * Convert notification preferences to toast queue config for the toast service.
     */
    preferencesToQueueConfig(prefs: NotificationPreferences): ToastQueueConfig {
        return {
            maxVisible: prefs.maxVisible,
            maxQueued: prefs.maxQueued,
            defaultDuration: prefs.duration,
            position: prefs.position,
            enableAnimations: prefs.enableAnimations,
            enabled: prefs.enabled,
            enabledTypes: prefs.types as Record<ToastType, boolean>,
            actionsEnabled: prefs.actionsEnabled
        };
    }

    private mergeWithDefaults(
        partial: Partial<NotificationPreferences>
    ): NotificationPreferences {
        const base = { ...DEFAULT_PREFERENCES };
        if (partial.enabled !== undefined) base.enabled = partial.enabled;
        if (partial.types) base.types = { ...base.types, ...partial.types };
        if (typeof partial.duration === 'number') base.duration = partial.duration;
        if (partial.position !== undefined) base.position = partial.position;
        if (partial.soundEnabled !== undefined) base.soundEnabled = partial.soundEnabled;
        if (partial.actionsEnabled !== undefined) base.actionsEnabled = partial.actionsEnabled;
        if (typeof partial.maxVisible === 'number') base.maxVisible = partial.maxVisible;
        if (typeof partial.maxQueued === 'number') base.maxQueued = partial.maxQueued;
        if (partial.enableAnimations !== undefined) base.enableAnimations = partial.enableAnimations;
        if (partial.presetId !== undefined) base.presetId = partial.presetId;
        return base;
    }
}
