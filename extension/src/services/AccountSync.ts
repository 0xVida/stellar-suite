import * as vscode from 'vscode';

export interface SyncAccount {
    publicKey: string;
    name: string;
    network: string;
    updatedAt: string;
}

/**
 * AccountSyncService — synchronizes Stellar accounts (public metadata + secrets)
 * across VS Code workspaces using globalState (shared across workspaces) and
 * SecretStorage (encrypted, VS Code keychain-backed).
 *
 * Emits the `stellar.accountSync.didChange` event so any view can refresh.
 */
export class AccountSyncService {
    private readonly secretStorage: vscode.SecretStorage;
    private readonly globalState: vscode.Memento;

    private static readonly ACCOUNTS_KEY = 'stellar.sync.accounts';
    private static readonly SECRETS_PREFIX = 'stellar.sync.secret.';

    /** Fires whenever the account list changes (add / remove / external sync). */
    private readonly _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

    constructor(context: vscode.ExtensionContext) {
        this.secretStorage = context.secrets;
        this.globalState = context.globalState;

        // React to secret changes from other workspaces sharing the same VS Code
        // global SecretStorage (e.g., a second workspace window that called addAccount).
        const secretWatcher = this.secretStorage.onDidChange((e) => {
            if (e.key.startsWith(AccountSyncService.SECRETS_PREFIX)) {
                this._onDidChange.fire();
                this._refreshAccountsView();
            }
        });

        context.subscriptions.push(secretWatcher, this._onDidChange);
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    /** Return all synced accounts from the shared global state. */
    public async getAccounts(): Promise<SyncAccount[]> {
        return this.globalState.get<SyncAccount[]>(AccountSyncService.ACCOUNTS_KEY, []);
    }

    /**
     * Upsert an account.
     * Public metadata is stored in globalState (available across workspaces).
     * The private key is stored in SecretStorage (encrypted, never in logs).
     */
    public async addAccount(
        name: string,
        publicKey: string,
        privateKey: string,
        network: string = 'testnet'
    ): Promise<void> {
        if (!name.trim() || !publicKey.trim()) {
            vscode.window.showErrorMessage('Account name and public key are required.');
            return;
        }

        const accounts = await this.getAccounts();
        const record: SyncAccount = {
            name: name.trim(),
            publicKey: publicKey.trim(),
            network,
            updatedAt: new Date().toISOString(),
        };

        const idx = accounts.findIndex((a) => a.publicKey === publicKey.trim());
        if (idx >= 0) {
            accounts[idx] = record;
        } else {
            accounts.push(record);
        }

        // Persist public metadata globally so every workspace can see it.
        await this.globalState.update(AccountSyncService.ACCOUNTS_KEY, accounts);

        // Persist the private key securely; only readable in the same VS Code profile.
        if (privateKey.trim()) {
            await this.secretStorage.store(this._secretKey(publicKey.trim()), privateKey.trim());
        }

        vscode.window.showInformationMessage(
            `Stellar account '${name}' synchronized across workspaces.`
        );

        this._onDidChange.fire();
        this._refreshAccountsView();
    }

    /** Remove an account from global state and delete its secret. */
    public async removeAccount(publicKey: string): Promise<void> {
        const accounts = await this.getAccounts();
        const filtered = accounts.filter((a) => a.publicKey !== publicKey);

        await this.globalState.update(AccountSyncService.ACCOUNTS_KEY, filtered);
        await this.secretStorage.delete(this._secretKey(publicKey));

        vscode.window.showInformationMessage('Account removed from workspace sync.');
        this._onDidChange.fire();
        this._refreshAccountsView();
    }

    /** Retrieve a stored private key. Returns undefined if not found or not stored. */
    public async getPrivateKey(publicKey: string): Promise<string | undefined> {
        return this.secretStorage.get(this._secretKey(publicKey));
    }

    /**
     * List all accounts that have a private key in SecretStorage.
     * Useful for UI: only show accounts that are fully synced with secrets.
     */
    public async listSyncedAccounts(): Promise<SyncAccount[]> {
        const accounts = await this.getAccounts();
        const results: SyncAccount[] = [];

        for (const account of accounts) {
            const key = await this.secretStorage.get(this._secretKey(account.publicKey));
            if (key) {
                results.push(account);
            }
        }

        return results;
    }

    // ─── Private helpers ───────────────────────────────────────────────────────

    private _secretKey(publicKey: string): string {
        return `${AccountSyncService.SECRETS_PREFIX}${publicKey}`;
    }

    /**
     * Signals VS Code that synced accounts are available.
     * Views / when-clauses can react to `stellar.accountsSynced`.
     */
    private _refreshAccountsView(): void {
        this.getAccounts().then((accounts) => {
            vscode.commands.executeCommand(
                'setContext',
                'stellar.accountsSynced',
                accounts.length > 0
            );
        });
    }
}
