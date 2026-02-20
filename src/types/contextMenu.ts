// ============================================================
// src/types/contextMenu.ts
// Shared type definitions for the sidebar context menu system.
// ============================================================

/** Mirrors the contract shape stored in workspace state */
export interface ContractInfo {
    name: string;
    path: string;
    contractId?: string;
    isBuilt: boolean;
    deployedAt?: string;
    network?: string;
    source?: string;
    templateId?: string;
    templateCategory?: string;
}

export interface DeploymentRecord {
    contractId: string;
    deployedAt: string;
    network: string;
    source: string;
    contractName: string;
}

// ── Context Menu Types ────────────────────────────────────────

export type ContextMenuActionId =
    | 'build'
    | 'deploy'
    | 'simulate'
    | 'inspect'
    | 'rename'
    | 'duplicate'
    | 'delete'
    | 'copyContractId'
    | 'openContractFolder'
    | 'viewDeploymentHistory'
    | 'pinContract'
    | 'setNetwork'
    | 'assignTemplate'
    | 'templateActions';

export interface ContextMenuAction {
    id: ContextMenuActionId | string;
    label: string;
    /** VS Code codicon name, e.g. 'copy', 'trash' */
    icon?: string;
    /** Keyboard shortcut display string */
    shortcut?: string;
    /** Whether the action should appear greyed-out */
    enabled: boolean;
    /** Whether to show a danger style (red) */
    destructive?: boolean;
    /** Whether to render a separator above this item */
    separatorBefore?: boolean;
}

/** The payload sent from the webview when the user right-clicks a contract */
export interface ContextMenuRequest {
    contractName: string;
    contractPath: string;
    contractId?: string;
    isBuilt: boolean;
    templateId?: string;
    templateCategory?: string;
    x: number;
    y: number;
}

/** The payload sent from the webview when the user clicks a context menu action */
export interface ContextMenuActionRequest {
    actionId: string;
    contractName: string;
    contractPath: string;
    contractId?: string;
    templateId?: string;
    templateCategory?: string;
}

/** Feedback message sent back to the webview after an action completes */
export interface ActionFeedback {
    type: 'success' | 'error' | 'info';
    message: string;
    /** If provided, triggers a sidebar refresh */
    refresh?: boolean;
}
