// ============================================================
// src/commands/abiCommands.ts
// VS Code commands for ABI generation, export, import, and
// inspection.
// ============================================================

import * as vscode from 'vscode';
import { ContractAbiService } from '../services/contractAbiService';
import { ContractInspector } from '../services/contractInspector';

/**
 * Register all ABI-related commands with the VS Code extension context.
 */
export function registerAbiCommands(
    context: vscode.ExtensionContext,
    abiService: ContractAbiService,
    outputChannel: vscode.OutputChannel
): void {
    // ── Generate ABI ──────────────────────────────────────────

    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.generateAbi', async () => {
            const contractId = await vscode.window.showInputBox({
                prompt: 'Enter the contract ID to generate ABI for',
                placeHolder: 'CABC…XYZ or contract hash',
            });

            if (!contractId) { return; }

            const config = vscode.workspace.getConfiguration('stellarSuite');
            const cliPath = config.get<string>('cliPath', 'stellar');
            const source = config.get<string>('source', 'dev');
            const network = config.get<string>('network', 'testnet');

            try {
                const inspector = new ContractInspector(cliPath, source, network);
                const functions = await inspector.getContractFunctions(contractId);

                if (functions.length === 0) {
                    vscode.window.showWarningMessage('No functions found for the given contract.');
                    return;
                }

                const abi = abiService.generateAbi(contractId, functions, {
                    network,
                    source,
                });
                await abiService.storeAbi(abi);

                vscode.window.showInformationMessage(
                    `ABI generated and stored for ${contractId} (${functions.length} function(s)).`
                );
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Failed to generate ABI: ${msg}`);
                outputChannel.appendLine(`[ABI] Error generating ABI: ${msg}`);
            }
        })
    );

    // ── Export ABI ─────────────────────────────────────────────

    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.exportAbi', async () => {
            const allAbis = abiService.getAllAbis();
            if (allAbis.length === 0) {
                vscode.window.showInformationMessage('No stored ABIs to export.');
                return;
            }

            const items = allAbis.map(a => ({
                label: a.contractId,
                description: `v${a.version} — ${a.functions.length} fn(s)`,
                contractId: a.contractId,
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select contract ABI to export',
            });

            if (!selected) { return; }

            const json = abiService.exportAbi(selected.contractId);
            if (!json) { return; }

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`${selected.contractId}-abi.json`),
                filters: { 'JSON files': ['json'] },
            });

            if (!uri) { return; }

            await vscode.workspace.fs.writeFile(
                uri,
                Buffer.from(json, 'utf-8')
            );
            vscode.window.showInformationMessage(`ABI exported to ${uri.fsPath}`);
        })
    );

    // ── Import ABI ────────────────────────────────────────────

    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.importAbi', async () => {
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: { 'JSON files': ['json'] },
                openLabel: 'Import ABI',
            });

            if (!uris || uris.length === 0) { return; }

            try {
                const content = await vscode.workspace.fs.readFile(uris[0]);
                const json = Buffer.from(content).toString('utf-8');
                const result = await abiService.importAbi(json);

                if (result.errors.length > 0) {
                    outputChannel.appendLine(`[ABI] Import errors:\n  ${result.errors.join('\n  ')}`);
                }

                const msg = result.imported > 0
                    ? `Imported ${result.imported} ABI(s).`
                    : 'No ABIs were imported.';

                if (result.errors.length > 0) {
                    vscode.window.showWarningMessage(
                        `${msg} ${result.errors.length} error(s) — see output for details.`
                    );
                } else {
                    vscode.window.showInformationMessage(msg);
                }
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Failed to import ABI: ${msg}`);
            }
        })
    );

    // ── Show ABI Details ──────────────────────────────────────

    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.showAbiDetails', async () => {
            const allAbis = abiService.getAllAbis();
            if (allAbis.length === 0) {
                vscode.window.showInformationMessage('No stored ABIs.');
                return;
            }

            const items = allAbis.map(a => ({
                label: a.contractId,
                description: `v${a.version} — ${a.functions.length} fn(s)`,
                contractId: a.contractId,
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select contract ABI to view',
            });

            if (!selected) { return; }

            const abi = abiService.getAbi(selected.contractId);
            if (!abi) { return; }

            outputChannel.clear();
            outputChannel.appendLine(`Contract ABI: ${abi.contractId}`);
            outputChannel.appendLine(`Version: ${abi.version}`);
            outputChannel.appendLine(`Schema: v${abi.schemaVersion}`);
            outputChannel.appendLine(`Generated: ${abi.generatedAt}`);
            if (abi.network) { outputChannel.appendLine(`Network: ${abi.network}`); }
            if (abi.source) { outputChannel.appendLine(`Source: ${abi.source}`); }
            outputChannel.appendLine(`\nFunctions (${abi.functions.length}):`);
            outputChannel.appendLine('─'.repeat(50));

            for (const fn of abi.functions) {
                const params = fn.parameters
                    .map(p => `${p.name}: ${JSON.stringify(p.sorobanType)}`)
                    .join(', ');
                outputChannel.appendLine(`  ${fn.name}(${params})`);
                if (fn.description) {
                    outputChannel.appendLine(`    ↳ ${fn.description}`);
                }
            }

            outputChannel.show(true);
        })
    );
}
