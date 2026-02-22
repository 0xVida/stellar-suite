// ============================================================
// src/services/fileValidator.ts
// File path validation — existence, type, permissions, and
// path normalization.
// ============================================================

import {
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

// ── File Validation Options ───────────────────────────────────

export type FileExpectedType = 'file' | 'directory' | 'any';
export type FilePermission = 'read' | 'write' | 'execute';

export interface FileValidationRule {
    /** The file path to validate (relative or absolute) */
    filePath: string;
    /** Expected filesystem type */
    expectedType?: FileExpectedType;
    /** Required permissions to check */
    permissions?: FilePermission[];
    /** Allowed file extensions (e.g., ['.wasm', '.json']) */
    allowedExtensions?: string[];
    /** Human-readable field name for error messages */
    label?: string;
    /** Base directory for resolving relative paths */
    basePath?: string;
    /** Whether the file must exist (default: true) */
    mustExist?: boolean;
}

// ── Single File Validation ────────────────────────────────────

function resolveFilePath(rule: FileValidationRule): string {
    if (path.isAbsolute(rule.filePath)) {
        return path.normalize(rule.filePath);
    }
    const base = rule.basePath || process.cwd();
    return path.resolve(base, rule.filePath);
}

function checkExistence(resolved: string, rule: FileValidationRule): ValidationIssue | undefined {
    try {
        fs.accessSync(resolved, fs.constants.F_OK);
        return undefined;
    } catch {
        const label = rule.label || rule.filePath;
        return createIssue(
            'FILE_NOT_FOUND',
            `File not found: "${label}" (resolved: ${resolved})`,
            {
                field: rule.filePath,
                suggestion: `Ensure the file exists at: ${resolved}`,
            },
        );
    }
}

function checkFileType(
    resolved: string,
    rule: FileValidationRule,
): ValidationIssue | undefined {
    if (!rule.expectedType || rule.expectedType === 'any') {
        return undefined;
    }
    try {
        const stats = fs.statSync(resolved);
        if (rule.expectedType === 'file' && !stats.isFile()) {
            return createIssue(
                'NOT_A_FILE',
                `"${rule.label || rule.filePath}" is not a regular file.`,
                {
                    field: rule.filePath,
                    suggestion: `Provide a path to a file, not a directory.`,
                },
            );
        }
        if (rule.expectedType === 'directory' && !stats.isDirectory()) {
            return createIssue(
                'NOT_A_DIRECTORY',
                `"${rule.label || rule.filePath}" is not a directory.`,
                {
                    field: rule.filePath,
                    suggestion: `Provide a path to a directory.`,
                },
            );
        }
    } catch {
        // Existence already checked — skip
    }
    return undefined;
}

function checkExtension(
    resolved: string,
    rule: FileValidationRule,
): ValidationIssue | undefined {
    if (!rule.allowedExtensions || rule.allowedExtensions.length === 0) {
        return undefined;
    }
    const ext = path.extname(resolved).toLowerCase();
    const allowed = rule.allowedExtensions.map(e => e.toLowerCase());
    if (!allowed.includes(ext)) {
        return createIssue(
            'INVALID_FILE_EXTENSION',
            `Invalid file type "${ext}" for "${rule.label || rule.filePath}".`,
            {
                field: rule.filePath,
                receivedValue: ext || '(no extension)',
                expectedValue: rule.allowedExtensions.join(', '),
                suggestion: `Allowed file types: ${rule.allowedExtensions.join(', ')}`,
            },
        );
    }
    return undefined;
}

function checkPermissions(
    resolved: string,
    rule: FileValidationRule,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!rule.permissions || rule.permissions.length === 0) {
        return issues;
    }

    const permMap: Record<FilePermission, number> = {
        read: fs.constants.R_OK,
        write: fs.constants.W_OK,
        execute: fs.constants.X_OK,
    };

    for (const perm of rule.permissions) {
        try {
            fs.accessSync(resolved, permMap[perm]);
        } catch {
            issues.push(createIssue(
                'INSUFFICIENT_PERMISSION',
                `Insufficient ${perm} permission for "${rule.label || rule.filePath}".`,
                {
                    field: rule.filePath,
                    suggestion: `Grant ${perm} permission to: ${resolved}`,
                },
            ));
        }
    }
    return issues;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Validate a single file path.
 */
export function validateFilePath(
    rule: FileValidationRule,
    logger?: ValidationLogger,
): ValidationResult {
    const issues: ValidationIssue[] = [];
    const label = rule.label || rule.filePath;
    const mustExist = rule.mustExist !== false;

    logger?.debug(`[FileValidator] Validating file: ${label}`);

    // Empty path check
    if (!rule.filePath || rule.filePath.trim() === '') {
        issues.push(createIssue(
            'EMPTY_PATH',
            `File path is empty for "${label}".`,
            {
                field: rule.filePath,
                suggestion: 'Provide a valid file path.',
            },
        ));
        return buildResult(issues);
    }

    const resolved = resolveFilePath(rule);

    // Existence
    if (mustExist) {
        const existsIssue = checkExistence(resolved, rule);
        if (existsIssue) {
            issues.push(existsIssue);
            return buildResult(issues); // Early exit — no point checking further
        }
    }

    // Type
    const typeIssue = checkFileType(resolved, rule);
    if (typeIssue) {
        issues.push(typeIssue);
    }

    // Extension
    const extIssue = checkExtension(resolved, rule);
    if (extIssue) {
        issues.push(extIssue);
    }

    // Permissions
    issues.push(...checkPermissions(resolved, rule));

    const result = buildResult(issues);
    if (result.valid) {
        logger?.debug(`[FileValidator] ✔ ${label} is valid`);
    } else {
        logger?.warn(`[FileValidator] ✘ ${label} has ${result.errors.length} issue(s)`);
    }

    return result;
}

/**
 * Validate multiple file paths.
 */
export function validateFilePaths(
    rules: FileValidationRule[],
    logger?: ValidationLogger,
): ValidationResult {
    const issues: ValidationIssue[] = [];

    for (const rule of rules) {
        const result = validateFilePath(rule, logger);
        issues.push(...result.issues);
    }

    return buildResult(issues);
}
