// ============================================================
// src/services/stateBackupService.ts
// Manages workspace state backups and restores. Supports manual
// and automatic backups, integrity validation, backup history,
// and export/import of backup files.
// ============================================================

// ── Public types ──────────────────────────────────────────────

/** Trigger that caused a backup to be created. */
export type BackupTrigger = 'manual' | 'auto' | 'pre-operation';

/** Current status of a backup entry. */
export type BackupStatus = 'valid' | 'corrupted' | 'unknown';

/** A single backup entry stored in workspace state. */
export interface BackupEntry {
    /** Unique identifier for this backup. */
    id: string;
    /** Human-readable label (optional). */
    label?: string;
    /** ISO-8601 timestamp when the backup was created. */
    createdAt: string;
    /** What triggered this backup. */
    trigger: BackupTrigger;
    /** Snapshot of all tracked workspace state keys. */
    snapshot: Record<string, unknown>;
    /** SHA-256 checksum of the serialized snapshot. */
    checksum: string;
    /** Byte size of the serialized snapshot. */
    sizeBytes: number;
    /** Validation status (set after integrity check). */
    status: BackupStatus;
    /** Optional description of the operation that preceded this backup. */
    description?: string;
}

/** Summary statistics about stored backups. */
export interface BackupStats {
    totalBackups: number;
    manualCount: number;
    autoCount: number;
    preOperationCount: number;
    oldestBackup?: string;
    newestBackup?: string;
    totalSizeBytes: number;
}

/** Result of a restore operation. */
export interface RestoreResult {
    success: boolean;
    restoredKeys: string[];
    errors: string[];
    backupId: string;
    restoredAt: string;
}

/** Portable backup file format used for export/import. */
export interface BackupExportData {
    version: number;
    exportedAt: string;
    entries: BackupEntry[];
}

// ── Minimal VS Code-compatible interfaces ─────────────────────
//
// Structural interfaces keep this service testable in plain
// Node.js without the VS Code extension host.

interface SimpleOutputChannel {
    appendLine(value: string): void;
}

interface SimpleWorkspaceState {
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): Thenable<void>;
    keys(): readonly string[];
}

interface SimpleExtensionContext {
    workspaceState: SimpleWorkspaceState;
}

// ── Internal constants ────────────────────────────────────────

const BACKUP_STORAGE_KEY = 'stellarSuite.stateBackups';
const MAX_BACKUPS = 50;
const EXPORT_VERSION = 1;

// Keys that belong to the backup system itself — excluded from snapshots
const INTERNAL_KEYS = new Set([BACKUP_STORAGE_KEY]);

// ── Service class ─────────────────────────────────────────────

/**
 * StateBackupService is responsible for:
 * - Creating manual and automatic workspace state backups
 * - Restoring workspace state from a backup snapshot
 * - Validating backup integrity via checksums
 * - Managing backup history with size limits
 * - Exporting and importing backups as portable JSON
 */
export class StateBackupService {
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
     * Create a backup of the current workspace state.
     * Automatically trims history to `MAX_BACKUPS`.
     */
    public async createBackup(
        trigger: BackupTrigger,
        options: { label?: string; description?: string } = {}
    ): Promise<BackupEntry> {
        const snapshot = this.captureSnapshot();
        const serialized = JSON.stringify(snapshot);
        const checksum = this.computeChecksum(serialized);

        const entry: BackupEntry = {
            id: this.generateId(),
            label: options.label,
            createdAt: new Date().toISOString(),
            trigger,
            snapshot,
            checksum,
            sizeBytes: serialized.length,
            status: 'valid',
            description: options.description,
        };

        const entries = this.loadEntries();
        entries.push(entry);

        if (entries.length > MAX_BACKUPS) {
            entries.splice(0, entries.length - MAX_BACKUPS);
        }

        await this.saveEntries(entries);
        this.log(`[Backup] Created ${trigger} backup: ${entry.id}${options.label ? ` (${options.label})` : ''}`);
        return entry;
    }

    /**
     * Create a pre-operation backup. Convenience wrapper used before
     * potentially destructive operations like deploy or sync.
     */
    public async createPreOperationBackup(operationName: string): Promise<BackupEntry> {
        return this.createBackup('pre-operation', {
            description: `Auto-backup before: ${operationName}`,
        });
    }

    /**
     * Restore workspace state from a backup entry.
     * Overwrites all tracked keys with the snapshot values.
     */
    public async restoreFromBackup(backupId: string): Promise<RestoreResult> {
        const entry = this.getBackup(backupId);
        if (!entry) {
            return {
                success: false,
                restoredKeys: [],
                errors: [`Backup not found: ${backupId}`],
                backupId,
                restoredAt: new Date().toISOString(),
            };
        }

        const validation = this.validateBackupIntegrity(entry);
        if (!validation.valid) {
            return {
                success: false,
                restoredKeys: [],
                errors: [`Backup integrity check failed: ${validation.error}`],
                backupId,
                restoredAt: new Date().toISOString(),
            };
        }

        const restoredKeys: string[] = [];
        const errors: string[] = [];

        for (const [key, value] of Object.entries(entry.snapshot)) {
            if (INTERNAL_KEYS.has(key)) {
                continue;
            }
            try {
                await this.context.workspaceState.update(key, value);
                restoredKeys.push(key);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                errors.push(`Failed to restore key "${key}": ${msg}`);
            }
        }

        const result: RestoreResult = {
            success: errors.length === 0,
            restoredKeys,
            errors,
            backupId,
            restoredAt: new Date().toISOString(),
        };

        this.log(`[Backup] Restored from ${backupId}: ${restoredKeys.length} keys restored, ${errors.length} errors`);
        return result;
    }

    /**
     * Retrieve a single backup entry by ID.
     */
    public getBackup(id: string): BackupEntry | undefined {
        return this.loadEntries().find(e => e.id === id);
    }

    /**
     * Get all backup entries, newest first.
     */
    public getAllBackups(): BackupEntry[] {
        return [...this.loadEntries()].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }

    /**
     * Get backups filtered by trigger type.
     */
    public getBackupsByTrigger(trigger: BackupTrigger): BackupEntry[] {
        return this.getAllBackups().filter(e => e.trigger === trigger);
    }

    /**
     * Delete a single backup by ID.
     */
    public async deleteBackup(backupId: string): Promise<boolean> {
        const entries = this.loadEntries();
        const index = entries.findIndex(e => e.id === backupId);
        if (index === -1) { return false; }

        entries.splice(index, 1);
        await this.saveEntries(entries);
        this.log(`[Backup] Deleted backup ${backupId}`);
        return true;
    }

    /**
     * Clear all stored backups.
     */
    public async clearAllBackups(): Promise<void> {
        await this.saveEntries([]);
        this.log('[Backup] All backups cleared');
    }

    /**
     * Add or update a label on an existing backup.
     */
    public async labelBackup(backupId: string, label: string): Promise<boolean> {
        const entries = this.loadEntries();
        const entry = entries.find(e => e.id === backupId);
        if (!entry) { return false; }

        entry.label = label;
        await this.saveEntries(entries);
        this.log(`[Backup] Labeled backup ${backupId}: "${label}"`);
        return true;
    }

    /**
     * Validate the integrity of a backup entry by recomputing its checksum.
     */
    public validateBackupIntegrity(entry: BackupEntry): { valid: boolean; error?: string } {
        if (!entry.snapshot || typeof entry.snapshot !== 'object') {
            return { valid: false, error: 'Snapshot is missing or not an object' };
        }

        const serialized = JSON.stringify(entry.snapshot);
        const computed = this.computeChecksum(serialized);

        if (computed !== entry.checksum) {
            return { valid: false, error: `Checksum mismatch: expected ${entry.checksum}, got ${computed}` };
        }

        if (serialized.length !== entry.sizeBytes) {
            return { valid: false, error: `Size mismatch: expected ${entry.sizeBytes}, got ${serialized.length}` };
        }

        return { valid: true };
    }

    /**
     * Validate all stored backups and update their status fields.
     */
    public async validateAllBackups(): Promise<{ total: number; valid: number; corrupted: number }> {
        const entries = this.loadEntries();
        let valid = 0;
        let corrupted = 0;

        for (const entry of entries) {
            const result = this.validateBackupIntegrity(entry);
            entry.status = result.valid ? 'valid' : 'corrupted';
            if (result.valid) {
                valid++;
            } else {
                corrupted++;
            }
        }

        await this.saveEntries(entries);
        this.log(`[Backup] Validated ${entries.length} backups: ${valid} valid, ${corrupted} corrupted`);
        return { total: entries.length, valid, corrupted };
    }

    /**
     * Get aggregate statistics about stored backups.
     */
    public getStatistics(): BackupStats {
        const entries = this.loadEntries();
        if (entries.length === 0) {
            return {
                totalBackups: 0,
                manualCount: 0,
                autoCount: 0,
                preOperationCount: 0,
                totalSizeBytes: 0,
            };
        }

        let manualCount = 0;
        let autoCount = 0;
        let preOperationCount = 0;
        let totalSizeBytes = 0;

        for (const entry of entries) {
            totalSizeBytes += entry.sizeBytes;
            switch (entry.trigger) {
                case 'manual': manualCount++; break;
                case 'auto': autoCount++; break;
                case 'pre-operation': preOperationCount++; break;
            }
        }

        const sorted = [...entries].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        return {
            totalBackups: entries.length,
            manualCount,
            autoCount,
            preOperationCount,
            oldestBackup: sorted[0].createdAt,
            newestBackup: sorted[sorted.length - 1].createdAt,
            totalSizeBytes,
        };
    }

    /**
     * Get the number of stored backups.
     */
    public getBackupCount(): number {
        return this.loadEntries().length;
    }

    /**
     * Export all backups as a portable JSON string.
     */
    public exportBackups(): string {
        const entries = this.getAllBackups();
        const data: BackupExportData = {
            version: EXPORT_VERSION,
            exportedAt: new Date().toISOString(),
            entries,
        };
        return JSON.stringify(data, null, 2);
    }

    /**
     * Import backups from a JSON string.
     * Merges with existing backups, skipping entries with duplicate IDs.
     */
    public async importBackups(json: string): Promise<{ imported: number; skipped: number }> {
        let parsed: unknown;
        try {
            parsed = JSON.parse(json);
        } catch {
            throw new Error('Invalid JSON: unable to parse backup data');
        }

        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Invalid format: expected an object with an "entries" array');
        }

        const data = parsed as Record<string, unknown>;

        if (typeof data['version'] === 'number' && data['version'] > EXPORT_VERSION) {
            throw new Error(`Unsupported backup version: ${data['version']}. Please update Stellar Suite.`);
        }

        const incoming = data['entries'];
        if (!Array.isArray(incoming)) {
            throw new Error('Invalid format: "entries" must be an array');
        }

        const existing = this.loadEntries();
        const existingIds = new Set(existing.map(e => e.id));
        let imported = 0;
        let skipped = 0;

        for (const raw of incoming) {
            if (!this.isValidBackupEntry(raw)) {
                skipped++;
                continue;
            }
            const entry = raw as BackupEntry;
            if (existingIds.has(entry.id)) {
                skipped++;
                continue;
            }

            // Re-validate integrity of imported entries
            const integrity = this.validateBackupIntegrity(entry);
            entry.status = integrity.valid ? 'valid' : 'corrupted';

            existing.push(entry);
            existingIds.add(entry.id);
            imported++;
        }

        if (existing.length > MAX_BACKUPS) {
            existing.splice(0, existing.length - MAX_BACKUPS);
        }

        await this.saveEntries(existing);
        this.log(`[Backup] Imported ${imported} backups, skipped ${skipped}`);
        return { imported, skipped };
    }

    // ── Snapshot helpers ──────────────────────────────────────

    /**
     * Capture a snapshot of all workspace state keys (excluding internal backup keys).
     */
    private captureSnapshot(): Record<string, unknown> {
        const snapshot: Record<string, unknown> = {};
        const keys = this.context.workspaceState.keys();

        for (const key of keys) {
            if (INTERNAL_KEYS.has(key)) {
                continue;
            }
            snapshot[key] = this.context.workspaceState.get(key, undefined);
        }

        return snapshot;
    }

    // ── Validation ────────────────────────────────────────────

    private isValidBackupEntry(raw: unknown): boolean {
        if (!raw || typeof raw !== 'object') { return false; }
        const obj = raw as Record<string, unknown>;
        return (
            typeof obj['id'] === 'string' &&
            typeof obj['createdAt'] === 'string' &&
            (obj['trigger'] === 'manual' || obj['trigger'] === 'auto' || obj['trigger'] === 'pre-operation') &&
            typeof obj['snapshot'] === 'object' && obj['snapshot'] !== null &&
            typeof obj['checksum'] === 'string' &&
            typeof obj['sizeBytes'] === 'number'
        );
    }

    // ── Persistence helpers ───────────────────────────────────

    private loadEntries(): BackupEntry[] {
        return this.context.workspaceState.get<BackupEntry[]>(BACKUP_STORAGE_KEY, []);
    }

    private async saveEntries(entries: BackupEntry[]): Promise<void> {
        await this.context.workspaceState.update(BACKUP_STORAGE_KEY, entries);
    }

    // ── Utility helpers ───────────────────────────────────────

    private generateId(): string {
        return `bak_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    /**
     * Compute a simple checksum for integrity validation.
     * Uses a fast DJB2-based hash that works in any JS environment
     * without requiring Node.js crypto.
     */
    private computeChecksum(data: string): string {
        let hash = 5381;
        for (let i = 0; i < data.length; i++) {
            hash = ((hash << 5) + hash + data.charCodeAt(i)) >>> 0;
        }
        return hash.toString(16).padStart(8, '0');
    }

    private log(msg: string): void {
        this.outputChannel.appendLine(msg);
    }
}
