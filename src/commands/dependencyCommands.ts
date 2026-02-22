// ============================================================
// src/commands/dependencyCommands.ts
// Commands for managing contract dependencies
// ============================================================

import * as vscode from 'vscode';
import { ContractMetadataService } from '../services/contractMetadataService';
import { ContractDependencyDetectionService } from '../services/contractDependencyDetectionService';

/**
 * Register all dependency-related commands
 */
export function registerDependencyCommands(
    context: vscode.ExtensionContext,
    metadataService: ContractMetadataService,
    dependencyService: ContractDependencyDetectionService
): void {
    const outputChannel = vscode.window.createOutputChannel('Stellar Suite - Dependencies');

    // Command: Show dependency graph
    const showDependencyGraphCommand = vscode.commands.registerCommand(
        'stellarSuite.showDependencyGraph',
        async () => {
            try {
                outputChannel.show();
                outputChannel.appendLine('[Dependencies] Building dependency graph...');

                const scan = await metadataService.scanWorkspace();
                if (scan.contracts.length === 0) {
                    vscode.window.showInformationMessage('No contracts found in workspace');
                    return;
                }

                const graph = await dependencyService.buildDependencyGraph(scan.contracts, {
                    detectImports: true,
                });

                // Display graph summary
                outputChannel.appendLine('\n═══════════════════════════════════════════════════════════');
                outputChannel.appendLine('DEPENDENCY GRAPH SUMMARY');
                outputChannel.appendLine('═══════════════════════════════════════════════════════════');
                outputChannel.appendLine(`Contracts: ${graph.statistics.totalContracts}`);
                outputChannel.appendLine(`Dependencies: ${graph.statistics.totalDependencies}`);
                outputChannel.appendLine(`External Dependencies: ${graph.statistics.externalDependencies}`);
                outputChannel.appendLine(`Circular Dependencies: ${graph.cycles.length}`);
                outputChannel.appendLine(`Max Depth: ${graph.statistics.maxDepth}`);
                outputChannel.appendLine(`Leaf Contracts: ${graph.statistics.leafContracts}`);
                outputChannel.appendLine(`Root Contracts: ${graph.statistics.rootContracts}`);
                outputChannel.appendLine('═══════════════════════════════════════════════════════════\n');

                // Display nodes
                outputChannel.appendLine('CONTRACTS:\n');
                for (const node of graph.nodes.values()) {
                    outputChannel.appendLine(`  ${node.name}`);
                    outputChannel.appendLine(`    Depth: ${node.depth}`);
                    outputChannel.appendLine(`    Dependencies: ${node.dependencyCount}`);
                    outputChannel.appendLine(`    Dependents: ${node.dependentCount}`);
                    if (node.dependencies.length > 0) {
                        outputChannel.appendLine(`    → Depends on: ${node.dependencies.join(', ')}`);
                    }
                    if (node.dependents.length > 0) {
                        outputChannel.appendLine(`    ← Used by: ${node.dependents.join(', ')}`);
                    }
                    outputChannel.appendLine('');
                }

                // Display deployment order
                if (graph.deploymentOrder.length > 0) {
                    outputChannel.appendLine('\nDEPLOYMENT ORDER:\n');
                    graph.deploymentOrder.forEach((contractPath, index) => {
                        const contract = scan.contracts.find(c => c.cargoTomlPath === contractPath);
                        outputChannel.appendLine(`  ${index + 1}. ${contract?.contractName || contractPath}`);
                    });
                }

                // Display deployment levels (parallel deployment)
                if (graph.deploymentLevels.length > 0) {
                    outputChannel.appendLine('\nPARALLEL DEPLOYMENT LEVELS:\n');
                    graph.deploymentLevels.forEach((level, index) => {
                        const names = level.map(path => {
                            const contract = scan.contracts.find(c => c.cargoTomlPath === path);
                            return contract?.contractName || path;
                        });
                        outputChannel.appendLine(`  Level ${index}: ${names.join(', ')}`);
                    });
                }

                // Display circular dependencies
                if (graph.cycles.length > 0) {
                    outputChannel.appendLine('\n⚠️  CIRCULAR DEPENDENCIES DETECTED:\n');
                    graph.cycles.forEach((cycle, index) => {
                        outputChannel.appendLine(`  ${index + 1}. ${cycle.join(' → ')}`);
                    });
                }

                vscode.window.showInformationMessage(
                    `Dependency graph: ${graph.statistics.totalContracts} contracts, ${graph.statistics.totalDependencies} dependencies`
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(`[Dependencies] Error: ${message}`);
                vscode.window.showErrorMessage(`Failed to build dependency graph: ${message}`);
            }
        }
    );

    // Command: Show contract dependencies
    const showContractDependenciesCommand = vscode.commands.registerCommand(
        'stellarSuite.showContractDependencies',
        async (contractPath?: string) => {
            try {
                // Get contract path from user if not provided
                if (!contractPath) {
                    const scan = await metadataService.scanWorkspace();
                    if (scan.contracts.length === 0) {
                        vscode.window.showInformationMessage('No contracts found in workspace');
                        return;
                    }

                    const selected = await vscode.window.showQuickPick(
                        scan.contracts.map(c => ({
                            label: c.contractName,
                            description: c.cargoTomlPath,
                            contract: c,
                        })),
                        {
                            placeHolder: 'Select a contract to view dependencies',
                        }
                    );

                    if (!selected) {
                        return;
                    }

                    contractPath = selected.contract.cargoTomlPath;
                }

                const scan = await metadataService.scanWorkspace();
                const contract = scan.contracts.find(c => c.cargoTomlPath === contractPath);
                if (!contract) {
                    vscode.window.showWarningMessage('Contract not found');
                    return;
                }

                const graph = await dependencyService.buildDependencyGraph(scan.contracts, {
                    detectImports: true,
                });

                const { direct, transitive } = dependencyService.getContractDependencies(
                    graph,
                    contract.contractName
                );

                outputChannel.show();
                outputChannel.appendLine('\n═══════════════════════════════════════════════════════════');
                outputChannel.appendLine(`DEPENDENCIES FOR: ${contract.contractName}`);
                outputChannel.appendLine('═══════════════════════════════════════════════════════════\n');

                if (direct.length === 0) {
                    outputChannel.appendLine('  No dependencies\n');
                } else {
                    outputChannel.appendLine('DIRECT DEPENDENCIES:\n');
                    direct.forEach(dep => {
                        outputChannel.appendLine(`  • ${dep.name} (depth: ${dep.depth})`);
                    });
                    outputChannel.appendLine('');
                }

                if (transitive.length > 0) {
                    outputChannel.appendLine('TRANSITIVE DEPENDENCIES:\n');
                    transitive.forEach(dep => {
                        outputChannel.appendLine(`  • ${dep.name} (depth: ${dep.depth})`);
                    });
                    outputChannel.appendLine('');
                }

                const { direct: directDependents, transitive: transitiveDependents } = 
                    dependencyService.getContractDependents(graph, contract.contractName);

                if (directDependents.length > 0 || transitiveDependents.length > 0) {
                    outputChannel.appendLine('USED BY:\n');
                    if (directDependents.length > 0) {
                        outputChannel.appendLine('  Direct:');
                        directDependents.forEach(dep => {
                            outputChannel.appendLine(`    • ${dep.name}`);
                        });
                    }
                    if (transitiveDependents.length > 0) {
                        outputChannel.appendLine('  Transitive:');
                        transitiveDependents.forEach(dep => {
                            outputChannel.appendLine(`    • ${dep.name}`);
                        });
                    }
                }

                vscode.window.showInformationMessage(
                    `${contract.contractName}: ${direct.length} direct, ${transitive.length} transitive dependencies`
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(`[Dependencies] Error: ${message}`);
                vscode.window.showErrorMessage(`Failed to show dependencies: ${message}`);
            }
        }
    );

    // Command: Check circular dependencies
    const checkCircularDependenciesCommand = vscode.commands.registerCommand(
        'stellarSuite.checkCircularDependencies',
        async () => {
            try {
                outputChannel.show();
                outputChannel.appendLine('[Dependencies] Checking for circular dependencies...');

                const scan = await metadataService.scanWorkspace();
                if (scan.contracts.length === 0) {
                    vscode.window.showInformationMessage('No contracts found in workspace');
                    return;
                }

                const graph = await dependencyService.buildDependencyGraph(scan.contracts, {
                    detectImports: true,
                });

                if (dependencyService.hasCircularDependencies(graph)) {
                    const details = dependencyService.getCircularDependencyDetails(graph);
                    
                    outputChannel.appendLine('\n⚠️  CIRCULAR DEPENDENCIES DETECTED:\n');
                    details.forEach((detail, index) => {
                        outputChannel.appendLine(`  ${index + 1}. ${detail}`);
                    });
                    outputChannel.appendLine('');

                    vscode.window.showWarningMessage(
                        `Found ${graph.cycles.length} circular ${graph.cycles.length === 1 ? 'dependency' : 'dependencies'}. Check output for details.`,
                        'Show Output'
                    ).then(action => {
                        if (action === 'Show Output') {
                            outputChannel.show();
                        }
                    });
                } else {
                    outputChannel.appendLine('\n✓ No circular dependencies detected\n');
                    vscode.window.showInformationMessage('No circular dependencies found');
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(`[Dependencies] Error: ${message}`);
                vscode.window.showErrorMessage(`Failed to check circular dependencies: ${message}`);
            }
        }
    );

    context.subscriptions.push(
        showDependencyGraphCommand,
        showContractDependenciesCommand,
        checkCircularDependenciesCommand
    );
}
