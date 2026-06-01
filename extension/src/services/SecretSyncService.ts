import * as vscode from 'vscode';

export interface SyncedIdentity {
    name: string;
    publicKey: string;
    network: string;
    updatedAt: string;
}

export class SecretSyncService {
    private static readonly IDENTITIES_KEY = 'stellarSuite.secretSync.identities';
    private static readonly SECRET_PREFIX = 'stellarSuite.secretSync.privateKey.';

    constructor(private readonly context: vscode.ExtensionContext) {
        this.context.subscriptions.push(
            this.context.secrets.onDidChange(event => {
                if (event.key.startsWith(SecretSyncService.SECRET_PREFIX)) {
                    vscode.commands.executeCommand('setContext', 'stellarSuite.secretSync.hasSyncedIdentities', true);
                }
            })
        );
    }

    public isEnabled(): boolean {
        return vscode.workspace.getConfiguration('stellarSuite').get<boolean>('secretSync.enabled', true);
    }

    public async listIdentities(): Promise<SyncedIdentity[]> {
        return this.context.globalState.get<SyncedIdentity[]>(SecretSyncService.IDENTITIES_KEY, []);
    }

    public async storeIdentity(identity: Omit<SyncedIdentity, 'updatedAt'>, privateKey: string): Promise<void> {
        if (!this.isEnabled() || !privateKey.trim()) {
            return;
        }

        const identities = await this.listIdentities();
        const nextIdentity: SyncedIdentity = {
            ...identity,
            updatedAt: new Date().toISOString()
        };
        const existingIndex = identities.findIndex(item => item.publicKey === identity.publicKey || item.name === identity.name);

        if (existingIndex >= 0) {
            identities[existingIndex] = nextIdentity;
        } else {
            identities.push(nextIdentity);
        }

        await this.context.secrets.store(this.getSecretKey(identity.publicKey), privateKey.trim());
        await this.context.globalState.update(SecretSyncService.IDENTITIES_KEY, identities);
        await vscode.commands.executeCommand('setContext', 'stellarSuite.secretSync.hasSyncedIdentities', identities.length > 0);
    }

    public async getPrivateKey(publicKey: string): Promise<string | undefined> {
        if (!this.isEnabled()) {
            return undefined;
        }

        return this.context.secrets.get(this.getSecretKey(publicKey));
    }

    public async removeIdentity(publicKey: string): Promise<void> {
        const identities = (await this.listIdentities()).filter(identity => identity.publicKey !== publicKey);
        await this.context.secrets.delete(this.getSecretKey(publicKey));
        await this.context.globalState.update(SecretSyncService.IDENTITIES_KEY, identities);
        await vscode.commands.executeCommand('setContext', 'stellarSuite.secretSync.hasSyncedIdentities', identities.length > 0);
    }

    private getSecretKey(publicKey: string): string {
        return `${SecretSyncService.SECRET_PREFIX}${publicKey}`;
    }
}
