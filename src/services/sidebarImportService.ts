// ============================================================
// src/services/sidebarImportService.ts
// Parses, validates, previews, and applies an import file for
// the sidebar contract list.
// ============================================================

import {
    SidebarExportFile,
    ExportedContract,
    ImportValidationResult,
    ImportPreview,
    ImportConflict,
    ImportSelection,
    ImportApplyResult,
    ValidationIssue,
    ExportImportLogger,
    SUPPORTED_VERSIONS,
    VALID_NETWORKS,
} from '../types/sidebarExport';

// ── Default logger ────────────────────────────────────────────

const noop: ExportImportLogger = {
    info: () => { },
    warn: () => { },
    error: () => { },
    debug: () => { },
};

// ═══════════════════════════════════════════════════════════════
// 1. PARSE
// ═══════════════════════════════════════════════════════════════

/**
 * Parse raw JSON text into a SidebarExportFile.
 *
 * Returns the parsed object or throws with a user-friendly message.
 */
export function parseExportFile(raw: string): SidebarExportFile {
    if (!raw || raw.trim().length === 0) {
        throw new Error('Import file is empty.');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error('Invalid JSON: the file is not valid JSON. It may be corrupted or truncated.');
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Invalid format: the file root must be a JSON object.');
    }

    return parsed as SidebarExportFile;
}

// ═══════════════════════════════════════════════════════════════
// 2. VALIDATE
// ═══════════════════════════════════════════════════════════════

function validateRootStructure(file: SidebarExportFile, issues: ValidationIssue[]): void {
    if (!file.version || typeof file.version !== 'string') {
        issues.push({
            severity: 'error',
            code: 'MISSING_VERSION',
            message: 'Missing or invalid "version" field.',
            field: 'version',
            suggestion: 'The file must contain a "version" string (e.g. "1.0").',
        });
    } else if (!SUPPORTED_VERSIONS.includes(file.version)) {
        issues.push({
            severity: 'error',
            code: 'UNSUPPORTED_VERSION',
            message: `Unsupported export format version "${file.version}".`,
            field: 'version',
            suggestion: `Supported versions: ${SUPPORTED_VERSIONS.join(', ')}. You may need a newer version of Stellar Suite.`,
        });
    }

    if (!file.exportedAt || typeof file.exportedAt !== 'string') {
        issues.push({
            severity: 'warning',
            code: 'MISSING_TIMESTAMP',
            message: 'Missing "exportedAt" timestamp.',
            field: 'exportedAt',
        });
    }

    if (!file.workspaceId || typeof file.workspaceId !== 'string') {
        issues.push({
            severity: 'warning',
            code: 'MISSING_WORKSPACE_ID',
            message: 'Missing "workspaceId".',
            field: 'workspaceId',
        });
    }

    if (!Array.isArray(file.contracts)) {
        issues.push({
            severity: 'error',
            code: 'MISSING_CONTRACTS',
            message: '"contracts" must be an array.',
            field: 'contracts',
            suggestion: 'Ensure the file contains a "contracts" array.',
        });
    }
}

function validateContract(
    contract: Partial<ExportedContract>,
    index: number,
    issues: ValidationIssue[],
): ValidationIssue[] {
    const entryIssues: ValidationIssue[] = [];

    if (!contract.id || typeof contract.id !== 'string') {
        entryIssues.push({
            severity: 'error',
            code: 'INVALID_CONTRACT_ID',
            message: `Contract #${index + 1}: missing or invalid "id".`,
            field: `contracts[${index}].id`,
        });
    }

    if (!contract.name || typeof contract.name !== 'string') {
        entryIssues.push({
            severity: 'error',
            code: 'INVALID_CONTRACT_NAME',
            message: `Contract #${index + 1}: missing or invalid "name".`,
            field: `contracts[${index}].name`,
        });
    }

    if (typeof contract.address !== 'string') {
        entryIssues.push({
            severity: 'error',
            code: 'INVALID_CONTRACT_ADDRESS',
            message: `Contract #${index + 1}: "address" must be a string.`,
            field: `contracts[${index}].address`,
        });
    }

    if (typeof contract.network !== 'string') {
        entryIssues.push({
            severity: 'error',
            code: 'INVALID_CONTRACT_NETWORK',
            message: `Contract #${index + 1}: "network" must be a string.`,
            field: `contracts[${index}].network`,
        });
    } else if (!VALID_NETWORKS.includes(contract.network as any)) {
        entryIssues.push({
            severity: 'warning',
            code: 'UNKNOWN_NETWORK',
            message: `Contract #${index + 1}: unrecognized network "${contract.network}".`,
            field: `contracts[${index}].network`,
            suggestion: `Valid networks: ${VALID_NETWORKS.join(', ')}.`,
        });
    }

    if (contract.config !== undefined && (typeof contract.config !== 'object' || contract.config === null || Array.isArray(contract.config))) {
        entryIssues.push({
            severity: 'error',
            code: 'INVALID_CONTRACT_CONFIG',
            message: `Contract #${index + 1}: "config" must be an object.`,
            field: `contracts[${index}].config`,
        });
    }

    issues.push(...entryIssues);
    return entryIssues;
}

function detectDuplicates(
    contracts: ExportedContract[],
    issues: ValidationIssue[],
): void {
    const seenIds = new Map<string, number>();
    const seenAddresses = new Map<string, number>();

    for (let i = 0; i < contracts.length; i++) {
        const c = contracts[i];

        // Duplicate IDs within the import file
        if (c.id) {
            if (seenIds.has(c.id)) {
                issues.push({
                    severity: 'warning',
                    code: 'DUPLICATE_ID_IN_FILE',
                    message: `Duplicate contract ID "${c.id}" found at indices ${seenIds.get(c.id)} and ${i}.`,
                    field: `contracts[${i}].id`,
                    suggestion: 'Only the first occurrence will be imported.',
                });
            } else {
                seenIds.set(c.id, i);
            }
        }

        // Duplicate addresses within the import file
        if (c.address && c.address.length > 0) {
            if (seenAddresses.has(c.address)) {
                issues.push({
                    severity: 'warning',
                    code: 'DUPLICATE_ADDRESS_IN_FILE',
                    message: `Duplicate contract address "${c.address}" at indices ${seenAddresses.get(c.address)} and ${i}.`,
                    field: `contracts[${i}].address`,
                });
            } else {
                seenAddresses.set(c.address, i);
            }
        }
    }
}

// ── Existing contracts interface ──────────────────────────────

export interface ExistingContract {
    id: string;
    name: string;
    address: string;
    network: string;
}

// ═══════════════════════════════════════════════════════════════
// 3. BUILD PREVIEW
// ═══════════════════════════════════════════════════════════════

/**
 * Validate the import file and build a preview.
 */
export function validateAndPreview(
    file: SidebarExportFile,
    existingContracts: ExistingContract[],
    logger?: ExportImportLogger,
): ImportValidationResult {
    const log = logger || noop;
    const issues: ValidationIssue[] = [];

    log.info('[Import] Validating import file…');

    // 1. Root structure
    validateRootStructure(file, issues);

    // If contracts array is missing, we can't proceed
    if (!Array.isArray(file.contracts)) {
        return {
            valid: false,
            errors: issues.filter(i => i.severity === 'error'),
            warnings: issues.filter(i => i.severity === 'warning'),
            preview: {
                totalContracts: 0,
                newContracts: [],
                conflicts: [],
                invalidEntries: [],
                warnings: issues.filter(i => i.severity === 'warning'),
            },
        };
    }

    // 2. Per-contract validation
    const validContracts: ExportedContract[] = [];
    const invalidEntries: ImportPreview['invalidEntries'] = [];

    for (let i = 0; i < file.contracts.length; i++) {
        const c = file.contracts[i];
        const entryIssues = validateContract(c, i, issues);
        const entryErrors = entryIssues.filter(issue => issue.severity === 'error');

        if (entryErrors.length === 0) {
            validContracts.push(c as ExportedContract);
        } else {
            invalidEntries.push({
                index: i,
                contract: c as Partial<ExportedContract>,
                issues: entryIssues,
            });
        }
    }

    // 3. Duplicate detection within the file
    detectDuplicates(validContracts, issues);

    // 4. Detect conflicts with existing contracts
    const existingIdSet = new Map<string, ExistingContract>();
    const existingAddrSet = new Map<string, ExistingContract>();
    for (const ec of existingContracts) {
        existingIdSet.set(ec.id, ec);
        if (ec.address && ec.address.length > 0) {
            existingAddrSet.set(ec.address, ec);
        }
    }

    const newContracts: ExportedContract[] = [];
    const conflicts: ImportConflict[] = [];

    for (const c of validContracts) {
        const idConflict = existingIdSet.get(c.id);
        const addrConflict = c.address ? existingAddrSet.get(c.address) : undefined;

        if (idConflict) {
            conflicts.push({
                importedContract: c,
                existingContract: idConflict,
                reason: 'duplicate_id',
                action: 'skip', // default; user can change
            });
        } else if (addrConflict) {
            conflicts.push({
                importedContract: c,
                existingContract: addrConflict,
                reason: 'duplicate_address',
                action: 'skip',
            });
        } else {
            newContracts.push(c);
        }
    }

    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');

    const preview: ImportPreview = {
        totalContracts: file.contracts.length,
        newContracts,
        conflicts,
        invalidEntries,
        warnings,
    };

    const valid = errors.length === 0;

    log.info(`[Import] Validation ${valid ? 'passed' : 'failed'}: ` +
        `${newContracts.length} new, ${conflicts.length} conflict(s), ` +
        `${invalidEntries.length} invalid, ${warnings.length} warning(s)`);

    return { valid, errors, warnings, preview };
}

// ═══════════════════════════════════════════════════════════════
// 4. APPLY IMPORT (Transactional)
// ═══════════════════════════════════════════════════════════════

export interface ImportTarget {
    /** Current contracts (will not be mutated). */
    currentContracts: ExistingContract[];
    /** Callback to persist the final contract list atomically. */
    applyContracts: (contracts: ExistingContract[]) => Promise<void>;
}

/**
 * Apply a validated import selection.
 *
 * This function is **transactional**: it builds the final state
 * in memory first, then calls `applyContracts` exactly once.
 * If `applyContracts` throws, no partial state is written.
 */
export async function applyImport(
    preview: ImportPreview,
    selection: ImportSelection,
    target: ImportTarget,
    logger?: ExportImportLogger,
): Promise<ImportApplyResult> {
    const log = logger || noop;
    const result: ImportApplyResult = {
        success: false,
        importedCount: 0,
        skippedCount: 0,
        overwrittenCount: 0,
        renamedCount: 0,
        errors: [],
    };

    log.info('[Import] Applying selected contracts…');

    try {
        // Build a mutable copy of the current state
        const finalContracts = [...target.currentContracts];
        const finalIdSet = new Map(finalContracts.map(c => [c.id, c]));

        // 1. New contracts (only those selected)
        for (const c of preview.newContracts) {
            if (!selection.selectedIds.includes(c.id)) {
                result.skippedCount++;
                continue;
            }
            finalContracts.push({
                id: c.id,
                name: c.name,
                address: c.address,
                network: c.network,
            });
            result.importedCount++;
        }

        // 2. Conflicting contracts (based on user's resolution)
        for (const conflict of preview.conflicts) {
            const cid = conflict.importedContract.id;
            if (!selection.selectedIds.includes(cid)) {
                result.skippedCount++;
                continue;
            }

            const action = selection.conflictResolutions[cid] || conflict.action;

            switch (action) {
                case 'skip':
                    result.skippedCount++;
                    break;

                case 'overwrite': {
                    const idx = finalContracts.findIndex(ec => ec.id === conflict.existingContract.id);
                    if (idx !== -1) {
                        finalContracts[idx] = {
                            id: conflict.importedContract.id,
                            name: conflict.importedContract.name,
                            address: conflict.importedContract.address,
                            network: conflict.importedContract.network,
                        };
                    }
                    result.overwrittenCount++;
                    break;
                }

                case 'rename': {
                    const newName = selection.renamedNames[cid]
                        || `${conflict.importedContract.name} (imported)`;
                    finalContracts.push({
                        id: `${cid}-imported-${Date.now()}`,
                        name: newName,
                        address: conflict.importedContract.address,
                        network: conflict.importedContract.network,
                    });
                    result.renamedCount++;
                    break;
                }

                default:
                    result.skippedCount++;
            }
        }

        // 3. Commit atomically
        await target.applyContracts(finalContracts);
        result.success = true;

        log.info(
            `[Import] Applied: ${result.importedCount} imported, ` +
            `${result.overwrittenCount} overwritten, ` +
            `${result.renamedCount} renamed, ` +
            `${result.skippedCount} skipped`
        );

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(msg);
        log.error(`[Import] Apply failed: ${msg}`);
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════
// 5. FORMAT PREVIEW (for display)
// ═══════════════════════════════════════════════════════════════

/**
 * Produce a human-readable summary of an import preview.
 */
export function formatImportPreview(preview: ImportPreview): string {
    const lines: string[] = [];

    lines.push(`Import Preview`);
    lines.push('─'.repeat(40));
    lines.push(`Total contracts in file: ${preview.totalContracts}`);
    lines.push(`  New (ready to import): ${preview.newContracts.length}`);
    lines.push(`  Conflicts:            ${preview.conflicts.length}`);
    lines.push(`  Invalid:              ${preview.invalidEntries.length}`);
    lines.push(`  Warnings:             ${preview.warnings.length}`);

    if (preview.newContracts.length > 0) {
        lines.push('');
        lines.push('New contracts:');
        for (const c of preview.newContracts) {
            lines.push(`  ✔ ${c.name} (${c.network}) ${c.address ? `[${c.address.slice(0, 12)}…]` : '[local]'}`);
        }
    }

    if (preview.conflicts.length > 0) {
        lines.push('');
        lines.push('Conflicts:');
        for (const cf of preview.conflicts) {
            lines.push(`  ⚠ ${cf.importedContract.name} — ${cf.reason === 'duplicate_id' ? 'duplicate ID' : 'duplicate address'} with "${cf.existingContract.name}"`);
        }
    }

    if (preview.invalidEntries.length > 0) {
        lines.push('');
        lines.push('Invalid entries:');
        for (const inv of preview.invalidEntries) {
            const name = inv.contract.name || `#${inv.index + 1}`;
            lines.push(`  ✘ ${name}: ${inv.issues.map(i => i.message).join('; ')}`);
        }
    }

    return lines.join('\n');
}
