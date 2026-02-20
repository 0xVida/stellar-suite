// ============================================================
// src/types/resourceProfile.ts
// Type definitions for simulation resource usage profiling.
// ============================================================

// ── Resource Categories ──────────────────────────────────────

/** Severity level for resource usage warnings. */
export type ResourceWarningSeverity = 'info' | 'warning' | 'critical';

/** Category of a resource metric. */
export type ResourceCategory = 'cpu' | 'memory' | 'storage' | 'time';

// ── Core Resource Data ───────────────────────────────────────

/** Raw resource usage captured from a single simulation. */
export interface ResourceUsageSnapshot {
    /** CPU instruction count reported by the simulation. */
    cpuInstructions: number;
    /** Memory usage in bytes. */
    memoryBytes: number;
    /** Number of storage read operations. */
    storageReads: number;
    /** Number of storage write operations. */
    storageWrites: number;
    /** Total execution time in milliseconds. */
    executionTimeMs: number;
    /** ISO-8601 timestamp when the snapshot was taken. */
    timestamp: string;
}

/** Breakdown of execution time into phases. */
export interface ExecutionTimeBreakdown {
    /** Time spent in setup / parameter resolution (ms). */
    setupMs: number;
    /** Time spent executing the contract logic (ms). */
    executionMs: number;
    /** Time spent on storage I/O (ms). */
    storageMs: number;
    /** Total wall-clock time (ms). */
    totalMs: number;
}

// ── Profiling Result ─────────────────────────────────────────

/** Full profiling result for a single simulation run. */
export interface ResourceProfile {
    /** Unique identifier for this profile. */
    id: string;
    /** ID of the related simulation history entry, if any. */
    simulationId?: string;
    /** Contract ID that was profiled. */
    contractId: string;
    /** Function that was invoked. */
    functionName: string;
    /** Network used for the simulation. */
    network: string;
    /** Raw resource usage snapshot. */
    usage: ResourceUsageSnapshot;
    /** Execution time breakdown by phase. */
    timeBreakdown: ExecutionTimeBreakdown;
    /** Warnings generated during profiling. */
    warnings: ResourceWarning[];
    /** ISO-8601 timestamp when the profile was created. */
    createdAt: string;
    /** Optional user-provided label. */
    label?: string;
}

// ── Warnings ─────────────────────────────────────────────────

/** A warning raised when a resource metric exceeds a threshold. */
export interface ResourceWarning {
    /** Which resource category triggered the warning. */
    category: ResourceCategory;
    /** Severity of the warning. */
    severity: ResourceWarningSeverity;
    /** Human-readable warning message. */
    message: string;
    /** Actual value that triggered the warning. */
    actualValue: number;
    /** Threshold that was exceeded. */
    threshold: number;
}

// ── Thresholds ───────────────────────────────────────────────

/** Configurable thresholds for resource warning generation. */
export interface ResourceThresholds {
    /** CPU instruction count thresholds. */
    cpu: ThresholdLevels;
    /** Memory usage (bytes) thresholds. */
    memory: ThresholdLevels;
    /** Storage operation count thresholds (reads + writes). */
    storage: ThresholdLevels;
    /** Execution time (ms) thresholds. */
    time: ThresholdLevels;
}

/** Warning and critical thresholds for a single metric. */
export interface ThresholdLevels {
    warning: number;
    critical: number;
}

// ── Comparison ───────────────────────────────────────────────

/** Result of comparing two resource profiles. */
export interface ResourceComparison {
    /** Profile used as the baseline. */
    baselineId: string;
    /** Profile being compared against the baseline. */
    currentId: string;
    /** Per-metric deltas between baseline and current. */
    deltas: ResourceDelta[];
    /** Overall summary of the comparison. */
    summary: ComparisonSummary;
}

/** Delta for a single resource metric. */
export interface ResourceDelta {
    /** Name of the metric (e.g. 'cpuInstructions'). */
    metric: string;
    /** Human-readable label for the metric. */
    label: string;
    /** Category of the metric. */
    category: ResourceCategory;
    /** Baseline value. */
    baselineValue: number;
    /** Current value. */
    currentValue: number;
    /** Absolute change (current − baseline). */
    absoluteChange: number;
    /** Percentage change relative to baseline. */
    percentageChange: number;
    /** Whether the change is an improvement (lower is better). */
    improved: boolean;
}

/** High-level summary of a resource comparison. */
export interface ComparisonSummary {
    /** Number of metrics that improved. */
    improved: number;
    /** Number of metrics that regressed. */
    regressed: number;
    /** Number of metrics that stayed the same. */
    unchanged: number;
    /** Overall assessment. */
    verdict: 'improved' | 'regressed' | 'mixed' | 'unchanged';
}

// ── Export ────────────────────────────────────────────────────

/** Portable format for exporting resource profiles. */
export interface ResourceProfileExport {
    /** Format version for forward compatibility. */
    version: number;
    /** ISO-8601 timestamp of the export. */
    exportedAt: string;
    /** Profiles included in the export. */
    profiles: ResourceProfile[];
    /** Comparisons included in the export, if any. */
    comparisons: ResourceComparison[];
}

// ── Aggregate Statistics ─────────────────────────────────────

/** Aggregate statistics across multiple profiles. */
export interface ResourceProfileStats {
    /** Total number of profiles. */
    totalProfiles: number;
    /** Number of distinct contracts profiled. */
    uniqueContracts: number;
    /** Number of distinct functions profiled. */
    uniqueFunctions: number;
    /** Average resource usage across all profiles. */
    averages: ResourceUsageSnapshot;
    /** Peak (maximum) resource usage across all profiles. */
    peaks: ResourceUsageSnapshot;
    /** Total number of warnings generated. */
    totalWarnings: number;
    /** Breakdown of warnings by severity. */
    warningsBySeverity: Record<ResourceWarningSeverity, number>;
}
