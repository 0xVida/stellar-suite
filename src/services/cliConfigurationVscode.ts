import * as vscode from 'vscode';
import {
    CliConfiguration,
    CliConfigurationService,
    CliConfigurationStore,
    DEFAULT_CLI_CONFIGURATION,
    ResolvedCliConfiguration,
    RpcEndpoint,
} from './cliConfigurationService';

class WorkspaceStateCliConfigurationStore implements CliConfigurationStore {
    constructor(private readonly state: vscode.Memento) { }

    get<T>(key: string, defaultValue: T): T {
        return this.state.get<T>(key, defaultValue);
    }

    update<T>(key: string, value: T): PromiseLike<void> {
        return this.state.update(key, value);
    }
}

export function readWorkspaceCliConfiguration(): CliConfiguration {
    const config = vscode.workspace.getConfiguration('stellarSuite');
    return {
        cliPath: config.get<string>('cliPath', DEFAULT_CLI_CONFIGURATION.cliPath),
        source: config.get<string>('source', DEFAULT_CLI_CONFIGURATION.source),
        network: config.get<string>('network', DEFAULT_CLI_CONFIGURATION.network) || DEFAULT_CLI_CONFIGURATION.network,
        rpcUrl: config.get<string>('rpcUrl', DEFAULT_CLI_CONFIGURATION.rpcUrl),
        rpcEndpoints: config.get<any[]>('rpcEndpoints', DEFAULT_CLI_CONFIGURATION.rpcEndpoints) || DEFAULT_CLI_CONFIGURATION.rpcEndpoints,
        automaticFailover: config.get<boolean>('automaticFailover', DEFAULT_CLI_CONFIGURATION.automaticFailover) ?? DEFAULT_CLI_CONFIGURATION.automaticFailover,
        useLocalCli: config.get<boolean>('useLocalCli', DEFAULT_CLI_CONFIGURATION.useLocalCli),
    };
}

export async function writeWorkspaceCliConfiguration(
    configuration: CliConfiguration,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace,
): Promise<void> {
    const config = vscode.workspace.getConfiguration('stellarSuite');
    await config.update('cliPath', configuration.cliPath, target);
    await config.update('source', configuration.source, target);
    await config.update('network', configuration.network, target);
    await config.update('rpcUrl', configuration.rpcUrl, target);
    await config.update('rpcEndpoints', configuration.rpcEndpoints, target);
    await config.update('automaticFailover', configuration.automaticFailover, target);
    await config.update('useLocalCli', configuration.useLocalCli, target);
    await config.update('rpcEndpoints', configuration.rpcEndpoints, target);
    await config.update('automaticFailover', configuration.automaticFailover, target);
}

export function createCliConfigurationService(context: vscode.ExtensionContext): CliConfigurationService {
    return new CliConfigurationService(
        new WorkspaceStateCliConfigurationStore(context.workspaceState),
        readWorkspaceCliConfiguration,
    );
}

export async function resolveCliConfigurationForCommand(
    context: vscode.ExtensionContext,
): Promise<ResolvedCliConfiguration> {
    const service = createCliConfigurationService(context);
    return service.getResolvedConfiguration();
}
