import * as vscode from 'vscode';
import { SorobanCliService } from '../services/sorobanCliService';
import { RpcService } from '../services/rpcService';
import { ContractInspector, ContractFunction } from '../services/contractInspector';
import { WorkspaceDetector } from '../utils/workspaceDetector';
import { SimulationPanel } from '../ui/simulationPanel';
import { SidebarViewProvider } from '../ui/sidebarView';
import { getFormValidationService } from '../services/formValidationService';
import { formatError } from '../utils/errorFormatter';

export async function simulateTransaction(context: vscode.ExtensionContext, sidebarProvider?: SidebarViewProvider) {
    try {
        const config = vscode.workspace.getConfiguration('stellarSuite');
        const useLocalCli = config.get<boolean>('useLocalCli', true);
        const cliPath = config.get<string>('cliPath', 'stellar');
        const source = config.get<string>('source', 'dev');
        const network = config.get<string>('network', 'testnet') || 'testnet';
        const rpcUrl = config.get<string>('rpcUrl', 'https://soroban-testnet.stellar.org:443');
        
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

        const formValidation = getFormValidationService();

        const contractId = await vscode.window.showInputBox({
            prompt: 'Enter the contract ID (address)',
            placeHolder: defaultContractId || 'e.g., C...',
            value: defaultContractId,
            validateInput: formValidation.getContractIdValidator()
        });

        if (!contractId) {
            return;
        }

        let contractFunctions: ContractFunction[] = [];
        let selectedFunction: ContractFunction | null = null;
        let functionName = '';

        if (useLocalCli) {
            const inspector = new ContractInspector(cliPath, source);
            try {
                contractFunctions = await inspector.getContractFunctions(contractId);
            } catch (error) {
            }
        }

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
                return;
            }

            selectedFunction = contractFunctions.find(f => f.name === selected.label) || null;
            functionName = selected.label;
        } else {
            const input = await vscode.window.showInputBox({
                prompt: 'Enter the function name to call',
                placeHolder: 'e.g., hello',
                validateInput: formValidation.getFunctionNameValidator()
            });

            if (!input) {
                return;
            }

            functionName = input;

            if (useLocalCli) {
                const inspector = new ContractInspector(cliPath, source);
                selectedFunction = await inspector.getFunctionHelp(contractId, functionName);
            }
        }

        let args: any[] = [];
        
        if (selectedFunction && selectedFunction.parameters.length > 0) {
            const argsObj: any = {};
            
            for (const param of selectedFunction.parameters) {
                const paramValue = await vscode.window.showInputBox({
                    prompt: `Enter value for parameter: ${param.name}${param.type ? ` (${param.type})` : ''}${param.required ? '' : ' (optional)'}`,
                    placeHolder: param.description || `Value for ${param.name}`,
                    ignoreFocusOut: !param.required,
                    validateInput: formValidation.getParameterValidator(param)
                });

                if (param.required && paramValue === undefined) {
                    return;
                }

                if (paramValue !== undefined && paramValue.trim().length > 0) {
                    try {
                        argsObj[param.name] = JSON.parse(paramValue);
                    } catch {
                        argsObj[param.name] = paramValue;
                    }
                }
            }

            args = [argsObj];
        } else {
            const argsInput = await vscode.window.showInputBox({
                prompt: 'Enter function arguments as JSON object (e.g., {"name": "value"})',
                placeHolder: 'e.g., {"name": "world"}',
                value: '{}',
                validateInput: formValidation.getJsonArgsValidator()
            });

            if (argsInput === undefined) {
                return;
            }

            const jsonValidation = formValidation.validateJsonArgs(argsInput || '{}');
            if (!jsonValidation.valid) {
                vscode.window.showErrorMessage(jsonValidation.errors[0]?.message ?? 'Invalid arguments');
                return;
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

        const panel = SimulationPanel.createOrShow(context);
        panel.updateResults(
            { success: false, error: 'Running simulation...' },
            contractId,
            functionName,
            args
        );

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Simulating Soroban Transaction',
                cancellable: false
            },
            async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
                progress.report({ increment: 0, message: 'Initializing...' });

                let result;

                if (useLocalCli) {
                    progress.report({ increment: 30, message: 'Using Stellar CLI...' });
                    
                    let actualCliPath = cliPath;
                    let cliService = new SorobanCliService(actualCliPath, source);
                    
                    let cliAvailable = await cliService.isAvailable();
                    
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
                        
                        if (sidebarProvider) {
                            const argsStr = args.length > 0 ? JSON.stringify(args) : '';
                            sidebarProvider.addCliHistoryEntry('stellar contract invoke', ['--id', contractId, '--source', source, '--network', network, '--', functionName, argsStr].filter(Boolean));
                        }
                    }
                } else {
                    progress.report({ increment: 30, message: 'Connecting to RPC...' });
                    const rpcService = new RpcService(rpcUrl);
                    
                    progress.report({ increment: 50, message: 'Executing simulation...' });
                    result = await rpcService.simulateTransaction(contractId, functionName, args);
                    
                    if (sidebarProvider) {
                        const argsStr = args.length > 0 ? JSON.stringify(args[0]) : '';
                        sidebarProvider.addCliHistoryEntry('RPC simulateTransaction', [contractId, functionName, argsStr].filter(Boolean));
                    }
                }

                progress.report({ increment: 100, message: 'Complete' });

                panel.updateResults(result, contractId, functionName, args);

                if (sidebarProvider) {
                    sidebarProvider.showSimulationResult(contractId, result);
                }

                if (result.success) {
                    vscode.window.showInformationMessage('Simulation completed successfully');
                } else {
                    vscode.window.showErrorMessage(`Simulation failed: ${result.error}`);
                }
            }
        );
    } catch (error) {
        const formatted = formatError(error, 'Simulation');
        vscode.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
    }
}
