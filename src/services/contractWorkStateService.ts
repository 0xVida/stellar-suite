import type * as vscode from 'vscode';

let vscodeRuntime: any = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    vscodeRuntime = require('vscode');
} catch {
    vscodeRuntime = null;
}

export interface ContractDeploymentRecord {
    contractId: string;
    contractName: string;
    deployedAt: string;
    network: string;
    source: string;
    transactionHash?: string;
    [key: string]: unknown;
}

export interface PersistedContractMetadata {
    contractPath: string;
    contractName: string;
    version?: string;
    updatedAt: string;
    data?: Record<string, unknown>;
}

export interface ContractWorkspacePreferences {
    selectedNetwork?: string;
    pinnedContracts?: string[];
    [key: string]: unknown;
}

export interface WorkspaceContractState {
    deployedContracts: Record<string, string>;
    deploymentHistory: ContractDeploymentRecord[];
    metadata: Record<string, PersistedContractMetadata>;
    preferences: ContractWorkspacePreferences;
    updatedAt: string;
}

export interface ContractWorkspaceStateSnapshot {
    schemaVersion: number;
    workspaces: Record<string, WorkspaceContractState>;
}

interface ExportPayload {
    exportedAt: string;
    format: 'stellarSuite.contractWorkspaceState';
    state: ContractWorkspaceStateSnapshot;
}

const STORAGE_KEY = 'stellarSuite.contractWorkspaceState';
const SCHEMA_VERSION = 2;

export class ContractWorkspaceStateService {
    constructor(
        private readonly context: { workspaceState: vscode.Memento },
        private readonly outputChannel: { appendLine(value: string): void },
    ) {}

    public async initialize(): Promise<void> {
        const snapshot = this.loadSnapshot();
        await this.saveSnapshot(snapshot);
    }

    public getWorkspaceId(): string {
        const folder = vscodeRuntime?.workspace?.workspaceFolders?.[0]?.uri?.fsPath;
        return folder?.replace(/\\/g, '/') ?? '__no_workspace__';
    }

    public getWorkspaceState(workspaceId = this.getWorkspaceId()): WorkspaceContractState {
        const snapshot = this.loadSnapshot();
        return snapshot.workspaces[workspaceId] ?? this.defaultWorkspaceState();
    }

    public async recordDeployment(
        record: ContractDeploymentRecord,
        opts?: { workspaceId?: string; contractPath?: string },
    ): Promise<void> {
        const workspaceId = opts?.workspaceId ?? this.getWorkspaceId();
        const snapshot = this.loadSnapshot();
        const ws = this.ensureWorkspace(snapshot, workspaceId);

        ws.deploymentHistory.push(record);
        ws.deploymentHistory.sort((a, b) => Date.parse(a.deployedAt) - Date.parse(b.deployedAt));

        if (opts?.contractPath) {
            ws.deployedContracts[opts.contractPath] = record.contractId;
        }

        ws.updatedAt = new Date().toISOString();
        await this.saveSnapshot(snapshot);
    }

    public async upsertMetadata(
        metadata: PersistedContractMetadata,
        workspaceId = this.getWorkspaceId(),
    ): Promise<void> {
        const snapshot = this.loadSnapshot();
        const ws = this.ensureWorkspace(snapshot, workspaceId);
        ws.metadata[metadata.contractPath] = metadata;
        ws.updatedAt = new Date().toISOString();
        await this.saveSnapshot(snapshot);
    }

    public async setPreference(key: string, value: unknown, workspaceId = this.getWorkspaceId()): Promise<void> {
        const snapshot = this.loadSnapshot();
        const ws = this.ensureWorkspace(snapshot, workspaceId);
        ws.preferences[key] = value;
        ws.updatedAt = new Date().toISOString();
        await this.saveSnapshot(snapshot);
    }

    public exportState(): string {
        const payload: ExportPayload = {
            exportedAt: new Date().toISOString(),
            format: 'stellarSuite.contractWorkspaceState',
            state: this.loadSnapshot(),
        };
        return JSON.stringify(payload, null, 2);
    }

    public async importState(raw: string, mode: 'replace' | 'merge' = 'merge'): Promise<void> {
        const parsed = JSON.parse(raw) as Partial<ExportPayload>;
        if (parsed.format !== 'stellarSuite.contractWorkspaceState' || !parsed.state) {
            throw new Error('Invalid import format for contract workspace state.');
        }

        const imported = this.normalizeSnapshot(parsed.state);
        if (mode === 'replace') {
            await this.saveSnapshot(imported);
            return;
        }

        const local = this.loadSnapshot();
        const merged: ContractWorkspaceStateSnapshot = {
            schemaVersion: SCHEMA_VERSION,
            workspaces: { ...local.workspaces },
        };

        for (const [id, ws] of Object.entries(imported.workspaces)) {
            const base = merged.workspaces[id] ?? this.defaultWorkspaceState();
            merged.workspaces[id] = {
                deployedContracts: { ...base.deployedContracts, ...ws.deployedContracts },
                deploymentHistory: [...base.deploymentHistory, ...ws.deploymentHistory],
                metadata: { ...base.metadata, ...ws.metadata },
                preferences: { ...base.preferences, ...ws.preferences },
                updatedAt: new Date().toISOString(),
            };
        }

        await this.saveSnapshot(this.normalizeSnapshot(merged));
    }

    public async migrateLegacyState(workspaceId = this.getWorkspaceId()): Promise<void> {
        const snapshot = this.loadSnapshot();
        const ws = this.ensureWorkspace(snapshot, workspaceId);

        const legacyDeployedContracts = this.context.workspaceState.get<Record<string, string>>('stellarSuite.deployedContracts', {});
        const legacyDeploymentHistory = this.context.workspaceState.get<ContractDeploymentRecord[]>('stellarSuite.deploymentHistory', []);

        ws.deployedContracts = { ...legacyDeployedContracts, ...ws.deployedContracts };
        ws.deploymentHistory = this.mergeHistory(legacyDeploymentHistory, ws.deploymentHistory);
        ws.updatedAt = new Date().toISOString();

        await this.saveSnapshot(snapshot);
    }

    private mergeHistory(left: ContractDeploymentRecord[], right: ContractDeploymentRecord[]): ContractDeploymentRecord[] {
        const seen = new Set<string>();
        const merged: ContractDeploymentRecord[] = [];

        for (const rec of [...left, ...right]) {
            const key = `${rec.contractId}:${rec.deployedAt}:${rec.network}`;
            if (seen.has(key)) { continue; }
            seen.add(key);
            merged.push(rec);
        }

        return merged.sort((a, b) => Date.parse(a.deployedAt) - Date.parse(b.deployedAt));
    }

    private loadSnapshot(): ContractWorkspaceStateSnapshot {
        try {
            const raw = this.context.workspaceState.get<ContractWorkspaceStateSnapshot | undefined>(STORAGE_KEY, undefined);
            if (!raw) {
                return { schemaVersion: SCHEMA_VERSION, workspaces: {} };
            }
            return this.normalizeSnapshot(raw);
        } catch (error) {
            this.outputChannel.appendLine(`[ContractWorkspaceState] Corruption detected, resetting state: ${String(error)}`);
            return { schemaVersion: SCHEMA_VERSION, workspaces: {} };
        }
    }

    private async saveSnapshot(snapshot: ContractWorkspaceStateSnapshot): Promise<void> {
        await this.context.workspaceState.update(STORAGE_KEY, snapshot);
    }

    private ensureWorkspace(snapshot: ContractWorkspaceStateSnapshot, workspaceId: string): WorkspaceContractState {
        if (!snapshot.workspaces[workspaceId]) {
            snapshot.workspaces[workspaceId] = this.defaultWorkspaceState();
        }
        return snapshot.workspaces[workspaceId];
    }

    private normalizeSnapshot(snapshot: Partial<ContractWorkspaceStateSnapshot>): ContractWorkspaceStateSnapshot {
        const normalized: ContractWorkspaceStateSnapshot = {
            schemaVersion: SCHEMA_VERSION,
            workspaces: {},
        };

        if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.workspaces !== 'object' || !snapshot.workspaces) {
            return normalized;
        }

        for (const [workspaceId, ws] of Object.entries(snapshot.workspaces)) {
            if (!ws || typeof ws !== 'object') {
                continue;
            }

            normalized.workspaces[workspaceId] = {
                deployedContracts: this.safeObject((ws as WorkspaceContractState).deployedContracts),
                deploymentHistory: Array.isArray((ws as WorkspaceContractState).deploymentHistory)
                    ? (ws as WorkspaceContractState).deploymentHistory.filter(this.isValidDeployment)
                    : [],
                metadata: this.safeObject((ws as WorkspaceContractState).metadata),
                preferences: this.safeObject((ws as WorkspaceContractState).preferences),
                updatedAt: typeof (ws as WorkspaceContractState).updatedAt === 'string'
                    ? (ws as WorkspaceContractState).updatedAt
                    : new Date().toISOString(),
            };
        }

        return normalized;
    }

    private safeObject<T extends object>(value: unknown): T {
        return (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as T;
    }

    private isValidDeployment = (value: unknown): value is ContractDeploymentRecord => {
        if (!value || typeof value !== 'object') { return false; }
        const r = value as ContractDeploymentRecord;
        return typeof r.contractId === 'string'
            && typeof r.contractName === 'string'
            && typeof r.deployedAt === 'string'
            && typeof r.network === 'string'
            && typeof r.source === 'string';
    };

    private defaultWorkspaceState(): WorkspaceContractState {
        return {
            deployedContracts: {},
            deploymentHistory: [],
            metadata: {},
            preferences: {},
            updatedAt: new Date().toISOString(),
        };
    }
}

export const ContractWorkspaceStateKeys = {
    STORAGE_KEY,
    SCHEMA_VERSION,
};
