import { ContractGroup } from '../services/contractGroupService';

/**
 * Utility functions for contract group operations
 */
export class GroupUtils {
    /**
     * Find group by name (case-insensitive)
     */
    static findGroupByName(groups: ContractGroup[], name: string): ContractGroup | undefined {
        return groups.find(g => g.name.toLowerCase() === name.toLowerCase());
    }

    /**
     * Get all ancestors of a group
     */
    static getAncestors(groupId: string, groups: Map<string, ContractGroup>): ContractGroup[] {
        const ancestors: ContractGroup[] = [];
        let current = groups.get(groupId);

        while (current?.parentId) {
            current = groups.get(current.parentId);
            if (current) {
                ancestors.push(current);
            }
        }

        return ancestors.reverse();
    }

    /**
     * Get all descendants of a group
     */
    static getDescendants(groupId: string, groups: Map<string, ContractGroup>): ContractGroup[] {
        const descendants: ContractGroup[] = [];
        const getChildren = (id: string) => {
            const children = Array.from(groups.values()).filter(g => g.parentId === id);
            children.forEach(child => {
                descendants.push(child);
                getChildren(child.id);
            });
        };
        getChildren(groupId);
        return descendants;
    }

    /**
     * Sort groups by name, with children grouped together
     */
    static sortGroups(groups: ContractGroup[]): ContractGroup[] {
        return groups.sort((a, b) => {
            // Root group first
            if (a.parentId === undefined && b.parentId !== undefined) return -1;
            if (a.parentId !== undefined && b.parentId === undefined) return 1;

            // Same parent, sort by name
            if (a.parentId === b.parentId) {
                return a.name.localeCompare(b.name);
            }

            return a.name.localeCompare(b.name);
        });
    }

    /**
     * Get path to group (breadcrumb)
     */
    static getGroupPath(groupId: string, groups: Map<string, ContractGroup>): string[] {
        const path: string[] = [];
        let current = groups.get(groupId);

        while (current) {
            path.unshift(current.name);
            if (current.parentId) {
                current = groups.get(current.parentId);
            } else {
                break;
            }
        }

        return path;
    }

    /**
     * Calculate group size including contracts
     */
    static calculateGroupSize(group: ContractGroup, includeNested: boolean = false): number {
        let size = group.contractIds.length;
        return includeNested ? size : size;
    }

    /**
     * Validate contract move operation
     */
    static validateContractMove(
        contractId: string,
        fromGroupId: string,
        toGroupId: string,
        groups: Map<string, ContractGroup>
    ): { valid: boolean; error?: string } {
        const fromGroup = groups.get(fromGroupId);
        const toGroup = groups.get(toGroupId);

        if (!fromGroup) {
            return { valid: false, error: `Source group "${fromGroupId}" not found` };
        }
        if (!toGroup) {
            return { valid: false, error: `Target group "${toGroupId}" not found` };
        }
        if (!fromGroup.contractIds.includes(contractId)) {
            return { valid: false, error: `Contract "${contractId}" not in source group` };
        }
        if (toGroup.contractIds.includes(contractId)) {
            return { valid: false, error: `Contract "${contractId}" already in target group` };
        }

        return { valid: true };
    }

    /**
     * Pretty print group hierarchy
     */
    static printHierarchy(
        groupId: string,
        groups: Map<string, ContractGroup>,
        indent: string = ''
    ): string {
        const group = groups.get(groupId);
        if (!group) return '';

        const lines: string[] = [];
        const children = Array.from(groups.values()).filter(g => g.parentId === groupId);

        lines.push(`${indent}├─ ${group.name} (${group.contractIds.length} contracts)`);

        children.forEach((child, index) => {
            const isLast = index === children.length - 1;
            const nextIndent = indent + (isLast ? '  ' : '│ ');
            lines.push(this.printHierarchy(child.id, groups, nextIndent));
        });

        return lines.filter(l => l).join('\n');
    }

    /**
     * Merge two groups
     */
    static mergeGroups(sourceId: string, targetId: string, groups: Map<string, ContractGroup>): void {
        const source = groups.get(sourceId);
        const target = groups.get(targetId);

        if (!source || !target) {
            throw new Error('Source or target group not found');
        }

        target.contractIds.push(...source.contractIds);
        target.modifiedAt = Date.now();
    }

    /**
     * Check if group is empty
     */
    static isEmpty(group: ContractGroup, groups: Map<string, ContractGroup>): boolean {
        const hasContracts = group.contractIds.length > 0;
        const hasChildren = Array.from(groups.values()).some(g => g.parentId === group.id);
        return !hasContracts && !hasChildren;
    }

    /**
     * Get formatted group info
     */
    static formatGroupInfo(group: ContractGroup): {
        name: string;
        contractCount: number;
        createdAt: string;
        modifiedAt: string;
    } {
        return {
            name: group.name,
            contractCount: group.contractIds.length,
            createdAt: new Date(group.createdAt).toISOString(),
            modifiedAt: new Date(group.modifiedAt).toISOString(),
        };
    }
}
