import * as vscode from 'vscode';

export function registerOpenInWebIDECommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('stellarSuite.openInWebIDE', () => {
        // Get the active text editor
        const activeEditor = vscode.window.activeTextEditor;
        let fileParam = '';
        let contentParam = '';

        if (activeEditor) {
            const document = activeEditor.document;
            const fileName = document.fileName.split('/').pop() || 'untitled.rs';
            const content = document.getText();
            
            // Encode the file details for the web IDE URL
            fileParam = encodeURIComponent(fileName);
            contentParam = encodeURIComponent(content);
        }

        // Deep linking URL for the Stellar Web IDE
        // Construct the URL with parameters if available
        const baseUrl = 'https://ide.stellar.org';
        let webIdeUrl = baseUrl;
        
        if (fileParam && contentParam) {
            webIdeUrl = `${baseUrl}?file=${fileParam}&content=${contentParam}`;
        }

        // Open the URL in the default browser
        vscode.env.openExternal(vscode.Uri.parse(webIdeUrl));
        vscode.window.showInformationMessage('Opening Stellar Web IDE...');
    });

    context.subscriptions.push(disposable);
}
