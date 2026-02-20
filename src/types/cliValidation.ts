// ============================================================
// src/types/cliValidation.ts
// Shared type definitions for CLI validation and pre-flight
// check system.
// ============================================================

// ── Parameter Schema Types ────────────────────────────────────

export type ParameterType = 'string' | 'number' | 'boolean' | 'enum' | 'path';

export interface ParameterSchema {
    /** Parameter name (e.g., '--network', 'contractId') */
    name: string;
    /** Display label for error messages */
    label?: string;
    /** Expected value type */
    type: ParameterType;
    /** Whether the parameter is required */
    required: boolean;
    /** Default value when omitted */
    defaultValue?: string | number | boolean;
    /** Description shown in usage/help text */
    description?: string;
    /** Regex pattern for string format validation */
    pattern?: RegExp;
    /** Human-friendly description of the expected pattern */
    patternDescription?: string;
    /** Allowed values for enum type */
    enumValues?: string[];
    /** Numeric range constraints for number type */
    min?: number;
    max?: number;
    /** Parameter names that are mutually exclusive with this one */
    mutuallyExclusiveWith?: string[];
    /** Parameter names that must be present when this one is present */
    dependsOn?: string[];
}

export interface CommandSchema {
    /** Command name / identifier (e.g., 'deploy', 'build') */
    name: string;
    /** Human-readable description */
    description?: string;
    /** Expected usage string */
    usage?: string;
    /** The sub-commands / positional arguments */
    positionalArgs?: ParameterSchema[];
    /** Named flags / options */
    flags?: ParameterSchema[];
    /** Known flag aliases (e.g., { '-n': '--network' }) */
    aliases?: Record<string, string>;
    /** Whether the command requires a network connection */
    requiresNetwork?: boolean;
    /** Whether the command requires the Stellar CLI binary */
    requiresCli?: boolean;
    /** Required environment variables */
    requiredEnvVars?: string[];
    /** Required configuration files (relative or absolute paths) */
    requiredConfigFiles?: string[];
    /** Minimum Node.js major version required */
    minNodeVersion?: number;
}

// ── Validation Result Types ───────────────────────────────────

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
    /** Severity level */
    severity: ValidationSeverity;
    /** Machine-readable issue code (e.g., 'MISSING_PARAMETER') */
    code: string;
    /** Human-readable message */
    message: string;
    /** Actionable suggestion for the user */
    suggestion?: string;
    /** The parameter or field this issue relates to */
    field?: string;
    /** The value that caused the issue */
    receivedValue?: string;
    /** The expected value / format */
    expectedValue?: string;
}

export interface ValidationResult {
    /** Whether validation passed (no errors, warnings are OK) */
    valid: boolean;
    /** All issues found during validation */
    issues: ValidationIssue[];
    /** Convenience: only error-level issues */
    errors: ValidationIssue[];
    /** Convenience: only warning-level issues */
    warnings: ValidationIssue[];
}

// ── Pre-Flight Check Types ────────────────────────────────────

export type PreFlightCheckStatus = 'passed' | 'failed' | 'skipped' | 'warning';

export interface PreFlightCheckResult {
    /** Machine-readable check identifier */
    checkId: string;
    /** Human-readable label */
    label: string;
    /** Result status */
    status: PreFlightCheckStatus;
    /** Optional detail message */
    message?: string;
    /** Duration in milliseconds */
    durationMs: number;
    /** Nested issues (if any) */
    issues?: ValidationIssue[];
}

export interface PreFlightReport {
    /** Overall pass / fail */
    passed: boolean;
    /** Whether this was a dry-run execution */
    dryRun: boolean;
    /** The command that was (or would be) executed */
    command: string;
    /** Individual check results, in execution order */
    checks: PreFlightCheckResult[];
    /** Total duration of all checks in milliseconds */
    totalDurationMs: number;
    /** The full command string that would execute */
    resolvedCommandLine?: string;
    /** Timestamp of the report */
    timestamp: string;
}

// ── Logger Interface ──────────────────────────────────────────

export interface ValidationLogger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    debug(message: string): void;
}

// ── Check Pipeline Types ──────────────────────────────────────

/**
 * A single, self-contained pre-flight check.
 * Checks are composable and independently testable.
 */
export interface PreFlightCheck {
    /** Unique identifier */
    id: string;
    /** Human-readable label */
    label: string;
    /**
     * Execute the check and return a result.
     * Implementations must never throw — they should catch
     * errors internally and return a failed PreFlightCheckResult.
     */
    execute(context: PreFlightContext): Promise<PreFlightCheckResult>;
}

export interface PreFlightContext {
    /** The resolved command schema */
    commandSchema: CommandSchema;
    /** Raw parameters supplied by the user */
    parameters: Record<string, string | number | boolean | undefined>;
    /** Resolved CLI configuration */
    cliPath: string;
    /** Network name */
    network: string;
    /** Source identity */
    source: string;
    /** RPC URL */
    rpcUrl: string;
    /** Whether dry-run mode is active */
    dryRun: boolean;
    /** Logger */
    logger: ValidationLogger;
}
