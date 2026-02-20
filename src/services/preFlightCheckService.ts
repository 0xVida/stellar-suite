// ============================================================
// src/services/preFlightCheckService.ts
// Modular pre-flight check pipeline.
// Assembles individual checks for a command and executes them
// in sequence with short-circuit-on-failure support.
// ============================================================

import {
    CommandSchema,
    PreFlightCheck,
    PreFlightCheckResult,
    PreFlightCheckStatus,
    PreFlightContext,
    PreFlightReport,
    ValidationIssue,
    ValidationLogger,
} from '../types/cliValidation';
import { validateCommandParameters, generateUsageString } from './parameterValidator';
import { validateEnvironmentForCommand } from './environmentValidator';
import { validateFilePath, FileValidationRule } from './fileValidator';
import { validateNetworkConnectivity, NetworkCheckOptions } from './networkValidator';
import { ConsoleValidationLogger } from './cliValidationService';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

// ── Helper ────────────────────────────────────────────────────

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

function elapsed(start: number): number {
    return Date.now() - start;
}

// ── Built-in Pre-Flight Checks ────────────────────────────────

/**
 * Check 1: Validate command syntax and parameters.
 */
export class CommandSyntaxCheck implements PreFlightCheck {
    readonly id = 'command-syntax';
    readonly label = 'Command Syntax & Parameters';

    async execute(ctx: PreFlightContext): Promise<PreFlightCheckResult> {
        const start = Date.now();
        try {
            const result = validateCommandParameters(ctx.commandSchema, ctx.parameters, ctx.logger);
            const issues = result.issues;

            if (!result.valid) {
                return {
                    checkId: this.id,
                    label: this.label,
                    status: 'failed',
                    message: `${result.errors.length} parameter error(s) found`,
                    durationMs: elapsed(start),
                    issues,
                };
            }

            return {
                checkId: this.id,
                label: this.label,
                status: result.warnings.length > 0 ? 'warning' : 'passed',
                message: result.warnings.length > 0
                    ? `Passed with ${result.warnings.length} warning(s)`
                    : 'All parameters valid',
                durationMs: elapsed(start),
                issues: result.warnings.length > 0 ? issues : undefined,
            };
        } catch (err) {
            return {
                checkId: this.id,
                label: this.label,
                status: 'failed',
                message: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
                durationMs: elapsed(start),
            };
        }
    }
}

/**
 * Check 2: Verify CLI availability and version.
 */
export class CliAvailabilityCheck implements PreFlightCheck {
    readonly id = 'cli-availability';
    readonly label = 'CLI Availability';

    async execute(ctx: PreFlightContext): Promise<PreFlightCheckResult> {
        const start = Date.now();

        if (ctx.commandSchema.requiresCli === false) {
            return {
                checkId: this.id,
                label: this.label,
                status: 'skipped',
                message: 'CLI not required for this command',
                durationMs: elapsed(start),
            };
        }

        try {
            const env = getEnvironmentWithPath();
            const { stdout } = await execFileAsync(ctx.cliPath, ['--version'], {
                env,
                timeout: 10000,
            });
            const version = stdout.trim();
            ctx.logger.info(`CLI found: ${version}`);

            return {
                checkId: this.id,
                label: this.label,
                status: 'passed',
                message: `Stellar CLI found (${version})`,
                durationMs: elapsed(start),
            };
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            return {
                checkId: this.id,
                label: this.label,
                status: 'failed',
                message: `Stellar CLI not found at "${ctx.cliPath}". Please install it before running this command.`,
                durationMs: elapsed(start),
                issues: [{
                    severity: 'error',
                    code: 'CLI_NOT_FOUND',
                    message: `Stellar CLI not found. Please install it before running this command.`,
                    suggestion: 'Install via: cargo install --locked stellar-cli (see https://developers.stellar.org/docs/tools/cli)',
                }],
            };
        }
    }
}

/**
 * Check 3: Validate environment (env vars, config files, Node version).
 */
export class EnvironmentCheck implements PreFlightCheck {
    readonly id = 'environment';
    readonly label = 'Environment Configuration';

    async execute(ctx: PreFlightContext): Promise<PreFlightCheckResult> {
        const start = Date.now();
        try {
            const result = validateEnvironmentForCommand(ctx.commandSchema, undefined, ctx.logger);

            if (!result.valid) {
                return {
                    checkId: this.id,
                    label: this.label,
                    status: 'failed',
                    message: `${result.errors.length} environment issue(s)`,
                    durationMs: elapsed(start),
                    issues: result.issues,
                };
            }

            const hasChecks = (ctx.commandSchema.requiredEnvVars?.length || 0) +
                (ctx.commandSchema.requiredConfigFiles?.length || 0) +
                (ctx.commandSchema.minNodeVersion ? 1 : 0);

            if (hasChecks === 0) {
                return {
                    checkId: this.id,
                    label: this.label,
                    status: 'skipped',
                    message: 'No environment requirements defined',
                    durationMs: elapsed(start),
                };
            }

            return {
                checkId: this.id,
                label: this.label,
                status: result.warnings.length > 0 ? 'warning' : 'passed',
                message: 'Environment verified',
                durationMs: elapsed(start),
                issues: result.warnings.length > 0 ? result.issues : undefined,
            };
        } catch (err) {
            return {
                checkId: this.id,
                label: this.label,
                status: 'failed',
                message: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
                durationMs: elapsed(start),
            };
        }
    }
}

/**
 * Check 4: Validate file paths.
 */
export class FileValidationCheck implements PreFlightCheck {
    readonly id = 'file-validation';
    readonly label = 'File Path Validation';

    private readonly rules: FileValidationRule[];

    constructor(rules: FileValidationRule[] = []) {
        this.rules = rules;
    }

    async execute(ctx: PreFlightContext): Promise<PreFlightCheckResult> {
        const start = Date.now();

        if (this.rules.length === 0) {
            return {
                checkId: this.id,
                label: this.label,
                status: 'skipped',
                message: 'No file paths to validate',
                durationMs: elapsed(start),
            };
        }

        try {
            const allIssues: ValidationIssue[] = [];
            for (const rule of this.rules) {
                const result = validateFilePath(rule, ctx.logger);
                allIssues.push(...result.issues);
            }

            const errors = allIssues.filter(i => i.severity === 'error');
            if (errors.length > 0) {
                return {
                    checkId: this.id,
                    label: this.label,
                    status: 'failed',
                    message: `${errors.length} file validation error(s)`,
                    durationMs: elapsed(start),
                    issues: allIssues,
                };
            }

            return {
                checkId: this.id,
                label: this.label,
                status: 'passed',
                message: `${this.rules.length} file path(s) validated`,
                durationMs: elapsed(start),
            };
        } catch (err) {
            return {
                checkId: this.id,
                label: this.label,
                status: 'failed',
                message: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
                durationMs: elapsed(start),
            };
        }
    }
}

/**
 * Check 5: Validate network connectivity.
 */
export class NetworkConnectivityCheck implements PreFlightCheck {
    readonly id = 'network-connectivity';
    readonly label = 'Network Connectivity';

    async execute(ctx: PreFlightContext): Promise<PreFlightCheckResult> {
        const start = Date.now();

        if (ctx.commandSchema.requiresNetwork !== true) {
            return {
                checkId: this.id,
                label: this.label,
                status: 'skipped',
                message: 'Network not required for this command',
                durationMs: elapsed(start),
            };
        }

        if (!ctx.rpcUrl) {
            return {
                checkId: this.id,
                label: this.label,
                status: 'warning',
                message: 'No RPC URL configured to validate',
                durationMs: elapsed(start),
                issues: [{
                    severity: 'warning',
                    code: 'NO_RPC_URL',
                    message: 'No RPC URL configured. Network connectivity could not be verified.',
                    suggestion: 'Set stellarSuite.rpcUrl in your VS Code settings.',
                }],
            };
        }

        try {
            const result = await validateNetworkConnectivity(
                { url: ctx.rpcUrl, label: 'Stellar RPC', timeoutMs: 5000 },
                ctx.logger,
            );

            if (!result.valid) {
                return {
                    checkId: this.id,
                    label: this.label,
                    status: 'failed',
                    message: 'RPC endpoint unreachable',
                    durationMs: elapsed(start),
                    issues: result.issues,
                };
            }

            return {
                checkId: this.id,
                label: this.label,
                status: 'passed',
                message: `RPC endpoint reachable (${ctx.rpcUrl})`,
                durationMs: elapsed(start),
            };
        } catch (err) {
            return {
                checkId: this.id,
                label: this.label,
                status: 'failed',
                message: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
                durationMs: elapsed(start),
            };
        }
    }
}

// ── Pre-Flight Check Pipeline ─────────────────────────────────

export interface PreFlightPipelineOptions {
    /** The command schema to validate against */
    commandSchema: CommandSchema;
    /** User-supplied parameters */
    parameters: Record<string, string | number | boolean | undefined>;
    /** CLI executable path */
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
    logger?: ValidationLogger;
    /** File validation rules */
    fileRules?: FileValidationRule[];
    /** Custom checks to append to the pipeline */
    additionalChecks?: PreFlightCheck[];
    /** Short-circuit on first failure */
    shortCircuit?: boolean;
}

/**
 * Execute the full pre-flight check pipeline.
 */
export async function runPreFlightChecks(
    options: PreFlightPipelineOptions,
): Promise<PreFlightReport> {
    const start = Date.now();
    const logger = options.logger || new ConsoleValidationLogger();
    const shortCircuit = options.shortCircuit !== false;

    const context: PreFlightContext = {
        commandSchema: options.commandSchema,
        parameters: options.parameters,
        cliPath: options.cliPath,
        network: options.network,
        source: options.source,
        rpcUrl: options.rpcUrl,
        dryRun: options.dryRun,
        logger,
    };

    // Build the pipeline
    const checks: PreFlightCheck[] = [
        new CommandSyntaxCheck(),
        new CliAvailabilityCheck(),
        new EnvironmentCheck(),
        new FileValidationCheck(options.fileRules),
        new NetworkConnectivityCheck(),
        ...(options.additionalChecks || []),
    ];

    const results: PreFlightCheckResult[] = [];
    let failed = false;

    logger.info(`Running ${checks.length} pre-flight check(s) for "${options.commandSchema.name}"...`);

    for (const check of checks) {
        if (failed && shortCircuit) {
            results.push({
                checkId: check.id,
                label: check.label,
                status: 'skipped',
                message: 'Skipped due to previous failure',
                durationMs: 0,
            });
            continue;
        }

        const result = await check.execute(context);
        results.push(result);

        const icon = result.status === 'passed' ? '✔'
            : result.status === 'failed' ? '✘'
                : result.status === 'warning' ? '⚠'
                    : '⊘';
        logger.info(`  ${icon} ${result.label}: ${result.message || result.status}`);

        if (result.status === 'failed') {
            failed = true;
        }
    }

    const passed = !failed;
    const commandLine = options.commandSchema.usage || `stellar ${options.commandSchema.name}`;

    const report: PreFlightReport = {
        passed,
        dryRun: options.dryRun,
        command: options.commandSchema.name,
        checks: results,
        totalDurationMs: elapsed(start),
        resolvedCommandLine: commandLine,
        timestamp: new Date().toISOString(),
    };

    if (passed) {
        logger.info(`✔ All pre-flight checks passed (${report.totalDurationMs}ms)`);
        if (options.dryRun) {
            logger.info('');
            logger.info('Dry run successful. Command would execute:');
            logger.info(`  ${commandLine}`);
        }
    } else {
        logger.error(`✘ Pre-flight checks failed (${report.totalDurationMs}ms)`);
    }

    return report;
}

// ── Report Formatting ─────────────────────────────────────────

/**
 * Format a PreFlightReport for user-facing output.
 */
export function formatPreFlightReport(report: PreFlightReport): string {
    const lines: string[] = [];

    lines.push(`Pre-Flight Report: ${report.command}`);
    lines.push('─'.repeat(50));

    for (const check of report.checks) {
        const icon = check.status === 'passed' ? '✔'
            : check.status === 'failed' ? '✘'
                : check.status === 'warning' ? '⚠'
                    : '⊘';
        const timeStr = check.durationMs > 0 ? ` (${check.durationMs}ms)` : '';
        lines.push(`${icon} ${check.label}${timeStr}`);

        if (check.message && check.status !== 'passed') {
            lines.push(`  ${check.message}`);
        }

        if (check.issues) {
            for (const issue of check.issues) {
                const issueIcon = issue.severity === 'error' ? '✘' : issue.severity === 'warning' ? '⚠' : 'ℹ';
                lines.push(`  ${issueIcon} ${issue.message}`);
                if (issue.suggestion) {
                    lines.push(`    → ${issue.suggestion}`);
                }
            }
        }
    }

    lines.push('─'.repeat(50));

    if (report.passed) {
        lines.push('✔ All validations passed.');
        if (report.dryRun) {
            lines.push('');
            lines.push('Dry run successful. Command would execute:');
            lines.push(`  ${report.resolvedCommandLine || `stellar ${report.command}`}`);
        }
    } else {
        lines.push('✘ Pre-flight validation failed. Fix the issues above before running.');
    }

    lines.push(`Total time: ${report.totalDurationMs}ms`);

    return lines.join('\n');
}
