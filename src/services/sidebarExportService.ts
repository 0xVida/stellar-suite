// ============================================================
// src/services/sidebarExportService.ts
// Exports the sidebar contract list and configurations to a
// portable JSON file.
// ============================================================

import {
    ExportedContract,
    ExportedContractConfig,
    SidebarExportFile,
    EXPORT_FORMAT_VERSION,
    ExportImportLogger,
} from '../types/sidebarExport';

// ── Minimal shim for ContractInfo ─────────────────────────────
// We import the shape only — the actual ContractInfo lives in
// sidebarView.ts but we avoid a hard circular import.

export interface ExportableContract {
    name: string;
    path: string;
    contractId?: string;
    isBuilt: boolean;
    network?: string;
    source?: string;
    isPinned?: boolean;
    localVersion?: string;
    deployedVersion?: string;
    templateId?: string;
    templateCategory?: string;
    templateSource?: string;
}

// ── Private Helpers ───────────────────────────────────────────

function generateExportId(contract: ExportableContract): string {
    // Prefer the on-chain contractId; fall back to a deterministic
    // hash built from the local path and name.
    if (contract.contractId) {
        return contract.contractId;
    }
    return `local:${contract.name}:${simpleHash(contract.path)}`;
}

function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
}

function stripRuntimeFields(contract: ExportableContract): ExportedContractConfig {
    const config: ExportedContractConfig = {};
    if (contract.source) { config.source = contract.source; }
    if (contract.isPinned) { config.isPinned = contract.isPinned; }
    if (contract.localVersion) { config.localVersion = contract.localVersion; }
    if (contract.deployedVersion) { config.deployedVersion = contract.deployedVersion; }
    if (contract.templateId) { config.templateId = contract.templateId; }
    if (contract.templateCategory) { config.templateCategory = contract.templateCategory; }
    if (contract.templateSource) { config.templateSource = contract.templateSource; }
    return config;
}

// ── Default logger ────────────────────────────────────────────

const noop: ExportImportLogger = {
    info: () => { },
    warn: () => { },
    error: () => { },
    debug: () => { },
};

// ── Public API ────────────────────────────────────────────────

export interface ExportOptions {
    /** Contracts to export (usually from SidebarViewProvider._lastContracts) */
    contracts: ExportableContract[];
    /** Human identifier for the workspace (e.g. workspace folder name) */
    workspaceId: string;
    /** Logger */
    logger?: ExportImportLogger;
}

/**
 * Build the export payload from a list of contracts.
 *
 * The output is a deterministic, serializable object with no
 * circular references, no sensitive secrets, and a version tag.
 */
export function buildExportPayload(options: ExportOptions): SidebarExportFile {
    const logger = options.logger || noop;

    logger.info(`[Export] Building export payload for ${options.contracts.length} contract(s)`);

    const contracts: ExportedContract[] = options.contracts.map(c => ({
        id: generateExportId(c),
        name: c.name,
        address: c.contractId || '',
        network: c.network || 'testnet',
        config: stripRuntimeFields(c),
    }));

    const payload: SidebarExportFile = {
        version: EXPORT_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        workspaceId: options.workspaceId,
        contracts,
    };

    logger.info(`[Export] Payload ready: ${contracts.length} contract(s), version ${EXPORT_FORMAT_VERSION}`);
    return payload;
}

/**
 * Serialize the export payload to a JSON string.
 */
export function serializeExport(payload: SidebarExportFile): string {
    return JSON.stringify(payload, null, 2);
}

/**
 * One-step convenience: build + serialize.
 */
export function exportSidebar(options: ExportOptions): string {
    const payload = buildExportPayload(options);
    return serializeExport(payload);
}
