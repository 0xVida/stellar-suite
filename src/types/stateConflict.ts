/**
 * Workspace State Conflict Resolution Types
 */

export enum ConflictResolutionStrategy {
    LOCAL_WINS = 'local_wins',
    REMOTE_WINS = 'remote_wins',
    MERGE = 'merge',
    MANUAL = 'manual'
}

export enum StateConflictType {
    CONCURRENT_MODIFICATION = 'concurrent_modification',
    SYNC_CONFLICT = 'sync_conflict',
    SCHEMA_MISMATCH = 'schema_mismatch'
}

export interface StateMetadata {
    version: number;
    updatedAt: string;
    clientId: string;
}

export interface StateConflict {
    type: StateConflictType;
    path: string; // dot-notation path to the conflicting field
    localValue: any;
    remoteValue: any;
    localMetadata: StateMetadata;
    remoteMetadata: StateMetadata;
}

export interface ConflictResolutionOperation {
    conflict: StateConflict;
    strategy: ConflictResolutionStrategy;
    resolvedValue: any;
    appliedAt: string;
}

export interface ResolutionResult {
    resolvedState: any;
    operations: ConflictResolutionOperation[];
    unresolvedConflicts: StateConflict[];
}
