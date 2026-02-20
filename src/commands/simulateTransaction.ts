import * as vscode from 'vscode';
import { SorobanCliService } from '../services/sorobanCliService';
import { RpcService } from '../services/rpcService';
import { ContractInspector, ContractFunction } from '../services/contractInspector';
import { WorkspaceDetector } from '../utils/workspaceDetector';
import { SimulationPanel } from '../ui/simulationPanel';
import { SidebarViewProvider } from '../ui/sidebarView';
import { parseFunctionArgs } from '../utils/jsonParser';
import { formatError } from '../utils/errorFormatter';
import { resolveCliConfigurationForCommand } from '../services/cliConfigurationVscode';
import { SimulationHistoryService } from '../services/simulationHistoryService';

export async function simulateTransaction(context: vscode.ExtensionContext, sidebarProvider?: SidebarViewProvider, historyService?: SimulationHistoryService) {
    try {
        const resolvedCliConfig = await resolveCliConfigurationForCommand(context);
        if (!resolvedCliConfig.validation.valid) {
            vscode.window.showErrorMessage(
                `CLI configuration is invalid: ${resolvedCliConfig.validation.errors.join(' ')}`
            );
            return;
        }

        const useLocalCli = resolvedCliConfig.configuration.useLocalCli;
        const cliPath = resolvedCliConfig.configuration.cliPath;
        const source = resolvedCliConfig.configuration.source;
        const network = resolvedCliConfig.configuration.network;
        const rpcUrl = resolvedCliConfig.configuration.rpcUrl;
        
        const lastContractId = context.workspaceState.get<string>('lastContractId');

        let defaultContractId = lastContractId || '';
        try {
            if (!defaultContractId) {
                const detectedId = await WorkspaceDetector.findContractId();
                if (detectedId) {
                    defaultContractId = detectedId;
                }
            }
        } catch (error) {
        }

        const contractId = await vscode.window.showInputBox({
            prompt: 'Enter the contract ID (address)',
            placeHolder: defaultContractId || 'e.g., C...',
            value: defaultContractId,
            validateInput: (value: string) => {
                if (!value || value.trim().length === 0) {
                    return 'Contract ID is required';
                }
                // Basic validation for Stellar contract ID format
                if (!value.match(/^C[A-Z0-9]{55}$/)) {
                    return 'Invalid contract ID format (should start with C and be 56 characters)';
                }
                return null;
            }
        });

        if (!contractId) {
            return; // User cancelled
        }

        // Inspect contract to get available functions
        let contractFunctions: ContractFunction[] = [];
        let selectedFunction: ContractFunction | null = null;
        let functionName = '';

        if (useLocalCli) {
            // Try to get contract functions
            const inspector = new ContractInspector(cliPath, source);
            try {
                contractFunctions = await inspector.getContractFunctions(contractId);
            } catch (error) {
                // If inspection fails, continue with manual input
                console.log('Contract inspection failed, using manual input');
            }
        }

        // If we have functions, show a picker
        if (contractFunctions.length > 0) {
            const functionItems = contractFunctions.map(fn => ({
                label: fn.name,
                description: fn.description || '',
                detail: fn.parameters.length > 0 
                    ? `Parameters: ${fn.parameters.map(p => p.name).join(', ')}`
                    : 'No parameters'
            }));

            const selected = await vscode.window.showQuickPick(functionItems, {
                placeHolder: 'Select a function to invoke'
            });

            if (!selected) {
                return; // User cancelled
            }

            selectedFunction = contractFunctions.find(f => f.name === selected.label) || null;
            functionName = selected.label;
        } else {
            // Fallback to manual input
            const input = await vscode.window.showInputBox({
                prompt: 'Enter the function name to call',
                placeHolder: 'e.g., hello',
                validateInput: (value: string) => {
                    if (!value || value.trim().length === 0) {
                        return 'Function name is required';
                    }
                    return null;
                }
            });

            if (!input) {
                return; // User cancelled
            }

            functionName = input;

            // Try to get function help
            if (useLocalCli) {
                const inspector = new ContractInspector(cliPath, source);
                selectedFunction = await inspector.getFunctionHelp(contractId, functionName);
            }
        }

        // Collect function arguments based on parameters
        let args: any[] = [];
        
        if (selectedFunction && selectedFunction.parameters.length > 0) {
            // Build arguments object from parameters
            const argsObj: any = {};
            
            for (const param of selectedFunction.parameters) {
                const paramValue = await vscode.window.showInputBox({
                    prompt: `Enter value for parameter: ${param.name}${param.type ? ` (${param.type})` : ''}${param.required ? '' : ' (optional)'}`,
                    placeHolder: param.description || `Value for ${param.name}`,
                    ignoreFocusOut: !param.required,
                    validateInput: (value: string) => {
                        if (param.required && (!value || value.trim().length === 0)) {
                            return `${param.name} is required`;
                        }
                        return null;
                    }
                });

                if (param.required && paramValue === undefined) {
                    return; // User cancelled required parameter
                }

                if (paramValue !== undefined && paramValue.trim().length > 0) {
                    // Try to parse as JSON, otherwise use as string
                    try {
                        argsObj[param.name] = JSON.parse(paramValue);
                    } catch {
                        argsObj[param.name] = paramValue;
                    }
                }
            }

            // Convert to array format expected by CLI service
            args = [argsObj];
        } else {
            // No parameters or couldn't get function info - use manual input
            const argsInput = await vscode.window.showInputBox({
                prompt: 'Enter function arguments as JSON object (e.g., {"name": "value"})',
                placeHolder: 'e.g., {"name": "world"}',
                value: '{}'
            });

            if (argsInput === undefined) {
                return; // User cancelled
            }

            try {
                const parsed = JSON.parse(argsInput || '{}');
                if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
                    args = [parsed];
                } else {
                    vscode.window.showErrorMessage('Arguments must be a JSON object');
                    return;
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
                return;
            }
        }

        // Create and show the simulation panel
        const panel = SimulationPanel.createOrShow(context);
        panel.updateResults(
            { success: false, error: 'Running simulation...' },
            contractId,
            functionName,
            args
        );

        // Show progress indicator
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Simulating Soroban Transaction',
                cancellable: false
            },
            async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
                progress.report({ increment: 0, message: 'Initializing...' });

                let result;
                const simulationStartTime = Date.now();
                let simulationMethod: 'cli' | 'rpc' = useLocalCli ? 'cli' : 'rpc';

                if (useLocalCli) {
                    // Use local CLI
                    progress.report({ increment: 30, message: 'Using Stellar CLI...' });
                    
                    // Try to find CLI if configured path doesn't work
                    let actualCliPath = cliPath;
                    let cliService = new SorobanCliService(actualCliPath, source);
                    
                    // Check if CLI is available at configured path
                    let cliAvailable = await cliService.isAvailable();
                    
                    // If not available and using default, try to auto-detect
                    if (!cliAvailable && cliPath === 'stellar') {
                        progress.report({ increment: 35, message: 'Auto-detecting Stellar CLI...' });
                        const foundPath = await SorobanCliService.findCliPath();
                        if (foundPath) {
                            actualCliPath = foundPath;
                            cliService = new SorobanCliService(actualCliPath, source);
                            cliAvailable = await cliService.isAvailable();
                        }
                    }
                    
                    if (!cliAvailable) {
                        const foundPath = await SorobanCliService.findCliPath();
                        const suggestion = foundPath 
                            ? `\n\nFound Stellar CLI at: ${foundPath}\nUpdate your stellarSuite.cliPath setting to: "${foundPath}"`
                            : '\n\nCommon locations:\n- ~/.cargo/bin/stellar\n- /usr/local/bin/stellar\n\nOr install Stellar CLI: https://developers.stellar.org/docs/tools/cli';
                        
                        result = {
                            success: false,
                            error: `Stellar CLI not found at "${cliPath}".${suggestion}`
                        };
                    } else {
                        progress.report({ increment: 50, message: 'Executing simulation...' });
                        result = await cliService.simulateTransaction(contractId, functionName, args, network);
                    }
                } else {
                    // Use RPC
                    progress.report({ increment: 30, message: 'Connecting to RPC...' });
                    const rpcService = new RpcService(rpcUrl);
                    
                    progress.report({ increment: 50, message: 'Executing simulation...' });
                    result = await rpcService.simulateTransaction(contractId, functionName, args);
                }

                const durationMs = Date.now() - simulationStartTime;
                progress.report({ increment: 100, message: 'Complete' });

                // Record simulation in history
                if (historyService) {
                    try {
                        await historyService.recordSimulation({
                            contractId,
                            functionName,
                            args,
                            outcome: result.success ? 'success' : 'failure',
                            result: result.result,
                            error: result.error,
                            errorType: result.errorType,
                            resourceUsage: result.resourceUsage,
                            network,
                            source,
                            method: simulationMethod,
                            durationMs,
                        });
                    } catch (historyError) {
                        // History recording should never block the simulation flow
                        console.warn('[Stellar Suite] Failed to record simulation history:', historyError);
                    }
                }

                // Update panel with results
                panel.updateResults(result, contractId, functionName, args);

                // Update sidebar view
                if (sidebarProvider) {
                    sidebarProvider.showSimulationResult(contractId, result);
                }

                // Show notification
                if (result.success) {
                    vscode.window.showInformationMessage('Simulation completed successfully');
                } else {
                    const notificationMessage = result.errorSummary
                        ? `Simulation failed: ${result.errorSummary}`
                        : `Simulation failed: ${result.error}`;
                    vscode.window.showErrorMessage(notificationMessage);
                }
            }
        );
    } catch (error) {
        const formatted = formatError(error, 'Simulation');
        vscode.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
    }
}
