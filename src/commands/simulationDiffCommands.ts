// ============================================================
// src/commands/simulationDiffCommands.ts
// Commands for comparing simulation results and showing
// diffs. Provides various workflows for selecting and
// comparing simulations.
// ============================================================

import * as vscode from 'vscode';
import { SimulationHistoryService, SimulationHistoryEntry } from '../services/simulationHistoryService';
import { SimulationDiffPanel } from '../ui/simulationDiffPanel';

/**
 * Register all simulation diff commands.
 */
export function registerSimulationDiffCommands(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService
): void {
    // Command: Show diff between two selected simulations
    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.showSimulationDiff', async () => {
            await showSimulationDiff(context, historyService);
        })
    );

    // Command: Compare with previous simulation
    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.compareWithPrevious', async () => {
            await compareWithPrevious(context, historyService);
        })
    );

    // Command: Compare two specific simulation IDs
    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.compareTwoSimulations', async (fromId?: string, toId?: string) => {
            await compareTwoSimulations(context, historyService, fromId, toId);
        })
    );

    // Command: Compare latest with any simulation
    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.compareLatestWithAny', async () => {
            await compareLatestWithAny(context, historyService);
        })
    );
}

/**
 * Show diff between two selected simulations (interactive selection).
 */
async function showSimulationDiff(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService
): Promise<void> {
    try {
        const allEntries = historyService.getAllEntries();

        if (allEntries.length < 2) {
            vscode.window.showInformationMessage(
                'Stellar Suite: Need at least 2 simulations in history to compare.'
            );
            return;
        }

        // First selection: "From" simulation
        const fromItems = allEntries.map(entry => ({
            label: `${entry.id}`,
            description: `${entry.contractId}::${entry.functionName} - ${entry.outcome}`,
            detail: `${new Date(entry.timestamp).toLocaleString()}`,
            entry,
        }));

        const fromSelection = await vscode.window.showQuickPick(fromItems, {
            placeHolder: 'Select first simulation (from)',
            title: 'Simulation Diff - Select From',
        });

        if (!fromSelection) {
            return;
        }

        // Second selection: "To" simulation
        const toItems = allEntries
            .filter(e => e.id !== fromSelection.entry.id)
            .map(entry => ({
                label: `${entry.id}`,
                description: `${entry.contractId}::${entry.functionName} - ${entry.outcome}`,
                detail: `${new Date(entry.timestamp).toLocaleString()}`,
                entry,
            }));

        const toSelection = await vscode.window.showQuickPick(toItems, {
            placeHolder: 'Select second simulation (to)',
            title: 'Simulation Diff - Select To',
        });

        if (!toSelection) {
            return;
        }

        // Create and show diff panel
        const panel = SimulationDiffPanel.createOrShow(context);
        panel.updateDiff(fromSelection.entry, toSelection.entry);

        vscode.window.showInformationMessage(
            `Stellar Suite: Showing diff from ${fromSelection.entry.id} to ${toSelection.entry.id}`
        );
    } catch (error) {
        vscode.window.showErrorMessage(
            `Stellar Suite: Failed to show diff: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

/**
 * Compare latest simulation with its previous one.
 */
async function compareWithPrevious(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService
): Promise<void> {
    try {
        const allEntries = historyService.getAllEntries();

        if (allEntries.length < 2) {
            vscode.window.showInformationMessage(
                'Stellar Suite: Need at least 2 simulations in history to compare with previous.'
            );
            return;
        }

        // Entries are sorted newest first
        const latest = allEntries[0];
        const previous = allEntries[1];

        // Create and show diff panel
        const panel = SimulationDiffPanel.createOrShow(context);
        panel.updateDiff(previous, latest);

        vscode.window.showInformationMessage(
            `Stellar Suite: Comparing latest simulation with previous`
        );
    } catch (error) {
        vscode.window.showErrorMessage(
            `Stellar Suite: Failed to compare with previous: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

/**
 * Compare two specific simulations by ID.
 */
async function compareTwoSimulations(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService,
    fromId?: string,
    toId?: string
): Promise<void> {
    try {
        let from: SimulationHistoryEntry | undefined;
        let to: SimulationHistoryEntry | undefined;

        // Get "from" simulation
        if (fromId) {
            from = historyService.getEntry(fromId);
            if (!from) {
                vscode.window.showErrorMessage(
                    `Stellar Suite: Simulation not found: ${fromId}`
                );
                return;
            }
        } else {
            const allEntries = historyService.getAllEntries();
            const fromItems = allEntries.map(entry => ({
                label: `${entry.id}`,
                description: `${entry.contractId}::${entry.functionName} - ${entry.outcome}`,
                detail: `${new Date(entry.timestamp).toLocaleString()}`,
                entry,
            }));

            const fromSelection = await vscode.window.showQuickPick(fromItems, {
                placeHolder: 'Select first simulation (from)',
            });

            if (!fromSelection) {
                return;
            }

            from = fromSelection.entry;
        }

        // Get "to" simulation
        if (toId) {
            to = historyService.getEntry(toId);
            if (!to) {
                vscode.window.showErrorMessage(
                    `Stellar Suite: Simulation not found: ${toId}`
                );
                return;
            }
        } else {
            const allEntries = historyService.getAllEntries();
            const toItems = allEntries
                .filter(e => e.id !== from.id)
                .map(entry => ({
                    label: `${entry.id}`,
                    description: `${entry.contractId}::${entry.functionName} - ${entry.outcome}`,
                    detail: `${new Date(entry.timestamp).toLocaleString()}`,
                    entry,
                }));

            const toSelection = await vscode.window.showQuickPick(toItems, {
                placeHolder: 'Select second simulation (to)',
            });

            if (!toSelection) {
                return;
            }

            to = toSelection.entry;
        }

        // Create and show diff panel
        const panel = SimulationDiffPanel.createOrShow(context);
        panel.updateDiff(from, to);

        vscode.window.showInformationMessage(
            `Stellar Suite: Showing diff from ${from.id} to ${to.id}`
        );
    } catch (error) {
        vscode.window.showErrorMessage(
            `Stellar Suite: Failed to compare simulations: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

/**
 * Compare latest simulation with any other simulation.
 */
async function compareLatestWithAny(
    context: vscode.ExtensionContext,
    historyService: SimulationHistoryService
): Promise<void> {
    try {
        const allEntries = historyService.getAllEntries();

        if (allEntries.length < 2) {
            vscode.window.showInformationMessage(
                'Stellar Suite: Need at least 2 simulations in history to compare.'
            );
            return;
        }

        const latest = allEntries[0];

        // Select simulation to compare with
        const compareItems = allEntries
            .slice(1) // Exclude the latest one
            .map(entry => ({
                label: `${entry.id}`,
                description: `${entry.contractId}::${entry.functionName} - ${entry.outcome}`,
                detail: `${new Date(entry.timestamp).toLocaleString()}`,
                entry,
            }));

        const selection = await vscode.window.showQuickPick(compareItems, {
            placeHolder: 'Select simulation to compare with latest',
            title: 'Compare Latest Simulation',
        });

        if (!selection) {
            return;
        }

        // Create and show diff panel
        const panel = SimulationDiffPanel.createOrShow(context);
        panel.updateDiff(selection.entry, latest);

        vscode.window.showInformationMessage(
            `Stellar Suite: Comparing ${selection.entry.id} with latest simulation`
        );
    } catch (error) {
        vscode.window.showErrorMessage(
            `Stellar Suite: Failed to compare with latest: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}
