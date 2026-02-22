import * as vscode from 'vscode';
import { CliHistoryService, CliHistoryEntry } from '../services/cliHistoryService';
import { CliReplayService, CliExecutor } from '../services/cliReplayService';
import { SorobanCliService } from '../services/sorobanCliService';
import { resolveCliConfigurationForCommand } from '../services/cliConfigurationVscode';
import { SidebarViewProvider } from '../ui/sidebarView';

/**
 * Register CLI history commands.
 */
export function registerCliHistoryCommands(
    context: vscode.ExtensionContext,
    historyService: CliHistoryService,
    replayService: CliReplayService,
    sidebarProvider?: SidebarViewProvider
): void {
    const commands = [
        vscode.commands.registerCommand('stellarSuite.replayCliCommand',
            (id?: string) => replayCliCommand(context, historyService, replayService, id, sidebarProvider)),
        vscode.commands.registerCommand('stellarSuite.modifyAndReplayCliCommand',
            (id?: string) => modifyAndReplayCliCommand(context, historyService, replayService, id, sidebarProvider)),
        vscode.commands.registerCommand('stellarSuite.clearCliHistory',
            () => clearCliHistory(historyService, sidebarProvider)),
        vscode.commands.registerCommand('stellarSuite.exportCliHistory',
            () => exportCliHistory(historyService)),
        vscode.commands.registerCommand('stellarSuite.deleteCliHistoryEntry',
            (id: string) => deleteCliHistoryEntry(historyService, id, sidebarProvider)),
    ];

    context.subscriptions.push(...commands);
}

async function replayCliCommand(
    context: vscode.ExtensionContext,
    historyService: CliHistoryService,
    replayService: CliReplayService,
    entryId?: string,
    sidebarProvider?: SidebarViewProvider
): Promise<void> {
    const id = entryId || await pickHistoryEntry(historyService);
    if (!id) return;

    const executor = await createCliExecutor(context);
    if (!executor) return;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Replaying CLI command...' },
        async () => {
            try {
                await replayService.replayCommand(id, executor, { source: 'replay' } as any);
                vscode.window.showInformationMessage('Command replayed.');
                sidebarProvider?.refresh();
            } catch (err) {
                vscode.window.showErrorMessage(`Replay failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    );
}

async function modifyAndReplayCliCommand(
    context: vscode.ExtensionContext,
    historyService: CliHistoryService,
    replayService: CliReplayService,
    entryId?: string,
    sidebarProvider?: SidebarViewProvider
): Promise<void> {
    const id = entryId || await pickHistoryEntry(historyService);
    if (!id) return;

    const entry = historyService.getEntry(id);
    if (!entry) return;

    const modifiedArgs = await vscode.window.showInputBox({
        prompt: 'Edit arguments',
        value: entry.args.join(' '),
        title: 'Modify & Replay'
    });

    if (modifiedArgs === undefined) return;

    const executor = await createCliExecutor(context);
    if (!executor) return;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Executing modified command...' },
        async () => {
            try {
                const args = modifiedArgs.split(/\s+/).filter(Boolean);
                await replayService.replayCommand(id, executor, { args });
                vscode.window.showInformationMessage('Modified command executed.');
                sidebarProvider?.refresh();
            } catch (err) {
                vscode.window.showErrorMessage(`Replay failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    );
}

async function clearCliHistory(historyService: CliHistoryService, sidebarProvider?: SidebarViewProvider) {
    const selection = await vscode.window.showWarningMessage('Clear all CLI history?', { modal: true }, 'Clear');
    if (selection === 'Clear') {
        await historyService.clearHistory();
        sidebarProvider?.refresh();
    }
}

async function exportCliHistory(historyService: CliHistoryService) {
    const json = historyService.exportHistory();
    const doc = await vscode.workspace.openTextDocument({ content: json, language: 'json' });
    await vscode.window.showTextDocument(doc);
}

async function deleteCliHistoryEntry(historyService: CliHistoryService, id: string, sidebarProvider?: SidebarViewProvider) {
    if (await historyService.deleteEntry(id)) {
        sidebarProvider?.refresh();
    }
}

async function pickHistoryEntry(historyService: CliHistoryService): Promise<string | undefined> {
    const entries = historyService.queryHistory();
    if (entries.length === 0) {
        vscode.window.showInformationMessage('No history records.');
        return;
    }

    const items = entries.map(e => ({
        label: `${e.command} ${e.args.slice(0, 3).join(' ')}`,
        description: `${new Date(e.timestamp).toLocaleTimeString()}`,
        id: e.id
    }));

    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Pick a command to replay' });
    return picked?.id;
}

async function createCliExecutor(context: vscode.ExtensionContext): Promise<CliExecutor | undefined> {
    const config = await resolveCliConfigurationForCommand(context);
    if (!config.validation.valid) {
        vscode.window.showErrorMessage(`Config error: ${config.validation.errors.join(', ')}`);
        return;
    }

    return async (command, args, cwd) => {
        const start = Date.now();
        const { execFile } = require('child_process');
        const { promisify } = require('util');
        const execFileAsync = promisify(execFile);

        try {
            const { stdout, stderr } = await execFileAsync(command, args, { cwd });
            return { success: true, stdout, stderr, durationMs: Date.now() - start };
        } catch (err) {
            return {
                success: false,
                exitCode: (err as any).code || 1,
                stdout: (err as any).stdout || '',
                stderr: (err as any).stderr || (err as Error).message,
                durationMs: Date.now() - start
            };
        }
    };
}
