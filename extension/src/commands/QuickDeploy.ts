import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execAsync } from '../services/sorobanCliService';
import { getSharedOutputChannel } from '../utils/outputChannel';

const NETWORKS = ['testnet', 'futurenet', 'mainnet'] as const;
type Network = (typeof NETWORKS)[number];

/**
 * QuickDeployCommand — one-click build + deploy for Soroban contracts.
 *
 * Flow:
 *   1. User selects a network from a quick-pick.
 *   2. Build: `cargo build --target wasm32-unknown-unknown --release`
 *   3. Locate the compiled .wasm artifact.
 *   4. Deploy: `stellar contract deploy --wasm <path> --network <net> --source <identity>`
 *   5. Show the resulting Contract ID in a notification + output channel.
 *
 * Progress is reported in both the notification progress bar and the VS Code
 * status bar so the user always has feedback.
 */
export class QuickDeployCommand {
    public static async register(context: vscode.ExtensionContext): Promise<void> {
        const disposable = vscode.commands.registerCommand(
            'stellar.quickDeploy',
            () => QuickDeployCommand.execute()
        );
        context.subscriptions.push(disposable);
    }

    public static async execute(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage(
                'No workspace open. Please open a Soroban project to deploy.'
            );
            return;
        }

        // If there are multiple workspace folders, let the user pick one.
        let projectPath: string;
        if (workspaceFolders.length === 1) {
            projectPath = workspaceFolders[0].uri.fsPath;
        } else {
            const picked = await vscode.window.showQuickPick(
                workspaceFolders.map((f) => ({ label: f.name, description: f.uri.fsPath, fsPath: f.uri.fsPath })),
                { placeHolder: 'Select the Soroban project folder to deploy' }
            );
            if (!picked) { return; }
            projectPath = picked.fsPath;
        }

        // Verify it's actually a Cargo project.
        if (!fs.existsSync(path.join(projectPath, 'Cargo.toml'))) {
            vscode.window.showErrorMessage(
                `No Cargo.toml found in ${projectPath}. Please open a Soroban (Rust) project.`
            );
            return;
        }

        const selectedNetwork = await vscode.window.showQuickPick([...NETWORKS], {
            placeHolder: 'Select Stellar network to deploy the contract to',
        }) as Network | undefined;

        if (!selectedNetwork) { return; }

        const config = vscode.workspace.getConfiguration('stellarSuite');
        const cliPath = config.get<string>('cliPath', 'stellar');
        const sourceIdentity = config.get<string>('source', 'dev');

        const outputChannel = getSharedOutputChannel();
        outputChannel.show(true);
        outputChannel.appendLine(`\n[Quick-Deploy] Starting deploy to ${selectedNetwork}…`);
        outputChannel.appendLine(`[Quick-Deploy] Project: ${projectPath}`);

        // Status bar item for persistent in-progress feedback.
        const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusItem.text = '$(sync~spin) Soroban: building…';
        statusItem.tooltip = 'Soroban Quick-Deploy in progress';
        statusItem.show();

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Soroban Quick-Deploy',
                cancellable: false,
            },
            async (progress) => {
                try {
                    // ── Step 1: Build ──────────────────────────────────────────
                    progress.report({ message: 'Building contract (cargo build)…', increment: 10 });
                    outputChannel.appendLine('[Quick-Deploy] Running: cargo build --target wasm32-unknown-unknown --release');

                    try {
                        const { stdout: buildOut, stderr: buildErr } = await execAsync(
                            'cargo build --target wasm32-unknown-unknown --release',
                            { cwd: projectPath }
                        );
                        if (buildOut) { outputChannel.appendLine(buildOut); }
                        if (buildErr) { outputChannel.appendLine(buildErr); }
                    } catch (buildError: any) {
                        const msg = buildError?.message ?? String(buildError);
                        outputChannel.appendLine(`[Quick-Deploy] Build error: ${msg}`);
                        throw new Error(`Build failed: ${msg}`);
                    }

                    progress.report({ message: 'Build complete. Locating WASM artifact…', increment: 30 });

                    // ── Step 2: Locate the WASM file ───────────────────────────
                    const wasmDir = path.join(projectPath, 'target', 'wasm32-unknown-unknown', 'release');
                    let wasmFile: string | undefined;

                    if (fs.existsSync(wasmDir)) {
                        const candidates = fs
                            .readdirSync(wasmDir)
                            .filter((f) => f.endsWith('.wasm') && !f.endsWith('.d.wasm'));

                        if (candidates.length === 1) {
                            wasmFile = path.join(wasmDir, candidates[0]);
                        } else if (candidates.length > 1) {
                            // Let the user pick if multiple artifacts were found.
                            const choice = await vscode.window.showQuickPick(
                                candidates.map((c) => ({ label: c, description: path.join(wasmDir, c) })),
                                { placeHolder: 'Multiple WASM files found – select the one to deploy' }
                            );
                            if (!choice) { return; }
                            wasmFile = choice.description;
                        }
                    }

                    if (!wasmFile) {
                        throw new Error(
                            'No WASM artifact found after build. ' +
                            'Ensure your Cargo.toml has [lib] crate-type = ["cdylib"].'
                        );
                    }

                    outputChannel.appendLine(`[Quick-Deploy] WASM artifact: ${wasmFile}`);

                    // ── Step 3: Deploy ─────────────────────────────────────────
                    progress.report({ message: `Deploying to ${selectedNetwork}…`, increment: 40 });
                    const deployCmd =
                        `${cliPath} contract deploy` +
                        ` --wasm "${wasmFile}"` +
                        ` --network ${selectedNetwork}` +
                        ` --source ${sourceIdentity}`;

                    outputChannel.appendLine(`[Quick-Deploy] Running: ${deployCmd}`);
                    statusItem.text = `$(sync~spin) Soroban: deploying to ${selectedNetwork}…`;

                    let contractId: string;
                    try {
                        const { stdout: deployOut, stderr: deployErr } = await execAsync(
                            deployCmd,
                            { cwd: projectPath }
                        );
                        if (deployErr) { outputChannel.appendLine(deployErr); }

                        // The CLI outputs the contract ID on the last non-empty line.
                        const lines = deployOut.trim().split('\n').filter((l) => l.trim());
                        contractId = lines[lines.length - 1]?.trim() ?? '';

                        outputChannel.appendLine(deployOut);
                    } catch (deployError: any) {
                        const msg = deployError?.message ?? String(deployError);
                        outputChannel.appendLine(`[Quick-Deploy] Deploy error: ${msg}`);
                        throw new Error(`Deploy failed: ${msg}`);
                    }

                    // ── Step 4: Report success ─────────────────────────────────
                    progress.report({ message: 'Deployment complete!', increment: 20 });
                    statusItem.text = `$(check) Deployed to ${selectedNetwork}`;

                    outputChannel.appendLine(`\n[Quick-Deploy] SUCCESS — Contract ID: ${contractId}`);

                    const action = await vscode.window.showInformationMessage(
                        `Contract deployed to ${selectedNetwork}!\nContract ID: ${contractId}`,
                        'Copy ID',
                        'Show Output'
                    );

                    if (action === 'Copy ID') {
                        await vscode.env.clipboard.writeText(contractId);
                        vscode.window.showInformationMessage('Contract ID copied to clipboard.');
                    } else if (action === 'Show Output') {
                        outputChannel.show(true);
                    }
                } catch (error: any) {
                    const msg = error?.message ?? String(error);
                    statusItem.text = '$(error) Deploy failed';
                    outputChannel.appendLine(`\n[Quick-Deploy] FAILED: ${msg}`);
                    vscode.window.showErrorMessage(`Quick-Deploy failed: ${msg}`, 'Show Output').then((sel) => {
                        if (sel === 'Show Output') { outputChannel.show(true); }
                    });
                } finally {
                    // Remove the status bar item after 5 seconds.
                    setTimeout(() => statusItem.dispose(), 5000);
                }
            }
        );
    }
}
