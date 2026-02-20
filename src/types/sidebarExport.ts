// ============================================================
// src/types/sidebarExport.ts
// Type definitions for sidebar export / import functionality.
// ============================================================

// ── Export File Format ────────────────────────────────────────

/** Supported export format versions. */
export const EXPORT_FORMAT_VERSION = '1.0';
export const SUPPORTED_VERSIONS = ['1.0'];

/** Valid networks (used for enum validation). */
export const VALID_NETWORKS = ['testnet', 'mainnet', 'futurenet', 'localnet', 'standalone'] as const;
export type NetworkName = typeof VALID_NETWORKS[number];

/** A single exported contract entry. */
export interface ExportedContract {
    id: string;
    name: string;
    address: string;
    network: string;
    config: ExportedContractConfig;
}

/** Contract-level configuration block. */
export interface ExportedContractConfig {
    source?: string;
    isPinned?: boolean;
    localVersion?: string;
    deployedVersion?: string;
    templateId?: string;
    templateCategory?: string;
    templateSource?: string;
    [key: string]: unknown;
}

/** The root structure of an export file. */
export interface SidebarExportFile {
    version: string;
    exportedAt: string;
    workspaceId: string;
    contracts: ExportedContract[];
}

// ── Validation ────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
    severity: IssueSeverity;
    code: string;
    message: string;
    field?: string;
    suggestion?: string;
}

export interface ImportValidationResult {
    valid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    preview: ImportPreview;
}

// ── Import Preview ────────────────────────────────────────────

export type ConflictAction = 'skip' | 'overwrite' | 'rename';

export interface ImportConflict {
    importedContract: ExportedContract;
    existingContract: {
        id: string;
        name: string;
        address: string;
        network: string;
    };
    reason: 'duplicate_id' | 'duplicate_address';
    action: ConflictAction;
    renamedName?: string;
}

export interface ImportPreview {
    totalContracts: number;
    newContracts: ExportedContract[];
    conflicts: ImportConflict[];
    invalidEntries: Array<{
        index: number;
        contract: Partial<ExportedContract>;
        issues: ValidationIssue[];
    }>;
    warnings: ValidationIssue[];
}

// ── Import Selection & Apply ──────────────────────────────────

export interface ImportSelection {
    /** IDs (from the export file) that the user selected for import. */
    selectedIds: string[];
    /** How to handle each conflict, keyed by import contract ID. */
    conflictResolutions: Record<string, ConflictAction>;
    /** Renamed names for 'rename' conflicts, keyed by import contract ID. */
    renamedNames: Record<string, string>;
}

export interface ImportApplyResult {
    success: boolean;
    importedCount: number;
    skippedCount: number;
    overwrittenCount: number;
    renamedCount: number;
    errors: string[];
}

// ── Logger ────────────────────────────────────────────────────

export interface ExportImportLogger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    debug(message: string): void;
}
