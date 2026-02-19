import * as vscode from 'vscode';

export interface ContractGroup {
    id: string;
    name: string;
    parentId?: string;
    contractIds: string[];
    collapsed: boolean;
    createdAt: number;
    modifiedAt: number;
}

export interface GroupHierarchy extends ContractGroup {
    children: GroupHierarchy[];
}

export interface GroupStatistics {
    totalGroups: number;
    totalContracts: number;
    groupDepth: number;
    contractsPerGroup: number;
}

/**
 * Service for managing contract groups and organization
 * Handles creation, deletion, nesting, and persistence of contract groups
 */
export class ContractGroupService {
    private groups: Map<string, ContractGroup> = new Map();
    private rootGroupId = 'root';
    private readonly storageKey = 'stellarSuite.contractGroups';

    constructor(private context: vscode.ExtensionContext) {
        this.initializeRootGroup();
    }

    /**
     * Load groups from storage
     */
    public async loadGroups(): Promise<void> {
        const stored = this.context.workspaceState.get<Record<string, ContractGroup> | undefined>(this.storageKey);
        if (stored) {
            this.groups.clear();
            Object.entries(stored).forEach(([id, group]) => {
                if (group) {
                    this.groups.set(id, group as ContractGroup);
                }
            });
        } else {
            this.initializeRootGroup();
        }
    }

    /**
     * Save groups to storage
     */
    public async saveGroups(): Promise<void> {
        const data: Record<string, ContractGroup> = {};
        this.groups.forEach((group, id) => {
            data[id] = group;
        });
        await this.context.workspaceState.update(this.storageKey, data);
    }

    /**
     * Create a new group
     */
    public createGroup(name: string, parentId?: string): ContractGroup {
        const id = this.generateId();
        const now = Date.now();

        const group: ContractGroup = {
            id,
            name: this.sanitizeName(name),
            parentId,
            contractIds: [],
            collapsed: false,
            createdAt: now,
            modifiedAt: now,
        };

        this.validateParentId(parentId);
        this.groups.set(id, group);
        return group;
    }

    /**
     * Get group by ID
     */
    public getGroup(id: string): ContractGroup | undefined {
        return this.groups.get(id);
    }

    /**
     * Get all groups
     */
    public getAllGroups(): ContractGroup[] {
        return Array.from(this.groups.values());
    }

    /**
     * Get root group
     */
    public getRootGroup(): ContractGroup {
        const root = this.groups.get(this.rootGroupId);
        if (!root) {
            throw new Error('Root group not found');
        }
        return root;
    }

    /**
     * Delete a group (moves contracts to parent)
     */
    public deleteGroup(groupId: string): void {
        if (groupId === this.rootGroupId) {
            throw new Error('Cannot delete root group');
        }

        const group = this.groups.get(groupId);
        if (!group) {
            throw new Error(`Group "${groupId}" not found`);
        }

        const parent = (group.parentId ? this.getGroup(group.parentId) : null) || this.getRootGroup();
        parent.contractIds.push(...group.contractIds);
        parent.modifiedAt = Date.now();

        this.groups.delete(groupId);
    }

    /**
     * Rename a group
     */
    public renameGroup(groupId: string, newName: string): void {
        const group = this.groups.get(groupId);
        if (!group) {
            throw new Error(`Group "${groupId}" not found`);
        }

        group.name = this.sanitizeName(newName);
        group.modifiedAt = Date.now();
    }

    /**
     * Add contract to group
     */
    public addContractToGroup(contractId: string, groupId: string): void {
        const group = this.groups.get(groupId);
        if (!group) {
            throw new Error(`Group "${groupId}" not found`);
        }

        if (!group.contractIds.includes(contractId)) {
            group.contractIds.push(contractId);
            group.modifiedAt = Date.now();
        }
    }

    /**
     * Remove contract from group
     */
    public removeContractFromGroup(contractId: string, groupId: string): void {
        const group = this.groups.get(groupId);
        if (!group) {
            throw new Error(`Group "${groupId}" not found`);
        }

        const index = group.contractIds.indexOf(contractId);
        if (index > -1) {
            group.contractIds.splice(index, 1);
            group.modifiedAt = Date.now();
        }
    }

    /**
     * Move contract between groups
     */
    public moveContractBetweenGroups(contractId: string, fromGroupId: string, toGroupId: string): void {
        this.removeContractFromGroup(contractId, fromGroupId);
        this.addContractToGroup(contractId, toGroupId);
    }

    /**
     * Move group to different parent (reparent)
     */
    public moveGroupToParent(groupId: string, newParentId?: string): void {
        if (groupId === this.rootGroupId) {
            throw new Error('Cannot move root group');
        }

        const group = this.groups.get(groupId);
        if (!group) {
            throw new Error(`Group "${groupId}" not found`);
        }

        if (newParentId && this.isGroupDescendant(newParentId, groupId)) {
            throw new Error('Cannot move group to its own descendant');
        }

        group.parentId = newParentId;
        group.modifiedAt = Date.now();
    }

    /**
     * Toggle group collapse state
     */
    public toggleGroupCollapse(groupId: string): void {
        const group = this.groups.get(groupId);
        if (!group) {
            throw new Error(`Group "${groupId}" not found`);
        }

        group.collapsed = !group.collapsed;
        group.modifiedAt = Date.now();
    }

    /**
     * Get group hierarchy starting from given group
     */
    public getGroupHierarchy(groupId?: string): GroupHierarchy {
        const id = groupId || this.rootGroupId;
        const group = this.groups.get(id);
        if (!group) {
            throw new Error(`Group "${id}" not found`);
        }

        return {
            ...group,
            children: this.getChildGroups(id).map(child => this.getGroupHierarchy(child.id)),
        };
    }

    /**
     * Get child groups of a parent
     */
    public getChildGroups(parentId?: string): ContractGroup[] {
        return Array.from(this.groups.values()).filter(g => g.parentId === parentId);
    }

    /**
     * Get group statistics
     */
    public getStatistics(): GroupStatistics {
        const allContracts = new Set<string>();
        this.groups.forEach(group => {
            group.contractIds.forEach(id => allContracts.add(id));
        });

        return {
            totalGroups: this.groups.size - 1, // Exclude root
            totalContracts: allContracts.size,
            groupDepth: this.calculateGroupDepth(),
            contractsPerGroup: allContracts.size > 0 ? 
                Math.floor(allContracts.size / (this.groups.size - 1)) : 0,
        };
    }

    /**
     * Find group by contract ID
     */
    public findGroupByContract(contractId: string): ContractGroup | undefined {
        for (const group of this.groups.values()) {
            if (group.contractIds.includes(contractId)) {
                return group;
            }
        }
        return undefined;
    }

    /**
     * Find all groups containing a contract
     */
    public findAllGroupsByContract(contractId: string): ContractGroup[] {
        return Array.from(this.groups.values())
            .filter(g => g.contractIds.includes(contractId));
    }

    /**
     * Validate group name
     */
    public validateGroupName(name: string): { valid: boolean; error?: string } {
        if (!name || name.trim().length === 0) {
            return { valid: false, error: 'Group name cannot be empty' };
        }
        if (name.length > 100) {
            return { valid: false, error: 'Group name must be less than 100 characters' };
        }
        return { valid: true };
    }

    /**
     * Clear all groups except root
     */
    public clearAllGroups(): void {
        const ids = Array.from(this.groups.keys())
            .filter(id => id !== this.rootGroupId);
        ids.forEach(id => this.groups.delete(id));
        this.initializeRootGroup();
    }

    /**
     * Export groups as JSON
     */
    public export(): string {
        const data: Record<string, ContractGroup> = {};
        this.groups.forEach((group, id) => {
            data[id] = group;
        });
        return JSON.stringify(data, null, 2);
    }

    /**
     * Import groups from JSON
     */
    public import(json: string): void {
        try {
            const data = JSON.parse(json) as Record<string, ContractGroup>;
            this.groups.clear();
            Object.entries(data).forEach(([id, group]) => {
                this.groups.set(id, group);
            });
            if (!this.groups.has(this.rootGroupId)) {
                this.initializeRootGroup();
            }
        } catch (error) {
            throw new Error(`Failed to import groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // Private helper methods

    private initializeRootGroup(): void {
        const now = Date.now();
        this.groups.set(this.rootGroupId, {
            id: this.rootGroupId,
            name: 'All Contracts',
            contractIds: [],
            collapsed: false,
            createdAt: now,
            modifiedAt: now,
        });
    }

    private generateId(): string {
        return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private sanitizeName(name: string): string {
        return name.trim().replace(/\s+/g, ' ').substr(0, 100);
    }

    private validateParentId(parentId?: string): void {
        if (parentId && !this.groups.has(parentId)) {
            throw new Error(`Parent group "${parentId}" not found`);
        }
    }

    private isGroupDescendant(ancestorId: string, descendantId: string): boolean {
        let current = this.groups.get(descendantId);
        while (current) {
            if (current.id === ancestorId) {
                return true;
            }
            current = current.parentId ? this.groups.get(current.parentId) : undefined;
        }
        return false;
    }

    private calculateGroupDepth(): number {
        let maxDepth = 0;

        const calculateDepth = (groupId?: string, depth: number = 0): void => {
            const children = this.getChildGroups(groupId);
            if (children.length === 0) {
                maxDepth = Math.max(maxDepth, depth);
            } else {
                children.forEach(child => calculateDepth(child.id, depth + 1));
            }
        };

        calculateDepth();
        return maxDepth;
    }
}
