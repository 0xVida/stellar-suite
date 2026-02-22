// ============================================================
// src/commands/simulationComparisonCommands.ts
// Commands for comparing simulation results.
// Provides UI for selecting simulations from history and
// displaying comparison results.
// ============================================================

import * as vscode from 'vscode';
import { SimulationHistoryService, SimulationHistoryEntry } from '../services/simulationHistoryService';
import { SimulationComparisonPanel } from '../ui/simulationComparisonPanel';

/**
 * Register simulation comparison commands
 */
export function registerSimulationComparisonCommands(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService
): void {
    // Compare simulations from history
    const compareCommand = vscode.commands.registerCommand(
        'stellarSuite.compareSimulations',
        () => compareSimulations(context, historyService)
    );

    // Compare selected simulations (called with simulation IDs)
    const compareSelectedCommand = vscode.commands.registerCommand(
        'stellarSuite.compareSelected',
        (simulationIds: string[]) => compareSelectedSimulations(context, historyService, simulationIds)
    );

    // Compare last N simulations
    const compareLastNCommand = vscode.commands.registerCommand(
        'stellarSuite.compareLastN',
        () => compareLastNSimulations(context, historyService)
    );

    // Compare simulations with same contract
    const compareSameContractCommand = vscode.commands.registerCommand(
        'stellarSuite.compareSameContract',
        () => compareSameContract(context, historyService)
    );

    // Compare simulations with same function
    const compareSameFunctionCommand = vscode.commands.registerCommand(
        'stellarSuite.compareSameFunction',
        () => compareSameFunction(context, historyService)
    );

    context.subscriptions.push(
        compareCommand,
        compareSelectedCommand,
        compareLastNCommand,
        compareSameContractCommand,
        compareSameFunctionCommand
    );
}

/**
 * Compare simulations with manual selection
 */
async function compareSimulations(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService
): Promise<void> {
    try {
        // Get all simulations from history
        const allSimulations = historyService.getAllEntries();

        if (allSimulations.length === 0) {
            vscode.window.showInformationMessage('Stellar Suite: No simulations in history.');
            return;
        }

        if (allSimulations.length < 2) {
            vscode.window.showInformationMessage('Stellar Suite: At least 2 simulations required for comparison.');
            return;
        }

        // Create quick pick items
        const items = allSimulations.map(sim => ({
            label: `${sim.contractId.substring(0, 12)}... - ${sim.functionName}`,
            description: `${sim.outcome === 'success' ? '✓' : '✗'} ${new Date(sim.timestamp).toLocaleString()}`,
            detail: sim.label || `Network: ${sim.network}`,
            simulation: sim,
            picked: false,
        }));

        // Show multi-select quick pick
        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: 'Select 2 or more simulations to compare',
            title: 'Compare Simulations',
        });

        if (!selected || selected.length < 2) {
            vscode.window.showWarningMessage('Stellar Suite: Please select at least 2 simulations.');
            return;
        }

        // Ask for optional label
        const label = await vscode.window.showInputBox({
            prompt: 'Enter a label for this comparison (optional)',
            placeHolder: 'e.g., Parameter variation test',
        });

        // Create comparison panel
        const panel = SimulationComparisonPanel.createOrShow(context);
        panel.updateComparison(selected.map(s => s.simulation), label);

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite: Failed to compare simulations — ${errorMsg}`);
    }
}

/**
 * Compare specific simulations by ID
 */
async function compareSelectedSimulations(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService,
    simulationIds: string[]
): Promise<void> {
    try {
        if (simulationIds.length < 2) {
            vscode.window.showWarningMessage('Stellar Suite: At least 2 simulation IDs required.');
            return;
        }

        // Retrieve simulations
        const simulations: SimulationHistoryEntry[] = [];
        for (const id of simulationIds) {
            const sim = historyService.getEntry(id);
            if (sim) {
                simulations.push(sim);
            }
        }

        if (simulations.length < 2) {
            vscode.window.showWarningMessage('Stellar Suite: Could not find enough simulations.');
            return;
        }

        // Create comparison panel
        const panel = SimulationComparisonPanel.createOrShow(context);
        panel.updateComparison(simulations);

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite: Failed to compare simulations — ${errorMsg}`);
    }
}

/**
 * Compare last N simulations
 */
async function compareLastNSimulations(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService
): Promise<void> {
    try {
        // Ask for number of simulations
        const count = await vscode.window.showInputBox({
            prompt: 'How many recent simulations to compare?',
            value: '2',
            validateInput: (value) => {
                const num = parseInt(value, 10);
                if (isNaN(num) || num < 2) {
                    return 'Please enter a number >= 2';
                }
                if (num > 10) {
                    return 'Maximum 10 simulations';
                }
                return null;
            },
        });

        if (!count) {
            return;
        }

        const n = parseInt(count, 10);

        // Get last N simulations
        const allSimulations = historyService.getAllEntries();
        if (allSimulations.length < n) {
            vscode.window.showWarningMessage(
                `Stellar Suite: Only ${allSimulations.length} simulations available in history.`
            );
        }

        const simulations = allSimulations.slice(0, Math.min(n, allSimulations.length));

        if (simulations.length < 2) {
            vscode.window.showWarningMessage('Stellar Suite: Need at least 2 simulations.');
            return;
        }

        // Create comparison panel
        const panel = SimulationComparisonPanel.createOrShow(context);
        panel.updateComparison(simulations, `Last ${simulations.length} simulations`);

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite: Failed to compare simulations — ${errorMsg}`);
    }
}

/**
 * Compare simulations for the same contract
 */
async function compareSameContract(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService
): Promise<void> {
    try {
        const allSimulations = historyService.getAllEntries();

        if (allSimulations.length === 0) {
            vscode.window.showInformationMessage('Stellar Suite: No simulations in history.');
            return;
        }

        // Get unique contract IDs
        const contractIds = Array.from(new Set(allSimulations.map(s => s.contractId)));

        if (contractIds.length === 0) {
            vscode.window.showInformationMessage('Stellar Suite: No contracts found in history.');
            return;
        }

        // Let user select a contract
        const contractId = await vscode.window.showQuickPick(
            contractIds.map(id => ({
                label: id,
                description: `${allSimulations.filter(s => s.contractId === id).length} simulations`,
            })),
            {
                placeHolder: 'Select a contract to compare simulations',
                title: 'Compare Simulations - Same Contract',
            }
        );

        if (!contractId) {
            return;
        }

        // Get all simulations for this contract
        const contractSimulations = historyService.getEntriesByContract(contractId.label);

        if (contractSimulations.length < 2) {
            vscode.window.showInformationMessage(
                'Stellar Suite: Need at least 2 simulations for the same contract.'
            );
            return;
        }

        // Create comparison panel
        const panel = SimulationComparisonPanel.createOrShow(context);
        panel.updateComparison(
            contractSimulations,
            `All simulations for ${contractId.label.substring(0, 12)}...`
        );

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite: Failed to compare simulations — ${errorMsg}`);
    }
}

/**
 * Compare simulations for the same function
 */
async function compareSameFunction(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService
): Promise<void> {
    try {
        const allSimulations = historyService.getAllEntries();

        if (allSimulations.length === 0) {
            vscode.window.showInformationMessage('Stellar Suite: No simulations in history.');
            return;
        }

        // Get unique function names
        const functionNames = Array.from(new Set(allSimulations.map(s => s.functionName)));

        if (functionNames.length === 0) {
            vscode.window.showInformationMessage('Stellar Suite: No functions found in history.');
            return;
        }

        // Let user select a function
        const functionName = await vscode.window.showQuickPick(
            functionNames.map(name => ({
                label: name,
                description: `${allSimulations.filter(s => s.functionName === name).length} simulations`,
            })),
            {
                placeHolder: 'Select a function to compare simulations',
                title: 'Compare Simulations - Same Function',
            }
        );

        if (!functionName) {
            return;
        }

        // Get all simulations for this function
        const functionSimulations = historyService.getEntriesByFunction(functionName.label);

        if (functionSimulations.length < 2) {
            vscode.window.showInformationMessage(
                'Stellar Suite: Need at least 2 simulations for the same function.'
            );
            return;
        }

        // Create comparison panel
        const panel = SimulationComparisonPanel.createOrShow(context);
        panel.updateComparison(
            functionSimulations,
            `All simulations for function: ${functionName.label}`
        );

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite: Failed to compare simulations — ${errorMsg}`);
    }
}
