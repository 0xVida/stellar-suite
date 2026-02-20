// ============================================================
// src/services/resourceProfilingService.ts
// Captures, stores, compares, and exports resource usage
// profiles from simulation runs. Generates warnings when
// resource metrics exceed configurable thresholds.
// ============================================================

import {
    ResourceUsageSnapshot,
    ExecutionTimeBreakdown,
    ResourceProfile,
    ResourceWarning,
    ResourceWarningSeverity,
    ResourceCategory,
    ResourceThresholds,
    ThresholdLevels,
    ResourceComparison,
    ResourceDelta,
    ComparisonSummary,
    ResourceProfileExport,
    ResourceProfileStats,
} from '../types/resourceProfile';

// ── Minimal VS Code-compatible interfaces ────────────────────

interface SimpleOutputChannel {
    appendLine(value: string): void;
}

interface SimpleWorkspaceState {
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): Thenable<void>;
}

interface SimpleExtensionContext {
    workspaceState: SimpleWorkspaceState;
}

// ── Constants ────────────────────────────────────────────────

const STORAGE_KEY = 'stellarSuite.resourceProfiles';
const MAX_PROFILES = 200;
const EXPORT_VERSION = 1;

/** Default thresholds based on typical Soroban contract limits. */
const DEFAULT_THRESHOLDS: ResourceThresholds = {
    cpu: { warning: 50_000_000, critical: 100_000_000 },
    memory: { warning: 5_242_880, critical: 10_485_760 },   // 5 MB / 10 MB
    storage: { warning: 50, critical: 100 },
    time: { warning: 5_000, critical: 15_000 },              // 5s / 15s
};

// ── Service class ─────────────────────────────────────────────

/**
 * ResourceProfilingService captures detailed resource usage from
 * simulation runs and provides comparison, export, and warning
 * capabilities to help developers optimise their contracts.
 *
 * Responsibilities:
 * - Building resource profiles from raw simulation data
 * - Persisting profiles in workspace state
 * - Generating threshold-based warnings
 * - Comparing profiles to detect regressions / improvements
 * - Computing aggregate statistics
 * - Exporting / importing profile data
 */
export class ResourceProfilingService {
    private readonly outputChannel: SimpleOutputChannel;
    private thresholds: ResourceThresholds;

    constructor(
        private readonly context: SimpleExtensionContext,
        outputChannel?: SimpleOutputChannel,
        thresholds?: ResourceThresholds
    ) {
        this.outputChannel = outputChannel ?? {
            appendLine: (_msg: string) => { /* no-op */ },
        };
        this.thresholds = thresholds ?? { ...DEFAULT_THRESHOLDS };
    }

    // ── Profile creation ─────────────────────────────────────

    /**
     * Create and store a resource profile from simulation data.
     *
     * @param params - Raw simulation metadata and resource numbers.
     * @returns The persisted `ResourceProfile`.
     */
    public async recordProfile(params: {
        simulationId?: string;
        contractId: string;
        functionName: string;
        network: string;
        cpuInstructions?: number;
        memoryBytes?: number;
        storageReads?: number;
        storageWrites?: number;
        executionTimeMs?: number;
        setupTimeMs?: number;
        storageTimeMs?: number;
        label?: string;
    }): Promise<ResourceProfile> {
        const now = new Date().toISOString();
        const totalMs = params.executionTimeMs ?? 0;

        const usage: ResourceUsageSnapshot = {
            cpuInstructions: params.cpuInstructions ?? 0,
            memoryBytes: params.memoryBytes ?? 0,
            storageReads: params.storageReads ?? 0,
            storageWrites: params.storageWrites ?? 0,
            executionTimeMs: totalMs,
            timestamp: now,
        };

        const setupMs = params.setupTimeMs ?? 0;
        const storageMs = params.storageTimeMs ?? 0;
        const executionMs = Math.max(0, totalMs - setupMs - storageMs);

        const timeBreakdown: ExecutionTimeBreakdown = {
            setupMs,
            executionMs,
            storageMs,
            totalMs,
        };

        const warnings = this.evaluateThresholds(usage);

        const profile: ResourceProfile = {
            id: this.generateId(),
            simulationId: params.simulationId,
            contractId: params.contractId,
            functionName: params.functionName,
            network: params.network,
            usage,
            timeBreakdown,
            warnings,
            createdAt: now,
            label: params.label,
        };

        const profiles = this.loadProfiles();
        profiles.push(profile);

        if (profiles.length > MAX_PROFILES) {
            profiles.splice(0, profiles.length - MAX_PROFILES);
        }

        await this.saveProfiles(profiles);

        this.log(
            `[ResourceProfile] Recorded profile for ${params.functionName}() on ${params.contractId}` +
            (warnings.length > 0 ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : '')
        );

        return profile;
    }

    // ── Retrieval ────────────────────────────────────────────

    /** Retrieve a single profile by ID. */
    public getProfile(id: string): ResourceProfile | undefined {
        return this.loadProfiles().find(p => p.id === id);
    }

    /** Get all stored profiles, newest first. */
    public getAllProfiles(): ResourceProfile[] {
        return this.loadProfiles()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    /** Get profiles for a specific contract. */
    public getProfilesByContract(contractId: string): ResourceProfile[] {
        return this.getAllProfiles().filter(p => p.contractId === contractId);
    }

    /** Get profiles for a specific function on a contract. */
    public getProfilesByFunction(contractId: string, functionName: string): ResourceProfile[] {
        return this.getAllProfiles().filter(
            p => p.contractId === contractId && p.functionName === functionName
        );
    }

    /** Get the total number of stored profiles. */
    public getProfileCount(): number {
        return this.loadProfiles().length;
    }

    // ── Deletion ─────────────────────────────────────────────

    /** Delete a single profile by ID. */
    public async deleteProfile(id: string): Promise<boolean> {
        const profiles = this.loadProfiles();
        const idx = profiles.findIndex(p => p.id === id);
        if (idx === -1) { return false; }

        profiles.splice(idx, 1);
        await this.saveProfiles(profiles);
        this.log(`[ResourceProfile] Deleted profile ${id}`);
        return true;
    }

    /** Clear all stored profiles. */
    public async clearProfiles(): Promise<void> {
        await this.saveProfiles([]);
        this.log('[ResourceProfile] All profiles cleared');
    }

    // ── Threshold warnings ───────────────────────────────────

    /**
     * Evaluate a resource snapshot against the configured thresholds
     * and return any warnings.
     */
    public evaluateThresholds(usage: ResourceUsageSnapshot): ResourceWarning[] {
        const warnings: ResourceWarning[] = [];

        this.checkMetric(warnings, 'cpu', 'CPU Instructions', usage.cpuInstructions, this.thresholds.cpu);
        this.checkMetric(warnings, 'memory', 'Memory Usage', usage.memoryBytes, this.thresholds.memory);

        const totalStorageOps = usage.storageReads + usage.storageWrites;
        this.checkMetric(warnings, 'storage', 'Storage Operations', totalStorageOps, this.thresholds.storage);

        this.checkMetric(warnings, 'time', 'Execution Time', usage.executionTimeMs, this.thresholds.time);

        return warnings;
    }

    /** Update the thresholds used for warning generation. */
    public setThresholds(thresholds: ResourceThresholds): void {
        this.thresholds = this.deepCopyThresholds(thresholds);
        this.log('[ResourceProfile] Thresholds updated');
    }

    /** Get the current thresholds. */
    public getThresholds(): ResourceThresholds {
        return this.deepCopyThresholds(this.thresholds);
    }

    // ── Comparison ───────────────────────────────────────────

    /**
     * Compare two profiles and produce a detailed delta report.
     *
     * @param baselineId - ID of the baseline profile.
     * @param currentId  - ID of the profile to compare.
     * @returns A `ResourceComparison` or `undefined` if either profile is missing.
     */
    public compareProfiles(baselineId: string, currentId: string): ResourceComparison | undefined {
        const baseline = this.getProfile(baselineId);
        const current = this.getProfile(currentId);
        if (!baseline || !current) { return undefined; }

        return this.buildComparison(baseline, current);
    }

    /**
     * Compare two profiles directly (without requiring them to be stored).
     */
    public compareProfileData(baseline: ResourceProfile, current: ResourceProfile): ResourceComparison {
        return this.buildComparison(baseline, current);
    }

    // ── Statistics ───────────────────────────────────────────

    /** Compute aggregate statistics across all stored profiles. */
    public getStatistics(): ResourceProfileStats {
        const profiles = this.loadProfiles();

        if (profiles.length === 0) {
            return this.emptyStats();
        }

        const contracts = new Set<string>();
        const functions = new Set<string>();
        let totalWarnings = 0;
        const warningSeverities: Record<ResourceWarningSeverity, number> = {
            info: 0,
            warning: 0,
            critical: 0,
        };

        const sums: ResourceUsageSnapshot = this.zeroSnapshot();
        const peaks: ResourceUsageSnapshot = this.zeroSnapshot();

        for (const p of profiles) {
            contracts.add(p.contractId);
            functions.add(`${p.contractId}::${p.functionName}`);
            totalWarnings += p.warnings.length;

            for (const w of p.warnings) {
                warningSeverities[w.severity]++;
            }

            sums.cpuInstructions += p.usage.cpuInstructions;
            sums.memoryBytes += p.usage.memoryBytes;
            sums.storageReads += p.usage.storageReads;
            sums.storageWrites += p.usage.storageWrites;
            sums.executionTimeMs += p.usage.executionTimeMs;

            peaks.cpuInstructions = Math.max(peaks.cpuInstructions, p.usage.cpuInstructions);
            peaks.memoryBytes = Math.max(peaks.memoryBytes, p.usage.memoryBytes);
            peaks.storageReads = Math.max(peaks.storageReads, p.usage.storageReads);
            peaks.storageWrites = Math.max(peaks.storageWrites, p.usage.storageWrites);
            peaks.executionTimeMs = Math.max(peaks.executionTimeMs, p.usage.executionTimeMs);
        }

        const count = profiles.length;
        const now = new Date().toISOString();
        const averages: ResourceUsageSnapshot = {
            cpuInstructions: Math.round(sums.cpuInstructions / count),
            memoryBytes: Math.round(sums.memoryBytes / count),
            storageReads: Math.round(sums.storageReads / count),
            storageWrites: Math.round(sums.storageWrites / count),
            executionTimeMs: Math.round(sums.executionTimeMs / count),
            timestamp: now,
        };
        peaks.timestamp = now;

        return {
            totalProfiles: count,
            uniqueContracts: contracts.size,
            uniqueFunctions: functions.size,
            averages,
            peaks,
            totalWarnings,
            warningsBySeverity: warningSeverities,
        };
    }

    // ── Export / Import ──────────────────────────────────────

    /** Export all profiles and optional comparisons as a JSON string. */
    public exportProfiles(comparisons: ResourceComparison[] = []): string {
        const data: ResourceProfileExport = {
            version: EXPORT_VERSION,
            exportedAt: new Date().toISOString(),
            profiles: this.getAllProfiles(),
            comparisons,
        };
        return JSON.stringify(data, null, 2);
    }

    /**
     * Import profiles from a JSON string.
     * Merges with existing profiles, skipping duplicates by ID.
     */
    public async importProfiles(json: string): Promise<{ imported: number; skipped: number }> {
        let parsed: unknown;
        try {
            parsed = JSON.parse(json);
        } catch {
            throw new Error('Invalid JSON: unable to parse resource profile data');
        }

        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Invalid format: expected an object with a "profiles" array');
        }

        const data = parsed as Record<string, unknown>;
        const incoming = data['profiles'];
        if (!Array.isArray(incoming)) {
            throw new Error('Invalid format: "profiles" must be an array');
        }

        const existing = this.loadProfiles();
        const existingIds = new Set(existing.map(p => p.id));
        let imported = 0;
        let skipped = 0;

        for (const raw of incoming) {
            if (!this.isValidProfile(raw)) {
                skipped++;
                continue;
            }
            const profile = raw as ResourceProfile;
            if (existingIds.has(profile.id)) {
                skipped++;
                continue;
            }
            existing.push(profile);
            existingIds.add(profile.id);
            imported++;
        }

        if (existing.length > MAX_PROFILES) {
            existing.splice(0, existing.length - MAX_PROFILES);
        }

        await this.saveProfiles(existing);
        this.log(`[ResourceProfile] Imported ${imported} profiles, skipped ${skipped}`);
        return { imported, skipped };
    }

    // ── Display helpers ──────────────────────────────────────

    /** Format a resource profile as a human-readable breakdown string. */
    public formatProfileBreakdown(profile: ResourceProfile): string {
        const u = profile.usage;
        const t = profile.timeBreakdown;
        const lines: string[] = [
            `Resource Profile: ${profile.functionName}() on ${profile.contractId}`,
            `─────────────────────────────────────────`,
            `CPU Instructions:   ${this.formatNumber(u.cpuInstructions)}`,
            `Memory Usage:       ${this.formatBytes(u.memoryBytes)}`,
            `Storage Reads:      ${u.storageReads}`,
            `Storage Writes:     ${u.storageWrites}`,
            `─────────────────────────────────────────`,
            `Execution Time Breakdown:`,
            `  Setup:            ${t.setupMs} ms`,
            `  Execution:        ${t.executionMs} ms`,
            `  Storage I/O:      ${t.storageMs} ms`,
            `  Total:            ${t.totalMs} ms`,
        ];

        if (profile.warnings.length > 0) {
            lines.push(`─────────────────────────────────────────`);
            lines.push(`Warnings (${profile.warnings.length}):`);
            for (const w of profile.warnings) {
                const icon = w.severity === 'critical' ? '🔴' : w.severity === 'warning' ? '🟡' : 'ℹ️';
                lines.push(`  ${icon} [${w.category}] ${w.message}`);
            }
        }

        return lines.join('\n');
    }

    /** Format a resource comparison as a human-readable string. */
    public formatComparison(comparison: ResourceComparison): string {
        const lines: string[] = [
            `Resource Comparison`,
            `Baseline: ${comparison.baselineId}  →  Current: ${comparison.currentId}`,
            `─────────────────────────────────────────`,
        ];

        for (const d of comparison.deltas) {
            const arrow = d.improved ? '↓' : d.absoluteChange > 0 ? '↑' : '─';
            const sign = d.absoluteChange >= 0 ? '+' : '';
            const pctStr = isFinite(d.percentageChange)
                ? `${sign}${d.percentageChange.toFixed(1)}%`
                : 'N/A';
            lines.push(
                `  ${d.label.padEnd(22)} ${this.formatNumber(d.baselineValue).padStart(14)} → ` +
                `${this.formatNumber(d.currentValue).padStart(14)}  ${arrow} ${pctStr}`
            );
        }

        const s = comparison.summary;
        lines.push(`─────────────────────────────────────────`);
        lines.push(`Verdict: ${s.verdict} (${s.improved} improved, ${s.regressed} regressed, ${s.unchanged} unchanged)`);

        return lines.join('\n');
    }

    // ── Private helpers ──────────────────────────────────────

    private buildComparison(baseline: ResourceProfile, current: ResourceProfile): ResourceComparison {
        const deltas: ResourceDelta[] = [
            this.buildDelta('cpuInstructions', 'CPU Instructions', 'cpu', baseline.usage.cpuInstructions, current.usage.cpuInstructions),
            this.buildDelta('memoryBytes', 'Memory Usage', 'memory', baseline.usage.memoryBytes, current.usage.memoryBytes),
            this.buildDelta('storageReads', 'Storage Reads', 'storage', baseline.usage.storageReads, current.usage.storageReads),
            this.buildDelta('storageWrites', 'Storage Writes', 'storage', baseline.usage.storageWrites, current.usage.storageWrites),
            this.buildDelta('executionTimeMs', 'Execution Time', 'time', baseline.usage.executionTimeMs, current.usage.executionTimeMs),
        ];

        const summary = this.summarizeDeltas(deltas);

        return {
            baselineId: baseline.id,
            currentId: current.id,
            deltas,
            summary,
        };
    }

    private buildDelta(
        metric: string,
        label: string,
        category: ResourceCategory,
        baselineValue: number,
        currentValue: number
    ): ResourceDelta {
        const absoluteChange = currentValue - baselineValue;
        const percentageChange = baselineValue !== 0
            ? (absoluteChange / baselineValue) * 100
            : (currentValue !== 0 ? Infinity : 0);

        return {
            metric,
            label,
            category,
            baselineValue,
            currentValue,
            absoluteChange,
            percentageChange,
            improved: absoluteChange < 0,
        };
    }

    private summarizeDeltas(deltas: ResourceDelta[]): ComparisonSummary {
        let improved = 0;
        let regressed = 0;
        let unchanged = 0;

        for (const d of deltas) {
            if (d.absoluteChange < 0) {
                improved++;
            } else if (d.absoluteChange > 0) {
                regressed++;
            } else {
                unchanged++;
            }
        }

        let verdict: ComparisonSummary['verdict'];
        if (improved > 0 && regressed === 0) {
            verdict = 'improved';
        } else if (regressed > 0 && improved === 0) {
            verdict = 'regressed';
        } else if (improved > 0 && regressed > 0) {
            verdict = 'mixed';
        } else {
            verdict = 'unchanged';
        }

        return { improved, regressed, unchanged, verdict };
    }

    private checkMetric(
        warnings: ResourceWarning[],
        category: ResourceCategory,
        label: string,
        value: number,
        levels: ThresholdLevels
    ): void {
        if (value >= levels.critical) {
            warnings.push({
                category,
                severity: 'critical',
                message: `${label} (${this.formatNumber(value)}) exceeds critical threshold (${this.formatNumber(levels.critical)})`,
                actualValue: value,
                threshold: levels.critical,
            });
        } else if (value >= levels.warning) {
            warnings.push({
                category,
                severity: 'warning',
                message: `${label} (${this.formatNumber(value)}) exceeds warning threshold (${this.formatNumber(levels.warning)})`,
                actualValue: value,
                threshold: levels.warning,
            });
        }
    }

    private isValidProfile(raw: unknown): boolean {
        if (!raw || typeof raw !== 'object') { return false; }
        const obj = raw as Record<string, unknown>;
        return (
            typeof obj['id'] === 'string' &&
            typeof obj['contractId'] === 'string' &&
            typeof obj['functionName'] === 'string' &&
            typeof obj['network'] === 'string' &&
            typeof obj['createdAt'] === 'string' &&
            obj['usage'] !== null && typeof obj['usage'] === 'object' &&
            obj['timeBreakdown'] !== null && typeof obj['timeBreakdown'] === 'object' &&
            Array.isArray(obj['warnings'])
        );
    }

    private emptyStats(): ResourceProfileStats {
        return {
            totalProfiles: 0,
            uniqueContracts: 0,
            uniqueFunctions: 0,
            averages: this.zeroSnapshot(),
            peaks: this.zeroSnapshot(),
            totalWarnings: 0,
            warningsBySeverity: { info: 0, warning: 0, critical: 0 },
        };
    }

    private zeroSnapshot(): ResourceUsageSnapshot {
        return {
            cpuInstructions: 0,
            memoryBytes: 0,
            storageReads: 0,
            storageWrites: 0,
            executionTimeMs: 0,
            timestamp: new Date().toISOString(),
        };
    }

    private formatNumber(n: number): string {
        return n.toLocaleString('en-US');
    }

    private formatBytes(bytes: number): string {
        if (bytes < 1024) { return `${bytes} B`; }
        if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    // ── Persistence ──────────────────────────────────────────

    private loadProfiles(): ResourceProfile[] {
        return this.context.workspaceState.get<ResourceProfile[]>(STORAGE_KEY, []);
    }

    private async saveProfiles(profiles: ResourceProfile[]): Promise<void> {
        await this.context.workspaceState.update(STORAGE_KEY, profiles);
    }

    // ── Utility ──────────────────────────────────────────────

    private generateId(): string {
        return `rp_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    private deepCopyThresholds(t: ResourceThresholds): ResourceThresholds {
        return {
            cpu: { ...t.cpu },
            memory: { ...t.memory },
            storage: { ...t.storage },
            time: { ...t.time },
        };
    }

    private log(msg: string): void {
        this.outputChannel.appendLine(msg);
    }
}
