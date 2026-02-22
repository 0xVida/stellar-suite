declare function require(name: string): any;

import { StreamBuffer } from '../utils/streamBuffer';
import { CancellationToken } from './cliCancellation';
import { CliTimeoutService } from './cliTimeoutService';
import { CliCleanupUtilities } from '../utils/cliCleanupUtilities';
import { TimeoutIndicators } from '../ui/timeoutIndicators';

const { spawn } = require('child_process') as { spawn: any };

export type CliOutputStream = 'stdout' | 'stderr' | 'system';

export interface CliOutputChunk {
    stream: CliOutputStream;
    text: string;
    timestamp: string;
}

// Export the generic type so other files using it still work, or they can switch.
export { CancellationToken as CliStreamingCancellationToken } from './cliCancellation';

export interface CliOutputStreamingRequest {
    command: string;
    args: string[];
    cwd?: string;
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
    maxBufferedBytes?: number;
    cancellationToken?: CancellationToken;
    onChunk?: (chunk: CliOutputChunk) => void;
    onStdout?: (text: string) => void;
    onStderr?: (text: string) => void;
}

export interface CliOutputStreamingResult {
    success: boolean;
    exitCode: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    combinedOutput: string;
    durationMs: number;
    cancelled: boolean;
    timedOut: boolean;
    truncated: boolean;
    error?: string;
}

export class CliOutputStreamingService {
    public async run(request: CliOutputStreamingRequest): Promise<CliOutputStreamingResult> {
        const startedAt = Date.now();
        const maxBufferedBytes = request.maxBufferedBytes ?? 2 * 1024 * 1024;

        const stdoutBuffer = new StreamBuffer(maxBufferedBytes);
        const stderrBuffer = new StreamBuffer(maxBufferedBytes);
        const combinedBuffer = new StreamBuffer(maxBufferedBytes * 2);

        if (request.cancellationToken?.isCancellationRequested) {
            return this.buildResult({
                startedAt,
                exitCode: null,
                signal: 'SIGTERM',
                stdout: '',
                stderr: '',
                combinedOutput: '',
                cancelled: true,
                timedOut: false,
                truncated: false,
                error: 'Command cancelled before start.',
            });
        }

        return new Promise<CliOutputStreamingResult>((resolve) => {
            let resolved = false;
            let cancelled = false;
            let timedOut = false;
            let cancellationDisposable: { dispose(): void } | undefined;

            const timeoutService = new CliTimeoutService({
                defaultTimeoutMs: request.timeoutMs || 0,
                warningThresholdMs: 10000,
            });

            const cleanupUtilities = new CliCleanupUtilities();

            const child = spawn(request.command, request.args, {
                cwd: request.cwd,
                env: request.env,
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: false,
            });

            if (child.pid) {
                cleanupUtilities.registerTask({
                    type: 'process',
                    target: child.pid,
                    description: `Command ${request.command}`,
                });
            }

            const emitChunk = (stream: CliOutputStream, text: string): void => {
                if (!text) return;

                const chunk: CliOutputChunk = {
                    stream,
                    text,
                    timestamp: new Date().toISOString(),
                };

                request.onChunk?.(chunk);

                if (stream === 'stdout') {
                    request.onStdout?.(text);
                    stdoutBuffer.append(text);
                } else if (stream === 'stderr') {
                    request.onStderr?.(text);
                    stderrBuffer.append(text);
                }

                combinedBuffer.append(text);
            };

            const finish = (result: CliOutputStreamingResult): void => {
                if (resolved) return;
                resolved = true;

                timeoutService.stop();
                cancellationDisposable?.dispose();

                resolve(result);
            };

            const terminate = async (): Promise<void> => {
                if (child.killed) return;
                await cleanupUtilities.cleanupAll();
            };

            child.stdout?.setEncoding('utf8');
            child.stderr?.setEncoding('utf8');

            child.stdout?.on('data', (chunk: unknown) => emitChunk('stdout', String(chunk)));
            child.stderr?.on('data', (chunk: unknown) => emitChunk('stderr', String(chunk)));

            child.on('error', (error: Error) => {
                const errText = error.message || 'Failed to start command.';
                emitChunk('system', `[stream-error] ${errText}\n`);
                finish(this.buildResult({
                    startedAt,
                    exitCode: null,
                    signal: null,
                    stdout: stdoutBuffer.toString(),
                    stderr: stderrBuffer.toString(),
                    combinedOutput: combinedBuffer.toString(),
                    cancelled,
                    timedOut,
                    truncated: stdoutBuffer.isTruncated() || stderrBuffer.isTruncated() || combinedBuffer.isTruncated(),
                    error: errText,
                }));
            });

            child.on('close', (exitCode: number | null, signal: string | null) => {
                const stdout = stdoutBuffer.toString();
                const stderr = stderrBuffer.toString();
                const combinedOutput = combinedBuffer.toString();
                const truncated = stdoutBuffer.isTruncated() || stderrBuffer.isTruncated() || combinedBuffer.isTruncated();

                let error: string | undefined;
                if (timedOut) {
                    error = `Command timed out after ${request.timeoutMs}ms.`;
                } else if (cancelled) {
                    error = 'Command cancelled by user.';
                } else if (exitCode !== 0) {
                    error = `Command exited with code ${exitCode}.`;
                }

                finish(this.buildResult({
                    startedAt,
                    exitCode,
                    signal,
                    stdout,
                    stderr,
                    combinedOutput,
                    cancelled,
                    timedOut,
                    truncated,
                    error,
                }));
            });

            if (request.timeoutMs && request.timeoutMs > 0) {
                timeoutService.on('event', (event) => {
                    if (event.type === 'warning') {
                        TimeoutIndicators.showWarning(timeoutService, event.remainingMs);
                        emitChunk('system', `[stream-warning] Command will timeout in ${Math.round(event.remainingMs / 1000)}s\n`);
                    } else if (event.type === 'timeout') {
                        timedOut = true;
                        TimeoutIndicators.showTimeoutMessage();
                        emitChunk('system', `[stream-timeout] Timed out after ${timeoutService['currentTimeoutMs']}ms\n`);
                        terminate();
                    } else if (event.type === 'cancelled') {
                        cancelled = true;
                        TimeoutIndicators.showCancellationPrompt();
                        emitChunk('system', '[stream-cancelled] Cancellation requested\n');
                        terminate();
                    } else if (event.type === 'extended') {
                        emitChunk('system', `[stream-info] Timeout extended. New timeout: ${event.newTimeoutMs}ms\n`);
                    }
                });

                timeoutService.start(request.command, request.timeoutMs);
            }

            if (request.cancellationToken?.onCancellationRequested) {
                cancellationDisposable = request.cancellationToken.onCancellationRequested(() => {
                    cancelled = true;
                    // Provide a calm, actionable cancellation message
                    emitChunk('system', '[stream-cancelled] Operation aborted by user. Cleaning up...\n');
                    terminate();
                });
            }
        });
    }

    private buildResult(params: {
        startedAt: number;
        exitCode: number | null;
        signal: string | null;
        stdout: string;
        stderr: string;
        combinedOutput: string;
        cancelled: boolean;
        timedOut: boolean;
        truncated: boolean;
        error?: string;
    }): CliOutputStreamingResult {
        return {
            success: params.exitCode === 0 && !params.cancelled && !params.timedOut && !params.error,
            exitCode: params.exitCode,
            signal: params.signal,
            stdout: params.stdout,
            stderr: params.stderr,
            combinedOutput: params.combinedOutput,
            durationMs: Date.now() - params.startedAt,
            cancelled: params.cancelled,
            timedOut: params.timedOut,
            truncated: params.truncated,
            error: params.error,
        };
    }
}
