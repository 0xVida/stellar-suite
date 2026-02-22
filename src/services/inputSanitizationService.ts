// ============================================================
// src/services/inputSanitizationService.ts
// Input sanitization service for Stellar Suite.
// Sanitizes user inputs before processing and submission to
// prevent malicious input and ensure data safety.
// ============================================================

// ── Types ─────────────────────────────────────────────────────

/** Severity level for sanitization log entries */
export type SanitizationLogLevel = 'info' | 'warn' | 'error';

/** A single sanitization log entry */
export interface SanitizationLogEntry {
    level: SanitizationLogLevel;
    field: string;
    message: string;
    originalValue?: string;
    sanitizedValue?: string;
    timestamp: string;
}

/** Result of a sanitization operation */
export interface SanitizationResult<T = string> {
    /** Whether the sanitized value is safe to use */
    valid: boolean;
    /** The sanitized (cleaned) value */
    sanitizedValue: T;
    /** Human-readable errors that prevent use of the value */
    errors: string[];
    /** Non-blocking warnings about the input */
    warnings: string[];
    /** Log entries produced during sanitization */
    logs: SanitizationLogEntry[];
    /** Whether the original value was modified during sanitization */
    wasModified: boolean;
}

/** A custom sanitization rule */
export interface SanitizationRule {
    /** Unique identifier for the rule */
    id: string;
    /** Human-readable description */
    description: string;
    /**
     * Apply the rule to a value.
     * Return the (possibly modified) value, or throw to signal an error.
     */
    apply(value: string, field: string): string;
}

/** Options for sanitizing a string field */
export interface SanitizeStringOptions {
    /** Field name used in log messages */
    field?: string;
    /** Maximum allowed length (default: 4096) */
    maxLength?: number;
    /** Minimum required length (default: 0) */
    minLength?: number;
    /** Whether to trim leading/trailing whitespace (default: true) */
    trim?: boolean;
    /** Whether to strip null bytes (default: true) */
    stripNullBytes?: boolean;
    /** Whether to strip control characters except newline/tab (default: true) */
    stripControlChars?: boolean;
    /** Whether to normalize Unicode to NFC form (default: true) */
    normalizeUnicode?: boolean;
    /** Whether to allow newlines in the value (default: false) */
    allowNewlines?: boolean;
    /** Additional custom rules to apply */
    customRules?: SanitizationRule[];
}

/** Options for sanitizing a contract ID */
export interface SanitizeContractIdOptions {
    field?: string;
}

/** Options for sanitizing a network name */
export interface SanitizeNetworkOptions {
    field?: string;
    /** Allowed network names (default: ['testnet', 'mainnet', 'futurenet', 'local', 'standalone']) */
    allowedNetworks?: string[];
}

/** Options for sanitizing a file path */
export interface SanitizePathOptions {
    field?: string;
    /** Whether to allow absolute paths (default: true) */
    allowAbsolute?: boolean;
    /** Whether to allow path traversal sequences (default: false) */
    allowTraversal?: boolean;
}

/** Options for sanitizing a JSON string */
export interface SanitizeJsonOptions {
    field?: string;
    /** Maximum depth of the parsed JSON object (default: 10) */
    maxDepth?: number;
    /** Maximum number of keys in any object (default: 100) */
    maxKeys?: number;
}

// ── Logger ────────────────────────────────────────────────────

export interface SanitizationLogger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

export class ConsoleSanitizationLogger implements SanitizationLogger {
    private readonly prefix: string;
    constructor(prefix = '[InputSanitization]') {
        this.prefix = prefix;
    }
    info(message: string): void { console.log(`${this.prefix} ${message}`); }
    warn(message: string): void { console.warn(`${this.prefix} ${message}`); }
    error(message: string): void { console.error(`${this.prefix} ${message}`); }
}

// ── Helpers ───────────────────────────────────────────────────

/** Measure the depth of a parsed JSON value */
function jsonDepth(value: unknown, current = 0): number {
    if (current > 20) { return current; } // guard against infinite recursion
    if (Array.isArray(value)) {
        if (value.length === 0) { return current + 1; }
        return Math.max(...value.map(v => jsonDepth(v, current + 1)));
    }
    if (value !== null && typeof value === 'object') {
        const vals = Object.values(value as Record<string, unknown>);
        if (vals.length === 0) { return current + 1; }
        return Math.max(...vals.map(v => jsonDepth(v, current + 1)));
    }
    return current;
}

/** Count the maximum number of keys in any object within a JSON value */
function maxObjectKeys(value: unknown): number {
    if (Array.isArray(value)) {
        return value.reduce<number>((acc, v) => Math.max(acc, maxObjectKeys(v)), 0);
    }
    if (value !== null && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const ownKeys = Object.keys(obj).length;
        const childMax = Object.values(obj).reduce<number>((acc, v) => Math.max(acc, maxObjectKeys(v)), 0);
        return Math.max(ownKeys, childMax);
    }
    return 0;
}

// ── Service ───────────────────────────────────────────────────

/**
 * InputSanitizationService
 *
 * Provides methods to sanitize and validate user-supplied inputs before
 * they are passed to CLI commands, stored in workspace state, or displayed
 * in the UI.  All methods are pure (no side-effects beyond logging) and
 * return a {@link SanitizationResult} that callers can inspect.
 */
export class InputSanitizationService {
    private readonly logger: SanitizationLogger;

    /** Default allowed network names */
    static readonly DEFAULT_ALLOWED_NETWORKS = [
        'testnet',
        'mainnet',
        'futurenet',
        'local',
        'standalone',
    ];

    constructor(logger?: SanitizationLogger) {
        this.logger = logger ?? new ConsoleSanitizationLogger();
    }

    // ── String sanitization ──────────────────────────────────

    /**
     * Sanitize a generic string input.
     *
     * Applies the following steps in order:
     * 1. Null / undefined guard → empty string
     * 2. Trim whitespace (optional)
     * 3. Strip null bytes
     * 4. Strip dangerous control characters
     * 5. Normalize Unicode (NFC)
     * 6. Enforce length constraints
     * 7. Apply custom rules
     */
    sanitizeString(
        value: unknown,
        options: SanitizeStringOptions = {},
    ): SanitizationResult<string> {
        const field = options.field ?? 'input';
        const logs: SanitizationLogEntry[] = [];
        const errors: string[] = [];
        const warnings: string[] = [];

        const addLog = (
            level: SanitizationLogLevel,
            message: string,
            original?: string,
            sanitized?: string,
        ): void => {
            const entry: SanitizationLogEntry = {
                level,
                field,
                message,
                originalValue: original,
                sanitizedValue: sanitized,
                timestamp: new Date().toISOString(),
            };
            logs.push(entry);
            this.logger[level](`[${field}] ${message}`);
        };

        // 1. Null / undefined guard
        if (value === null || value === undefined) {
            addLog('warn', 'Received null/undefined value; treating as empty string');
            return { valid: true, sanitizedValue: '', errors, warnings, logs, wasModified: true };
        }

        // Coerce to string
        let str = String(value);
        const original = str;

        // 2. Trim
        const trim = options.trim !== false;
        if (trim) {
            const trimmed = str.trim();
            if (trimmed !== str) {
                addLog('info', 'Trimmed leading/trailing whitespace', str, trimmed);
                str = trimmed;
            }
        }

        // 3. Strip null bytes
        const stripNull = options.stripNullBytes !== false;
        if (stripNull) {
            const cleaned = str.replace(/\0/g, '');
            if (cleaned !== str) {
                addLog('warn', 'Stripped null bytes from input', str, cleaned);
                str = cleaned;
            }
        }

        // 4. Strip control characters (keep \t and optionally \n)
        const stripCtrl = options.stripControlChars !== false;
        if (stripCtrl) {
            const allowNewlines = options.allowNewlines === true;
            // eslint-disable-next-line no-control-regex
            const pattern = allowNewlines
                ? /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g
                : /[\x00-\x08\x0A-\x1F\x7F]/g;
            const cleaned = str.replace(pattern, '');
            if (cleaned !== str) {
                addLog('warn', 'Stripped control characters from input', str, cleaned);
                str = cleaned;
            }
        }

        // 5. Normalize Unicode
        const normalizeUnicode = options.normalizeUnicode !== false;
        if (normalizeUnicode) {
            try {
                const normalized = str.normalize('NFC');
                if (normalized !== str) {
                    addLog('info', 'Normalized Unicode to NFC form', str, normalized);
                    str = normalized;
                }
            } catch (err) {
                addLog('error', `Unicode normalization failed: ${err instanceof Error ? err.message : String(err)}`);
                errors.push('Input contains invalid Unicode sequences.');
            }
        }

        // 6. Length constraints
        const maxLength = options.maxLength ?? 4096;
        const minLength = options.minLength ?? 0;

        if (str.length > maxLength) {
            addLog('error', `Input exceeds maximum length of ${maxLength} characters (got ${str.length})`, str);
            errors.push(`Input is too long (maximum ${maxLength} characters).`);
        }

        if (str.length < minLength) {
            addLog('error', `Input is shorter than minimum length of ${minLength} characters (got ${str.length})`, str);
            errors.push(`Input is too short (minimum ${minLength} characters).`);
        }

        // 7. Custom rules
        if (options.customRules) {
            for (const rule of options.customRules) {
                try {
                    const result = rule.apply(str, field);
                    if (result !== str) {
                        addLog('info', `Custom rule "${rule.id}" modified input`, str, result);
                        str = result;
                    }
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    addLog('error', `Custom rule "${rule.id}" rejected input: ${msg}`, str);
                    errors.push(`Validation rule "${rule.description}" failed: ${msg}`);
                }
            }
        }

        const wasModified = str !== original;
        if (wasModified && errors.length === 0) {
            addLog('info', 'Input was sanitized successfully', original, str);
        }

        return {
            valid: errors.length === 0,
            sanitizedValue: str,
            errors,
            warnings,
            logs,
            wasModified,
        };
    }

    // ── Contract ID sanitization ─────────────────────────────

    /**
     * Sanitize and validate a Stellar contract ID.
     *
     * A valid Stellar contract ID starts with 'C' and is exactly 56
     * alphanumeric uppercase characters (Stellar strkey format).
     */
    sanitizeContractId(
        value: unknown,
        options: SanitizeContractIdOptions = {},
    ): SanitizationResult<string> {
        const field = options.field ?? 'contractId';

        // First apply generic string sanitization
        const base = this.sanitizeString(value, {
            field,
            maxLength: 56,
            minLength: 1,
            trim: true,
            allowNewlines: false,
        });

        if (!base.valid) {
            return base;
        }

        const str = base.sanitizedValue.toUpperCase();
        const errors = [...base.errors];
        const logs = [...base.logs];

        if (!/^C[A-Z0-9]{55}$/.test(str)) {
            const msg = 'Invalid contract ID format (must start with "C" and be 56 uppercase alphanumeric characters)';
            logs.push({
                level: 'error',
                field,
                message: msg,
                originalValue: base.sanitizedValue,
                timestamp: new Date().toISOString(),
            });
            this.logger.error(`[${field}] ${msg}`);
            errors.push(msg);
        }

        return {
            valid: errors.length === 0,
            sanitizedValue: str,
            errors,
            warnings: base.warnings,
            logs,
            wasModified: base.wasModified || str !== base.sanitizedValue,
        };
    }

    // ── Network name sanitization ────────────────────────────

    /**
     * Sanitize and validate a network name.
     */
    sanitizeNetworkName(
        value: unknown,
        options: SanitizeNetworkOptions = {},
    ): SanitizationResult<string> {
        const field = options.field ?? 'network';
        const allowed = options.allowedNetworks ?? InputSanitizationService.DEFAULT_ALLOWED_NETWORKS;

        const base = this.sanitizeString(value, {
            field,
            maxLength: 64,
            minLength: 1,
            trim: true,
            allowNewlines: false,
        });

        if (!base.valid) {
            return base;
        }

        const str = base.sanitizedValue.toLowerCase();
        const errors = [...base.errors];
        const logs = [...base.logs];

        if (!allowed.includes(str)) {
            const msg = `Unknown network "${str}". Allowed values: ${allowed.join(', ')}`;
            logs.push({
                level: 'error',
                field,
                message: msg,
                originalValue: base.sanitizedValue,
                timestamp: new Date().toISOString(),
            });
            this.logger.error(`[${field}] ${msg}`);
            errors.push(msg);
        }

        return {
            valid: errors.length === 0,
            sanitizedValue: str,
            errors,
            warnings: base.warnings,
            logs,
            wasModified: base.wasModified || str !== base.sanitizedValue,
        };
    }

    // ── File path sanitization ───────────────────────────────

    /**
     * Sanitize and validate a file system path.
     *
     * By default, path traversal sequences (`..`) are rejected to prevent
     * directory traversal attacks.
     */
    sanitizePath(
        value: unknown,
        options: SanitizePathOptions = {},
    ): SanitizationResult<string> {
        const field = options.field ?? 'path';
        const allowTraversal = options.allowTraversal === true;

        const base = this.sanitizeString(value, {
            field,
            maxLength: 4096,
            minLength: 1,
            trim: true,
            allowNewlines: false,
            // Paths may contain control chars on some systems, but we still strip null bytes
            stripControlChars: true,
        });

        if (!base.valid) {
            return base;
        }

        const str = base.sanitizedValue;
        const errors = [...base.errors];
        const warnings = [...base.warnings];
        const logs = [...base.logs];

        // Reject path traversal
        if (!allowTraversal && /(^|[/\\])\.\.([/\\]|$)/.test(str)) {
            const msg = 'Path traversal sequences ("..") are not allowed';
            logs.push({
                level: 'error',
                field,
                message: msg,
                originalValue: str,
                timestamp: new Date().toISOString(),
            });
            this.logger.error(`[${field}] ${msg}`);
            errors.push(msg);
        }

        // Warn on absolute paths if not allowed
        if (options.allowAbsolute === false && /^([A-Za-z]:[/\\]|\/)/.test(str)) {
            const msg = 'Absolute paths are not permitted for this field';
            logs.push({
                level: 'warn',
                field,
                message: msg,
                originalValue: str,
                timestamp: new Date().toISOString(),
            });
            this.logger.warn(`[${field}] ${msg}`);
            warnings.push(msg);
        }

        return {
            valid: errors.length === 0,
            sanitizedValue: str,
            errors,
            warnings,
            logs,
            wasModified: base.wasModified,
        };
    }

    // ── JSON sanitization ────────────────────────────────────

    /**
     * Sanitize and validate a JSON string.
     *
     * Parses the JSON, checks depth and key count limits, then
     * re-serializes to a canonical form.
     */
    sanitizeJson(
        value: unknown,
        options: SanitizeJsonOptions = {},
    ): SanitizationResult<string> {
        const field = options.field ?? 'json';
        const maxDepth = options.maxDepth ?? 10;
        const maxKeys = options.maxKeys ?? 100;

        const base = this.sanitizeString(value, {
            field,
            maxLength: 65536,
            minLength: 1,
            trim: true,
            allowNewlines: true,
        });

        if (!base.valid) {
            return base;
        }

        const errors = [...base.errors];
        const warnings = [...base.warnings];
        const logs = [...base.logs];

        let parsed: unknown;
        try {
            parsed = JSON.parse(base.sanitizedValue);
        } catch (err) {
            const msg = `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`;
            logs.push({
                level: 'error',
                field,
                message: msg,
                originalValue: base.sanitizedValue,
                timestamp: new Date().toISOString(),
            });
            this.logger.error(`[${field}] ${msg}`);
            errors.push(msg);
            return {
                valid: false,
                sanitizedValue: base.sanitizedValue,
                errors,
                warnings,
                logs,
                wasModified: base.wasModified,
            };
        }

        // Depth check
        const depth = jsonDepth(parsed);
        if (depth > maxDepth) {
            const msg = `JSON nesting depth ${depth} exceeds maximum of ${maxDepth}`;
            logs.push({
                level: 'error',
                field,
                message: msg,
                timestamp: new Date().toISOString(),
            });
            this.logger.error(`[${field}] ${msg}`);
            errors.push(msg);
        }

        // Key count check
        const keys = maxObjectKeys(parsed);
        if (keys > maxKeys) {
            const msg = `JSON object has ${keys} keys which exceeds maximum of ${maxKeys}`;
            logs.push({
                level: 'error',
                field,
                message: msg,
                timestamp: new Date().toISOString(),
            });
            this.logger.error(`[${field}] ${msg}`);
            errors.push(msg);
        }

        // Re-serialize to canonical form (removes extra whitespace, sorts nothing)
        const canonical = JSON.stringify(parsed);
        const wasModified = base.wasModified || canonical !== base.sanitizedValue;

        if (wasModified && errors.length === 0) {
            logs.push({
                level: 'info',
                field,
                message: 'JSON re-serialized to canonical form',
                originalValue: base.sanitizedValue,
                sanitizedValue: canonical,
                timestamp: new Date().toISOString(),
            });
            this.logger.info(`[${field}] JSON re-serialized to canonical form`);
        }

        return {
            valid: errors.length === 0,
            sanitizedValue: errors.length === 0 ? canonical : base.sanitizedValue,
            errors,
            warnings,
            logs,
            wasModified,
        };
    }

    // ── Function name sanitization ───────────────────────────

    /**
     * Sanitize a Soroban contract function name.
     *
     * Function names must be valid Rust identifiers: start with a letter or
     * underscore, followed by letters, digits, or underscores.
     */
    sanitizeFunctionName(
        value: unknown,
        options: { field?: string } = {},
    ): SanitizationResult<string> {
        const field = options.field ?? 'functionName';

        const base = this.sanitizeString(value, {
            field,
            maxLength: 128,
            minLength: 1,
            trim: true,
            allowNewlines: false,
        });

        if (!base.valid) {
            return base;
        }

        const str = base.sanitizedValue;
        const errors = [...base.errors];
        const logs = [...base.logs];

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str)) {
            const msg = 'Function name must be a valid identifier (letters, digits, underscores; cannot start with a digit)';
            logs.push({
                level: 'error',
                field,
                message: msg,
                originalValue: str,
                timestamp: new Date().toISOString(),
            });
            this.logger.error(`[${field}] ${msg}`);
            errors.push(msg);
        }

        return {
            valid: errors.length === 0,
            sanitizedValue: str,
            errors,
            warnings: base.warnings,
            logs,
            wasModified: base.wasModified,
        };
    }

    // ── Environment variable sanitization ───────────────────

    /**
     * Sanitize an environment variable name.
     *
     * Env var names must consist of uppercase letters, digits, and underscores,
     * and must not start with a digit.
     */
    sanitizeEnvVarName(
        value: unknown,
        options: { field?: string } = {},
    ): SanitizationResult<string> {
        const field = options.field ?? 'envVarName';

        const base = this.sanitizeString(value, {
            field,
            maxLength: 256,
            minLength: 1,
            trim: true,
            allowNewlines: false,
        });

        if (!base.valid) {
            return base;
        }

        const str = base.sanitizedValue.toUpperCase();
        const errors = [...base.errors];
        const logs = [...base.logs];

        if (!/^[A-Z_][A-Z0-9_]*$/.test(str)) {
            const msg = 'Environment variable name must contain only uppercase letters, digits, and underscores, and must not start with a digit';
            logs.push({
                level: 'error',
                field,
                message: msg,
                originalValue: base.sanitizedValue,
                timestamp: new Date().toISOString(),
            });
            this.logger.error(`[${field}] ${msg}`);
            errors.push(msg);
        }

        return {
            valid: errors.length === 0,
            sanitizedValue: str,
            errors,
            warnings: base.warnings,
            logs,
            wasModified: base.wasModified || str !== base.sanitizedValue,
        };
    }

    /**
     * Sanitize an environment variable value.
     *
     * Env var values may contain most printable characters but must not
     * contain null bytes or unescaped shell metacharacters that could
     * enable injection.
     */
    sanitizeEnvVarValue(
        value: unknown,
        options: { field?: string } = {},
    ): SanitizationResult<string> {
        const field = options.field ?? 'envVarValue';

        const base = this.sanitizeString(value, {
            field,
            maxLength: 32768,
            trim: false, // preserve intentional leading/trailing spaces in values
            allowNewlines: true,
        });

        if (!base.valid) {
            return base;
        }

        const str = base.sanitizedValue;
        const warnings = [...base.warnings];
        const logs = [...base.logs];

        // Warn if value contains shell metacharacters that could be dangerous
        // when interpolated without quoting
        const dangerousChars = /[`$!;&|<>(){}[\]\\]/;
        if (dangerousChars.test(str)) {
            const msg = 'Environment variable value contains shell metacharacters; ensure it is properly quoted when used in shell commands';
            logs.push({
                level: 'warn',
                field,
                message: msg,
                timestamp: new Date().toISOString(),
            });
            this.logger.warn(`[${field}] ${msg}`);
            warnings.push(msg);
        }

        return {
            valid: base.errors.length === 0,
            sanitizedValue: str,
            errors: base.errors,
            warnings,
            logs,
            wasModified: base.wasModified,
        };
    }

    // ── Batch sanitization ───────────────────────────────────

    /**
     * Sanitize a record of key-value pairs (e.g., form fields).
     *
     * Each value is sanitized with {@link sanitizeString} using the key as
     * the field name.  Returns a map of field names to their results.
     */
    sanitizeFormFields(
        fields: Record<string, unknown>,
        perFieldOptions: Record<string, SanitizeStringOptions> = {},
    ): Record<string, SanitizationResult<string>> {
        const results: Record<string, SanitizationResult<string>> = {};
        for (const [key, val] of Object.entries(fields)) {
            results[key] = this.sanitizeString(val, {
                field: key,
                ...(perFieldOptions[key] ?? {}),
            });
        }
        return results;
    }

    /**
     * Returns true if all results in a batch are valid.
     */
    static allValid(results: Record<string, SanitizationResult>): boolean {
        return Object.values(results).every(r => r.valid);
    }

    /**
     * Collect all errors from a batch of results into a flat array.
     */
    static collectErrors(results: Record<string, SanitizationResult>): string[] {
        return Object.entries(results).flatMap(([field, r]) =>
            r.errors.map(e => `[${field}] ${e}`),
        );
    }
}
