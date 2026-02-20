"use strict";
// ============================================================
// src/services/fileValidator.ts
// File path validation — existence, type, permissions, and
// path normalization.
// ============================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFilePath = validateFilePath;
exports.validateFilePaths = validateFilePaths;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ── Helpers ───────────────────────────────────────────────────
function createIssue(code, message, options) {
    return {
        severity: 'error',
        code,
        message,
        ...options,
    };
}
function buildResult(issues) {
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    return {
        valid: errors.length === 0,
        issues,
        errors,
        warnings,
    };
}
// ── Single File Validation ────────────────────────────────────
function resolveFilePath(rule) {
    if (path.isAbsolute(rule.filePath)) {
        return path.normalize(rule.filePath);
    }
    const base = rule.basePath || process.cwd();
    return path.resolve(base, rule.filePath);
}
function checkExistence(resolved, rule) {
    try {
        fs.accessSync(resolved, fs.constants.F_OK);
        return undefined;
    }
    catch {
        const label = rule.label || rule.filePath;
        return createIssue('FILE_NOT_FOUND', `File not found: "${label}" (resolved: ${resolved})`, {
            field: rule.filePath,
            suggestion: `Ensure the file exists at: ${resolved}`,
        });
    }
}
function checkFileType(resolved, rule) {
    if (!rule.expectedType || rule.expectedType === 'any') {
        return undefined;
    }
    try {
        const stats = fs.statSync(resolved);
        if (rule.expectedType === 'file' && !stats.isFile()) {
            return createIssue('NOT_A_FILE', `"${rule.label || rule.filePath}" is not a regular file.`, {
                field: rule.filePath,
                suggestion: `Provide a path to a file, not a directory.`,
            });
        }
        if (rule.expectedType === 'directory' && !stats.isDirectory()) {
            return createIssue('NOT_A_DIRECTORY', `"${rule.label || rule.filePath}" is not a directory.`, {
                field: rule.filePath,
                suggestion: `Provide a path to a directory.`,
            });
        }
    }
    catch {
        // Existence already checked — skip
    }
    return undefined;
}
function checkExtension(resolved, rule) {
    if (!rule.allowedExtensions || rule.allowedExtensions.length === 0) {
        return undefined;
    }
    const ext = path.extname(resolved).toLowerCase();
    const allowed = rule.allowedExtensions.map(e => e.toLowerCase());
    if (!allowed.includes(ext)) {
        return createIssue('INVALID_FILE_EXTENSION', `Invalid file type "${ext}" for "${rule.label || rule.filePath}".`, {
            field: rule.filePath,
            receivedValue: ext || '(no extension)',
            expectedValue: rule.allowedExtensions.join(', '),
            suggestion: `Allowed file types: ${rule.allowedExtensions.join(', ')}`,
        });
    }
    return undefined;
}
function checkPermissions(resolved, rule) {
    const issues = [];
    if (!rule.permissions || rule.permissions.length === 0) {
        return issues;
    }
    const permMap = {
        read: fs.constants.R_OK,
        write: fs.constants.W_OK,
        execute: fs.constants.X_OK,
    };
    for (const perm of rule.permissions) {
        try {
            fs.accessSync(resolved, permMap[perm]);
        }
        catch {
            issues.push(createIssue('INSUFFICIENT_PERMISSION', `Insufficient ${perm} permission for "${rule.label || rule.filePath}".`, {
                field: rule.filePath,
                suggestion: `Grant ${perm} permission to: ${resolved}`,
            }));
        }
    }
    return issues;
}
// ── Public API ────────────────────────────────────────────────
/**
 * Validate a single file path.
 */
function validateFilePath(rule, logger) {
    const issues = [];
    const label = rule.label || rule.filePath;
    const mustExist = rule.mustExist !== false;
    logger?.debug(`[FileValidator] Validating file: ${label}`);
    // Empty path check
    if (!rule.filePath || rule.filePath.trim() === '') {
        issues.push(createIssue('EMPTY_PATH', `File path is empty for "${label}".`, {
            field: rule.filePath,
            suggestion: 'Provide a valid file path.',
        }));
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
    }
    else {
        logger?.warn(`[FileValidator] ✘ ${label} has ${result.errors.length} issue(s)`);
    }
    return result;
}
/**
 * Validate multiple file paths.
 */
function validateFilePaths(rules, logger) {
    const issues = [];
    for (const rule of rules) {
        const result = validateFilePath(rule, logger);
        issues.push(...result.issues);
    }
    return buildResult(issues);
}
