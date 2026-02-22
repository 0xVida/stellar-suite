import { StateConflict, StateConflictType, StateMetadata } from '../types/stateConflict';
import { isObject } from '../utils/stateIntegrity';

/**
 * Service for detecting conflicts between different versions of workspace state.
 */
export class StateConflictDetectionService {
    /**
     * Compares two state objects and identifies points of conflict.
     * 
     * @param local Current local state
     * @param remote Remote/Incoming state
     * @param localMeta Metadata for local state
     * @param remoteMeta Metadata for remote state
     * @returns Array of detected conflicts
     */
    public detectConflicts(
        local: any,
        remote: any,
        localMeta: StateMetadata,
        remoteMeta: StateMetadata
    ): StateConflict[] {
        const conflicts: StateConflict[] = [];

        // If versions are the same and client IDs match, usually no conflict unless force-checked
        if (localMeta.version === remoteMeta.version && localMeta.clientId === remoteMeta.clientId) {
            // However, if values differ, it might be a schema mismatch or corruption or missed sync
            this.findValueDifferences(local, remote, '', localMeta, remoteMeta, conflicts);
        } else {
            // Versions differ, concurrent modification likely
            this.findValueDifferences(local, remote, '', localMeta, remoteMeta, conflicts);
        }

        return conflicts;
    }

    private findValueDifferences(
        local: any,
        remote: any,
        path: string,
        localMeta: StateMetadata,
        remoteMeta: StateMetadata,
        conflicts: StateConflict[]
    ): void {
        // Handle primitive equality
        if (local === remote) {
            return;
        }

        // Check if both are objects for deep comparison
        if (isObject(local) && isObject(remote)) {
            const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);

            for (const key of allKeys) {
                const currentPath = path ? `${path}.${key}` : key;
                this.findValueDifferences(local[key], remote[key], currentPath, localMeta, remoteMeta, conflicts);
            }
            return;
        }

        // If we reach here, values are different and at least one is not an object or they differ in structure
        conflicts.push({
            type: StateConflictType.CONCURRENT_MODIFICATION,
            path,
            localValue: local,
            remoteValue: remote,
            localMetadata: localMeta,
            remoteMetadata: remoteMeta
        });
    }

    /**
     * Checks if a conflict is automatically resolvable (e.g., recursive merge possible).
     */
    public isResolvable(conflict: StateConflict): boolean {
        // For now, most things are resolvable via strategies except radical structural changes
        // but we might refine this later.
        return true;
    }
}
