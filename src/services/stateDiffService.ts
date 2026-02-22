import { StateDiff, StateDiffChange, StateSnapshot, StateSnapshotEntry } from '../types/simulationState';

interface DiffExportOptions {
    includeSnapshots?: boolean;
}

/**
 * Calculates and exports storage-level state differences between two snapshots.
 */
export class StateDiffService {
    public calculateDiff(before: StateSnapshot, after: StateSnapshot): StateDiff {
        const beforeMap = this.toEntryMap(before.entries);
        const afterMap = this.toEntryMap(after.entries);

        const created: StateDiffChange[] = [];
        const modified: StateDiffChange[] = [];
        const deleted: StateDiffChange[] = [];
        const unchangedKeys: string[] = [];

        const allKeys = new Set<string>([
            ...beforeMap.keys(),
            ...afterMap.keys(),
        ]);

        for (const compositeKey of allKeys) {
            const beforeEntry = beforeMap.get(compositeKey);
            const afterEntry = afterMap.get(compositeKey);

            if (!beforeEntry && afterEntry) {
                created.push({
                    type: 'created',
                    key: afterEntry.key,
                    contractId: afterEntry.contractId,
                    afterValue: afterEntry.value,
                    afterEntry,
                });
                continue;
            }

            if (beforeEntry && !afterEntry) {
                deleted.push({
                    type: 'deleted',
                    key: beforeEntry.key,
                    contractId: beforeEntry.contractId,
                    beforeValue: beforeEntry.value,
                    beforeEntry,
                });
                continue;
            }

            if (!beforeEntry || !afterEntry) {
                continue;
            }

            if (!this.valuesEqual(beforeEntry.value, afterEntry.value)) {
                modified.push({
                    type: 'modified',
                    key: afterEntry.key,
                    contractId: afterEntry.contractId ?? beforeEntry.contractId,
                    beforeValue: beforeEntry.value,
                    afterValue: afterEntry.value,
                    beforeEntry,
                    afterEntry,
                });
                continue;
            }

            unchangedKeys.push(afterEntry.key);
        }

        const summary = {
            totalEntriesBefore: before.entries.length,
            totalEntriesAfter: after.entries.length,
            created: created.length,
            modified: modified.length,
            deleted: deleted.length,
            unchanged: unchangedKeys.length,
            totalChanges: created.length + modified.length + deleted.length,
        };

        return {
            before,
            after,
            created,
            modified,
            deleted,
            unchangedKeys,
            summary,
            hasChanges: summary.totalChanges > 0,
        };
    }

    public exportStateDiff(stateDiff: StateDiff, options: DiffExportOptions = {}): string {
        return JSON.stringify({
            exportedAt: new Date().toISOString(),
            summary: stateDiff.summary,
            hasChanges: stateDiff.hasChanges,
            changes: {
                created: stateDiff.created,
                modified: stateDiff.modified,
                deleted: stateDiff.deleted,
            },
            ...(options.includeSnapshots
                ? {
                    snapshots: {
                        before: stateDiff.before,
                        after: stateDiff.after,
                    },
                }
                : {}),
        }, null, 2);
    }

    private toEntryMap(entries: StateSnapshotEntry[]): Map<string, StateSnapshotEntry> {
        const map = new Map<string, StateSnapshotEntry>();

        for (const entry of entries) {
            map.set(this.toCompositeKey(entry), entry);
        }

        return map;
    }

    private toCompositeKey(entry: StateSnapshotEntry): string {
        const contract = entry.contractId ?? 'global';
        return `${contract}::${entry.key}`;
    }

    private valuesEqual(left: unknown, right: unknown): boolean {
        return this.stableSerialize(left) === this.stableSerialize(right);
    }

    private stableSerialize(value: unknown): string {
        if (value === undefined) {
            return '__undefined__';
        }

        if (value === null || typeof value !== 'object') {
            return JSON.stringify(value);
        }

        if (Array.isArray(value)) {
            return `[${value.map(item => this.stableSerialize(item)).join(',')}]`;
        }

        const obj = value as Record<string, unknown>;
        const keys = Object.keys(obj).sort();
        return `{${keys
            .map(key => `${JSON.stringify(key)}:${this.stableSerialize(obj[key])}`)
            .join(',')}}`;
    }
}
