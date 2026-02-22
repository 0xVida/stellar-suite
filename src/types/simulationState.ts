export interface StateSnapshotEntry {
    key: string;
    value: unknown;
    contractId?: string;
    keyDisplay?: string;
    metadata?: Record<string, unknown>;
}

export interface StateSnapshot {
    capturedAt: string;
    entries: StateSnapshotEntry[];
    source?: string;
}

export type StateDiffChangeType = 'created' | 'modified' | 'deleted';

export interface StateDiffChange {
    type: StateDiffChangeType;
    key: string;
    contractId?: string;
    beforeValue?: unknown;
    afterValue?: unknown;
    beforeEntry?: StateSnapshotEntry;
    afterEntry?: StateSnapshotEntry;
}

export interface StateDiffSummary {
    totalEntriesBefore: number;
    totalEntriesAfter: number;
    created: number;
    modified: number;
    deleted: number;
    unchanged: number;
    totalChanges: number;
}

export interface StateDiff {
    before: StateSnapshot;
    after: StateSnapshot;
    created: StateDiffChange[];
    modified: StateDiffChange[];
    deleted: StateDiffChange[];
    unchangedKeys: string[];
    summary: StateDiffSummary;
    hasChanges: boolean;
}
