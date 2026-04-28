import * as vscode from 'vscode';

export interface SyncAccount {
    publicKey: string;
    name: string;
    network: string;
}

export class AccountSyncService {
    private secretStorage: vscode.SecretStorage;
    private globalState: vscode.Memento;
    private static readonly ACCOUNTS_KEY = 'stellar.sync.accounts';
    private static readonly SECRETS_PREFIX = 'stellar.sync.secret.';

    constructor(context: vscode.ExtensionContext) {
        this.secretStorage = context.secrets;
        this.globalState = context.globalState;
        
        // Listen for external changes (other workspaces syncing accounts)
        context.subscriptions.push(
            this.secretStorage.onDidChange((e) => {
                this.handleSecretChange(e.key);
            })
        );
    }

    public async getAccounts(): Promise<SyncAccount[]> {
        return this.globalState.get<SyncAccount[]>(AccountSyncService.ACCOUNTS_KEY, []);
    }

    public async addAccount(name: string, publicKey: string, privateKey: string, network: string = 'testnet') {
        const accounts = await this.getAccounts();
        
        // Check if exists
        const existingIndex = accounts.findIndex(a => a.publicKey === publicKey);
        if (existingIndex >= 0) {
            accounts[existingIndex] = { name, publicKey, network };
        } else {
            accounts.push({ name, publicKey, network });
        }

        // Save public config in global state across workspaces
        await this.globalState.update(AccountSyncService.ACCOUNTS_KEY, accounts);
        
        // Save private key in VS Code secret storage safely
        const secretKey = `${AccountSyncService.SECRETS_PREFIX}${publicKey}`;
        await this.secretStorage.store(secretKey, privateKey);

        vscode.window.showInformationMessage(`Stellar Account '${name}' synchronized across workspaces.`);
        this.refreshAccountsView();
    }

    public async removeAccount(publicKey: string) {
        const accounts = await this.getAccounts();
        const filtered = accounts.filter(a => a.publicKey !== publicKey);
        
        await this.globalState.update(AccountSyncService.ACCOUNTS_KEY, filtered);
        const secretKey = `${AccountSyncService.SECRETS_PREFIX}${publicKey}`;
        await this.secretStorage.delete(secretKey);
        
        vscode.window.showInformationMessage(`Account removed and unsynced.`);
        this.refreshAccountsView();
    }

    public async getPrivateKey(publicKey: string): Promise<string | undefined> {
        const secretKey = `${AccountSyncService.SECRETS_PREFIX}${publicKey}`;
        return await this.secretStorage.get(secretKey);
    }

    private handleSecretChange(key: string) {
        if (key.startsWith(AccountSyncService.SECRETS_PREFIX)) {
            // Trigger a refresh when a secret is updated from another workspace
            this.refreshAccountsView();
        }
    }

    private refreshAccountsView() {
        // Signal the UI/TreeView that accounts have been updated.
        console.log("AccountSyncService: Accounts updated, triggering UI refresh.");
        vscode.commands.executeCommand('setContext', 'stellar.accountsSynced', true);
    }
}
