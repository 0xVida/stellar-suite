// ============================================================
// src/types/notificationPreferences.ts
// Type definitions for notification preferences
// ============================================================

import { ToastPosition } from './toastNotification';

/**
 * Which notification types are enabled (success, error, warning, info)
 */
export interface NotificationTypesConfig {
    success: boolean;
    error: boolean;
    warning: boolean;
    info: boolean;
}

/**
 * User notification preferences (stored and API)
 */
export interface NotificationPreferences {
    /** Master switch: enable or disable all notifications */
    enabled: boolean;
    /** Which notification types to show */
    types: NotificationTypesConfig;
    /** Default duration in ms (0 = no auto-dismiss) */
    duration: number;
    /** Position on screen */
    position: ToastPosition;
    /** Play sound when notification is shown (reserved for future use) */
    soundEnabled: boolean;
    /** Whether to show action buttons on notifications */
    actionsEnabled: boolean;
    /** Maximum number of visible toasts */
    maxVisible: number;
    /** Maximum toasts in queue */
    maxQueued: number;
    /** Enable animations */
    enableAnimations: boolean;
    /** Applied preset id, or undefined for custom */
    presetId?: string;
}

/**
 * Built-in preset identifier
 */
export type NotificationPresetId = 'minimal' | 'normal' | 'verbose' | 'custom';

/**
 * Preset definition (read-only)
 */
export interface NotificationPreset {
    id: NotificationPresetId;
    label: string;
    description: string;
    preferences: Omit<NotificationPreferences, 'presetId'>;
}

/**
 * Result of validating notification preferences
 */
export interface PreferenceValidationResult {
    valid: boolean;
    errors: string[];
}
