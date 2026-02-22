import { CliHistoryService, CliHistoryEntry } from './cliHistoryService';

/**
 * Executor function that performs the actual CLI call.
 */
export type CliExecutor = (command: string, args: string[], cwd?: string) => Promise<{
    success: boolean;
    exitCode?: number;
    stdout: string;
    stderr: string;
    durationMs: number;
}>;

/**
 * Parameters that can be modified when replaying.
 */
export interface ReplayModifications {
    command?: string;
    args?: string[];
    cwd?: string;
    label?: string;
}

/**
 * Service to re-run previous CLI commands.
 */
export class CliReplayService {
    constructor(private readonly historyService: CliHistoryService) { }

    async replayCommand(
        entryId: string,
        executor: CliExecutor,
        modifications: ReplayModifications = {}
    ): Promise<CliHistoryEntry> {
        const original = this.historyService.getEntry(entryId);
        if (!original) {
            throw new Error(`Command history entry not found: ${entryId}`);
        }

        const command = modifications.command ?? original.command;
        const args = modifications.args ? [...modifications.args] : [...original.args];
        const cwd = modifications.cwd ?? original.cwd;
        const label = modifications.label ?? (original.label ? `Replay: ${original.label}` : `Replay of ${entryId}`);

        const result = await executor(command, args, cwd);

        const newEntry = await this.historyService.recordCommand({
            command,
            args,
            cwd,
            outcome: result.success ? 'success' : 'failure',
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            durationMs: result.durationMs,
            label,
            source: 'replay',
        });

        return newEntry;
    }
}
