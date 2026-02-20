// ============================================================
// src/services/environmentValidator.ts
// Environment validation — checks env vars, config files,
// runtime compatibility, and permissions.
// ============================================================

import {
    CommandSchema,
    ValidationIssue,
    ValidationResult,
    ValidationLogger,
} from '../types/cliValidation';
import * as fs from 'fs';
import * as path from 'path';

// ── Helpers ───────────────────────────────────────────────────

function createIssue(
    code: string,
    message: string,
    options?: Partial<ValidationIssue>,
): ValidationIssue {
    return {
        severity: 'error',
        code,
        message,
        ...options,
    };
}

function buildResult(issues: ValidationIssue[]): ValidationResult {
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    return {
        valid: errors.length === 0,
        issues,
        errors,
        warnings,
    };
}

// ── Environment Variable Checks ───────────────────────────────

function validateEnvironmentVariables(
    requiredVars: string[],
    logger?: ValidationLogger,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const varName of requiredVars) {
        const value = process.env[varName];
        if (value === undefined || value.trim() === '') {
            logger?.warn(`[EnvironmentValidator] Missing environment variable: ${varName}`);
            issues.push(createIssue(
                'MISSING_ENV_VAR',
                `Required environment variable "${varName}" is not set.`,
                {
                    field: varName,
                    suggestion: `Set the environment variable: export ${varName}=<value>`,
                },
            ));
        } else {
            logger?.debug(`[EnvironmentValidator] ✔ ${varName} is set`);
        }
    }

    return issues;
}

// ── Configuration File Checks ─────────────────────────────────

function validateConfigFiles(
    requiredFiles: string[],
    basePath?: string,
    logger?: ValidationLogger,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const filePath of requiredFiles) {
        const resolvedPath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(basePath || process.cwd(), filePath);

        try {
            const stats = fs.statSync(resolvedPath);
            if (!stats.isFile()) {
                issues.push(createIssue(
                    'INVALID_CONFIG_FILE',
                    `"${filePath}" exists but is not a file.`,
                    {
                        field: filePath,
                        suggestion: `Ensure "${filePath}" is a regular file, not a directory.`,
                    },
                ));
            } else {
                logger?.debug(`[EnvironmentValidator] ✔ Config file found: ${filePath}`);
            }
        } catch {
            logger?.warn(`[EnvironmentValidator] Missing config file: ${filePath}`);
            issues.push(createIssue(
                'MISSING_CONFIG_FILE',
                `Required configuration file "${filePath}" not found.`,
                {
                    field: filePath,
                    suggestion: `Create or restore the file at: ${resolvedPath}`,
                },
            ));
        }
    }

    return issues;
}

// ── Node.js Version Check ─────────────────────────────────────

function validateNodeVersion(
    minMajor: number,
    logger?: ValidationLogger,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const match = process.version.match(/^v?(\d+)/);
    const currentMajor = match ? parseInt(match[1], 10) : 0;

    if (currentMajor < minMajor) {
        logger?.warn(`[EnvironmentValidator] Node.js version ${process.version} is below required v${minMajor}`);
        issues.push(createIssue(
            'UNSUPPORTED_NODE_VERSION',
            `Node.js ${process.version} is below the minimum required version (v${minMajor}).`,
            {
                receivedValue: process.version,
                expectedValue: `>= v${minMajor}.0.0`,
                suggestion: `Upgrade Node.js to v${minMajor} or higher.`,
            },
        ));
    } else {
        logger?.debug(`[EnvironmentValidator] ✔ Node.js ${process.version} meets minimum v${minMajor}`);
    }

    return issues;
}

// ── Public API ────────────────────────────────────────────────

export interface EnvironmentValidationOptions {
    /** Required environment variable names */
    requiredEnvVars?: string[];
    /** Required configuration file paths */
    requiredConfigFiles?: string[];
    /** Base path for resolving relative config file paths */
    configBasePath?: string;
    /** Minimum Node.js major version */
    minNodeVersion?: number;
    /** Logger */
    logger?: ValidationLogger;
}

/**
 * Validate environment prerequisites for a CLI command.
 */
export function validateEnvironment(options: EnvironmentValidationOptions): ValidationResult {
    const issues: ValidationIssue[] = [];
    const { logger } = options;

    logger?.debug('[EnvironmentValidator] Starting environment validation');

    // 1. Check environment variables
    if (options.requiredEnvVars && options.requiredEnvVars.length > 0) {
        issues.push(...validateEnvironmentVariables(options.requiredEnvVars, logger));
    }

    // 2. Check configuration files
    if (options.requiredConfigFiles && options.requiredConfigFiles.length > 0) {
        issues.push(...validateConfigFiles(
            options.requiredConfigFiles,
            options.configBasePath,
            logger,
        ));
    }

    // 3. Check Node.js version
    if (options.minNodeVersion !== undefined) {
        issues.push(...validateNodeVersion(options.minNodeVersion, logger));
    }

    const result = buildResult(issues);
    if (result.valid) {
        logger?.debug('[EnvironmentValidator] Environment validation passed');
    } else {
        logger?.warn(`[EnvironmentValidator] Environment validation failed: ${result.errors.length} error(s)`);
    }

    return result;
}

/**
 * Validate environment from a CommandSchema.
 */
export function validateEnvironmentForCommand(
    schema: CommandSchema,
    basePath?: string,
    logger?: ValidationLogger,
): ValidationResult {
    return validateEnvironment({
        requiredEnvVars: schema.requiredEnvVars,
        requiredConfigFiles: schema.requiredConfigFiles,
        configBasePath: basePath,
        minNodeVersion: schema.minNodeVersion,
        logger,
    });
}
