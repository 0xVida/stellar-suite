import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
    CliOutputStreamingService,
    CliStreamingCancellationToken,
} from './cliOutputStreamingService';
import {
    CliErrorContext,
    CliErrorType,
    formatCliErrorForDisplay,
    formatCliErrorForNotification,
    logCliError,
    parseCliErrorOutput,
} from '../utils/cliErrorParser';
import { DeploymentRetryService, RetryDeploymentParams } from './deploymentRetryService';
import { DeploymentRetryConfig, DeploymentRetryRecord } from '../types/deploymentRetry';

function getEnvironmentWithPath(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    const homeDir = os.homedir();
    const cargoBin = path.join(homeDir, '.cargo', 'bin');

    const additionalPaths = [
        cargoBin,
        path.join(homeDir, '.local', 'bin'),
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin'
    ];

    const currentPath = env.PATH || env.Path || '';
    env.PATH = [...additionalPaths, currentPath].filter(Boolean).join(path.delimiter);
    env.Path = env.PATH;

    return env;
}

export interface DeploymentResult {
    success: boolean;
    contractId?: string;
    transactionHash?: string;
    error?: string;
    errorSummary?: string;
    errorType?: CliErrorType;
    errorCode?: string;
    errorSuggestions?: string[];
    errorContext?: CliErrorContext;
    rawError?: string;
    buildOutput?: string;
    deployOutput?: string;
    signing?: {
        method?: string;
        status?: string;
        validated?: boolean;
        payloadHash?: string;
        publicKey?: string;
        signature?: string;
        signedAt?: string;
    };
}

export interface BuildResult {
    success: boolean;
    output: string;
    wasmPath?: string;
    cancelled?: boolean;
    errorSummary?: string;
    errorType?: CliErrorType;
    errorCode?: string;
    errorSuggestions?: string[];
    rawError?: string;
}

export interface CliExecutionStreamingOptions {
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
    cancellationToken?: CliStreamingCancellationToken;
    timeoutMs?: number;
    maxBufferedBytes?: number;
}

export class ContractDeployer {
    private cliPath: string;
    private source: string;
    private network: string;
    private readonly streamingService: CliOutputStreamingService;
    private readonly retryService: DeploymentRetryService;

    constructor(
        cliPath: string,
        source: string = 'dev',
        network: string = 'testnet',
        streamingService?: CliOutputStreamingService,
        retryService?: DeploymentRetryService
    ) {
        this.cliPath = cliPath;
        this.source = source;
        this.network = network;
        this.streamingService = streamingService || new CliOutputStreamingService();
        this.retryService = retryService || new DeploymentRetryService();
    }

    /**
     * Deploy a contract with automatic retry and exponential backoff.
     *
     * Wraps {@link deployContract} with configurable retry logic. Transient
     * failures (network errors, timeouts, rate limits) are retried automatically;
     * permanent failures (invalid WASM, auth errors) are surfaced immediately.
     *
     * @param wasmPath     Path to the compiled WASM file
     * @param retryConfig  Optional retry policy overrides
     * @returns            The completed retry session record
     */
    async deployWithRetry(
        wasmPath: string,
        retryConfig?: DeploymentRetryConfig
    ): Promise<DeploymentRetryRecord> {
        const params: RetryDeploymentParams = {
            wasmPath,
            network: this.network,
            source: this.source,
            cliPath: this.cliPath,
            retryConfig,
        };
        return this.retryService.deploy(params);
    }

    /**
     * Cancel an active retry-managed deployment by its session ID.
     *
     * @param sessionId  The session ID returned by {@link deployWithRetry}
     * @returns          `true` if the session was found and cancelled
     */
    cancelRetry(sessionId: string): boolean {
        return this.retryService.cancel(sessionId);
    }

    /**
     * Retrieve the retry history for deployments run through this deployer instance.
     */
    getRetryHistory(): DeploymentRetryRecord[] {
        return this.retryService.getHistory();
    }

    /**
     * Register a callback to receive live retry status events.
     * Returns a disposer that removes the listener.
     */
    onRetryStatusChange(
        listener: Parameters<DeploymentRetryService['onStatusChange']>[0]
    ): () => void {
        return this.retryService.onStatusChange(listener);
    }

    async buildContract(
        contractPath: string,
        options: CliExecutionStreamingOptions = {}
    ): Promise<BuildResult> {
        try {
            const env = getEnvironmentWithPath();

            const streamResult = await this.streamingService.run({
                command: this.cliPath,
                args: ['contract', 'build'],
                cwd: contractPath,
                env,
                timeoutMs: options.timeoutMs ?? 120000,
                maxBufferedBytes: options.maxBufferedBytes ?? 10 * 1024 * 1024,
                cancellationToken: options.cancellationToken,
                onStdout: options.onStdout,
                onStderr: options.onStderr,
            });

            const output = streamResult.combinedOutput;

            if (streamResult.cancelled) {
                return {
                    success: false,
                    cancelled: true,
                    output: output || 'Build cancelled by user.',
                    errorSummary: 'Build cancelled by user.',
                    errorType: 'execution',
                    errorSuggestions: ['Re-run the build when ready.'],
                };
            }

            if (streamResult.timedOut) {
                return {
                    success: false,
                    output: output || (streamResult.error ?? 'Build timed out.'),
                    errorSummary: 'Build timed out.',
                    errorType: 'execution',
                    errorSuggestions: ['Try again, or increase command timeout for long builds.'],
                };
            }

            if (!streamResult.success) {
                const parsedError = parseCliErrorOutput(output || streamResult.error || 'Build failed.', {
                    command: 'stellar contract build',
                    network: this.network,
                });
                logCliError(parsedError, '[Build CLI]');

                return {
                    success: false,
                    output: formatCliErrorForDisplay(parsedError),
                    errorSummary: formatCliErrorForNotification(parsedError),
                    errorType: parsedError.type,
                    errorCode: parsedError.code,
                    errorSuggestions: parsedError.suggestions,
                    rawError: parsedError.normalized,
                };
            }

            const wasmMatch = output.match(/target\/wasm32[^\/]*\/release\/[^\s]+\.wasm/);
            let wasmPath: string | undefined;

            if (wasmMatch) {
                wasmPath = path.join(contractPath, wasmMatch[0]);
            } else {
                const commonPaths = [
                    path.join(contractPath, 'target', 'wasm32v1-none', 'release', '*.wasm'),
                    path.join(contractPath, 'target', 'wasm32-unknown-unknown', 'release', '*.wasm')
                ];

                for (const pattern of commonPaths) {
                    const dir = path.dirname(pattern);
                    if (fs.existsSync(dir)) {
                        const files = fs.readdirSync(dir).filter(f => f.endsWith('.wasm'));
                        if (files.length > 0) {
                            wasmPath = path.join(dir, files[0]);
                            break;
                        }
                    }
                }
            }

            return {
                success: true,
                output: streamResult.truncated
                    ? `${output}\n\n[Stellar Suite] Output was truncated for display.`
                    : output,
                wasmPath
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const stderrText = this.getExecErrorStream(error, 'stderr');
            const stdoutText = this.getExecErrorStream(error, 'stdout');
            const rawOutput = [stderrText, stdoutText, errorMessage].filter(Boolean).join('\n');
            const parsedError = parseCliErrorOutput(rawOutput || errorMessage, {
                command: 'stellar contract build',
                network: this.network,
            });
            logCliError(parsedError, '[Build CLI]');

            return {
                success: false,
                output: formatCliErrorForDisplay(parsedError),
                errorSummary: formatCliErrorForNotification(parsedError),
                errorType: parsedError.type,
                errorCode: parsedError.code,
                errorSuggestions: parsedError.suggestions,
                rawError: parsedError.normalized,
            };
        }
    }

    /**
     * Deploy a contract from WASM file.
     * 
     * @param wasmPath - Path to the compiled WASM file
     * @returns Deployment result with contract ID and transaction hash
     */
    async deployContract(
        wasmPath: string,
        options: CliExecutionStreamingOptions = {}
    ): Promise<DeploymentResult> {
        try {
            // Verify WASM file exists
            if (!fs.existsSync(wasmPath)) {
                return {
                    success: false,
                    error: `WASM file not found: ${wasmPath}`,
                    errorSummary: 'Validation error: WASM file path does not exist.',
                    errorType: 'validation',
                    errorSuggestions: ['Rebuild the contract and select an existing WASM file.'],
                };
            }

            // Get environment with proper PATH
            const env = getEnvironmentWithPath();

            const streamResult = await this.streamingService.run({
                command: this.cliPath,
                args: [
                    'contract',
                    'deploy',
                    '--wasm', wasmPath,
                    '--source', this.source,
                    '--network', this.network
                ],
                env,
                timeoutMs: options.timeoutMs ?? 60000,
                maxBufferedBytes: options.maxBufferedBytes ?? 10 * 1024 * 1024,
                cancellationToken: options.cancellationToken,
                onStdout: options.onStdout,
                onStderr: options.onStderr,
            });

            const output = streamResult.combinedOutput;

            if (streamResult.cancelled) {
                return {
                    success: false,
                    error: 'Deployment cancelled by user.',
                    errorSummary: 'Deployment cancelled by user.',
                    errorType: 'execution',
                    errorSuggestions: ['Re-run deployment when ready.'],
                    deployOutput: output,
                };
            }

            if (streamResult.timedOut) {
                return {
                    success: false,
                    error: 'Deployment timed out.',
                    errorSummary: 'Deployment timed out.',
                    errorType: 'execution',
                    errorSuggestions: ['Try again, or increase command timeout for long deployments.'],
                    deployOutput: output,
                };
            }

            if (!streamResult.success) {
                const parsedError = parseCliErrorOutput(output || streamResult.error || 'Deployment failed.', {
                    command: 'stellar contract deploy',
                    network: this.network,
                });
                logCliError(parsedError, '[Deploy CLI]');

                return {
                    success: false,
                    error: formatCliErrorForDisplay(parsedError),
                    errorSummary: formatCliErrorForNotification(parsedError),
                    errorType: parsedError.type,
                    errorCode: parsedError.code,
                    errorSuggestions: parsedError.suggestions,
                    errorContext: parsedError.context,
                    rawError: parsedError.normalized,
                    deployOutput: output,
                };
            }

            // Parse output to extract Contract ID and transaction hash
            // Typical output format:
            // "Contract ID: C..."
            // "Transaction hash: ..."
            const contractIdMatch = output.match(/Contract\s+ID[:\s]+(C[A-Z0-9]{55})/i);
            const txHashMatch = output.match(/Transaction\s+hash[:\s]+([a-f0-9]{64})/i);

            const contractId = contractIdMatch ? contractIdMatch[1] : undefined;
            const transactionHash = txHashMatch ? txHashMatch[1] : undefined;

            if (!contractId) {
                // Try alternative patterns
                const altMatch = output.match(/(C[A-Z0-9]{55})/);
                if (altMatch) {
                    return {
                        success: true,
                        contractId: altMatch[0],
                        transactionHash,
                        deployOutput: output
                    };
                }

                return {
                    success: false,
                    error: 'Could not extract Contract ID from deployment output',
                    errorSummary: 'Execution error: Deployment completed but Contract ID was missing in output.',
                    errorType: 'execution',
                    errorSuggestions: [
                        'Inspect deployment output and retry with a single target network/source.',
                        'Run deployment manually in terminal to compare CLI behavior.',
                    ],
                    deployOutput: output
                };
            }

            return {
                success: true,
                contractId,
                transactionHash,
                deployOutput: streamResult.truncated
                    ? `${output}\n\n[Stellar Suite] Output was truncated for display.`
                    : output
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const stderrText = this.getExecErrorStream(error, 'stderr');
            const stdoutText = this.getExecErrorStream(error, 'stdout');
            const rawOutput = [stderrText, stdoutText, errorMessage].filter(Boolean).join('\n');
            const parsedError = parseCliErrorOutput(rawOutput || errorMessage, {
                command: 'stellar contract deploy',
                network: this.network,
            });

            if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
                parsedError.message = `Stellar CLI not found at "${this.cliPath}".`;
                parsedError.suggestions = [
                    'Install Stellar CLI, or set `stellarSuite.cliPath` to a valid binary path.',
                    ...parsedError.suggestions,
                ];
            }

            logCliError(parsedError, '[Deploy CLI]');

            return {
                success: false,
                error: formatCliErrorForDisplay(parsedError),
                errorSummary: formatCliErrorForNotification(parsedError),
                errorType: parsedError.type,
                errorCode: parsedError.code,
                errorSuggestions: parsedError.suggestions,
                errorContext: parsedError.context,
                rawError: parsedError.normalized,
            };
        }
    }

    /**
     * Build and deploy a contract in one step.
     * 
     * @param contractPath - Path to contract directory
     * @returns Deployment result
     */
    async buildAndDeploy(
        contractPath: string,
        options: CliExecutionStreamingOptions = {}
    ): Promise<DeploymentResult> {
        // First build
        const buildResult = await this.buildContract(contractPath, options);

        if (!buildResult.success) {
            return {
                success: false,
                error: `Build failed: ${buildResult.output}`,
                errorSummary: buildResult.errorSummary,
                errorType: buildResult.errorType,
                errorCode: buildResult.errorCode,
                errorSuggestions: buildResult.errorSuggestions,
                rawError: buildResult.rawError,
                buildOutput: buildResult.output
            };
        }

        if (!buildResult.wasmPath) {
            return {
                success: false,
                error: 'Build succeeded but could not locate WASM file',
                buildOutput: buildResult.output
            };
        }

        // Then deploy
        const deployResult = await this.deployContract(buildResult.wasmPath, options);
        deployResult.buildOutput = buildResult.output;

        return deployResult;
    }

    /**
     * Deploy a contract directly from WASM file (skip build).
     * 
     * @param wasmPath - Path to WASM file
     * @returns Deployment result
     */
    async deployFromWasm(
        wasmPath: string,
        options: CliExecutionStreamingOptions = {}
    ): Promise<DeploymentResult> {
        return this.deployContract(wasmPath, options);
    }

    private getExecErrorStream(error: unknown, stream: 'stderr' | 'stdout'): string {
        if (typeof error !== 'object' || error === null) {
            return '';
        }
        const value = (error as Record<string, unknown>)[stream];
        return typeof value === 'string' ? value : '';
    }
}
