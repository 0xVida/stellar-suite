import * as vscode from 'vscode';

let sharedOutputChannel: vscode.OutputChannel | undefined;

/**
 * Gets or creates the shared "Stellar Suite" output channel.
 * This ensures all commands use the same channel instance, preventing switching.
 */
export function getSharedOutputChannel(): vscode.OutputChannel {
    if (!sharedOutputChannel) {
        sharedOutputChannel = vscode.window.createOutputChannel('Stellar Suite');
    }
    return sharedOutputChannel;
}

/**
 * Shows the shared output channel.
 */
export function showSharedOutputChannel(): void {
    const channel = getSharedOutputChannel();
    channel.show(true);
}
