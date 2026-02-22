import * as vscode from 'vscode';

// ============================================================
// Type Definitions
// ============================================================

export enum ConflictResolutionStrategy {
    LOCAL_WINS = 'local_wins',
    REMOTE_WINS = 'remote_wins',
    MERGE = 'merge',
    MANUAL = 'manual'
}

export enum SyncStatus {
    IDLE = 'idle',
    SYNCING = 'syncing',
    SUCCESS = 'success',
    CONFLICT = 'conflict',
    ERROR = 'error',
    CANCELLED = 'cancelled'
}

export interface WorkspaceState {
    deployments: Map<string, DeploymentRecord>;
    configurations: Record<string, any>;
    lastSync: number;
    syncVersion: number;
}

export interface DeploymentRecord {
    contractId: string;
    contractName?: string;
    deployedAt: string;
    network: string;
    source: string;
    transactionHash?: string;
    metadata?: Record<string, any>;
}

export interface SyncConflict {
    key: string;
    type: 'deployment' | 'configuration';
    local: any;
    remote: any;
    timestamp: number;
    strategy: ConflictResolutionStrategy;
}

export interface SyncEvent {
    status: SyncStatus;
    itemsProcessed: number;
    totalItems: number;
    conflicts: SyncConflict[];
    errors: string[];
    timestamp: number;
}

export interface SyncOptions {
    syncDeployments?: boolean;
    syncConfigurations?: boolean;
    conflictStrategy?: ConflictResolutionStrategy;
    validateOnly?: boolean;
    cancellationToken?: vscode.CancellationToken;
}

// ============================================================
// State Synchronization Service
// ============================================================

export class WorkspaceStateSyncService {
    private static readonly SYNC_STATE_KEY = 'stellarSuite.syncState';
    private static readonly DEPLOYMENTS_KEY = 'stellarSuite.deploymentHistory';
    private static readonly CONFIGURATIONS_KEY = 'stellarSuite.configurations';
    private static readonly LAST_SYNC_KEY = 'stellarSuite.lastSync';
    private static readonly SYNC_VERSION = 1;

    private globalState: vscode.Memento;
    private workspaceState: vscode.Memento;
    private outputChannel: vscode.OutputChannel;
    private syncInProgress: boolean = false;
    private currentStatus: SyncStatus = SyncStatus.IDLE;
    private syncStatusEmitter = new vscode.EventEmitter<SyncEvent>();
    readonly onSyncStatusChange = this.syncStatusEmitter.event;

    constructor(context: vscode.ExtensionContext) {
        this.globalState = context.globalState;
        this.workspaceState = context.workspaceState;
        this.outputChannel = vscode.window.createOutputChannel('StellarSuite Sync');
    }

    /**
     * Get current synchronization status.
     */
    getStatus(): SyncStatus {
        return this.currentStatus;
    }

    /**
     * Synchronize state with other workspaces.
     */
    async synchronizeState(options: SyncOptions = {}): Promise<SyncEvent> {
        const defaults = {
            syncDeployments: true,
            syncConfigurations: true,
            conflictStrategy: ConflictResolutionStrategy.MERGE,
            validateOnly: false,
            cancellationToken: undefined as vscode.CancellationToken | undefined
        };

        const opts = { ...defaults, ...options };

        if (this.syncInProgress) {
            return this.createSyncEvent(SyncStatus.ERROR, 'Sync already in progress');
        }

        this.syncInProgress = true;
        this.updateStatus(SyncStatus.SYNCING);

        try {
            const event = new SyncEventBuilder();

            // Validate state before syncing
            if (!opts.validateOnly) {
                const validation = await this.validateState();
                if (!validation.valid) {
                    return this.createSyncEvent(SyncStatus.ERROR, `Validation failed: ${validation.errors.join(', ')}`);
                }
            }

            // Synchronize deployments
            if (opts.syncDeployments) {
                opts.cancellationToken?.onCancellationRequested(() => {
                    throw new vscode.CancellationError();
                });

                const depResult = await this.syncDeployments(opts.conflictStrategy, opts.validateOnly);
                event.addDeploymentResult(depResult);
            }

            // Synchronize configurations
            if (opts.syncConfigurations) {
                opts.cancellationToken?.onCancellationRequested(() => {
                    throw new vscode.CancellationError();
                });

                const confResult = await this.syncConfigurations(opts.conflictStrategy, opts.validateOnly);
                event.addConfigurationResult(confResult);
            }

            const finalStatus = event.hasConflicts ? SyncStatus.CONFLICT : SyncStatus.SUCCESS;
            return this.finalizeSyncEvent(event, finalStatus);
        } catch (error) {
            if (error instanceof vscode.CancellationError) {
                return this.createSyncEvent(SyncStatus.CANCELLED, 'Synchronization cancelled by user');
            }
            const msg = error instanceof Error ? error.message : String(error);
            return this.createSyncEvent(SyncStatus.ERROR, msg);
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Export state for sharing with other workspaces.
     */
    exportState(): WorkspaceState {
        const deployments = new Map<string, DeploymentRecord>();
        const history = this.workspaceState.get<DeploymentRecord[]>(WorkspaceStateSyncService.DEPLOYMENTS_KEY, []);

        for (const record of history) {
            deployments.set(record.contractId, record);
        }

        return {
            deployments,
            configurations: this.workspaceState.get<Record<string, any>>(WorkspaceStateSyncService.CONFIGURATIONS_KEY, {}),
            lastSync: this.workspaceState.get<number>(WorkspaceStateSyncService.LAST_SYNC_KEY, 0),
            syncVersion: WorkspaceStateSyncService.SYNC_VERSION
        };
    }

    /**
     * Import state from another workspace.
     */
    async importState(state: WorkspaceState, strategy: ConflictResolutionStrategy = ConflictResolutionStrategy.MERGE): Promise<SyncEvent> {
        this.log('Importing state...');

        if (!this.validateImportedState(state)) {
            return this.createSyncEvent(SyncStatus.ERROR, 'Invalid state format');
        }

        try {
            const event = new SyncEventBuilder();

            // Import deployments
            const depResult = await this.importDeployments(state.deployments, strategy);
            event.addDeploymentResult(depResult);

            // Import configurations
            const confResult = await this.importConfigurations(state.configurations, strategy);
            event.addConfigurationResult(confResult);

            const finalStatus = event.hasConflicts ? SyncStatus.CONFLICT : SyncStatus.SUCCESS;
            return this.finalizeSyncEvent(event, finalStatus);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return this.createSyncEvent(SyncStatus.ERROR, msg);
        }
    }

    /**
     * Clear all synchronized state.
     */
    async clearSyncState(): Promise<void> {
        await this.workspaceState.update(WorkspaceStateSyncService.DEPLOYMENTS_KEY, []);
        await this.workspaceState.update(WorkspaceStateSyncService.CONFIGURATIONS_KEY, {});
        await this.workspaceState.update(WorkspaceStateSyncService.LAST_SYNC_KEY, 0);
        this.log('Sync state cleared');
    }

    /**
     * Validate current state integrity.
     */
    async validateState(): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];

        try {
            const deployments = this.workspaceState.get<DeploymentRecord[]>(WorkspaceStateSyncService.DEPLOYMENTS_KEY, []);
            for (const dep of deployments) {
                if (!this.isValidDeployment(dep)) {
                    errors.push(`Invalid deployment record: ${JSON.stringify(dep)}`);
                }
            }

            const configs = this.workspaceState.get<Record<string, any>>(WorkspaceStateSyncService.CONFIGURATIONS_KEY, {});
            if (typeof configs !== 'object' || configs === null) {
                errors.push('Configurations corrupted');
            }

            return { valid: errors.length === 0, errors };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { valid: false, errors: [msg] };
        }
    }

    /**
     * Handle synchronization conflict with resolution strategy.
     */
    resolveConflict(conflict: SyncConflict): any {
        switch (conflict.strategy) {
            case ConflictResolutionStrategy.LOCAL_WINS:
                return conflict.local;

            case ConflictResolutionStrategy.REMOTE_WINS:
                return conflict.remote;

            case ConflictResolutionStrategy.MERGE:
                return this.mergeValues(conflict.local, conflict.remote);

            case ConflictResolutionStrategy.MANUAL:
                // Return null to indicate manual resolution needed
                return null;

            default:
                return conflict.local;
        }
    }

    // ============================================================
    // Private Methods
    // ============================================================

    private async syncDeployments(strategy: ConflictResolutionStrategy, validateOnly: boolean): Promise<SyncResult> {
        const result = new SyncResult('deployment');
        const localDeployments = this.workspaceState.get<DeploymentRecord[]>(WorkspaceStateSyncService.DEPLOYMENTS_KEY, []);
        const globalDeployments = this.globalState.get<DeploymentRecord[]>(WorkspaceStateSyncService.DEPLOYMENTS_KEY, []);

        // Build maps for efficient lookup
        const localMap = new Map<string, DeploymentRecord>(
            (localDeployments || []).map((d: DeploymentRecord): [string, DeploymentRecord] => [d.contractId, d])
        );
        const globalMap = new Map<string, DeploymentRecord>(
            (globalDeployments || []).map((d: DeploymentRecord): [string, DeploymentRecord] => [d.contractId, d])
        );

        // Detect conflicts and new items
        const processed = new Set<string>();

        for (const [id, remote] of globalMap) {
            processed.add(id);
            const local = localMap.get(id);

            if (!local) {
                result.newItems++;
                if (!validateOnly) {
                    localMap.set(id, remote);
                }
            } else if (this.deploymentsEqual(local, remote)) {
                result.skippedItems++;
            } else {
                result.conflicts++;
                const conflict: SyncConflict = {
                    key: id,
                    type: 'deployment',
                    local,
                    remote,
                    timestamp: Date.now(),
                    strategy
                };
                result.conflictList.push(conflict);

                if (!validateOnly) {
                    const resolved = this.resolveConflict(conflict);
                    if (resolved) {
                        localMap.set(id, resolved);
                    }
                }
            }
        }

        // Check for local items not in global (new local items)
        for (const [id, local] of localMap) {
            if (!processed.has(id)) {
                result.totalItems++;
            }
        }

        result.totalItems = Math.max(result.totalItems, localMap.size);

        if (!validateOnly) {
            await this.workspaceState.update(WorkspaceStateSyncService.DEPLOYMENTS_KEY, Array.from(localMap.values()));
        }

        return result;
    }

    private async syncConfigurations(strategy: ConflictResolutionStrategy, validateOnly: boolean): Promise<SyncResult> {
        const result = new SyncResult('configuration');
        const localConfigs = this.workspaceState.get<Record<string, any>>(WorkspaceStateSyncService.CONFIGURATIONS_KEY, {});
        const globalConfigs = this.globalState.get<Record<string, any>>(WorkspaceStateSyncService.CONFIGURATIONS_KEY, {});

        for (const [key, remoteValue] of Object.entries(globalConfigs)) {
            const localValue = localConfigs[key];

            if (localValue === undefined) {
                result.newItems++;
                if (!validateOnly) {
                    localConfigs[key] = remoteValue;
                }
            } else if (JSON.stringify(localValue) !== JSON.stringify(remoteValue)) {
                result.conflicts++;
                const conflict: SyncConflict = {
                    key,
                    type: 'configuration',
                    local: localValue,
                    remote: remoteValue,
                    timestamp: Date.now(),
                    strategy
                };
                result.conflictList.push(conflict);

                if (!validateOnly) {
                    const resolved = this.resolveConflict(conflict);
                    if (resolved !== null) {
                        localConfigs[key] = resolved;
                    }
                }
            } else {
                result.skippedItems++;
            }

            result.totalItems++;
        }

        if (!validateOnly) {
            await this.workspaceState.update(WorkspaceStateSyncService.CONFIGURATIONS_KEY, localConfigs);
        }

        return result;
    }

    private async importDeployments(remote: Map<string, DeploymentRecord>, strategy: ConflictResolutionStrategy): Promise<SyncResult> {
        const result = new SyncResult('deployment');
        const local = this.workspaceState.get<DeploymentRecord[]>(WorkspaceStateSyncService.DEPLOYMENTS_KEY, []) || [];
        const localMap = new Map<string, DeploymentRecord>(
            local.map((d: DeploymentRecord): [string, DeploymentRecord] => [d.contractId, d])
        );

        for (const [id, remoteRecord] of remote) {
            const localRecord = localMap.get(id);

            if (!localRecord) {
                result.newItems++;
                localMap.set(id, remoteRecord);
            } else if (!this.deploymentsEqual(localRecord, remoteRecord)) {
                result.conflicts++;
                const conflict: SyncConflict = {
                    key: id,
                    type: 'deployment',
                    local: localRecord,
                    remote: remoteRecord,
                    timestamp: Date.now(),
                    strategy
                };
                result.conflictList.push(conflict);
                const resolved = this.resolveConflict(conflict);
                if (resolved) {
                    localMap.set(id, resolved);
                }
            } else {
                result.skippedItems++;
            }

            result.totalItems++;
        }

        await this.workspaceState.update(WorkspaceStateSyncService.DEPLOYMENTS_KEY, Array.from(localMap.values()));
        return result;
    }

    private async importConfigurations(remote: Record<string, any>, strategy: ConflictResolutionStrategy): Promise<SyncResult> {
        const result = new SyncResult('configuration');
        const local = this.workspaceState.get<Record<string, any>>(WorkspaceStateSyncService.CONFIGURATIONS_KEY, {}) || {};

        for (const [key, remoteValue] of Object.entries(remote)) {
            const localValue = local[key];

            if (localValue === undefined) {
                result.newItems++;
                local[key] = remoteValue;
            } else if (JSON.stringify(localValue) !== JSON.stringify(remoteValue)) {
                result.conflicts++;
                const conflict: SyncConflict = {
                    key,
                    type: 'configuration',
                    local: localValue,
                    remote: remoteValue,
                    timestamp: Date.now(),
                    strategy
                };
                result.conflictList.push(conflict);
                const resolved = this.resolveConflict(conflict);
                if (resolved !== null) {
                    local[key] = resolved;
                }
            } else {
                result.skippedItems++;
            }

            result.totalItems++;
        }

        await this.workspaceState.update(WorkspaceStateSyncService.CONFIGURATIONS_KEY, local);
        return result;
    }

    private validateImportedState(state: WorkspaceState): boolean {
        if (!state || typeof state !== 'object') {
            return false;
        }

        if (state.syncVersion !== WorkspaceStateSyncService.SYNC_VERSION) {
            this.log(`Warning: Version mismatch. Expected ${WorkspaceStateSyncService.SYNC_VERSION}, got ${state.syncVersion}`);
        }

        if (!(state.deployments instanceof Map) && typeof state.deployments !== 'object') {
            return false;
        }

        return true;
    }

    private isValidDeployment(record: any): boolean {
        return record &&
            typeof record === 'object' &&
            typeof record.contractId === 'string' &&
            typeof record.deployedAt === 'string' &&
            typeof record.network === 'string' &&
            typeof record.source === 'string';
    }

    private deploymentsEqual(a: DeploymentRecord, b: DeploymentRecord): boolean {
        return a.contractId === b.contractId &&
            a.deployedAt === b.deployedAt &&
            a.network === b.network &&
            a.source === b.source;
    }

    private mergeValues(local: any, remote: any): any {
        // For simple values, prefer local
        if (typeof local !== 'object' || typeof remote !== 'object') {
            return local;
        }

        // For objects, merge recursively
        const merged = { ...local };
        for (const [key, value] of Object.entries(remote)) {
            if (merged[key] === undefined) {
                merged[key] = value;
            }
        }

        return merged;
    }

    private updateStatus(status: SyncStatus): void {
        this.currentStatus = status;
    }

    private createSyncEvent(status: SyncStatus, errorMsg: string): SyncEvent {
        const event: SyncEvent = {
            status,
            itemsProcessed: 0,
            totalItems: 0,
            conflicts: [],
            errors: [errorMsg],
            timestamp: Date.now()
        };

        this.syncStatusEmitter.fire(event);
        this.updateStatus(status);
        this.log(`Sync ${status}: ${errorMsg}`);
        return event;
    }

    private finalizeSyncEvent(builder: SyncEventBuilder, status: SyncStatus): SyncEvent {
        const event = builder.build(status);
        this.syncStatusEmitter.fire(event);
        this.updateStatus(status);

        const msg = `Sync ${status}: ${event.itemsProcessed}/${event.totalItems} items processed, ${event.conflicts.length} conflicts`;
        this.log(msg);

        if (status === SyncStatus.SUCCESS) {
            this.workspaceState.update(WorkspaceStateSyncService.LAST_SYNC_KEY, Date.now());
        }

        return event;
    }

    private log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }
}

// ============================================================
// Helper Classes
// ============================================================

class SyncResult {
    totalItems: number = 0;
    newItems: number = 0;
    skippedItems: number = 0;
    conflicts: number = 0;
    conflictList: SyncConflict[] = [];

    constructor(readonly type: string) {}

    get processedItems(): number {
        return this.newItems + this.skippedItems + this.conflicts;
    }
}

class SyncEventBuilder {
    private deploymentResult?: SyncResult;
    private configurationResult?: SyncResult;
    private allConflicts: SyncConflict[] = [];
    private allErrors: string[] = [];

    addDeploymentResult(result: SyncResult): void {
        this.deploymentResult = result;
        this.allConflicts.push(...result.conflictList);
    }

    addConfigurationResult(result: SyncResult): void {
        this.configurationResult = result;
        this.allConflicts.push(...result.conflictList);
    }

    addError(error: string): void {
        this.allErrors.push(error);
    }

    get hasConflicts(): boolean {
        return this.allConflicts.length > 0;
    }

    build(status: SyncStatus): SyncEvent {
        const totalItems = (this.deploymentResult?.totalItems || 0) + (this.configurationResult?.totalItems || 0);
        const itemsProcessed = (this.deploymentResult?.processedItems || 0) + (this.configurationResult?.processedItems || 0);

        return {
            status,
            itemsProcessed,
            totalItems,
            conflicts: this.allConflicts,
            errors: this.allErrors,
            timestamp: Date.now()
        };
    }
}
