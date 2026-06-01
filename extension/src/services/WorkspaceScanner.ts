import * as vscode from 'vscode';
import * as path from 'path';

export interface WorkspaceContractManifest {
    name: string;
    manifestPath: string;
    directory: string;
}

const EXCLUDE_GLOB = '{**/node_modules/**,**/target/**,**/.git/**,**/dist/**,**/out/**}';

export class WorkspaceScanner {
    static async findSorobanManifests(token?: vscode.CancellationToken): Promise<WorkspaceContractManifest[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        const manifests: WorkspaceContractManifest[] = [];
        const seen = new Set<string>();

        for (const folder of vscode.workspace.workspaceFolders) {
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(folder, '**/Cargo.toml'),
                EXCLUDE_GLOB,
                500,
                token
            );

            for (const file of files) {
                if (token?.isCancellationRequested) {
                    return manifests;
                }

                const manifestPath = file.fsPath;
                if (seen.has(manifestPath)) {
                    continue;
                }

                const manifest = await this.tryReadManifest(file);
                if (!manifest || !this.hasSorobanSdkDependency(manifest)) {
                    continue;
                }

                seen.add(manifestPath);
                manifests.push({
                    name: this.getPackageName(manifest) || path.basename(path.dirname(manifestPath)),
                    manifestPath,
                    directory: path.dirname(manifestPath)
                });
            }
        }

        return manifests.sort((a, b) => a.name.localeCompare(b.name));
    }

    private static async tryReadManifest(uri: vscode.Uri): Promise<string | undefined> {
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            return Buffer.from(bytes).toString('utf8');
        } catch {
            return undefined;
        }
    }

    private static hasSorobanSdkDependency(manifest: string): boolean {
        return /^\s*soroban-sdk\s*=/m.test(manifest) || /^\s*"soroban-sdk"\s*=/m.test(manifest);
    }

    private static getPackageName(manifest: string): string | undefined {
        const packageSection = manifest.match(/^\s*\[package\][\s\S]*?(?=^\s*\[|\s*$)/m)?.[0];
        const name = packageSection?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
        return name;
    }
}
