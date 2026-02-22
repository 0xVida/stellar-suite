// ============================================================
// src/services/contractAbiService.ts
// Generates, stores, validates, imports, and exports contract
// ABIs from parsed function signatures.
// No vscode dependency — pure TypeScript service.
// ============================================================

import { ContractFunction } from './contractInspector';
import { parseParameters } from '../utils/abiParser';
import {
    ABI_SCHEMA_VERSION,
    AbiFunctionEntry,
    AbiExportPayload,
    AbiStorageEntry,
    AbiValidationResult,
    ContractAbi,
} from '../types/contractAbi';

// ── Minimal VS Code-compatible interfaces ─────────────────────
//
// Structural interfaces keep this service testable in plain
// Node.js without the VS Code extension host.

interface SimpleOutputChannel {
    appendLine(value: string): void;
}

interface SimpleWorkspaceState {
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
}

interface SimpleExtensionContext {
    workspaceState: SimpleWorkspaceState;
}

// ── Constants ─────────────────────────────────────────────────

const STORAGE_KEY = 'stellarSuite.contractAbis';

// ── Service class ─────────────────────────────────────────────

/**
 * ContractAbiService is responsible for:
 * - Generating ABI from ContractFunction[] (via abiParser)
 * - Storing and retrieving ABIs in workspace state
 * - Versioning and staleness detection
 * - Exporting / importing ABIs as JSON
 * - Structural validation of ABI objects
 */
export class ContractAbiService {
    private readonly outputChannel: SimpleOutputChannel;

    constructor(
        private readonly context: SimpleExtensionContext,
        outputChannel?: SimpleOutputChannel
    ) {
        this.outputChannel = outputChannel ?? {
            appendLine: (_msg: string) => { /* no-op outside VS Code */ },
        };
    }

    // ── Generation ────────────────────────────────────────────

    /**
     * Generate a ContractAbi from an array of ContractFunction[].
     * Each function's parameters are parsed via `parseParameters()`.
     */
    public generateAbi(
        contractId: string,
        functions: ContractFunction[],
        opts?: { version?: string; network?: string; source?: string }
    ): ContractAbi {
        const abiFunctions: AbiFunctionEntry[] = functions.map(fn => ({
            name: fn.name,
            parameters: parseParameters(fn.parameters),
            description: fn.description,
        }));

        const abi: ContractAbi = {
            schemaVersion: ABI_SCHEMA_VERSION,
            contractId,
            version: opts?.version ?? '1.0.0',
            functions: abiFunctions,
            generatedAt: new Date().toISOString(),
            network: opts?.network,
            source: opts?.source,
        };

        this.log(`[ABI] Generated ABI for ${contractId} with ${abiFunctions.length} function(s)`);
        return abi;
    }

    // ── Storage ───────────────────────────────────────────────

    /**
     * Store an ABI in workspace state, replacing any existing
     * entry for the same contractId.
     */
    public async storeAbi(abi: ContractAbi): Promise<void> {
        const all = this.loadAll();
        const entry: AbiStorageEntry = {
            abi,
            contentHash: this.computeHash(abi),
            storedAt: new Date().toISOString(),
        };
        all[abi.contractId] = entry;
        await this.saveAll(all);
        this.log(`[ABI] Stored ABI for ${abi.contractId}`);
    }

    /** Retrieve a stored ABI by contractId, or undefined. */
    public getAbi(contractId: string): ContractAbi | undefined {
        const all = this.loadAll();
        return all[contractId]?.abi;
    }

    /** Get all stored ABIs. */
    public getAllAbis(): ContractAbi[] {
        const all = this.loadAll();
        return Object.values(all).map(e => e.abi);
    }

    /** Remove a stored ABI by contractId. Returns true if found. */
    public async removeAbi(contractId: string): Promise<boolean> {
        const all = this.loadAll();
        if (!(contractId in all)) { return false; }
        delete all[contractId];
        await this.saveAll(all);
        this.log(`[ABI] Removed ABI for ${contractId}`);
        return true;
    }

    /** Clear all stored ABIs. */
    public async clearAllAbis(): Promise<void> {
        await this.saveAll({});
        this.log('[ABI] Cleared all stored ABIs');
    }

    // ── Export / Import ───────────────────────────────────────

    /**
     * Export a single ABI as a JSON string.
     * Returns undefined if not found.
     */
    public exportAbi(contractId: string): string | undefined {
        const abi = this.getAbi(contractId);
        if (!abi) { return undefined; }

        const payload: AbiExportPayload = {
            format: 'stellarSuite.contractAbi',
            exportedAt: new Date().toISOString(),
            abis: [abi],
        };
        return JSON.stringify(payload, null, 2);
    }

    /** Export all stored ABIs as a JSON string. */
    public exportAllAbis(): string {
        const payload: AbiExportPayload = {
            format: 'stellarSuite.contractAbi',
            exportedAt: new Date().toISOString(),
            abis: this.getAllAbis(),
        };
        return JSON.stringify(payload, null, 2);
    }

    /**
     * Import ABIs from a JSON string. Validates format and each
     * ABI before storing. Returns count of successfully imported ABIs.
     */
    public async importAbi(json: string): Promise<{ imported: number; errors: string[] }> {
        const errors: string[] = [];
        let payload: AbiExportPayload;

        try {
            payload = JSON.parse(json) as AbiExportPayload;
        } catch {
            return { imported: 0, errors: ['Invalid JSON'] };
        }

        if (payload.format !== 'stellarSuite.contractAbi') {
            return { imported: 0, errors: ['Invalid format: expected stellarSuite.contractAbi'] };
        }

        if (!Array.isArray(payload.abis)) {
            return { imported: 0, errors: ['Missing or invalid "abis" array'] };
        }

        let imported = 0;
        for (const abi of payload.abis) {
            const validation = this.validateAbi(abi);
            if (!validation.valid) {
                errors.push(`ABI for "${abi?.contractId ?? 'unknown'}": ${validation.errors.join('; ')}`);
                continue;
            }
            await this.storeAbi(abi);
            imported++;
        }

        this.log(`[ABI] Imported ${imported} ABI(s), ${errors.length} error(s)`);
        return { imported, errors };
    }

    // ── Validation ────────────────────────────────────────────

    /** Validate the structural integrity of a ContractAbi object. */
    public validateAbi(abi: unknown): AbiValidationResult {
        const errors: string[] = [];

        if (!abi || typeof abi !== 'object') {
            return { valid: false, errors: ['ABI must be a non-null object'] };
        }

        const a = abi as Record<string, unknown>;

        if (typeof a.schemaVersion !== 'number') {
            errors.push('Missing or invalid "schemaVersion" (expected number)');
        }
        if (typeof a.contractId !== 'string' || a.contractId.length === 0) {
            errors.push('Missing or empty "contractId"');
        }
        if (typeof a.version !== 'string' || a.version.length === 0) {
            errors.push('Missing or empty "version"');
        }
        if (typeof a.generatedAt !== 'string') {
            errors.push('Missing "generatedAt" timestamp');
        }
        if (!Array.isArray(a.functions)) {
            errors.push('Missing or invalid "functions" array');
        } else {
            for (let i = 0; i < a.functions.length; i++) {
                const fn = a.functions[i] as Record<string, unknown>;
                if (!fn || typeof fn !== 'object') {
                    errors.push(`functions[${i}]: must be an object`);
                    continue;
                }
                if (typeof fn.name !== 'string' || fn.name.length === 0) {
                    errors.push(`functions[${i}]: missing or empty "name"`);
                }
                if (!Array.isArray(fn.parameters)) {
                    errors.push(`functions[${i}]: missing or invalid "parameters" array`);
                }
            }
        }

        return { valid: errors.length === 0, errors };
    }

    // ── Staleness / Versioning ─────────────────────────────────

    /**
     * Check whether a stored ABI is stale compared to the current
     * set of contract functions. Returns true if the ABI should
     * be regenerated.
     */
    public isStale(contractId: string, currentFunctions: ContractFunction[]): boolean {
        const all = this.loadAll();
        const entry = all[contractId];
        if (!entry) { return true; }

        // Build a temporary ABI to compute its hash and compare.
        const tempAbi = this.generateAbi(contractId, currentFunctions, {
            version: entry.abi.version,
            network: entry.abi.network,
            source: entry.abi.source,
        });

        return this.computeHash(tempAbi) !== entry.contentHash;
    }

    /**
     * Refresh the ABI for a contract only if it is stale.
     * Returns the (possibly unchanged) ABI and a flag indicating
     * whether it was regenerated.
     */
    public async refreshAbi(
        contractId: string,
        functions: ContractFunction[],
        opts?: { version?: string; network?: string; source?: string }
    ): Promise<{ abi: ContractAbi; wasRefreshed: boolean }> {
        if (!this.isStale(contractId, functions)) {
            const existing = this.getAbi(contractId)!;
            return { abi: existing, wasRefreshed: false };
        }

        const abi = this.generateAbi(contractId, functions, opts);
        await this.storeAbi(abi);
        return { abi, wasRefreshed: true };
    }

    // ── Persistence helpers ───────────────────────────────────

    private loadAll(): Record<string, AbiStorageEntry> {
        return this.context.workspaceState.get<Record<string, AbiStorageEntry>>(
            STORAGE_KEY, {}
        );
    }

    private async saveAll(data: Record<string, AbiStorageEntry>): Promise<void> {
        await this.context.workspaceState.update(STORAGE_KEY, data);
    }

    // ── Hashing helper ────────────────────────────────────────

    /**
     * Compute a simple content hash for staleness detection.
     * Uses a deterministic subset of the ABI (functions + contractId)
     * so timestamps don't affect the hash.
     */
    private computeHash(abi: ContractAbi): string {
        const content = JSON.stringify({
            contractId: abi.contractId,
            functions: abi.functions.map(fn => ({
                name: fn.name,
                parameters: fn.parameters,
            })),
        });

        // Simple DJB2 hash — sufficient for local staleness checks.
        let hash = 5381;
        for (let i = 0; i < content.length; i++) {
            hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
        }
        return `djb2:${(hash >>> 0).toString(16)}`;
    }

    // ── Logging ───────────────────────────────────────────────

    private log(msg: string): void {
        this.outputChannel.appendLine(msg);
    }
}
