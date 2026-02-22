import * as vscode from 'vscode';
import { CliVersionService, DEFAULT_CLI_VERSION_CONFIG } from './cliVersionService';
import { CliVersionConfig } from '../types/cliVersion';

/** Read CLI version check settings from the VS Code workspace configuration. */
function readCliVersionConfig(): CliVersionConfig {
    const config = vscode.workspace.getConfiguration('stellarSuite');
    return {
        enabled: config.get<boolean>('cliVersionCheck.enabled', DEFAULT_CLI_VERSION_CONFIG.enabled),
        minimumVersion: config.get<string>('minimumCliVersion', DEFAULT_CLI_VERSION_CONFIG.minimumVersion),
        checkIntervalMinutes: config.get<number>('cliVersionCheck.intervalMinutes', DEFAULT_CLI_VERSION_CONFIG.checkIntervalMinutes),
    };
}

/** Read the configured CLI path from workspace settings. */
function readCliPath(): string {
    return vscode.workspace.getConfiguration('stellarSuite').get<string>('cliPath', 'stellar');
}

/**
 * Create a CliVersionService wired to VS Code settings.
 *
 * - Immediately runs a version check on creation.
 * - Starts periodic re-checks if `intervalMinutes > 0`.
 * - Listens for configuration changes and updates accordingly.
 * - Returns a disposable that cleans up all resources.
 */
export function createCliVersionService(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
): CliVersionService & vscode.Disposable {
    const versionConfig = readCliVersionConfig();
    const cliPath = readCliPath();

    const service = new CliVersionService(
        versionConfig,
        (msg) => outputChannel.appendLine(msg),
    );

    // Wire incompatibility warnings to VS Code warning messages
    service.onWarning((result) => {
        const actions = result.upgradeCommand ? ['Copy Upgrade Command'] : [];
        vscode.window.showWarningMessage(result.message, ...actions).then((action) => {
            if (action === 'Copy Upgrade Command' && result.upgradeCommand) {
                vscode.env.clipboard.writeText(result.upgradeCommand);
                vscode.window.showInformationMessage('Upgrade command copied to clipboard.');
            }
        });
    });

    // Initial check
    service.checkVersion(cliPath).catch((err) => {
        outputChannel.appendLine(`[CliVersion] Initial check failed: ${err}`);
    });

    // Start periodic checking
    service.startPeriodicCheck(cliPath);

    // Listen for config changes
    const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration('stellarSuite')) { return; }

        const newConfig = readCliVersionConfig();
        const newCliPath = readCliPath();
        service.updateConfig(newConfig);

        if (newConfig.enabled) {
            service.clearCache();
            service.checkVersion(newCliPath).catch(() => {});
            service.startPeriodicCheck(newCliPath);
        } else {
            service.stopPeriodicCheck();
        }
    });

    context.subscriptions.push(configListener);

    // Add dispose to the service instance for extension subscriptions
    const originalDispose = service.dispose.bind(service);
    service.dispose = () => {
        configListener.dispose();
        originalDispose();
    };

    return service as CliVersionService & vscode.Disposable;
}
