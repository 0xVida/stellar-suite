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
import { SimulationValidationService } from '../services/simulationValidationService';

export async function simulateTransaction(
    context: vscode.ExtensionContext,
    sidebarProvider?: SidebarViewProvider
) {
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
        } catch {
            // Ignore detection errors
        }

        const contractId = await vscode.window.showInputBox({
            prompt: 'Enter contract ID',
            value: defaultContractId
        });

        if (!contractId) {
            return;
        }

        await context.workspaceState.update('lastContractId', contractId);

        const inspector = new ContractInspector(cliPath, source, network);
        const contractFunctions: ContractFunction[] =
            await inspector.getContractFunctions(contractId);

        if (!contractFunctions || contractFunctions.length === 0) {
            vscode.window.showErrorMessage('No contract functions found.');
            return;
        }

        const functionName = await vscode.window.showQuickPick(
            contractFunctions.map(fn => fn.name),
            { placeHolder: 'Select function to simulate' }
        );

        if (!functionName) {
            return;
        }

        const selectedFunction = contractFunctions.find(fn => fn.name === functionName) || null;

        let args: any[] = [];

        if (selectedFunction?.parameters && selectedFunction.parameters.length > 0) {
            const argsInput = await vscode.window.showInputBox({
                prompt: 'Enter function arguments as JSON object (e.g., {"name": "value"})',
                placeHolder: 'e.g., {"name": "world"}',
                value: '{}'
            });

            if (argsInput === undefined) {
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
                vscode.window.showErrorMessage(
                    `Invalid JSON: ${
                        error instanceof Error ? error.message : 'Unknown error'
                    }`
                );
                return;
            }
        }

        const validationService = new SimulationValidationService();
        const validationReport = validationService.validateSimulation(
            contractId,
            functionName,
            args,
            selectedFunction,
            contractFunctions
        );

        const validationWarnings = [
            ...validationReport.warnings,
            ...validationReport.predictedErrors
                .filter(prediction => prediction.severity === 'warning')
                .map(prediction => `${prediction.code}: ${prediction.message}`)
        ];

        if (!validationReport.valid) {
            const validationErrorMessage = [
                ...validationReport.errors,
                ...(validationReport.suggestions.length > 0
                    ? ['Suggestions:', ...validationReport.suggestions.map(s => `- ${s}`)]
                    : [])
            ].join('\n');

            const panel = SimulationPanel.createOrShow(context);
            panel.updateResults(
                {
                    success: false,
                    error: `Simulation validation failed before execution.\n\n${validationErrorMessage}`,
                    errorSummary: validationReport.errors[0],
                    errorSuggestions: validationReport.suggestions,
                    validationWarnings
                },
                contractId,
                functionName,
                args
            );

            vscode.window.showErrorMessage(
                `Simulation validation failed: ${validationReport.errors[0]}`
            );
            return;
        }

        if (validationWarnings.length > 0) {
            const firstWarning = validationWarnings[0];
            const selection = await vscode.window.showWarningMessage(
                `Simulation pre-check warning: ${firstWarning}`,
                'Continue',
                'Cancel'
            );

            if (selection !== 'Continue') {
                vscode.window.showInformationMessage(
                    'Simulation cancelled due to validation warning.'
                );
                return;
            }
        }

        const panel = SimulationPanel.createOrShow(context);
        panel.updateResults(
            { success: false, error: 'Running simulation...', validationWarnings },
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
            async progress => {
                progress.report({ increment: 0, message: 'Initializing...' });

                let result;
                const simulationStartTime = Date.now();
                let simulationMethod: 'cli' | 'rpc' = useLocalCli ? 'cli' : 'rpc';

                if (useLocalCli) {
                    progress.report({ increment: 30, message: 'Using Stellar CLI...' });

                    let actualCliPath = cliPath;
                    let cliService = new SorobanCliService(actualCliPath, source);

                    try {
                        progress.report({ increment: 50, message: 'Executing simulation...' });
                        result = await cliService.simulateTransaction(
                            contractId,
                            functionName,
                            args,
                            network
                        );
                    } catch (cliError) {
                        const foundPath = await SorobanCliService.findCliPath();
                        const suggestion = foundPath
                            ? `\n\nFound Stellar CLI at: ${foundPath}\nUpdate your stellarSuite.cliPath setting to: "${foundPath}"`
                            : '\n\nCommon locations:\n- ~/.cargo/bin/stellar\n- /usr/local/bin/stellar\n\nOr install Stellar CLI: https://developers.stellar.org/docs/tools/cli';

                        result = {
                            success: false,
                            error: `Stellar CLI not found at "${cliPath}".${suggestion}`
                        };
                    }
                } else {
                    progress.report({ increment: 30, message: 'Connecting to RPC...' });
                    const rpcService = new RpcService(rpcUrl);

                    progress.report({ increment: 50, message: 'Executing simulation...' });
                    result = await rpcService.simulateTransaction(
                        contractId,
                        functionName,
                        args
                    );
                }

                const durationMs = Date.now() - simulationStartTime;
                progress.report({ increment: 100, message: 'Complete' });

                panel.updateResults(
                    { ...result, validationWarnings },
                    contractId,
                    functionName,
                    args
                );
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

                if (sidebarProvider) {
                    sidebarProvider.showSimulationResult(contractId, result);
                }

                if (result.success) {
                    vscode.window.showInformationMessage(
                        'Simulation completed successfully'
                    );
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