import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class WasmDetector {
    static async findWasmFiles(): Promise<string[]> {
        const wasmFiles: string[] = [];
        
        if (!vscode.workspace.workspaceFolders) {
            return wasmFiles;
        }

        const patterns = [
            '**/*.wasm',
            '**/target/**/*.wasm'
        ];

        for (const folder of vscode.workspace.workspaceFolders) {
            for (const pattern of patterns) {
                const files = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(folder, pattern),
                    '**/node_modules/**',
                    50
                );
                wasmFiles.push(...files.map((f: { fsPath: string }) => f.fsPath));
            }
        }

        return wasmFiles.filter(file => {
            const dir = path.dirname(file);
            return dir.includes('target') || dir.includes('wasm32');
        });
    }

    static async findLatestWasm(): Promise<string | null> {
        const wasmFiles = await this.findWasmFiles();
        
        if (wasmFiles.length === 0) {
            return null;
        }

        const withStats = wasmFiles.map(file => ({
            path: file,
            mtime: fs.statSync(file).mtime.getTime()
        })).sort((a, b) => b.mtime - a.mtime);

        return withStats[0].path;
    }

    static async findContractDirectories(): Promise<string[]> {
        const contractDirs: string[] = [];
        
        if (!vscode.workspace.workspaceFolders) {
            return contractDirs;
        }

        const patterns = [
            '**/Cargo.toml'
        ];

        for (const folder of vscode.workspace.workspaceFolders) {
            for (const pattern of patterns) {
                const files = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(folder, pattern),
                    '**/node_modules/**',
                    20
                );
                
                for (const file of files) {
                    const dir = path.dirname(file.fsPath);
                    const libRs = path.join(dir, 'src', 'lib.rs');
                    if (fs.existsSync(libRs)) {
                        contractDirs.push(dir);
                    }
                }
            }
        }

        return contractDirs;
    }

    static getActiveContractDirectory(): string | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }

        const filePath = editor.document.fileName;
        let currentDir = path.dirname(filePath);

        for (let i = 0; i < 10; i++) {
            const cargoToml = path.join(currentDir, 'Cargo.toml');
            if (fs.existsSync(cargoToml)) {
                return currentDir;
            }
            const parent = path.dirname(currentDir);
            if (parent === currentDir) {
                break;
            }
            currentDir = parent;
        }

        return null;
    }

    static getExpectedWasmPath(contractDir: string): string | null {
        const commonPaths = [
            path.join(contractDir, 'target', 'wasm32v1-none', 'release', '*.wasm'),
            path.join(contractDir, 'target', 'wasm32-unknown-unknown', 'release', '*.wasm')
        ];

        for (const pattern of commonPaths) {
            const dir = path.dirname(pattern);
            if (fs.existsSync(dir)) {
                        const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.wasm'));
                        if (files.length > 0) {
                            const contractName = path.basename(contractDir).replace(/-/g, '_');
                            const wasmFile = files.find((f: string) => f.includes(contractName)) || files[0];
                            return path.join(dir, wasmFile);
                        }
                    }
                }

        return null;
    }
}
