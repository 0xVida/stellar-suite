let vscode: any;
try {
    vscode = require('vscode');
} catch (e) {
    // Fallback for native Node.js unit tests where 'vscode' is not available
    vscode = {
        window: {
            showWarningMessage: async () => '',
            showInformationMessage: () => { },
            showErrorMessage: () => { }
        }
    };
}
import { CliTimeoutService } from '../services/cliTimeoutService';

export class TimeoutIndicators {
    static async showWarning(service: CliTimeoutService, remainingMs: number): Promise<void> {
        const remainingSec = Math.round(remainingMs / 1000);
        const action = await vscode.window.showWarningMessage(
            `CLI operation is taking longer than expected. Timeout in ${remainingSec}s.`,
            'Extend Timeout',
            'Cancel Operation'
        );

        if (action === 'Extend Timeout') {
            // Extend by 30 seconds
            service.extend(30000);
            vscode.window.showInformationMessage('Timeout extended by 30 seconds.');
        } else if (action === 'Cancel Operation') {
            service.cancel();
            vscode.window.showInformationMessage('Operation cancelled.');
        }
    }

    static showCancellationPrompt(): void {
        vscode.window.showInformationMessage('Operation cancelled cleanly by user.');
    }

    static showTimeoutMessage(): void {
        vscode.window.showErrorMessage('CLI operation timed out.');
    }
}
