// ============================================================
// src/services/simulationHistoryService.ts
// Tracks simulation history including parameters, results,
// timestamps, and metadata. Provides search and filtering
// capabilities for simulation history.
// ============================================================

// ── Public types ──────────────────────────────────────────────

/** Outcome status of a simulation run. */
export type SimulationOutcome = 'success' | 'failure';

/** Criteria for filtering simulation history entries. */
export interface SimulationHistoryFilter {
    /** Match entries for a specific contract ID. */
    contractId?: string;
    /** Match entries that called a specific function. */
    functionName?: string;
    /** Match entries with a specific outcome. */
    outcome?: SimulationOutcome;
    /** Match entries on a specific network. */
    network?: string;
    /** Only include entries recorded at or after this ISO-8601 timestamp. */
    fromDate?: string;
    /** Only include entries recorded at or before this ISO-8601 timestamp. */
    toDate?: string;
    /** Free-text search across contract ID, function name, and error messages. */
    searchText?: string;
}

/** Sort direction for history queries. */
export type SortDirection = 'asc' | 'desc';

/** Sort field for history queries. */
export type SortField = 'timestamp' | 'contractId' | 'functionName' | 'outcome';

/** Options for querying simulation history. */
export interface SimulationHistoryQueryOptions {
    filter?: SimulationHistoryFilter;
    sortBy?: SortField;
    sortDirection?: SortDirection;
    limit?: number;
    offset?: number;
}

/** Statistics about the simulation history. */
export interface SimulationHistoryStats {
    totalSimulations: number;
    successCount: number;
    failureCount: number;
    uniqueContracts: number;
    uniqueFunctions: number;
    firstSimulation?: string;
    lastSimulation?: string;
}

/** A single simulation history entry. */
export interface SimulationHistoryEntry {
    /** Unique identifier for this entry. */
    id: string;
    /** Contract ID (address) that was simulated. */
    contractId: string;
    /** Function name that was invoked. */
    functionName: string;
    /** Arguments passed to the function. */
    args: unknown[];
    /** Whether the simulation succeeded or failed. */
    outcome: SimulationOutcome;
    /** Return value on success, or undefined on failure. */
    result?: unknown;
    /** Error message on failure. */
    error?: string;
    /** Error type classification on failure. */
    errorType?: string;
    /** Resource usage reported by the simulation. */
    resourceUsage?: {
        cpuInstructions?: number;
        memoryBytes?: number;
    };
    /** Network used for the simulation. */
    network: string;
    /** Source identity used. */
    source: string;
    /** Whether the local CLI or RPC was used. */
    method: 'cli' | 'rpc';
    /** ISO-8601 timestamp when the simulation was recorded. */
    timestamp: string;
    /** Duration of the simulation in milliseconds. */
    durationMs?: number;
    /** Optional user-provided label or note. */
    label?: string;
}

// ── Minimal VS Code-compatible interfaces ────────────────────
//
// Structural interfaces keep this service testable in plain
// Node.js without the VS Code extension host.

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

// ── Internal persistence key ──────────────────────────────────

const STORAGE_KEY = 'stellarSuite.simulationHistory';
const MAX_HISTORY_ENTRIES = 500;

// ── Service class ─────────────────────────────────────────────

/**
 * SimulationHistoryService is responsible for:
 * - Recording simulation runs with full parameter and result data
 * - Persisting history in workspace state
 * - Providing search, filter, and sort capabilities
 * - Exporting history data as JSON
 * - Computing aggregate statistics
 */
export class SimulationHistoryService {
    private readonly outputChannel: SimpleOutputChannel;

    constructor(
        private readonly context: SimpleExtensionContext,
        outputChannel?: SimpleOutputChannel
    ) {
        this.outputChannel = outputChannel ?? {
            appendLine: (_msg: string) => { /* no-op outside VS Code */ },
        };
    }

    // ── Public API ────────────────────────────────────────────

    /**
     * Record a completed simulation.
     * Automatically trims history to `MAX_HISTORY_ENTRIES`.
     */
    public async recordSimulation(
        params: Omit<SimulationHistoryEntry, 'id' | 'timestamp'>
    ): Promise<SimulationHistoryEntry> {
        const entry: SimulationHistoryEntry = {
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            contractId: params.contractId,
            functionName: params.functionName,
            args: params.args,
            outcome: params.outcome,
            result: params.outcome === 'success' ? params.result : undefined,
            error: params.outcome === 'failure' ? params.error : undefined,
            errorType: params.outcome === 'failure' ? params.errorType : undefined,
            resourceUsage: params.resourceUsage,
            network: params.network,
            source: params.source,
            method: params.method,
            durationMs: params.durationMs,
            label: params.label,
        };

        const entries = this.loadEntries();
        entries.push(entry);

        // Trim oldest entries if we exceed the cap
        if (entries.length > MAX_HISTORY_ENTRIES) {
            entries.splice(0, entries.length - MAX_HISTORY_ENTRIES);
        }

        await this.saveEntries(entries);
        this.log(`[SimHistory] Recorded simulation: ${entry.functionName}() on ${entry.contractId} → ${entry.outcome}`);
        return entry;
    }

    /**
     * Retrieve a single history entry by ID.
     */
    public getEntry(id: string): SimulationHistoryEntry | undefined {
        return this.loadEntries().find(e => e.id === id);
    }

    /**
     * Query simulation history with optional filtering, sorting, and pagination.
     */
    public queryHistory(options: SimulationHistoryQueryOptions = {}): SimulationHistoryEntry[] {
        let entries = this.loadEntries();

        // Apply filters
        if (options.filter) {
            entries = this.applyFilter(entries, options.filter);
        }

        // Apply sorting (default: newest first)
        const sortBy = options.sortBy ?? 'timestamp';
        const sortDir = options.sortDirection ?? 'desc';
        entries = this.sortEntries(entries, sortBy, sortDir);

        // Apply pagination
        const offset = options.offset ?? 0;
        if (offset > 0) {
            entries = entries.slice(offset);
        }
        if (options.limit !== undefined && options.limit > 0) {
            entries = entries.slice(0, options.limit);
        }

        return entries;
    }

    /**
     * Get all history entries (newest first).
     */
    public getAllEntries(): SimulationHistoryEntry[] {
        return this.queryHistory();
    }

    /**
     * Get history entries for a specific contract.
     */
    public getEntriesByContract(contractId: string): SimulationHistoryEntry[] {
        return this.queryHistory({ filter: { contractId } });
    }

    /**
     * Get history entries for a specific function name.
     */
    public getEntriesByFunction(functionName: string): SimulationHistoryEntry[] {
        return this.queryHistory({ filter: { functionName } });
    }

    /**
     * Add or update a label on an existing history entry.
     */
    public async labelEntry(entryId: string, label: string): Promise<boolean> {
        const entries = this.loadEntries();
        const entry = entries.find(e => e.id === entryId);
        if (!entry) { return false; }

        entry.label = label;
        await this.saveEntries(entries);
        this.log(`[SimHistory] Labeled entry ${entryId}: "${label}"`);
        return true;
    }

    /**
     * Delete a single history entry by ID.
     */
    public async deleteEntry(entryId: string): Promise<boolean> {
        const entries = this.loadEntries();
        const index = entries.findIndex(e => e.id === entryId);
        if (index === -1) { return false; }

        entries.splice(index, 1);
        await this.saveEntries(entries);
        this.log(`[SimHistory] Deleted entry ${entryId}`);
        return true;
    }

    /**
     * Clear all simulation history.
     */
    public async clearHistory(): Promise<void> {
        await this.saveEntries([]);
        this.log('[SimHistory] All simulation history cleared');
    }

    /**
     * Get aggregate statistics about the simulation history.
     */
    public getStatistics(): SimulationHistoryStats {
        const entries = this.loadEntries();
        if (entries.length === 0) {
            return {
                totalSimulations: 0,
                successCount: 0,
                failureCount: 0,
                uniqueContracts: 0,
                uniqueFunctions: 0,
            };
        }

        const contracts = new Set<string>();
        const functions = new Set<string>();
        let successCount = 0;
        let failureCount = 0;

        for (const entry of entries) {
            contracts.add(entry.contractId);
            functions.add(`${entry.contractId}::${entry.functionName}`);
            if (entry.outcome === 'success') {
                successCount++;
            } else {
                failureCount++;
            }
        }

        // Entries are stored oldest-first
        const sorted = [...entries].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        return {
            totalSimulations: entries.length,
            successCount,
            failureCount,
            uniqueContracts: contracts.size,
            uniqueFunctions: functions.size,
            firstSimulation: sorted[0].timestamp,
            lastSimulation: sorted[sorted.length - 1].timestamp,
        };
    }

    /**
     * Export the full history as a JSON string.
     */
    public exportHistory(): string {
        const entries = this.queryHistory();
        const stats = this.getStatistics();
        return JSON.stringify({
            exportedAt: new Date().toISOString(),
            statistics: stats,
            entries,
        }, null, 2);
    }

    /**
     * Import history entries from a JSON string.
     * Merges with existing history, skipping entries with duplicate IDs.
     */
    public async importHistory(json: string): Promise<{ imported: number; skipped: number }> {
        let parsed: unknown;
        try {
            parsed = JSON.parse(json);
        } catch {
            throw new Error('Invalid JSON: unable to parse simulation history data');
        }

        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Invalid format: expected an object with an "entries" array');
        }

        const data = parsed as Record<string, unknown>;
        const incoming = data['entries'];
        if (!Array.isArray(incoming)) {
            throw new Error('Invalid format: "entries" must be an array');
        }

        const existing = this.loadEntries();
        const existingIds = new Set(existing.map(e => e.id));
        let imported = 0;
        let skipped = 0;

        for (const raw of incoming) {
            if (!this.isValidEntry(raw)) {
                skipped++;
                continue;
            }
            const entry = raw as SimulationHistoryEntry;
            if (existingIds.has(entry.id)) {
                skipped++;
                continue;
            }
            existing.push(entry);
            existingIds.add(entry.id);
            imported++;
        }

        // Trim if needed
        if (existing.length > MAX_HISTORY_ENTRIES) {
            existing.splice(0, existing.length - MAX_HISTORY_ENTRIES);
        }

        await this.saveEntries(existing);
        this.log(`[SimHistory] Imported ${imported} entries, skipped ${skipped}`);
        return { imported, skipped };
    }

    /**
     * Get the total number of stored entries.
     */
    public getEntryCount(): number {
        return this.loadEntries().length;
    }

    // ── Filtering ─────────────────────────────────────────────

    private applyFilter(
        entries: SimulationHistoryEntry[],
        filter: SimulationHistoryFilter
    ): SimulationHistoryEntry[] {
        return entries.filter(entry => {
            if (filter.contractId && entry.contractId !== filter.contractId) {
                return false;
            }
            if (filter.functionName && entry.functionName !== filter.functionName) {
                return false;
            }
            if (filter.outcome && entry.outcome !== filter.outcome) {
                return false;
            }
            if (filter.network && entry.network !== filter.network) {
                return false;
            }
            if (filter.fromDate) {
                const from = new Date(filter.fromDate).getTime();
                if (isNaN(from)) { return false; }
                if (new Date(entry.timestamp).getTime() < from) { return false; }
            }
            if (filter.toDate) {
                const to = new Date(filter.toDate).getTime();
                if (isNaN(to)) { return false; }
                if (new Date(entry.timestamp).getTime() > to) { return false; }
            }
            if (filter.searchText) {
                const needle = filter.searchText.toLowerCase();
                const haystack = [
                    entry.contractId,
                    entry.functionName,
                    entry.error ?? '',
                    entry.label ?? '',
                    entry.network,
                ].join(' ').toLowerCase();
                if (!haystack.includes(needle)) { return false; }
            }
            return true;
        });
    }

    // ── Sorting ───────────────────────────────────────────────

    private sortEntries(
        entries: SimulationHistoryEntry[],
        field: SortField,
        direction: SortDirection
    ): SimulationHistoryEntry[] {
        const sorted = [...entries];
        const dir = direction === 'asc' ? 1 : -1;

        sorted.sort((a, b) => {
            switch (field) {
                case 'timestamp':
                    return dir * (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                case 'contractId':
                    return dir * a.contractId.localeCompare(b.contractId);
                case 'functionName':
                    return dir * a.functionName.localeCompare(b.functionName);
                case 'outcome':
                    return dir * a.outcome.localeCompare(b.outcome);
                default:
                    return 0;
            }
        });

        return sorted;
    }

    // ── Validation ────────────────────────────────────────────

    private isValidEntry(raw: unknown): boolean {
        if (!raw || typeof raw !== 'object') { return false; }
        const obj = raw as Record<string, unknown>;
        return (
            typeof obj['id'] === 'string' &&
            typeof obj['contractId'] === 'string' &&
            typeof obj['functionName'] === 'string' &&
            typeof obj['timestamp'] === 'string' &&
            (obj['outcome'] === 'success' || obj['outcome'] === 'failure') &&
            typeof obj['network'] === 'string' &&
            typeof obj['source'] === 'string' &&
            (obj['method'] === 'cli' || obj['method'] === 'rpc')
        );
    }

    // ── Persistence helpers ───────────────────────────────────

    private loadEntries(): SimulationHistoryEntry[] {
        return this.context.workspaceState.get<SimulationHistoryEntry[]>(STORAGE_KEY, []);
    }

    private async saveEntries(entries: SimulationHistoryEntry[]): Promise<void> {
        await this.context.workspaceState.update(STORAGE_KEY, entries);
    }

    // ── Utility helpers ───────────────────────────────────────

    private generateId(): string {
        return `sim_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    private log(msg: string): void {
        this.outputChannel.appendLine(msg);
    }
}
