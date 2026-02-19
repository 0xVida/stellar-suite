import * as vscode from 'vscode';
import { ContractGroupService } from '../services/contractGroupService';

/**
 * Register contract grouping commands
 */
export function registerGroupCommands(context: vscode.ExtensionContext, groupService: ContractGroupService) {
    const outputChannel = vscode.window.createOutputChannel('Stellar Suite - Groups');

    const createGroupCommand = vscode.commands.registerCommand(
        'stellarSuite.createGroup',
        async (parentGroupId?: string) => {
            try {
                outputChannel.appendLine('[Groups] Creating new group...');
                const name = await vscode.window.showInputBox({
                    prompt: 'Enter group name',
                    placeHolder: 'e.g., Payment Contracts',
                    validateInput: (value: string) => {
                        const validation = groupService.validateGroupName(value);
                        return validation.error || '';
                    },
                });

                if (name) {
                    const group = groupService.createGroup(name, parentGroupId);
                    await groupService.saveGroups();
                    outputChannel.appendLine(`[Groups] Created group: ${group.name} (${group.id})`);
                    vscode.window.showInformationMessage(`Group "${name}" created successfully`);
                    await vscode.commands.executeCommand('stellarSuite.refreshContracts');
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                outputChannel.appendLine(`[Groups] Error creating group: ${errorMsg}`);
                vscode.window.showErrorMessage(`Failed to create group: ${errorMsg}`);
            }
        }
    );

    const renameGroupCommand = vscode.commands.registerCommand(
        'stellarSuite.renameGroup',
        async (groupId: string) => {
            try {
                outputChannel.appendLine(`[Groups] Renaming group: ${groupId}`);
                const group = groupService.getGroup(groupId);
                if (!group) {
                    throw new Error('Group not found');
                }

                const newName = await vscode.window.showInputBox({
                    prompt: 'Enter new group name',
                    value: group.name,
                    validateInput: (value: string) => {
                        const validation = groupService.validateGroupName(value);
                        return validation.error || '';
                    },
                });

                if (newName && newName !== group.name) {
                    groupService.renameGroup(groupId, newName);
                    await groupService.saveGroups();
                    outputChannel.appendLine(`[Groups] Renamed group to: ${newName}`);
                    vscode.window.showInformationMessage(`Group renamed to "${newName}"`);
                    await vscode.commands.executeCommand('stellarSuite.refreshContracts');
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                outputChannel.appendLine(`[Groups] Error renaming group: ${errorMsg}`);
                vscode.window.showErrorMessage(`Failed to rename group: ${errorMsg}`);
            }
        }
    );

    const deleteGroupCommand = vscode.commands.registerCommand(
        'stellarSuite.deleteGroup',
        async (groupId: string) => {
            try {
                outputChannel.appendLine(`[Groups] Deleting group: ${groupId}`);
                const group = groupService.getGroup(groupId);
                if (!group) {
                    throw new Error('Group not found');
                }

                const confirm = await vscode.window.showWarningMessage(
                    `Delete group "${group.name}"? Contracts will be moved to parent group.`,
                    'Delete',
                    'Cancel'
                );

                if (confirm === 'Delete') {
                    groupService.deleteGroup(groupId);
                    await groupService.saveGroups();
                    outputChannel.appendLine(`[Groups] Deleted group: ${group.name}`);
                    vscode.window.showInformationMessage(`Group "${group.name}" deleted`);
                    await vscode.commands.executeCommand('stellarSuite.refreshContracts');
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                outputChannel.appendLine(`[Groups] Error deleting group: ${errorMsg}`);
                vscode.window.showErrorMessage(`Failed to delete group: ${errorMsg}`);
            }
        }
    );

    const addContractToGroupCommand = vscode.commands.registerCommand(
        'stellarSuite.addContractToGroup',
        async (contractId: string, groupId: string) => {
            try {
                outputChannel.appendLine(`[Groups] Adding contract ${contractId} to group ${groupId}`);
                groupService.addContractToGroup(contractId, groupId);
                await groupService.saveGroups();
                outputChannel.appendLine('[Groups] Contract added to group');
                await vscode.commands.executeCommand('stellarSuite.refreshContracts');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                outputChannel.appendLine(`[Groups] Error adding contract to group: ${errorMsg}`);
                vscode.window.showErrorMessage(`Failed to add contract to group: ${errorMsg}`);
            }
        }
    );

    const removeContractFromGroupCommand = vscode.commands.registerCommand(
        'stellarSuite.removeContractFromGroup',
        async (contractId: string, groupId: string) => {
            try {
                outputChannel.appendLine(`[Groups] Removing contract ${contractId} from group ${groupId}`);
                groupService.removeContractFromGroup(contractId, groupId);
                await groupService.saveGroups();
                outputChannel.appendLine('[Groups] Contract removed from group');
                await vscode.commands.executeCommand('stellarSuite.refreshContracts');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                outputChannel.appendLine(`[Groups] Error removing contract from group: ${errorMsg}`);
                vscode.window.showErrorMessage(`Failed to remove contract from group: ${errorMsg}`);
            }
        }
    );

    const toggleGroupCollapseCommand = vscode.commands.registerCommand(
        'stellarSuite.toggleGroupCollapse',
        async (groupId: string) => {
            try {
                outputChannel.appendLine(`[Groups] Toggling collapse state for group: ${groupId}`);
                groupService.toggleGroupCollapse(groupId);
                await groupService.saveGroups();
                outputChannel.appendLine('[Groups] Group collapse state toggled');
                await vscode.commands.executeCommand('stellarSuite.refreshContracts');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                outputChannel.appendLine(`[Groups] Error toggling group collapse: ${errorMsg}`);
            }
        }
    );

    const moveGroupCommand = vscode.commands.registerCommand(
        'stellarSuite.moveGroup',
        async (groupId: string, newParentId?: string) => {
            try {
                outputChannel.appendLine(`[Groups] Moving group ${groupId} to parent ${newParentId || 'root'}`);
                groupService.moveGroupToParent(groupId, newParentId);
                await groupService.saveGroups();
                outputChannel.appendLine('[Groups] Group moved successfully');
                await vscode.commands.executeCommand('stellarSuite.refreshContracts');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                outputChannel.appendLine(`[Groups] Error moving group: ${errorMsg}`);
                vscode.window.showErrorMessage(`Failed to move group: ${errorMsg}`);
            }
        }
    );

    const showGroupStatisticsCommand = vscode.commands.registerCommand(
        'stellarSuite.showGroupStatistics',
        async () => {
            try {
                const stats = groupService.getStatistics();
                const message = `
Total Groups: ${stats.totalGroups}
Total Contracts: ${stats.totalContracts}
Max Group Depth: ${stats.groupDepth}
Avg Contracts/Group: ${stats.contractsPerGroup}
                `.trim();

                await vscode.window.showInformationMessage(message);
                outputChannel.appendLine(`[Groups] Statistics displayed: ${message}`);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                outputChannel.appendLine(`[Groups] Error showing statistics: ${errorMsg}`);
            }
        }
    );

    context.subscriptions.push(
        createGroupCommand,
        renameGroupCommand,
        deleteGroupCommand,
        addContractToGroupCommand,
        removeContractFromGroupCommand,
        toggleGroupCollapseCommand,
        moveGroupCommand,
        showGroupStatisticsCommand
    );

    outputChannel.appendLine('[Groups] All group commands registered successfully');
}
