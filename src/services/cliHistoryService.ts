import * as vscode from 'vscode';

/**
 * CLI command history entry.
 */
export interface CliHistoryEntry {
    id: string;
    command: string;
    args: string[];
    cwd?: string;
    timestamp: string;
    outcome: 'success' | 'failure';
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    durationMs: number;
    label?: string;
    source: 'manual' | 'replay';
}

export interface CliHistoryFilter {
    searchText?: string;
    outcome?: 'success' | 'failure';
    source?: 'manual' | 'replay';
    fromDate?: string;
    toDate?: string;
}

interface SimpleWorkspaceState {
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): Thenable<void>;
}

interface SimpleExtensionContext {
    workspaceState: SimpleWorkspaceState;
}

const STORAGE_KEY = 'stellarSuite.cliCommandHistory';
const MAX_HISTORY_ENTRIES = 100;

/**
 * Handles recording and retrieval of CLI execution history.
 */
export class CliHistoryService {
    constructor(private readonly context: SimpleExtensionContext) { }

    async recordCommand(params: Omit<CliHistoryEntry, 'id' | 'timestamp'>): Promise<CliHistoryEntry> {
        const entry: CliHistoryEntry = {
            id: `cli_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date().toISOString(),
            ...params,
        };

        const history = this.loadEntries();
        history.push(entry);

        if (history.length > MAX_HISTORY_ENTRIES) {
            history.splice(0, history.length - MAX_HISTORY_ENTRIES);
        }

        await this.saveEntries(history);
        return entry;
    }

    queryHistory(filter: CliHistoryFilter = {}): CliHistoryEntry[] {
        let entries = this.loadEntries();

        // Sort by newest first
        entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (filter.outcome) {
            entries = entries.filter(e => e.outcome === filter.outcome);
        }

        if (filter.source) {
            entries = entries.filter(e => e.source === filter.source);
        }

        if (filter.searchText) {
            const query = filter.searchText.toLowerCase();
            entries = entries.filter(e => {
                return (
                    e.command.toLowerCase().includes(query) ||
                    e.args.some(a => a.toLowerCase().includes(query)) ||
                    (e.label && e.label.toLowerCase().includes(query)) ||
                    (e.stdout && e.stdout.toLowerCase().includes(query)) ||
                    (e.stderr && e.stderr.toLowerCase().includes(query))
                );
            });
        }

        if (filter.fromDate) {
            const from = new Date(filter.fromDate).getTime();
            entries = entries.filter(e => new Date(e.timestamp).getTime() >= from);
        }

        if (filter.toDate) {
            const to = new Date(filter.toDate).getTime();
            entries = entries.filter(e => new Date(e.timestamp).getTime() <= to);
        }

        return entries;
    }

    getEntry(id: string): CliHistoryEntry | undefined {
        return this.loadEntries().find(e => e.id === id);
    }

    async clearHistory(): Promise<void> {
        await this.saveEntries([]);
    }

    async deleteEntry(id: string): Promise<boolean> {
        const history = this.loadEntries();
        const index = history.findIndex(e => e.id === id);
        if (index === -1) return false;

        history.splice(index, 1);
        await this.saveEntries(history);
        return true;
    }

    exportHistory(): string {
        const entries = this.loadEntries().map(e => ({
            ...e,
            command: this.maskSensitiveData(e.command),
            args: e.args.map(arg => this.maskSensitiveData(arg)),
            stdout: e.stdout ? this.maskSensitiveData(e.stdout) : undefined,
            stderr: e.stderr ? this.maskSensitiveData(e.stderr) : undefined,
        }));

        return JSON.stringify({
            version: 1,
            exportedAt: new Date().toISOString(),
            entries,
        }, null, 2);
    }

    maskSensitiveData(text: string): string {
        let masked = text;

        // Mask S... secret keys
        masked = masked.replace(/\bS[A-Z0-9]{55}\b/g, 'S*******************************************************');

        // Mask secret flag values
        const secretFlags = ['--secret', '--sk', '--seed', '--private-key'];
        for (const flag of secretFlags) {
            const regex = new RegExp(`(${flag}\\s+)(\\S+)`, 'gi');
            masked = masked.replace(regex, '$1********');
        }

        return masked;
    }

    async setLabel(id: string, label: string): Promise<boolean> {
        const history = this.loadEntries();
        const entry = history.find(e => e.id === id);
        if (!entry) return false;

        entry.label = label;
        await this.saveEntries(history);
        return true;
    }

    private loadEntries(): CliHistoryEntry[] {
        return this.context.workspaceState.get<CliHistoryEntry[]>(STORAGE_KEY, []);
    }

    private async saveEntries(entries: CliHistoryEntry[]): Promise<void> {
        await this.context.workspaceState.update(STORAGE_KEY, entries);
    }
}
