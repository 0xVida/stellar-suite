// ============================================================
// src/services/cliValidationService.ts
// Central CLI validation orchestration service.
// Composes all validation modules and provides predefined
// command schemas for Stellar CLI operations.
// ============================================================

import {
    CommandSchema,
    ParameterSchema,
    ValidationIssue,
    ValidationResult,
    ValidationLogger,
} from '../types/cliValidation';
import { validateCommandParameters, generateUsageString } from './parameterValidator';
import { validateEnvironmentForCommand } from './environmentValidator';
import { validateFilePath, FileValidationRule } from './fileValidator';
import { validateNetworkConnectivity, NetworkCheckOptions } from './networkValidator';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

// ── Console Logger (default) ──────────────────────────────────

export class ConsoleValidationLogger implements ValidationLogger {
    private readonly prefix: string;

    constructor(prefix: string = '[CLI Validation]') {
        this.prefix = prefix;
    }

    info(message: string): void {
        console.log(`${this.prefix} ${message}`);
    }
    warn(message: string): void {
        console.warn(`${this.prefix} ${message}`);
    }
    error(message: string): void {
        console.error(`${this.prefix} ${message}`);
    }
    debug(message: string): void {
        console.log(`${this.prefix} [debug] ${message}`);
    }
}

// ── CLI Availability ──────────────────────────────────────────

export interface CliAvailabilityResult {
    available: boolean;
    version?: string;
    path: string;
    error?: string;
}

function getEnvironmentWithPath(): NodeJS.ProcessEnv {
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

async function checkCliAvailability(
    cliPath: string,
    logger?: ValidationLogger,
): Promise<CliAvailabilityResult> {
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
    } catch (error) {
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

const NETWORK_FLAG: ParameterSchema = {
    name: '--network',
    label: 'Network',
    type: 'enum',
    required: false,
    enumValues: ['testnet', 'mainnet', 'futurenet', 'localnet'],
    description: 'Stellar network to use',
    defaultValue: 'testnet',
};

const SOURCE_FLAG: ParameterSchema = {
    name: '--source',
    label: 'Source Identity',
    type: 'string',
    required: false,
    description: 'Source identity for transactions (e.g., "dev")',
    defaultValue: 'dev',
};

const CONTRACT_ID_ARG: ParameterSchema = {
    name: 'contractId',
    label: 'Contract ID',
    type: 'string',
    required: true,
    pattern: /^C[A-Z0-9]{55}$/,
    patternDescription: 'A 56-character string starting with C (e.g., CABCDEF…)',
    description: 'The deployed contract identifier',
};

const DRY_RUN_FLAG: ParameterSchema = {
    name: '--dry-run',
    label: 'Dry Run',
    type: 'boolean',
    required: false,
    description: 'Perform all validation without executing the command',
    defaultValue: false,
};

export const COMMAND_SCHEMAS: Record<string, CommandSchema> = {
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

// ── Validation Orchestration ──────────────────────────────────

export interface FullValidationOptions {
    /** Command name key (from COMMAND_SCHEMAS) */
    commandName: string;
    /** Custom schema (overrides predefined) */
    schema?: CommandSchema;
    /** Supplied parameters */
    parameters?: Record<string, string | number | boolean | undefined>;
    /** CLI executable path */
    cliPath?: string;
    /** RPC endpoint URL */
    rpcUrl?: string;
    /** File validation rules */
    fileRules?: FileValidationRule[];
    /** Additional network endpoints to check */
    networkEndpoints?: NetworkCheckOptions[];
    /** Dry-run mode */
    dryRun?: boolean;
    /** Logger */
    logger?: ValidationLogger;
    /** Base path for file/config resolution */
    basePath?: string;
    /** Skip network checks */
    skipNetworkChecks?: boolean;
    /** Skip CLI availability check */
    skipCliCheck?: boolean;
}

export interface FullValidationResult {
    /** Overall pass / fail */
    valid: boolean;
    /** Per-step results */
    commandSyntax: ValidationResult;
    parameterValidation: ValidationResult;
    cliAvailability: CliAvailabilityResult | null;
    environmentValidation: ValidationResult;
    fileValidation: ValidationResult;
    networkValidation: ValidationResult;
    /** All issues combined */
    allIssues: ValidationIssue[];
    /** The resolved command schema */
    schema: CommandSchema;
    /** Generated usage string */
    usageString: string;
    /** Whether dry-run mode is active */
    dryRun: boolean;
    /** Total duration in ms */
    durationMs: number;
}

/**
 * Validate a command structure/syntax against its schema.
 */
function validateCommandSyntax(
    schema: CommandSchema,
    params: Record<string, string | number | boolean | undefined>,
    logger?: ValidationLogger,
): ValidationResult {
    const issues: ValidationIssue[] = [];

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
export async function validateCommand(
    options: FullValidationOptions,
): Promise<FullValidationResult> {
    const start = Date.now();
    const logger = options.logger || new ConsoleValidationLogger();
    const schema = options.schema || COMMAND_SCHEMAS[options.commandName];

    if (!schema) {
        const emptyResult: ValidationResult = {
            valid: false,
            issues: [{
                severity: 'error',
                code: 'UNKNOWN_COMMAND',
                message: `Unknown command: "${options.commandName}"`,
                suggestion: `Available commands: ${Object.keys(COMMAND_SCHEMAS).join(', ')}`,
            }],
            errors: [{
                severity: 'error',
                code: 'UNKNOWN_COMMAND',
                message: `Unknown command: "${options.commandName}"`,
                suggestion: `Available commands: ${Object.keys(COMMAND_SCHEMAS).join(', ')}`,
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
    const parameterValidation = validateCommandParameters(schema, params, logger);

    // 3. CLI availability
    let cliAvailability: CliAvailabilityResult | null = null;
    if (schema.requiresCli !== false && !options.skipCliCheck) {
        const cliPath = options.cliPath || 'stellar';
        cliAvailability = await checkCliAvailability(cliPath, logger);
    }

    // 4. Environment
    const environmentValidation = validateEnvironmentForCommand(
        schema,
        options.basePath,
        logger,
    );

    // 5. File validation
    let fileValidation: ValidationResult = { valid: true, issues: [], errors: [], warnings: [] };
    if (options.fileRules && options.fileRules.length > 0) {
        const fileIssues: ValidationIssue[] = [];
        for (const rule of options.fileRules) {
            const result = validateFilePath(rule, logger);
            fileIssues.push(...result.issues);
        }
        const fileErrors = fileIssues.filter(i => i.severity === 'error');
        const fileWarnings = fileIssues.filter(i => i.severity === 'warning');
        fileValidation = { valid: fileErrors.length === 0, issues: fileIssues, errors: fileErrors, warnings: fileWarnings };
    }

    // 6. Network connectivity
    let networkValidation: ValidationResult = { valid: true, issues: [], errors: [], warnings: [] };
    if (schema.requiresNetwork && !options.skipNetworkChecks) {
        const endpoints: NetworkCheckOptions[] = [];
        if (options.rpcUrl) {
            endpoints.push({ url: options.rpcUrl, label: 'Stellar RPC', timeoutMs: 5000 });
        }
        if (options.networkEndpoints) {
            endpoints.push(...options.networkEndpoints);
        }
        if (endpoints.length > 0) {
            const { validateNetworkEndpoints } = await import('./networkValidator');
            networkValidation = await validateNetworkEndpoints(endpoints, logger);
        }
    }

    // Combine all issues
    const allIssues: ValidationIssue[] = [
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
    const usageString = generateUsageString(schema);

    const result: FullValidationResult = {
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
    } else {
        const errorCount = allIssues.filter(i => i.severity === 'error').length;
        logger.error(`✘ Validation failed with ${errorCount} error(s) (${result.durationMs}ms)`);
    }

    return result;
}

// ── Formatting ────────────────────────────────────────────────

/**
 * Format a full validation result for user-facing display.
 */
export function formatValidationResult(result: FullValidationResult): string {
    const lines: string[] = [];

    if (result.valid) {
        lines.push('✔ All validations passed.');
        if (result.dryRun) {
            lines.push('');
            lines.push('Dry run successful. Command would execute:');
            lines.push(`  ${result.schema.usage || `stellar ${result.schema.name}`}`);
        }
    } else {
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
