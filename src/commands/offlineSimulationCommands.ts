// ============================================================
// src/commands/offlineSimulationCommands.ts
// Commands for offline simulation functionality.
// Handles UI and workflow for offline contract simulation.
// ============================================================

import * as vscode from 'vscode';
import { OfflineSimulationService } from '../services/offlineSimulationService';
import { ContractCacheService } from '../services/contractCacheService';
import { OfflineModeDetectionService } from '../services/offlineModeDetectionService';
import { InputSanitizationService } from '../services/inputSanitizationService';
import { SidebarViewProvider } from '../ui/sidebarView';
import { formatError } from '../utils/errorFormatter';

/**
 * Register offline simulation commands.
 */
export function registerOfflineSimulationCommands(
    context: vscode.ExtensionContext,
    offlineService: OfflineSimulationService,
    cacheService: ContractCacheService,
    modeDetectionService: OfflineModeDetectionService,
    sidebarProvider?: SidebarViewProvider
): void {
    const disposables = [
        vscode.commands.registerCommand('stellarSuite.simulateOffline', async () => {
            await simulateOffline(context, offlineService, cacheService, sidebarProvider);
        }),
        vscode.commands.registerCommand('stellarSuite.cacheContractForOffline', async () => {
            await cacheContractForOffline(context, cacheService);
        }),
        vscode.commands.registerCommand('stellarSuite.enableOfflineMode', async () => {
            await enableOfflineMode(modeDetectionService);
        }),
        vscode.commands.registerCommand('stellarSuite.disableOfflineMode', async () => {
            await disableOfflineMode(modeDetectionService);
        }),
        vscode.commands.registerCommand('stellarSuite.showCacheStats', async () => {
            await showCacheStats(cacheService);
        }),
        vscode.commands.registerCommand('stellarSuite.clearContractCache', async () => {
            await clearContractCache(cacheService);
        }),
        vscode.commands.registerCommand('stellarSuite.checkNetworkConnectivity', async () => {
            await checkNetworkConnectivity(modeDetectionService);
        }),
        vscode.commands.registerCommand('stellarSuite.replayOfflineSimulation', async () => {
            await replayOfflineSimulation(context, offlineService, cacheService);
        }),
    ];

    context.subscriptions.push(...disposables);
}

// ── Command implementations ───────────────────────────────────

async function simulateOffline(
    context: vscode.ExtensionContext,
    offlineService: OfflineSimulationService,
    cacheService: ContractCacheService,
    sidebarProvider?: SidebarViewProvider
): Promise<void> {
    const sanitizer = new InputSanitizationService();

    try {
        const cachedContracts = cacheService.getAllCachedContracts();
        if (cachedContracts.length === 0) {
            vscode.window.showErrorMessage(
                'No contracts cached. Use "Cache Contract for Offline" first.'
            );
            return;
        }

        // Show quick pick of cached contracts
        const contractOptions = cachedContracts.map((c) => ({
            label: c.contractId,
            description: `Network: ${c.network} | Cached: ${c.cachedAt}`,
            contract: c,
        }));

        const selectedContract = await vscode.window.showQuickPick(contractOptions, {
            placeHolder: 'Select a cached contract',
        });

        if (!selectedContract) {
            return;
        }

        const contract = selectedContract.contract;

        // Show quick pick of functions
        const functionOptions = contract.functions.map((f) => ({
            label: f.name,
            description: f.returnType ? `Returns: ${f.returnType}` : 'No return type',
            function: f,
        }));

        const selectedFunction = await vscode.window.showQuickPick(functionOptions, {
            placeHolder: 'Select a function to simulate',
        });

        if (!selectedFunction) {
            return;
        }

        // Get function arguments
        const args: unknown[] = [];
        const functionInfo = selectedFunction.function;

        if (functionInfo.parameters && functionInfo.parameters.length > 0) {
            for (let i = 0; i < functionInfo.parameters.length; i++) {
                const param = functionInfo.parameters[i];
                const argInput = await vscode.window.showInputBox({
                    prompt: `Enter argument ${i + 1} (${param.name}: ${param.type})`,
                    placeHolder: `e.g., value for ${param.name}`,
                });

                if (argInput === undefined) {
                    return; // User cancelled
                }

                // Try to parse as JSON, fallback to string
                try {
                    args.push(JSON.parse(argInput));
                } catch {
                    args.push(argInput);
                }
            }
        }

        // Execute offline simulation
        const result = await offlineService.simulateOffline({
            contractId: contract.contractId,
            functionName: selectedFunction.function.name,
            args,
            network: contract.network,
            source: contract.source,
        });

        // Display result
        if ('code' in result) {
            // Error result
            vscode.window.showErrorMessage(`Simulation failed: ${result.message}`);
        } else {
            // Success result
            const resultStr = JSON.stringify(result.result, null, 2);
            vscode.window.showInformationMessage(
                `Offline simulation successful! Result: ${resultStr.substring(0, 100)}...`
            );
        }
    } catch (error) {
        vscode.window.showErrorMessage(
            `Offline simulation error: ${formatError(error)}`
        );
    }
}

async function cacheContractForOffline(
    context: vscode.ExtensionContext,
    cacheService: ContractCacheService
): Promise<void> {
    const sanitizer = new InputSanitizationService();

    try {
        const contractId = await vscode.window.showInputBox({
            prompt: 'Enter contract ID to cache',
            placeHolder: 'C...',
            validateInput: (value: string) => {
                const result = sanitizer.sanitizeContractId(value, { field: 'contractId' });
                return !result.valid ? result.errors[0] : null;
            },
        });

        if (!contractId) {
            return;
        }

        const network = await vscode.window.showQuickPick(
            ['testnet', 'mainnet', 'local'],
            { placeHolder: 'Select network' }
        );

        if (!network) {
            return;
        }

        const source = await vscode.window.showInputBox({
            prompt: 'Enter source identity',
            placeHolder: 'e.g., G...',
        });

        if (!source) {
            return;
        }

        // In a real implementation, this would fetch from network or user file
        await cacheService.cacheContract({
            contractId,
            network,
            source,
            functions: [],
            cachedAt: new Date().toISOString(),
        });

        vscode.window.showInformationMessage(`Contract ${contractId} cached for offline use`);
    } catch (error) {
        vscode.window.showErrorMessage(
            `Error caching contract: ${formatError(error)}`
        );
    }
}

async function enableOfflineMode(
    modeDetectionService: OfflineModeDetectionService
): Promise<void> {
    try {
        await modeDetectionService.setOfflineMode(true, 'User enabled offline mode');
        vscode.window.showInformationMessage('Offline mode enabled');
    } catch (error) {
        vscode.window.showErrorMessage(`Error enabling offline mode: ${formatError(error)}`);
    }
}

async function disableOfflineMode(
    modeDetectionService: OfflineModeDetectionService
): Promise<void> {
    try {
        const isOnline = await modeDetectionService.checkNetworkConnectivity();
        if (isOnline) {
            vscode.window.showInformationMessage('Online mode enabled');
        } else {
            vscode.window.showWarningMessage(
                'Network connectivity check failed. Offline mode remains active.'
            );
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error disabling offline mode: ${formatError(error)}`);
    }
}

async function showCacheStats(cacheService: ContractCacheService): Promise<void> {
    try {
        const stats = cacheService.getStats();
        const message = `Cache Stats:
- Total Contracts: ${stats.totalCachedContracts}
- Valid Entries: ${stats.validEntries}
- Stale Entries: ${stats.staleEntries}
- Total Size: ${(stats.totalCacheSize / 1024).toFixed(2)} KB
- Oldest: ${stats.oldestCacheEntry || 'N/A'}
- Newest: ${stats.newestCacheEntry || 'N/A'}`;

        vscode.window.showInformationMessage(message);
    } catch (error) {
        vscode.window.showErrorMessage(`Error getting cache stats: ${formatError(error)}`);
    }
}

async function clearContractCache(cacheService: ContractCacheService): Promise<void> {
    try {
        const confirmation = await vscode.window.showWarningMessage(
            'Are you sure you want to clear the entire contract cache?',
            'Yes',
            'No'
        );

        if (confirmation === 'Yes') {
            await cacheService.clearCache();
            vscode.window.showInformationMessage('Contract cache cleared');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error clearing cache: ${formatError(error)}`);
    }
}

async function checkNetworkConnectivity(
    modeDetectionService: OfflineModeDetectionService
): Promise<void> {
    try {
        vscode.window.showInformationMessage('Checking network connectivity...');
        const isOnline = await modeDetectionService.checkNetworkConnectivity();
        const status = isOnline ? 'Online' : 'Offline';
        vscode.window.showInformationMessage(`Network status: ${status}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Error checking connectivity: ${formatError(error)}`);
    }
}

async function replayOfflineSimulation(
    context: vscode.ExtensionContext,
    offlineService: OfflineSimulationService,
    cacheService: ContractCacheService
): Promise<void> {
    try {
        const cachedContracts = cacheService.getAllCachedContracts();
        if (cachedContracts.length === 0) {
            vscode.window.showErrorMessage('No offline simulations to replay');
            return;
        }

        // Show cached contracts for selection
        const contractOptions = cachedContracts.map((c) => ({
            label: c.contractId,
            description: `Network: ${c.network}`,
            contract: c,
        }));

        const selected = await vscode.window.showQuickPick(contractOptions, {
            placeHolder: 'Select contract to replay simulations',
        });

        if (selected) {
            vscode.window.showInformationMessage(`Replay functionality for ${selected.contract.contractId}`);
            // Implement replay logic here
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error replaying simulation: ${formatError(error)}`);
    }
}
