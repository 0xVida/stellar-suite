import { StateSnapshot, StateSnapshotEntry } from '../types/simulationState';

interface StateChangeRecord {
    key: string;
    before?: unknown;
    after?: unknown;
    contractId?: string;
}

const BEFORE_STATE_KEYS = [
    'stateBefore',
    'beforeState',
    'preState',
    'storageBefore',
    'ledgerBefore',
];

const AFTER_STATE_KEYS = [
    'stateAfter',
    'afterState',
    'postState',
    'storageAfter',
    'ledgerAfter',
];

const CHANGE_KEYS = [
    'stateChanges',
    'storageChanges',
    'changes',
    'modifiedEntries',
];

const ENTRY_COLLECTION_KEYS = [
    'entries',
    'storageEntries',
    'ledgerEntries',
    'items',
    'records',
];

const ENTRY_KEY_FIELDS = ['key', 'storageKey', 'ledgerKey', 'id', 'name'];
const ENTRY_VALUE_FIELDS = ['value', 'val', 'data', 'entry', 'bytes', 'current'];
const ENTRY_CONTRACT_FIELDS = ['contractId', 'contract', 'address'];

/**
 * Utility for extracting before/after state snapshots from simulation payloads.
 *
 * Supports multiple payload shapes so state diff can work with CLI and RPC responses,
 * including future payload variants with nested structures.
 */
export class StateCaptureService {
    public captureBeforeState(payload: unknown): StateSnapshot {
        const directBefore = this.findByKeys(payload, BEFORE_STATE_KEYS);
        if (directBefore !== undefined) {
            return this.toSnapshot(directBefore, 'before');
        }

        const changes = this.extractChanges(payload);
        if (changes.length > 0) {
            return this.snapshotFromChanges(changes, 'before');
        }

        return this.emptySnapshot('before');
    }

    public captureAfterState(payload: unknown): StateSnapshot {
        const directAfter = this.findByKeys(payload, AFTER_STATE_KEYS);
        if (directAfter !== undefined) {
            return this.toSnapshot(directAfter, 'after');
        }

        const changes = this.extractChanges(payload);
        if (changes.length > 0) {
            return this.snapshotFromChanges(changes, 'after');
        }

        return this.emptySnapshot('after');
    }

    public captureSnapshots(payload: unknown): { before: StateSnapshot; after: StateSnapshot } {
        return {
            before: this.captureBeforeState(payload),
            after: this.captureAfterState(payload),
        };
    }

    private emptySnapshot(source: string): StateSnapshot {
        return {
            capturedAt: new Date().toISOString(),
            entries: [],
            source,
        };
    }

    private toSnapshot(raw: unknown, source: string): StateSnapshot {
        return {
            capturedAt: new Date().toISOString(),
            entries: this.extractEntries(raw),
            source,
        };
    }

    private snapshotFromChanges(changes: StateChangeRecord[], phase: 'before' | 'after'): StateSnapshot {
        const entries: StateSnapshotEntry[] = [];

        for (const change of changes) {
            const value = phase === 'before' ? change.before : change.after;
            if (value === undefined) {
                continue;
            }

            entries.push({
                key: change.key,
                contractId: change.contractId,
                value,
            });
        }

        return {
            capturedAt: new Date().toISOString(),
            entries,
            source: `${phase}-from-changes`,
        };
    }

    private extractEntries(raw: unknown): StateSnapshotEntry[] {
        if (raw === null || raw === undefined) {
            return [];
        }

        if (Array.isArray(raw)) {
            return raw
                .map((item, index) => this.parseEntry(item, `entry_${index}`))
                .filter((entry): entry is StateSnapshotEntry => entry !== undefined);
        }

        if (typeof raw !== 'object') {
            return [];
        }

        const obj = raw as Record<string, unknown>;

        const embeddedEntries = this.findByKeys(obj, ENTRY_COLLECTION_KEYS);
        if (Array.isArray(embeddedEntries)) {
            return this.extractEntries(embeddedEntries);
        }

        if (this.looksLikeEntryRecord(obj)) {
            const parsed = this.parseEntry(obj);
            return parsed ? [parsed] : [];
        }

        return Object.entries(obj)
            .map(([key, value]) => ({
                key,
                value,
            }))
            .map(entry => this.parseEntry(entry, entry.key))
            .filter((entry): entry is StateSnapshotEntry => entry !== undefined);
    }

    private parseEntry(raw: unknown, fallbackKey?: string): StateSnapshotEntry | undefined {
        if (raw === null || raw === undefined) {
            return undefined;
        }

        if (typeof raw !== 'object') {
            if (!fallbackKey) {
                return undefined;
            }
            return {
                key: fallbackKey,
                value: raw,
            };
        }

        const obj = raw as Record<string, unknown>;

        const key = this.pickStringField(obj, ENTRY_KEY_FIELDS) ?? fallbackKey;
        if (!key) {
            return undefined;
        }

        const value = this.pickField(obj, ENTRY_VALUE_FIELDS) ?? obj['value'] ?? obj;
        const contractId = this.pickStringField(obj, ENTRY_CONTRACT_FIELDS);

        const metadata: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
            if (
                ENTRY_KEY_FIELDS.includes(k) ||
                ENTRY_VALUE_FIELDS.includes(k) ||
                ENTRY_CONTRACT_FIELDS.includes(k)
            ) {
                continue;
            }
            metadata[k] = v;
        }

        return {
            key,
            value,
            contractId,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        };
    }

    private extractChanges(raw: unknown): StateChangeRecord[] {
        const changesValue = this.findByKeys(raw, CHANGE_KEYS);
        if (!Array.isArray(changesValue)) {
            return [];
        }

        const parsed: StateChangeRecord[] = [];

        for (const item of changesValue) {
            if (!item || typeof item !== 'object') {
                continue;
            }

            const obj = item as Record<string, unknown>;
            const key = this.pickStringField(obj, ENTRY_KEY_FIELDS);
            if (!key) {
                continue;
            }

            parsed.push({
                key,
                before: obj['before'],
                after: obj['after'],
                contractId: this.pickStringField(obj, ENTRY_CONTRACT_FIELDS),
            });
        }

        return parsed;
    }

    private looksLikeEntryRecord(obj: Record<string, unknown>): boolean {
        return ENTRY_KEY_FIELDS.some(field => typeof obj[field] === 'string')
            && ENTRY_VALUE_FIELDS.some(field => field in obj);
    }

    private findByKeys(raw: unknown, keys: string[]): unknown {
        const queue: Array<{ node: unknown; depth: number }> = [{ node: raw, depth: 0 }];
        const maxDepth = 5;

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) {
                continue;
            }

            const { node, depth } = current;
            if (!node || typeof node !== 'object') {
                continue;
            }

            const obj = node as Record<string, unknown>;

            for (const key of keys) {
                if (key in obj) {
                    return obj[key];
                }
            }

            if (depth >= maxDepth) {
                continue;
            }

            for (const value of Object.values(obj)) {
                if (value && typeof value === 'object') {
                    queue.push({ node: value, depth: depth + 1 });
                }
            }
        }

        return undefined;
    }

    private pickField(obj: Record<string, unknown>, fields: string[]): unknown {
        for (const field of fields) {
            if (field in obj) {
                return obj[field];
            }
        }
        return undefined;
    }

    private pickStringField(obj: Record<string, unknown>, fields: string[]): string | undefined {
        for (const field of fields) {
            const value = obj[field];
            if (typeof value === 'string' && value.length > 0) {
                return value;
            }
        }
        return undefined;
    }
}
