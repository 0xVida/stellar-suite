"use strict";
// ============================================================
// src/services/environmentValidator.ts
// Environment validation — checks env vars, config files,
// runtime compatibility, and permissions.
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
exports.validateEnvironment = validateEnvironment;
exports.validateEnvironmentForCommand = validateEnvironmentForCommand;
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
// ── Environment Variable Checks ───────────────────────────────
function validateEnvironmentVariables(requiredVars, logger) {
    const issues = [];
    for (const varName of requiredVars) {
        const value = process.env[varName];
        if (value === undefined || value.trim() === '') {
            logger?.warn(`[EnvironmentValidator] Missing environment variable: ${varName}`);
            issues.push(createIssue('MISSING_ENV_VAR', `Required environment variable "${varName}" is not set.`, {
                field: varName,
                suggestion: `Set the environment variable: export ${varName}=<value>`,
            }));
        }
        else {
            logger?.debug(`[EnvironmentValidator] ✔ ${varName} is set`);
        }
    }
    return issues;
}
// ── Configuration File Checks ─────────────────────────────────
function validateConfigFiles(requiredFiles, basePath, logger) {
    const issues = [];
    for (const filePath of requiredFiles) {
        const resolvedPath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(basePath || process.cwd(), filePath);
        try {
            const stats = fs.statSync(resolvedPath);
            if (!stats.isFile()) {
                issues.push(createIssue('INVALID_CONFIG_FILE', `"${filePath}" exists but is not a file.`, {
                    field: filePath,
                    suggestion: `Ensure "${filePath}" is a regular file, not a directory.`,
                }));
            }
            else {
                logger?.debug(`[EnvironmentValidator] ✔ Config file found: ${filePath}`);
            }
        }
        catch {
            logger?.warn(`[EnvironmentValidator] Missing config file: ${filePath}`);
            issues.push(createIssue('MISSING_CONFIG_FILE', `Required configuration file "${filePath}" not found.`, {
                field: filePath,
                suggestion: `Create or restore the file at: ${resolvedPath}`,
            }));
        }
    }
    return issues;
}
// ── Node.js Version Check ─────────────────────────────────────
function validateNodeVersion(minMajor, logger) {
    const issues = [];
    const match = process.version.match(/^v?(\d+)/);
    const currentMajor = match ? parseInt(match[1], 10) : 0;
    if (currentMajor < minMajor) {
        logger?.warn(`[EnvironmentValidator] Node.js version ${process.version} is below required v${minMajor}`);
        issues.push(createIssue('UNSUPPORTED_NODE_VERSION', `Node.js ${process.version} is below the minimum required version (v${minMajor}).`, {
            receivedValue: process.version,
            expectedValue: `>= v${minMajor}.0.0`,
            suggestion: `Upgrade Node.js to v${minMajor} or higher.`,
        }));
    }
    else {
        logger?.debug(`[EnvironmentValidator] ✔ Node.js ${process.version} meets minimum v${minMajor}`);
    }
    return issues;
}
/**
 * Validate environment prerequisites for a CLI command.
 */
function validateEnvironment(options) {
    const issues = [];
    const { logger } = options;
    logger?.debug('[EnvironmentValidator] Starting environment validation');
    // 1. Check environment variables
    if (options.requiredEnvVars && options.requiredEnvVars.length > 0) {
        issues.push(...validateEnvironmentVariables(options.requiredEnvVars, logger));
    }
    // 2. Check configuration files
    if (options.requiredConfigFiles && options.requiredConfigFiles.length > 0) {
        issues.push(...validateConfigFiles(options.requiredConfigFiles, options.configBasePath, logger));
    }
    // 3. Check Node.js version
    if (options.minNodeVersion !== undefined) {
        issues.push(...validateNodeVersion(options.minNodeVersion, logger));
    }
    const result = buildResult(issues);
    if (result.valid) {
        logger?.debug('[EnvironmentValidator] Environment validation passed');
    }
    else {
        logger?.warn(`[EnvironmentValidator] Environment validation failed: ${result.errors.length} error(s)`);
    }
    return result;
}
/**
 * Validate environment from a CommandSchema.
 */
function validateEnvironmentForCommand(schema, basePath, logger) {
    return validateEnvironment({
        requiredEnvVars: schema.requiredEnvVars,
        requiredConfigFiles: schema.requiredConfigFiles,
        configBasePath: basePath,
        minNodeVersion: schema.minNodeVersion,
        logger,
    });
}
