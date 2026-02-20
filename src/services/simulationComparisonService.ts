// ============================================================
// src/services/simulationComparisonService.ts
// Service for comparing multiple simulation results side-by-side.
// Highlights differences in outcomes, resource usage, state changes,
// and provides similarity analysis.
// ============================================================

import {
    SimulationHistoryEntry,
    SimulationOutcome,
} from './simulationHistoryService';
import {
    StateDiff,
    StateDiffChange,
    StateSnapshot,
    StateDiffChangeType,
} from '../types/simulationState';

// ── Types ─────────────────────────────────────────────────────

/** Comparison metric type */
export type ComparisonMetric = 'outcome' | 'resourceUsage' | 'stateChanges' | 'parameters' | 'timing';

/** Difference severity level */
export type DifferenceSeverity = 'critical' | 'major' | 'minor' | 'none';

/** Resource usage comparison */
export interface ResourceUsageComparison {
    /** CPU instructions comparison */
    cpuInstructions?: {
        values: (number | undefined)[];
        min: number;
        max: number;
        avg: number;
        variance: number;
        percentDifference: number;
    };
    /** Memory bytes comparison */
    memoryBytes?: {
        values: (number | undefined)[];
        min: number;
        max: number;
        avg: number;
        variance: number;
        percentDifference: number;
    };
    /** Overall resource usage similarity (0-100%) */
    similarity: number;
}

/** State changes comparison */
export interface StateChangesComparison {
    /** Common state changes across all simulations */
    commonChanges: StateDiffChange[];
    /** Unique changes per simulation */
    uniqueChanges: Map<string, StateDiffChange[]>;
    /** Conflicting changes (same key, different values) */
    conflicts: StateChangeConflict[];
    /** Overall state change similarity (0-100%) */
    similarity: number;
    /** Summary statistics */
    summary: {
        totalCommonChanges: number;
        totalUniqueChanges: number;
        totalConflicts: number;
    };
}

/** Conflicting state change */
export interface StateChangeConflict {
    key: string;
    contractId?: string;
    changeType: StateDiffChangeType;
    values: Map<string, unknown>; // simulation ID -> value
}

/** Parameter comparison */
export interface ParameterComparison {
    /** Contract ID matches */
    contractIdMatches: boolean;
    /** Function name matches */
    functionNameMatches: boolean;
    /** Arguments match */
    argsMatch: boolean;
    /** Network matches */
    networkMatches: boolean;
    /** Unique contract IDs */
    uniqueContractIds: string[];
    /** Unique function names */
    uniqueFunctionNames: string[];
    /** Overall parameter similarity (0-100%) */
    similarity: number;
}

/** Timing comparison */
export interface TimingComparison {
    durations: (number | undefined)[];
    min?: number;
    max?: number;
    avg?: number;
    variance: number;
    percentDifference: number;
}

/** Outcome comparison */
export interface OutcomeComparison {
    /** All simulations have same outcome */
    allMatch: boolean;
    /** Outcome distribution */
    distribution: Record<SimulationOutcome, number>;
    /** List of outcomes in order */
    outcomes: SimulationOutcome[];
    /** Similarity score (0-100%) */
    similarity: number;
}

/** Difference detected between simulations */
export interface SimulationDifference {
    metric: ComparisonMetric;
    severity: DifferenceSeverity;
    description: string;
    details: Record<string, unknown>;
}

/** Similarity detected between simulations */
export interface SimulationSimilarity {
    metric: ComparisonMetric;
    score: number; // 0-100%
    description: string;
}

/** Complete comparison result */
export interface SimulationComparisonResult {
    /** Simulations being compared */
    simulations: SimulationHistoryEntry[];
    /** Simulation IDs in order */
    simulationIds: string[];
    /** Number of simulations compared */
    count: number;
    /** Comparison timestamp */
    comparedAt: string;
    
    /** Outcome comparison */
    outcomeComparison: OutcomeComparison;
    /** Resource usage comparison */
    resourceComparison: ResourceUsageComparison;
    /** State changes comparison */
    stateComparison: StateChangesComparison;
    /** Parameter comparison */
    parameterComparison: ParameterComparison;
    /** Timing comparison */
    timingComparison: TimingComparison;
    
    /** List of all differences */
    differences: SimulationDifference[];
    /** List of all similarities */
    similarities: SimulationSimilarity[];
    
    /** Overall similarity score (0-100%) */
    overallSimilarity: number;
    
    /** Optional comparison label */
    label?: string;
}

/** Options for comparison export */
export interface ComparisonExportOptions {
    /** Include full simulation data */
    includeFullData?: boolean;
    /** Include state snapshots */
    includeStateSnapshots?: boolean;
    /** Format for export */
    format?: 'json' | 'markdown' | 'html';
    /** Include visual charts */
    includeCharts?: boolean;
}

// ── Service ─────────────────────────────────────────────────────

/**
 * Service for comparing multiple simulation results.
 * Provides detailed analysis of differences and similarities.
 */
export class SimulationComparisonService {
    /**
     * Compare multiple simulation results
     */
    public compareSimulations(
        simulations: SimulationHistoryEntry[],
        options?: { label?: string }
    ): SimulationComparisonResult {
        if (simulations.length < 2) {
            throw new Error('At least 2 simulations are required for comparison');
        }

        const outcomeComparison = this.compareOutcomes(simulations);
        const resourceComparison = this.compareResourceUsage(simulations);
        const stateComparison = this.compareStateChanges(simulations);
        const parameterComparison = this.compareParameters(simulations);
        const timingComparison = this.compareTiming(simulations);

        const differences = this.detectDifferences(
            outcomeComparison,
            resourceComparison,
            stateComparison,
            parameterComparison,
            timingComparison
        );

        const similarities = this.detectSimilarities(
            outcomeComparison,
            resourceComparison,
            stateComparison,
            parameterComparison,
            timingComparison
        );

        const overallSimilarity = this.calculateOverallSimilarity(
            outcomeComparison,
            resourceComparison,
            stateComparison,
            parameterComparison
        );

        return {
            simulations,
            simulationIds: simulations.map(s => s.id),
            count: simulations.length,
            comparedAt: new Date().toISOString(),
            outcomeComparison,
            resourceComparison,
            stateComparison,
            parameterComparison,
            timingComparison,
            differences,
            similarities,
            overallSimilarity,
            label: options?.label,
        };
    }

    /**
     * Compare outcomes across simulations
     */
    private compareOutcomes(simulations: SimulationHistoryEntry[]): OutcomeComparison {
        const outcomes = simulations.map(s => s.outcome);
        const uniqueOutcomes = new Set(outcomes);
        const allMatch = uniqueOutcomes.size === 1;

        const distribution: Record<SimulationOutcome, number> = {
            success: 0,
            failure: 0,
        };

        outcomes.forEach(outcome => {
            distribution[outcome]++;
        });

        const similarity = allMatch ? 100 : 0;

        return {
            allMatch,
            distribution,
            outcomes,
            similarity,
        };
    }

    /**
     * Compare resource usage across simulations
     */
    private compareResourceUsage(simulations: SimulationHistoryEntry[]): ResourceUsageComparison {
        const cpuValues = simulations.map(s => s.resourceUsage?.cpuInstructions);
        const memValues = simulations.map(s => s.resourceUsage?.memoryBytes);

        const cpuComparison = this.compareNumericMetric(cpuValues);
        const memComparison = this.compareNumericMetric(memValues);

        // Calculate overall similarity based on variance
        const cpuSimilarity = cpuComparison ? (100 - Math.min(cpuComparison.percentDifference, 100)) : 100;
        const memSimilarity = memComparison ? (100 - Math.min(memComparison.percentDifference, 100)) : 100;
        const similarity = (cpuSimilarity + memSimilarity) / 2;

        return {
            cpuInstructions: cpuComparison,
            memoryBytes: memComparison,
            similarity,
        };
    }

    /**
     * Compare numeric metric values
     */
    private compareNumericMetric(values: (number | undefined)[]) {
        const defined = values.filter((v): v is number => v !== undefined);
        if (defined.length === 0) {
            return undefined;
        }

        const min = Math.min(...defined);
        const max = Math.max(...defined);
        const avg = defined.reduce((sum, v) => sum + v, 0) / defined.length;
        const variance = defined.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / defined.length;
        const percentDifference = avg === 0 ? 0 : ((max - min) / avg) * 100;

        return {
            values,
            min,
            max,
            avg,
            variance,
            percentDifference,
        };
    }

    /**
     * Compare state changes across simulations
     */
    private compareStateChanges(simulations: SimulationHistoryEntry[]): StateChangesComparison {
        const allChanges = simulations.map(s => this.extractAllChanges(s.stateDiff));
        
        // Find common changes (appear in all simulations with same value)
        const commonChanges: StateDiffChange[] = [];
        const uniqueChanges = new Map<string, StateDiffChange[]>();
        const conflicts: StateChangeConflict[] = [];

        if (allChanges.length === 0) {
            return {
                commonChanges: [],
                uniqueChanges: new Map(),
                conflicts: [],
                similarity: 100,
                summary: {
                    totalCommonChanges: 0,
                    totalUniqueChanges: 0,
                    totalConflicts: 0,
                },
            };
        }

        // Build a map of all unique keys
        const allKeys = new Set<string>();
        allChanges.forEach(changes => {
            changes.forEach(change => allKeys.add(change.key));
        });

        // Analyze each key
        allKeys.forEach(key => {
            const changesForKey = allChanges.map((changes, idx) => ({
                simId: simulations[idx].id,
                change: changes.find(c => c.key === key),
            }));

            const presentIn = changesForKey.filter(c => c.change !== undefined);

            if (presentIn.length === 0) {
                return; // No changes for this key
            }

            if (presentIn.length === simulations.length) {
                // Present in all simulations - check if values match
                const firstChange = presentIn[0].change!;
                const allSameValue = presentIn.every(c =>
                    JSON.stringify(c.change!.afterValue) === JSON.stringify(firstChange.afterValue)
                );

                if (allSameValue) {
                    commonChanges.push(firstChange);
                } else {
                    // Conflict: same key, different values
                    const valueMap = new Map<string, unknown>();
                    presentIn.forEach(c => {
                        valueMap.set(c.simId, c.change!.afterValue);
                    });
                    conflicts.push({
                        key,
                        contractId: firstChange.contractId,
                        changeType: firstChange.type,
                        values: valueMap,
                    });
                }
            } else {
                // Unique to some simulations
                presentIn.forEach(c => {
                    const existing = uniqueChanges.get(c.simId) || [];
                    existing.push(c.change!);
                    uniqueChanges.set(c.simId, existing);
                });
            }
        });

        const totalUniqueChanges = Array.from(uniqueChanges.values())
            .reduce((sum, changes) => sum + changes.length, 0);

        // Calculate similarity based on ratio of common to total changes
        const totalChanges = commonChanges.length + totalUniqueChanges + conflicts.length;
        const similarity = totalChanges === 0 ? 100 : (commonChanges.length / totalChanges) * 100;

        return {
            commonChanges,
            uniqueChanges,
            conflicts,
            similarity,
            summary: {
                totalCommonChanges: commonChanges.length,
                totalUniqueChanges,
                totalConflicts: conflicts.length,
            },
        };
    }

    /**
     * Extract all changes from a state diff
     */
    private extractAllChanges(stateDiff?: StateDiff): StateDiffChange[] {
        if (!stateDiff) {
            return [];
        }
        return [
            ...stateDiff.created,
            ...stateDiff.modified,
            ...stateDiff.deleted,
        ];
    }

    /**
     * Compare parameters across simulations
     */
    private compareParameters(simulations: SimulationHistoryEntry[]): ParameterComparison {
        const contractIds = simulations.map(s => s.contractId);
        const functionNames = simulations.map(s => s.functionName);
        const networks = simulations.map(s => s.network);

        const contractIdMatches = new Set(contractIds).size === 1;
        const functionNameMatches = new Set(functionNames).size === 1;
        const networkMatches = new Set(networks).size === 1;

        // Compare arguments (complex comparison)
        const argsMatch = this.compareArgs(simulations.map(s => s.args));

        const uniqueContractIds = Array.from(new Set(contractIds));
        const uniqueFunctionNames = Array.from(new Set(functionNames));

        // Calculate similarity
        let matchCount = 0;
        if (contractIdMatches) matchCount++;
        if (functionNameMatches) matchCount++;
        if (argsMatch) matchCount++;
        if (networkMatches) matchCount++;

        const similarity = (matchCount / 4) * 100;

        return {
            contractIdMatches,
            functionNameMatches,
            argsMatch,
            networkMatches,
            uniqueContractIds,
            uniqueFunctionNames,
            similarity,
        };
    }

    /**
     * Compare arguments across simulations
     */
    private compareArgs(argsList: unknown[][]): boolean {
        if (argsList.length === 0) return true;
        
        const first = JSON.stringify(argsList[0]);
        return argsList.every(args => JSON.stringify(args) === first);
    }

    /**
     * Compare timing across simulations
     */
    private compareTiming(simulations: SimulationHistoryEntry[]): TimingComparison {
        const durations = simulations.map(s => s.durationMs);
        const defined = durations.filter((d): d is number => d !== undefined);

        if (defined.length === 0) {
            return {
                durations,
                variance: 0,
                percentDifference: 0,
            };
        }

        const min = Math.min(...defined);
        const max = Math.max(...defined);
        const avg = defined.reduce((sum, d) => sum + d, 0) / defined.length;
        const variance = defined.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / defined.length;
        const percentDifference = avg === 0 ? 0 : ((max - min) / avg) * 100;

        return {
            durations,
            min,
            max,
            avg,
            variance,
            percentDifference,
        };
    }

    /**
     * Detect differences between simulations
     */
    private detectDifferences(
        outcome: OutcomeComparison,
        resource: ResourceUsageComparison,
        state: StateChangesComparison,
        params: ParameterComparison,
        timing: TimingComparison
    ): SimulationDifference[] {
        const differences: SimulationDifference[] = [];

        // Outcome differences
        if (!outcome.allMatch) {
            differences.push({
                metric: 'outcome',
                severity: 'critical',
                description: 'Simulation outcomes differ',
                details: {
                    distribution: outcome.distribution,
                    outcomes: outcome.outcomes,
                },
            });
        }

        // Resource usage differences
        if (resource.cpuInstructions && resource.cpuInstructions.percentDifference > 20) {
            differences.push({
                metric: 'resourceUsage',
                severity: resource.cpuInstructions.percentDifference > 50 ? 'major' : 'minor',
                description: `CPU usage varies by ${resource.cpuInstructions.percentDifference.toFixed(1)}%`,
                details: {
                    min: resource.cpuInstructions.min,
                    max: resource.cpuInstructions.max,
                    avg: resource.cpuInstructions.avg,
                },
            });
        }

        if (resource.memoryBytes && resource.memoryBytes.percentDifference > 20) {
            differences.push({
                metric: 'resourceUsage',
                severity: resource.memoryBytes.percentDifference > 50 ? 'major' : 'minor',
                description: `Memory usage varies by ${resource.memoryBytes.percentDifference.toFixed(1)}%`,
                details: {
                    min: resource.memoryBytes.min,
                    max: resource.memoryBytes.max,
                    avg: resource.memoryBytes.avg,
                },
            });
        }

        // State change differences
        if (state.summary.totalConflicts > 0) {
            differences.push({
                metric: 'stateChanges',
                severity: 'major',
                description: `${state.summary.totalConflicts} conflicting state changes detected`,
                details: {
                    conflicts: state.conflicts.map(c => ({ key: c.key, values: Array.from(c.values.entries()) })),
                },
            });
        }

        if (state.summary.totalUniqueChanges > 0) {
            differences.push({
                metric: 'stateChanges',
                severity: 'minor',
                description: `${state.summary.totalUniqueChanges} unique state changes across simulations`,
                details: {
                    uniqueChanges: state.summary.totalUniqueChanges,
                },
            });
        }

        // Parameter differences
        if (!params.contractIdMatches) {
            differences.push({
                metric: 'parameters',
                severity: 'major',
                description: 'Different contract IDs',
                details: {
                    contractIds: params.uniqueContractIds,
                },
            });
        }

        if (!params.functionNameMatches) {
            differences.push({
                metric: 'parameters',
                severity: 'major',
                description: 'Different function names',
                details: {
                    functionNames: params.uniqueFunctionNames,
                },
            });
        }

        if (!params.argsMatch) {
            differences.push({
                metric: 'parameters',
                severity: 'minor',
                description: 'Different function arguments',
                details: {},
            });
        }

        // Timing differences
        if (timing.percentDifference > 30) {
            differences.push({
                metric: 'timing',
                severity: timing.percentDifference > 100 ? 'major' : 'minor',
                description: `Execution time varies by ${timing.percentDifference.toFixed(1)}%`,
                details: {
                    min: timing.min,
                    max: timing.max,
                    avg: timing.avg,
                },
            });
        }

        return differences;
    }

    /**
     * Detect similarities between simulations
     */
    private detectSimilarities(
        outcome: OutcomeComparison,
        resource: ResourceUsageComparison,
        state: StateChangesComparison,
        params: ParameterComparison,
        timing: TimingComparison
    ): SimulationSimilarity[] {
        const similarities: SimulationSimilarity[] = [];

        if (outcome.allMatch) {
            similarities.push({
                metric: 'outcome',
                score: 100,
                description: 'All simulations have the same outcome',
            });
        }

        if (resource.similarity > 80) {
            similarities.push({
                metric: 'resourceUsage',
                score: resource.similarity,
                description: 'Resource usage is very similar across simulations',
            });
        }

        if (state.similarity > 70) {
            similarities.push({
                metric: 'stateChanges',
                score: state.similarity,
                description: `${state.summary.totalCommonChanges} common state changes`,
            });
        }

        if (params.similarity === 100) {
            similarities.push({
                metric: 'parameters',
                score: 100,
                description: 'All parameters are identical',
            });
        }

        if (timing.percentDifference < 10) {
            similarities.push({
                metric: 'timing',
                score: 100 - timing.percentDifference,
                description: 'Execution times are very consistent',
            });
        }

        return similarities;
    }

    /**
     * Calculate overall similarity score
     */
    private calculateOverallSimilarity(
        outcome: OutcomeComparison,
        resource: ResourceUsageComparison,
        state: StateChangesComparison,
        params: ParameterComparison
    ): number {
        const scores = [
            outcome.similarity,
            resource.similarity,
            state.similarity,
            params.similarity,
        ];

        return scores.reduce((sum, score) => sum + score, 0) / scores.length;
    }

    /**
     * Export comparison results
     */
    public exportComparison(
        comparison: SimulationComparisonResult,
        options: ComparisonExportOptions = {}
    ): string {
        const format = options.format || 'json';

        switch (format) {
            case 'json':
                return this.exportAsJson(comparison, options);
            case 'markdown':
                return this.exportAsMarkdown(comparison, options);
            case 'html':
                return this.exportAsHtml(comparison, options);
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Export as JSON
     */
    private exportAsJson(
        comparison: SimulationComparisonResult,
        options: ComparisonExportOptions
    ): string {
        const payload: any = {
            comparedAt: comparison.comparedAt,
            count: comparison.count,
            label: comparison.label,
            overallSimilarity: comparison.overallSimilarity,
            outcomeComparison: comparison.outcomeComparison,
            resourceComparison: comparison.resourceComparison,
            stateComparison: {
                ...comparison.stateComparison,
                uniqueChanges: Array.from(comparison.stateComparison.uniqueChanges.entries()),
            },
            parameterComparison: comparison.parameterComparison,
            timingComparison: comparison.timingComparison,
            differences: comparison.differences,
            similarities: comparison.similarities,
        };

        if (options.includeFullData) {
            payload.simulations = comparison.simulations.map(s => {
                const sim: any = { ...s };
                if (!options.includeStateSnapshots) {
                    delete sim.stateSnapshotBefore;
                    delete sim.stateSnapshotAfter;
                }
                return sim;
            });
        } else {
            payload.simulationIds = comparison.simulationIds;
        }

        return JSON.stringify(payload, null, 2);
    }

    /**
     * Export as Markdown
     */
    private exportAsMarkdown(
        comparison: SimulationComparisonResult,
        options: ComparisonExportOptions
    ): string {
        let md = `# Simulation Comparison Report\n\n`;
        
        if (comparison.label) {
            md += `**Label:** ${comparison.label}\n\n`;
        }
        
        md += `**Compared At:** ${comparison.comparedAt}\n`;
        md += `**Number of Simulations:** ${comparison.count}\n`;
        md += `**Overall Similarity:** ${comparison.overallSimilarity.toFixed(1)}%\n\n`;

        md += `## Summary\n\n`;
        md += `- **Differences Found:** ${comparison.differences.length}\n`;
        md += `- **Similarities Found:** ${comparison.similarities.length}\n\n`;

        if (comparison.differences.length > 0) {
            md += `## Differences\n\n`;
            comparison.differences.forEach((diff, idx) => {
                md += `${idx + 1}. **${diff.metric}** (${diff.severity}): ${diff.description}\n`;
            });
            md += `\n`;
        }

        if (comparison.similarities.length > 0) {
            md += `## Similarities\n\n`;
            comparison.similarities.forEach((sim, idx) => {
                md += `${idx + 1}. **${sim.metric}** (${sim.score.toFixed(1)}%): ${sim.description}\n`;
            });
            md += `\n`;
        }

        md += `## Detailed Comparison\n\n`;
        
        md += `### Outcomes\n\n`;
        md += `- All Match: ${comparison.outcomeComparison.allMatch ? 'Yes' : 'No'}\n`;
        md += `- Success: ${comparison.outcomeComparison.distribution.success}\n`;
        md += `- Failure: ${comparison.outcomeComparison.distribution.failure}\n\n`;

        md += `### Resource Usage\n\n`;
        if (comparison.resourceComparison.cpuInstructions) {
            const cpu = comparison.resourceComparison.cpuInstructions;
            md += `**CPU Instructions:**\n`;
            md += `- Min: ${cpu.min.toLocaleString()}\n`;
            md += `- Max: ${cpu.max.toLocaleString()}\n`;
            md += `- Avg: ${cpu.avg.toLocaleString()}\n`;
            md += `- Variance: ${cpu.percentDifference.toFixed(1)}%\n\n`;
        }

        if (comparison.resourceComparison.memoryBytes) {
            const mem = comparison.resourceComparison.memoryBytes;
            md += `**Memory Usage:**\n`;
            md += `- Min: ${(mem.min / 1024).toFixed(2)} KB\n`;
            md += `- Max: ${(mem.max / 1024).toFixed(2)} KB\n`;
            md += `- Avg: ${(mem.avg / 1024).toFixed(2)} KB\n`;
            md += `- Variance: ${mem.percentDifference.toFixed(1)}%\n\n`;
        }

        md += `### State Changes\n\n`;
        md += `- Common Changes: ${comparison.stateComparison.summary.totalCommonChanges}\n`;
        md += `- Unique Changes: ${comparison.stateComparison.summary.totalUniqueChanges}\n`;
        md += `- Conflicts: ${comparison.stateComparison.summary.totalConflicts}\n`;
        md += `- Similarity: ${comparison.stateComparison.similarity.toFixed(1)}%\n\n`;

        return md;
    }

    /**
     * Export as HTML
     */
    private exportAsHtml(
        comparison: SimulationComparisonResult,
        options: ComparisonExportOptions
    ): string {
        // For now, convert markdown to HTML-like structure
        const md = this.exportAsMarkdown(comparison, options);
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Simulation Comparison Report</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; max-width: 1200px; margin: 0 auto; }
        h1, h2, h3 { color: #333; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .critical { color: #d32f2f; }
        .major { color: #f57c00; }
        .minor { color: #fbc02d; }
    </style>
</head>
<body>
    <pre>${md}</pre>
</body>
</html>`;
    }
}
