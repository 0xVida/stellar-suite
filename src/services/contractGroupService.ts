import * as vscode from 'vscode';

/**
 * Service for managing contract groups (e.g. grouping contracts in the sidebar).
 * Loads and persists group configuration from workspace state.
 */
export class ContractGroupService {
    constructor(private readonly context: vscode.ExtensionContext) {}

    /**
     * Load saved groups from workspace state. Resolves when done.
     */
    async loadGroups(): Promise<void> {
        // Groups can be read from context.workspaceState if needed later
        return;
    }
}
