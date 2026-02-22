// ============================================================
// src/types/contractAbi.ts
// Type definitions for contract ABI generation, storage,
// validation, and import/export.
// No vscode dependency — pure TypeScript types.
// ============================================================

import { AbiParameter } from '../utils/abiParser';

// ── Schema version ────────────────────────────────────────────

/** Current ABI schema version. Bump when the shape changes. */
export const ABI_SCHEMA_VERSION = 1;

// ── Core ABI types ────────────────────────────────────────────

/** A single function entry within a contract's ABI. */
export interface AbiFunctionEntry {
    /** Function name as declared in the contract. */
    name: string;
    /** Parsed parameters with full Soroban type information. */
    parameters: AbiParameter[];
    /** Human-readable description of the function (if available). */
    description?: string;
}

/** Complete ABI representation for a Soroban contract. */
export interface ContractAbi {
    /** ABI schema version for forward compatibility. */
    schemaVersion: number;
    /** On-chain contract ID (C… or hash). */
    contractId: string;
    /** Semantic version label, e.g. "1.0.0" or auto-generated. */
    version: string;
    /** All public functions exposed by the contract. */
    functions: AbiFunctionEntry[];
    /** ISO-8601 timestamp when this ABI was generated. */
    generatedAt: string;
    /** Stellar network used when generating (e.g. "testnet"). */
    network?: string;
    /** Source identity used when generating (e.g. "dev"). */
    source?: string;
}

// ── Storage types ─────────────────────────────────────────────

/** Wrapper stored in workspace state for each ABI. */
export interface AbiStorageEntry {
    /** The full ABI object. */
    abi: ContractAbi;
    /** Content hash used for staleness detection. */
    contentHash: string;
    /** ISO-8601 timestamp of when this entry was last stored. */
    storedAt: string;
}

// ── Import / Export ───────────────────────────────────────────

/** JSON envelope used when exporting one or more ABIs. */
export interface AbiExportPayload {
    format: 'stellarSuite.contractAbi';
    exportedAt: string;
    abis: ContractAbi[];
}

// ── Validation ────────────────────────────────────────────────

/** Result of structural ABI validation. */
export interface AbiValidationResult {
    valid: boolean;
    errors: string[];
}
