// ============================================================
// src/types/keyboardShortcuts.ts
// Type definitions for sidebar keyboard shortcut support.
// ============================================================

/** Actions that can be triggered via keyboard shortcuts in the webview. */
export type WebviewShortcutAction =
    | 'focusNext'
    | 'focusPrevious'
    | 'focusFirst'
    | 'focusLast'
    | 'openMenu'
    | 'build'
    | 'deploy'
    | 'simulate'
    | 'inspect'
    | 'togglePin'
    | 'remove'
    | 'rename'
    | 'escape'
    | 'focusSearch';

/** Configuration for keyboard shortcut behaviour. */
export interface KeyboardShortcutConfig {
    /** Whether to display inline shortcut hints on contract cards. */
    showHints: boolean;
}
