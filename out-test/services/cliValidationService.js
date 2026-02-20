"use strict";
// ============================================================
// src/services/cliValidationService.ts
// Central CLI validation orchestration service.
// Composes all validation modules and provides predefined
// command schemas for Stellar CLI operations.
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
exports.COMMAND_SCHEMAS = exports.ConsoleValidationLogger = void 0;
exports.validateCommand = validateCommand;
exports.formatValidationResult = formatValidationResult;
const parameterValidator_1 = require("./parameterValidator");
const environmentValidator_1 = require("./environmentValidator");
const fileValidator_1 = require("./fileValidator");
const child_process_1 = require("child_process");
const util_1 = require("util");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
// ── Console Logger (default) ──────────────────────────────────
class ConsoleValidationLogger {
    constructor(prefix = '[CLI Validation]') {
        this.prefix = prefix;
    }
    info(message) {
        console.log(`${this.prefix} ${message}`);
    }
    warn(message) {
        console.warn(`${this.prefix} ${message}`);
    }
    error(message) {
        console.error(`${this.prefix} ${message}`);
    }
    debug(message) {
        console.log(`${this.prefix} [debug] ${message}`);
    }
}
exports.ConsoleValidationLogger = ConsoleValidationLogger;
function getEnvironmentWithPath() {
    const env = { ...process.env };
    const homeDir = os.homedir();
    const cargoBin = path.join(homeDir, '.cargo', 'bin');
    const additionalPaths = [
        cargoBin,
        path.join(homeDir, '.local', 'bin'),
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
    ];
    const currentPath = env.PATH || env.Path || '';
    env.PATH = [...additionalPaths, currentPath].filter(Boolean).join(path.delimiter);
    env.Path = env.PATH;
    return env;
}
async function checkCliAvailability(cliPath, logger) {
    logger?.debug(`[CliValidation] Checking CLI availability at: ${cliPath}`);
    try {
        const env = getEnvironmentWithPath();
        const { stdout } = await execFileAsync(cliPath, ['--version'], {
            env,
            timeout: 10000,
        });
        const version = stdout.trim();
        logger?.debug(`[CliValidation] ✔ CLI found: ${version}`);
        return { available: true, version, path: cliPath };
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger?.warn(`[CliValidation] ✘ CLI not found at "${cliPath}": ${errMsg}`);
        return {
            available: false,
            path: cliPath,
            error: errMsg,
        };
    }
}
// ── Predefined Command Schemas ────────────────────────────────
const NETWORK_FLAG = {
    name: '--network',
    label: 'Network',
    type: 'enum',
    required: false,
    enumValues: ['testnet', 'mainnet', 'futurenet', 'localnet'],
    description: 'Stellar network to use',
    defaultValue: 'testnet',
};
const SOURCE_FLAG = {
    name: '--source',
    label: 'Source Identity',
    type: 'string',
    required: false,
    description: 'Source identity for transactions (e.g., "dev")',
    defaultValue: 'dev',
};
const CONTRACT_ID_ARG = {
    name: 'contractId',
    label: 'Contract ID',
    type: 'string',
    required: true,
    pattern: /^C[A-Z0-9]{55}$/,
    patternDescription: 'A 56-character string starting with C (e.g., CABCDEF…)',
    description: 'The deployed contract identifier',
};
const DRY_RUN_FLAG = {
    name: '--dry-run',
    label: 'Dry Run',
    type: 'boolean',
    required: false,
    description: 'Perform all validation without executing the command',
    defaultValue: false,
};
exports.COMMAND_SCHEMAS = {
    deploy: {
        name: 'contract deploy',
        description: 'Deploy a smart contract to the Stellar network',
        usage: 'stellar contract deploy --wasm <FILE> --source <IDENTITY> --network <NETWORK>',
        positionalArgs: [],
        flags: [
            {
                name: '--wasm',
                label: 'WASM File',
                type: 'path',
                required: false,
                description: 'Path to the compiled WASM contract file',
            },
            NETWORK_FLAG,
            SOURCE_FLAG,
            DRY_RUN_FLAG,
        ],
        aliases: { '-n': '--network', '-s': '--source' },
        requiresNetwork: true,
        requiresCli: true,
    },
    build: {
        name: 'contract build',
        description: 'Build a Soroban smart contract',
        usage: 'stellar contract build',
        positionalArgs: [],
        flags: [
            DRY_RUN_FLAG,
        ],
        requiresNetwork: false,
        requiresCli: true,
    },
    simulate: {
        name: 'contract invoke',
        description: 'Simulate a contract function invocation',
        usage: 'stellar contract invoke --id <CONTRACT_ID> --source <IDENTITY> --network <NETWORK> -- <FUNCTION> [ARGS]',
        positionalArgs: [
            CONTRACT_ID_ARG,
            {
                name: 'functionName',
                label: 'Function Name',
                type: 'string',
                required: true,
                description: 'Contract function to invoke',
                pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
                patternDescription: 'A valid function identifier (letters, digits, underscores)',
            },
        ],
        flags: [
            NETWORK_FLAG,
            SOURCE_FLAG,
            DRY_RUN_FLAG,
        ],
        aliases: { '-n': '--network', '-s': '--source' },
        requiresNetwork: true,
        requiresCli: true,
    },
    configure: {
        name: 'configure',
        description: 'Configure the Stellar CLI settings',
        usage: 'stellar configure',
        positionalArgs: [],
        flags: [],
        requiresNetwork: false,
        requiresCli: false,
    },
};
/**
 * Validate a command structure/syntax against its schema.
 */
function validateCommandSyntax(schema, params, logger) {
    const issues = [];
    logger?.debug(`[CliValidation] Validating command syntax for "${schema.name}"`);
    // Check required positional arguments
    for (const arg of schema.positionalArgs || []) {
        if (arg.required && (params[arg.name] === undefined || params[arg.name] === '')) {
            issues.push({
                severity: 'error',
                code: 'MISSING_ARGUMENT',
                message: `Missing required argument: ${arg.label || arg.name}`,
                field: arg.name,
                suggestion: schema.usage
                    ? `Usage: ${schema.usage}`
                    : `Provide a value for ${arg.label || arg.name}.`,
            });
        }
    }
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    return { valid: errors.length === 0, issues, errors, warnings };
}
/**
 * Run the full validation pipeline for a command.
 *
 * Steps:
 * 1. Command syntax validation
 * 2. Parameter validation
 * 3. CLI availability check
 * 4. Environment validation
 * 5. File validation
 * 6. Network connectivity
 */
async function validateCommand(options) {
    const start = Date.now();
    const logger = options.logger || new ConsoleValidationLogger();
    const schema = options.schema || exports.COMMAND_SCHEMAS[options.commandName];
    if (!schema) {
        const emptyResult = {
            valid: false,
            issues: [{
                    severity: 'error',
                    code: 'UNKNOWN_COMMAND',
                    message: `Unknown command: "${options.commandName}"`,
                    suggestion: `Available commands: ${Object.keys(exports.COMMAND_SCHEMAS).join(', ')}`,
                }],
            errors: [{
                    severity: 'error',
                    code: 'UNKNOWN_COMMAND',
                    message: `Unknown command: "${options.commandName}"`,
                    suggestion: `Available commands: ${Object.keys(exports.COMMAND_SCHEMAS).join(', ')}`,
                }],
            warnings: [],
        };
        return {
            valid: false,
            commandSyntax: emptyResult,
            parameterValidation: { valid: true, issues: [], errors: [], warnings: [] },
            cliAvailability: null,
            environmentValidation: { valid: true, issues: [], errors: [], warnings: [] },
            fileValidation: { valid: true, issues: [], errors: [], warnings: [] },
            networkValidation: { valid: true, issues: [], errors: [], warnings: [] },
            allIssues: emptyResult.issues,
            schema: { name: options.commandName, requiresNetwork: false, requiresCli: false },
            usageString: '',
            dryRun: options.dryRun || false,
            durationMs: Date.now() - start,
        };
    }
    const params = options.parameters || {};
    const dryRun = options.dryRun || false;
    logger.info(`Validating command "${schema.name}"${dryRun ? ' (dry-run)' : ''}...`);
    // 1. Command syntax
    const commandSyntax = validateCommandSyntax(schema, params, logger);
    // 2. Parameter validation
    const parameterValidation = (0, parameterValidator_1.validateCommandParameters)(schema, params, logger);
    // 3. CLI availability
    let cliAvailability = null;
    if (schema.requiresCli !== false && !options.skipCliCheck) {
        const cliPath = options.cliPath || 'stellar';
        cliAvailability = await checkCliAvailability(cliPath, logger);
    }
    // 4. Environment
    const environmentValidation = (0, environmentValidator_1.validateEnvironmentForCommand)(schema, options.basePath, logger);
    // 5. File validation
    let fileValidation = { valid: true, issues: [], errors: [], warnings: [] };
    if (options.fileRules && options.fileRules.length > 0) {
        const fileIssues = [];
        for (const rule of options.fileRules) {
            const result = (0, fileValidator_1.validateFilePath)(rule, logger);
            fileIssues.push(...result.issues);
        }
        const fileErrors = fileIssues.filter(i => i.severity === 'error');
        const fileWarnings = fileIssues.filter(i => i.severity === 'warning');
        fileValidation = { valid: fileErrors.length === 0, issues: fileIssues, errors: fileErrors, warnings: fileWarnings };
    }
    // 6. Network connectivity
    let networkValidation = { valid: true, issues: [], errors: [], warnings: [] };
    if (schema.requiresNetwork && !options.skipNetworkChecks) {
        const endpoints = [];
        if (options.rpcUrl) {
            endpoints.push({ url: options.rpcUrl, label: 'Stellar RPC', timeoutMs: 5000 });
        }
        if (options.networkEndpoints) {
            endpoints.push(...options.networkEndpoints);
        }
        if (endpoints.length > 0) {
            const { validateNetworkEndpoints } = await Promise.resolve().then(() => __importStar(require('./networkValidator')));
            networkValidation = await validateNetworkEndpoints(endpoints, logger);
        }
    }
    // Combine all issues
    const allIssues = [
        ...commandSyntax.issues,
        ...parameterValidation.issues,
        ...environmentValidation.issues,
        ...fileValidation.issues,
        ...networkValidation.issues,
    ];
    // CLI availability contributes an issue if unavailable
    if (cliAvailability && !cliAvailability.available) {
        allIssues.push({
            severity: 'error',
            code: 'CLI_NOT_FOUND',
            message: `Stellar CLI not found at "${cliAvailability.path}".`,
            suggestion: 'Install Stellar CLI (https://developers.stellar.org/docs/tools/cli) or update the cliPath setting.',
        });
    }
    const valid = allIssues.filter(i => i.severity === 'error').length === 0;
    const usageString = (0, parameterValidator_1.generateUsageString)(schema);
    const result = {
        valid,
        commandSyntax,
        parameterValidation,
        cliAvailability,
        environmentValidation,
        fileValidation,
        networkValidation,
        allIssues,
        schema,
        usageString,
        dryRun,
        durationMs: Date.now() - start,
    };
    if (valid) {
        logger.info(`✔ All validations passed (${result.durationMs}ms)`);
    }
    else {
        const errorCount = allIssues.filter(i => i.severity === 'error').length;
        logger.error(`✘ Validation failed with ${errorCount} error(s) (${result.durationMs}ms)`);
    }
    return result;
}
// ── Formatting ────────────────────────────────────────────────
/**
 * Format a full validation result for user-facing display.
 */
function formatValidationResult(result) {
    const lines = [];
    if (result.valid) {
        lines.push('✔ All validations passed.');
        if (result.dryRun) {
            lines.push('');
            lines.push('Dry run successful. Command would execute:');
            lines.push(`  ${result.schema.usage || `stellar ${result.schema.name}`}`);
        }
    }
    else {
        lines.push('✘ Pre-flight validation failed:');
        lines.push('');
        for (const issue of result.allIssues) {
            const icon = issue.severity === 'error' ? '✘' : issue.severity === 'warning' ? '⚠' : 'ℹ';
            lines.push(`  ${icon} [${issue.code}] ${issue.message}`);
            if (issue.suggestion) {
                lines.push(`    → ${issue.suggestion}`);
            }
        }
        if (result.usageString) {
            lines.push('');
            lines.push(result.usageString);
        }
    }
    lines.push('');
    lines.push(`Completed in ${result.durationMs}ms`);
    return lines.join('\n');
}
