// ============================================================
// src/services/simulationReplayService.ts
// Handles replaying previous simulations with the same or
// modified parameters. Integrates with SimulationHistoryService
// for retrieving past entries and recording replay results.
// ============================================================

import {
    SimulationHistoryService,
    SimulationHistoryEntry,
    SimulationOutcome,
} from './simulationHistoryService';
import { StateDiff, StateSnapshot } from '../types/simulationState';

// ── Public types ──────────────────────────────────────────────

/** Parameters that can be overridden when replaying a simulation. */
export interface ReplayOverrides {
    contractId?: string;
    functionName?: string;
    args?: unknown[];
    network?: string;
    source?: string;
    method?: 'cli' | 'rpc';
    label?: string;
}

/** Resolved parameters used to execute a replay. */
export interface ReplayParameters {
    contractId: string;
    functionName: string;
    args: unknown[];
    network: string;
    source: string;
    method: 'cli' | 'rpc';
    label?: string;
}

/** Result of a single simulation replay. */
export interface ReplayResult {
    /** The original history entry that was replayed. */
    originalEntryId: string;
    /** The newly recorded history entry from the replay. */
    newEntryId: string;
    /** Resolved parameters that were used for the replay. */
    parameters: ReplayParameters;
    /** Whether the replay simulation succeeded. */
    outcome: SimulationOutcome;
    /** Return value on success. */
    result?: unknown;
    /** Error message on failure. */
    error?: string;
    /** Duration of the replay in milliseconds. */
    durationMs?: number;
    /** Comparison with the original simulation. */
    comparison: ReplayComparison;
    /** Captured storage snapshot before replay execution. */
    stateSnapshotBefore?: StateSnapshot;
    /** Captured storage snapshot after replay execution. */
    stateSnapshotAfter?: StateSnapshot;
    /** Computed storage-level diff for replay execution. */
    stateDiff?: StateDiff;
}

/** Comparison between original and replayed simulation. */
export interface ReplayComparison {
    /** Whether the outcome changed between original and replay. */
    outcomeChanged: boolean;
    /** Whether the parameters were modified for the replay. */
    parametersModified: boolean;
    /** List of parameter fields that were overridden. */
    modifiedFields: string[];
    /** Original outcome for reference. */
    originalOutcome: SimulationOutcome;
    /** Replay outcome for reference. */
    replayOutcome: SimulationOutcome;
}

/** Result of a batch replay operation. */
export interface BatchReplayResult {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
    results: ReplayResult[];
    errors: string[];
}

/** Callback invoked during simulation execution. */
export type SimulationExecutor = (params: ReplayParameters) => Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
    errorType?: string;
    resourceUsage?: { cpuInstructions?: number; memoryBytes?: number };
    stateSnapshotBefore?: StateSnapshot;
    stateSnapshotAfter?: StateSnapshot;
    stateDiff?: StateDiff;
    durationMs?: number;
}>;

// ── Minimal VS Code-compatible interfaces ────────────────────

interface SimpleOutputChannel {
    appendLine(value: string): void;
}

// ── Service class ─────────────────────────────────────────────

/**
 * SimulationReplayService orchestrates replaying past simulations.
 *
 * Responsibilities:
 * - Resolving replay parameters from a history entry + optional overrides
 * - Delegating actual simulation execution to a caller-provided executor
 * - Recording replay results back into simulation history
 * - Comparing original vs. replay outcomes
 * - Supporting batch replays across multiple history entries
 */
export class SimulationReplayService {
    private readonly outputChannel: SimpleOutputChannel;

    constructor(
        private readonly historyService: SimulationHistoryService,
        outputChannel?: SimpleOutputChannel
    ) {
        this.outputChannel = outputChannel ?? {
            appendLine: (_msg: string) => { /* no-op */ },
        };
    }

    // ── Public API ────────────────────────────────────────────

    /**
     * Replay a simulation from history.
     *
     * Resolves the original entry's parameters, applies any overrides,
     * executes the simulation via the provided executor, records the
     * result in history, and returns a comparison.
     */
    public async replaySimulation(
        entryId: string,
        executor: SimulationExecutor,
        overrides: ReplayOverrides = {}
    ): Promise<ReplayResult> {
        const original = this.historyService.getEntry(entryId);
        if (!original) {
            throw new Error(`Simulation history entry not found: ${entryId}`);
        }

        const parameters = this.resolveParameters(original, overrides);
        const comparison = this.buildPreComparison(original, parameters, overrides);

        this.log(
            `[Replay] Replaying ${parameters.functionName}() on ${parameters.contractId}` +
            (comparison.parametersModified ? ` (modified: ${comparison.modifiedFields.join(', ')})` : '')
        );

        const startTime = Date.now();
        let execResult: Awaited<ReturnType<SimulationExecutor>>;

        try {
            execResult = await executor(parameters);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            execResult = { success: false, error: `Replay execution failed: ${errorMsg}` };
        }

        const durationMs = execResult.durationMs ?? (Date.now() - startTime);

        // Record the replay in history
        const replayLabel = parameters.label
            ? `Replay: ${parameters.label}`
            : `Replay of ${entryId}`;

        const newEntry = await this.historyService.recordSimulation({
            contractId: parameters.contractId,
            functionName: parameters.functionName,
            args: parameters.args,
            outcome: execResult.success ? 'success' : 'failure',
            result: execResult.result,
            error: execResult.error,
            errorType: execResult.errorType,
            resourceUsage: execResult.resourceUsage,
            network: parameters.network,
            source: parameters.source,
            method: parameters.method,
            durationMs,
            label: replayLabel,
            stateSnapshotBefore: execResult.stateSnapshotBefore,
            stateSnapshotAfter: execResult.stateSnapshotAfter,
            stateDiff: execResult.stateDiff,
        });

        const replayOutcome: SimulationOutcome = execResult.success ? 'success' : 'failure';
        comparison.replayOutcome = replayOutcome;
        comparison.outcomeChanged = original.outcome !== replayOutcome;

        const result: ReplayResult = {
            originalEntryId: entryId,
            newEntryId: newEntry.id,
            parameters,
            outcome: replayOutcome,
            result: execResult.result,
            error: execResult.error,
            durationMs,
            comparison,
            stateSnapshotBefore: execResult.stateSnapshotBefore,
            stateSnapshotAfter: execResult.stateSnapshotAfter,
            stateDiff: execResult.stateDiff,
        };

        this.log(
            `[Replay] Completed: ${replayOutcome}` +
            (comparison.outcomeChanged ? ` (outcome changed from ${original.outcome})` : '')
        );

        return result;
    }

    /**
     * Replay multiple simulations from history in sequence.
     *
     * Entries that no longer exist in history are skipped.
     * Execution continues even if individual replays fail.
     */
    public async batchReplay(
        entryIds: string[],
        executor: SimulationExecutor,
        overrides: ReplayOverrides = {}
    ): Promise<BatchReplayResult> {
        const results: ReplayResult[] = [];
        const errors: string[] = [];
        let succeeded = 0;
        let failed = 0;
        let skipped = 0;

        for (const entryId of entryIds) {
            const original = this.historyService.getEntry(entryId);
            if (!original) {
                skipped++;
                errors.push(`Skipped: entry ${entryId} not found in history`);
                continue;
            }

            try {
                const result = await this.replaySimulation(entryId, executor, overrides);
                results.push(result);
                if (result.outcome === 'success') {
                    succeeded++;
                } else {
                    failed++;
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                errors.push(`Error replaying ${entryId}: ${msg}`);
                failed++;
            }
        }

        this.log(
            `[Replay] Batch complete: ${succeeded} succeeded, ${failed} failed, ${skipped} skipped`
        );

        return {
            total: entryIds.length,
            succeeded,
            failed,
            skipped,
            results,
            errors,
        };
    }

    /**
     * Resolve the final parameters for a replay by merging the
     * original entry's values with any caller-provided overrides.
     */
    public resolveParameters(
        entry: SimulationHistoryEntry,
        overrides: ReplayOverrides = {}
    ): ReplayParameters {
        return {
            contractId: overrides.contractId ?? entry.contractId,
            functionName: overrides.functionName ?? entry.functionName,
            args: overrides.args ?? JSON.parse(JSON.stringify(entry.args)),
            network: overrides.network ?? entry.network,
            source: overrides.source ?? entry.source,
            method: overrides.method ?? entry.method,
            label: overrides.label,
        };
    }

    /**
     * Determine which fields differ between the original entry
     * and the provided overrides.
     */
    public getModifiedFields(
        entry: SimulationHistoryEntry,
        overrides: ReplayOverrides
    ): string[] {
        const modified: string[] = [];

        if (overrides.contractId !== undefined && overrides.contractId !== entry.contractId) {
            modified.push('contractId');
        }
        if (overrides.functionName !== undefined && overrides.functionName !== entry.functionName) {
            modified.push('functionName');
        }
        if (overrides.args !== undefined) {
            const originalJson = JSON.stringify(entry.args);
            const overrideJson = JSON.stringify(overrides.args);
            if (originalJson !== overrideJson) {
                modified.push('args');
            }
        }
        if (overrides.network !== undefined && overrides.network !== entry.network) {
            modified.push('network');
        }
        if (overrides.source !== undefined && overrides.source !== entry.source) {
            modified.push('source');
        }
        if (overrides.method !== undefined && overrides.method !== entry.method) {
            modified.push('method');
        }

        return modified;
    }

    /**
     * Export a set of replay results as a JSON string for reporting.
     */
    public exportReplayResults(results: ReplayResult[]): string {
        return JSON.stringify({
            exportedAt: new Date().toISOString(),
            totalReplays: results.length,
            succeeded: results.filter(r => r.outcome === 'success').length,
            failed: results.filter(r => r.outcome === 'failure').length,
            outcomeChanges: results.filter(r => r.comparison.outcomeChanged).length,
            results: results.map(r => ({
                originalEntryId: r.originalEntryId,
                newEntryId: r.newEntryId,
                outcome: r.outcome,
                durationMs: r.durationMs,
                parametersModified: r.comparison.parametersModified,
                modifiedFields: r.comparison.modifiedFields,
                outcomeChanged: r.comparison.outcomeChanged,
                originalOutcome: r.comparison.originalOutcome,
                stateChanges: r.stateDiff?.summary.totalChanges ?? 0,
            })),
        }, null, 2);
    }

    // ── Private helpers ──────────────────────────────────────

    private buildPreComparison(
        original: SimulationHistoryEntry,
        _parameters: ReplayParameters,
        overrides: ReplayOverrides
    ): ReplayComparison {
        const modifiedFields = this.getModifiedFields(original, overrides);
        return {
            outcomeChanged: false, // will be updated after execution
            parametersModified: modifiedFields.length > 0,
            modifiedFields,
            originalOutcome: original.outcome,
            replayOutcome: original.outcome, // placeholder, updated after execution
        };
    }

    private log(msg: string): void {
        this.outputChannel.appendLine(msg);
    }
}
