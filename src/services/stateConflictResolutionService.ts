import {
    ConflictResolutionStrategy,
    ResolutionResult,
    StateConflict,
    ConflictResolutionOperation
} from '../types/stateConflict';
import { safeClone } from '../utils/stateIntegrity';

/**
 * Service for resolving conflicts between local and remote state.
 */
export class StateConflictResolutionService {
    /**
     * Resolves an array of conflicts using a given strategy.
     * 
     * @param state Basis state to apply resolutions onto (usually a clone of local state)
     * @param conflicts Array of detected conflicts
     * @param defaultStrategy Strategy to use if none specified for a conflict
     * @returns Result of the resolution process
     */
    public resolve(
        state: any,
        conflicts: StateConflict[],
        defaultStrategy: ConflictResolutionStrategy = ConflictResolutionStrategy.MERGE
    ): ResolutionResult {
        const resolvedState = safeClone(state);
        const operations: ConflictResolutionOperation[] = [];
        const unresolvedConflicts: StateConflict[] = [];

        for (const conflict of conflicts) {
            const strategy = defaultStrategy;

            let resolvedValue: any;
            let resolved = true;

            switch (strategy) {
                case ConflictResolutionStrategy.LOCAL_WINS:
                    resolvedValue = conflict.localValue;
                    break;
                case ConflictResolutionStrategy.REMOTE_WINS:
                    resolvedValue = conflict.remoteValue;
                    break;
                case ConflictResolutionStrategy.MERGE:
                    resolvedValue = this.mergeValues(conflict.localValue, conflict.remoteValue);
                    break;
                case ConflictResolutionStrategy.MANUAL:
                    resolved = false;
                    break;
                default:
                    resolvedValue = conflict.localValue;
            }

            if (resolved) {
                this.applyValueAtInterface(resolvedState, conflict.path, resolvedValue);
                operations.push({
                    conflict,
                    strategy,
                    resolvedValue,
                    appliedAt: new Date().toISOString()
                });
            } else {
                unresolvedConflicts.push(conflict);
            }
        }

        return {
            resolvedState,
            operations,
            unresolvedConflicts
        };
    }

    private mergeValues(local: any, remote: any): any {
        // If both are objects, merge them. Simple merge for now.
        if (typeof local === 'object' && local !== null && typeof remote === 'object' && remote !== null) {
            return { ...remote, ...local }; // Local overrides remote for fields that exist in both
        }
        // For primitives, default to local if merge is requested but not really possible
        return local;
    }

    private applyValueAtInterface(obj: any, path: string, value: any): void {
        const parts = path.split('.');
        let current = obj;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!(part in current)) {
                current[part] = {};
            }
            current = current[part];
        }

        current[parts[parts.length - 1]] = value;
    }
}
