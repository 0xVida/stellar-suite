"use strict";
// ============================================================
// src/services/simulationHistoryService.ts
// Tracks simulation history including parameters, results,
// timestamps, and metadata. Provides search and filtering
// capabilities for simulation history.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulationHistoryService = void 0;
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
class SimulationHistoryService {
    constructor(context, outputChannel) {
        this.context = context;
        this.outputChannel = outputChannel ?? {
            appendLine: (_msg) => { },
        };
    }
    // ── Public API ────────────────────────────────────────────
    /**
     * Record a completed simulation.
     * Automatically trims history to `MAX_HISTORY_ENTRIES`.
     */
    async recordSimulation(params) {
        const entry = {
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
    getEntry(id) {
        return this.loadEntries().find(e => e.id === id);
    }
    /**
     * Query simulation history with optional filtering, sorting, and pagination.
     */
    queryHistory(options = {}) {
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
    getAllEntries() {
        return this.queryHistory();
    }
    /**
     * Get history entries for a specific contract.
     */
    getEntriesByContract(contractId) {
        return this.queryHistory({ filter: { contractId } });
    }
    /**
     * Get history entries for a specific function name.
     */
    getEntriesByFunction(functionName) {
        return this.queryHistory({ filter: { functionName } });
    }
    /**
     * Add or update a label on an existing history entry.
     */
    async labelEntry(entryId, label) {
        const entries = this.loadEntries();
        const entry = entries.find(e => e.id === entryId);
        if (!entry) {
            return false;
        }
        entry.label = label;
        await this.saveEntries(entries);
        this.log(`[SimHistory] Labeled entry ${entryId}: "${label}"`);
        return true;
    }
    /**
     * Delete a single history entry by ID.
     */
    async deleteEntry(entryId) {
        const entries = this.loadEntries();
        const index = entries.findIndex(e => e.id === entryId);
        if (index === -1) {
            return false;
        }
        entries.splice(index, 1);
        await this.saveEntries(entries);
        this.log(`[SimHistory] Deleted entry ${entryId}`);
        return true;
    }
    /**
     * Clear all simulation history.
     */
    async clearHistory() {
        await this.saveEntries([]);
        this.log('[SimHistory] All simulation history cleared');
    }
    /**
     * Get aggregate statistics about the simulation history.
     */
    getStatistics() {
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
        const contracts = new Set();
        const functions = new Set();
        let successCount = 0;
        let failureCount = 0;
        for (const entry of entries) {
            contracts.add(entry.contractId);
            functions.add(`${entry.contractId}::${entry.functionName}`);
            if (entry.outcome === 'success') {
                successCount++;
            }
            else {
                failureCount++;
            }
        }
        // Entries are stored oldest-first
        const sorted = [...entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
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
    exportHistory() {
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
    async importHistory(json) {
        let parsed;
        try {
            parsed = JSON.parse(json);
        }
        catch {
            throw new Error('Invalid JSON: unable to parse simulation history data');
        }
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Invalid format: expected an object with an "entries" array');
        }
        const data = parsed;
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
            const entry = raw;
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
    getEntryCount() {
        return this.loadEntries().length;
    }
    // ── Filtering ─────────────────────────────────────────────
    applyFilter(entries, filter) {
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
                if (isNaN(from)) {
                    return false;
                }
                if (new Date(entry.timestamp).getTime() < from) {
                    return false;
                }
            }
            if (filter.toDate) {
                const to = new Date(filter.toDate).getTime();
                if (isNaN(to)) {
                    return false;
                }
                if (new Date(entry.timestamp).getTime() > to) {
                    return false;
                }
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
                if (!haystack.includes(needle)) {
                    return false;
                }
            }
            return true;
        });
    }
    // ── Sorting ───────────────────────────────────────────────
    sortEntries(entries, field, direction) {
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
    isValidEntry(raw) {
        if (!raw || typeof raw !== 'object') {
            return false;
        }
        const obj = raw;
        return (typeof obj['id'] === 'string' &&
            typeof obj['contractId'] === 'string' &&
            typeof obj['functionName'] === 'string' &&
            typeof obj['timestamp'] === 'string' &&
            (obj['outcome'] === 'success' || obj['outcome'] === 'failure') &&
            typeof obj['network'] === 'string' &&
            typeof obj['source'] === 'string' &&
            (obj['method'] === 'cli' || obj['method'] === 'rpc'));
    }
    // ── Persistence helpers ───────────────────────────────────
    loadEntries() {
        return this.context.workspaceState.get(STORAGE_KEY, []);
    }
    async saveEntries(entries) {
        await this.context.workspaceState.update(STORAGE_KEY, entries);
    }
    // ── Utility helpers ───────────────────────────────────────
    generateId() {
        return `sim_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    log(msg) {
        this.outputChannel.appendLine(msg);
    }
}
exports.SimulationHistoryService = SimulationHistoryService;
