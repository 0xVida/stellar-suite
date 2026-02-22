// ============================================================
// src/services/reorderingService.ts
// Persists and resolves custom contract display order.
// Follows the same workspaceState pattern as contextMenuService.
// ============================================================

import * as vscode from 'vscode';

const ORDER_KEY = 'stellarSuite.contractOrder';

export class ReorderingService {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly outputChannel: vscode.OutputChannel
    ) {}

    /**
     * Return the persisted order array (contract paths in display order).
     */
    getOrder(): string[] {
        return this.context.workspaceState.get<string[]>(ORDER_KEY, []);
    }

    /**
     * Persist a new order. Validates that paths are non-empty strings.
     */
    async saveOrder(orderedPaths: string[]): Promise<void> {
        if (!Array.isArray(orderedPaths)) {
            throw new Error('orderedPaths must be an array');
        }
        const cleaned = orderedPaths.filter(p => typeof p === 'string' && p.trim().length > 0);
        await this.context.workspaceState.update(ORDER_KEY, cleaned);
        this.outputChannel.appendLine(
            `[Reordering] Saved order for ${cleaned.length} contract(s)`
        );
    }

    /**
     * Apply the saved custom order to a discovered contract list.
     * Contracts not in the saved order are appended at the end
     * (e.g. newly discovered contracts appear last).
     * Pinned contracts always float to the top, same as before.
     */
    applyOrder<T extends { path: string; isPinned?: boolean }>(contracts: T[]): T[] {
        const savedOrder = this.getOrder();

        if (savedOrder.length === 0) {
            // No custom order — maintain pin-first default
            return this.sortPinnedFirst(contracts);
        }

        const pinned    = contracts.filter(c => c.isPinned);
        const unpinned  = contracts.filter(c => !c.isPinned);

        // Sort unpinned by saved order; unknowns go to end
        const ordered = [...unpinned].sort((a, b) => {
            const ai = savedOrder.indexOf(a.path);
            const bi = savedOrder.indexOf(b.path);
            if (ai === -1 && bi === -1) { return 0; }
            if (ai === -1) { return 1; }
            if (bi === -1) { return -1; }
            return ai - bi;
        });

        return [...pinned, ...ordered];
    }

    /**
     * Move a contract from one index to another within the unpinned set
     * and persist the result. Returns the new full ordered path list.
     */
    async move(
        allContracts: Array<{ path: string; isPinned?: boolean }>,
        fromPath: string,
        toPath: string
    ): Promise<string[]> {
        if (fromPath === toPath) {
            return this.getOrder();
        }

        const unpinned = allContracts
            .filter(c => !c.isPinned)
            .map(c => c.path);

        const savedOrder = this.getOrder();

        // Build the working order — start from saved, fill in any unknowns
        const workingOrder = savedOrder.filter(p => unpinned.includes(p));
        for (const p of unpinned) {
            if (!workingOrder.includes(p)) { workingOrder.push(p); }
        }

        const fromIdx = workingOrder.indexOf(fromPath);
        const toIdx   = workingOrder.indexOf(toPath);

        if (fromIdx === -1) {
            throw new Error(`Contract not found in order list: ${fromPath}`);
        }

        // Splice fromPath out and insert before toPath
        workingOrder.splice(fromIdx, 1);
        const newToIdx = workingOrder.indexOf(toPath);
        if (newToIdx === -1) {
            workingOrder.push(fromPath);
        } else {
            workingOrder.splice(newToIdx, 0, fromPath);
        }

        await this.saveOrder(workingOrder);
        this.outputChannel.appendLine(
            `[Reordering] Moved "${fromPath}" → before "${toPath}"`
        );
        return workingOrder;
    }

    /**
     * Reset to default (filesystem discovery) order.
     */
    async resetOrder(): Promise<void> {
        await this.context.workspaceState.update(ORDER_KEY, []);
        this.outputChannel.appendLine('[Reordering] Order reset to default');
    }

    private sortPinnedFirst<T extends { isPinned?: boolean }>(items: T[]): T[] {
        return [...items].sort((a, b) => {
            if (a.isPinned && !b.isPinned) { return -1; }
            if (!a.isPinned && b.isPinned) { return 1; }
            return 0;
        });
    }
}