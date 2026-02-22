// ============================================================
// src/types/envVariable.ts
// Shared type definitions for CLI environment variable
// management, profiles, validation, and import/export.
// ============================================================

// ── Core Types ───────────────────────────────────────────────

/**
 * A single environment variable entry.
 */
export interface EnvVariable {
    /** Variable name (e.g., STELLAR_SECRET_KEY) */
    name: string;
    /** Variable value */
    value: string;
    /** Whether the value should be masked in UI / exports */
    sensitive?: boolean;
}

/**
 * A named collection of environment variables.
 */
export interface EnvVariableProfile {
    /** Unique identifier */
    id: string;
    /** Human-readable profile name */
    name: string;
    /** Optional description */
    description?: string;
    /** Environment variables in this profile */
    variables: EnvVariable[];
    /** ISO-8601 creation timestamp */
    createdAt: string;
    /** ISO-8601 last-update timestamp */
    updatedAt: string;
}

// ── Validation Types ─────────────────────────────────────────

export interface EnvVariableValidation {
    /** Whether validation passed (no errors, warnings are OK) */
    valid: boolean;
    /** Error messages */
    errors: string[];
    /** Warning messages */
    warnings: string[];
}

// ── Store Types ──────────────────────────────────────────────

export interface EnvVariableStoreState {
    version: number;
    activeProfileId?: string;
    profiles: EnvVariableProfile[];
}

// ── Import / Export Types ────────────────────────────────────

export interface EnvVariableImportResult {
    /** Number of newly imported profiles */
    imported: number;
    /** Number of existing profiles replaced */
    replaced: number;
    /** Number of profiles skipped (duplicate, not replacing) */
    skipped: number;
    /** Active profile ID after import */
    activeProfileId?: string;
}

// ── Constants ────────────────────────────────────────────────

/** Regex for a valid POSIX environment variable name */
export const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Stellar-specific variable names that are typically sensitive */
export const SENSITIVE_ENV_VAR_NAMES = new Set([
    'STELLAR_SECRET_KEY',
    'STELLAR_SEED',
    'SOROBAN_SECRET_KEY',
    'SECRET_KEY',
    'PRIVATE_KEY',
]);
