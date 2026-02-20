import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Utility functions for detecting contracts in the workspace.
 */
export class WorkspaceDetector {
    /**
     * Find contract files in the workspace.
     * Looks for common contract file patterns.
     * 
     * @returns Array of contract file paths
     */
    static async findContractFiles(): Promise<string[]> {
        const contractFiles: string[] = [];
        
        if (!vscode.workspace.workspaceFolders) {
            return contractFiles;
        }

        const patterns = [
            '**/src/lib.rs',
            '**/Cargo.toml',
            '**/*.wasm',
            '**/contracts/**/*.rs',
            '**/soroban/**/*.rs'
        ];

        for (const folder of vscode.workspace.workspaceFolders) {
            for (const pattern of patterns) {
                const files = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(folder, pattern),
                    '**/node_modules/**',
                    10
                );
                contractFiles.push(...files.map((f: { fsPath: string }) => f.fsPath));
            }
        }

        return contractFiles;
    }

    /**
     * Try to extract contract ID from workspace files.
     * Looks in common configuration files and contract files.
     * 
     * @returns Contract ID if found, or null
     */
    static async findContractId(): Promise<string | null> {
        if (!vscode.workspace.workspaceFolders) {
            return null;
        }

        // Look for contract ID in common locations
        const searchPatterns = [
            '**/.env',
            '**/.env.local',
            '**/stellar.toml',
            '**/soroban.toml',
            '**/README.md',
            '**/*.toml',
            '**/*.json'
        ];

        for (const folder of vscode.workspace.workspaceFolders) {
            for (const pattern of searchPatterns) {
                try {
                    const files = await vscode.workspace.findFiles(
                        new vscode.RelativePattern(folder, pattern),
                        '**/node_modules/**',
                        20
                    );

                    for (const file of files) {
                        const content = fs.readFileSync(file.fsPath, 'utf-8');
                        
                        // Look for contract ID pattern (starts with C and is 56 chars)
                        const contractIdMatch = content.match(/C[A-Z0-9]{55}/);
                        if (contractIdMatch) {
                            return contractIdMatch[0];
                        }

                        // Look for CONTRACT_ID= or contract_id = patterns
                        const envMatch = content.match(/(?:CONTRACT_ID|contract_id)\s*[=:]\s*([CA-Z0-9]{56})/i);
                        if (envMatch) {
                            return envMatch[1];
                        }
                    }
                } catch (error) {
                    // Continue searching
                }
            }
        }

        return null;
    }

    /**
     * Get the active editor's file if it looks like a contract file.
     * 
     * @returns Contract file path or null
     */
    static getActiveContractFile(): string | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }

        const filePath = editor.document.fileName;
        const ext = path.extname(filePath);

        // Check if it's a Rust file (common for Soroban contracts)
        if (ext === '.rs' || filePath.includes('contract') || filePath.includes('soroban')) {
            return filePath;
        }

        return null;
    }
}
