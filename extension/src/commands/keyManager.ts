import * as vscode from 'vscode';
import { execAsync } from '../services/sorobanCliService';
import { SecretSyncService } from '../services/SecretSyncService';

export async function keysGenerate(secretSync?: SecretSyncService) {
    const name = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new identity',
        placeHolder: 'e.g., alice, bob, dev'
    });

    if (!name) return;

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating Stellar key: ${name}...`,
            cancellable: false
        }, async () => {
            await execAsync(`stellar keys generate ${name}`);
        });
        await syncIdentitySecret(secretSync, name);
        vscode.window.showInformationMessage(`Successfully generated identity: ${name}`);
    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to generate identity: ${e.message}`);
    }
}

export async function keysFund() {
    try {
        const { stdout } = await execAsync('stellar keys ls');
        const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
        const identities = lines.filter(line => !line.startsWith('ℹ️'));

        if (identities.length === 0) {
            vscode.window.showErrorMessage('No identities found. Generate one first!');
            return;
        }

        const selected = await vscode.window.showQuickPick(identities, {
            placeHolder: 'Select identity to fund on Testnet'
        });

        if (!selected) return;

        await fundIdentity(selected);
    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to fund identity: ${e.message}`);
    }
}

export async function fundIdentity(name: string) {
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Funding ${name} on Testnet... (This may take a few seconds)`,
            cancellable: false
        }, async () => {
            await execAsync(`stellar keys fund ${name} --network testnet`);
        });

        vscode.window.showInformationMessage(`Successfully funded identity: ${name}`);
    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to fund identity: ${e.message}`);
    }
}

interface KeyIdentityItem extends vscode.QuickPickItem {
    rawName: string;
    rawPubKey: string;
}

export async function keysList(secretSync?: SecretSyncService) {
    try {
        const { stdout } = await execAsync('stellar keys ls');
        const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
        const identities = lines.filter(line => !line.startsWith('ℹ️'));
        
        if (identities.length === 0) {
            vscode.window.showInformationMessage('No identities found.');
            return;
        }

        const items: KeyIdentityItem[] = [];
        
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Loading identities...',
            cancellable: false
        }, async () => {
            for (const line of identities) {
                // Remove the potential '*' active indicator to get the raw name
                const rawName = line.replace(/^\*\s*/, '').trim();
                const isSelected = line.startsWith('*');
                
                try {
                    // Fetch the public key for this identity
                    const addrOutput = await execAsync(`stellar keys address ${rawName}`);
                    const pubKey = addrOutput.stdout.trim();
                    
                    items.push({
                        label: `${isSelected ? '$(check) ' : ''}${rawName}`,
                        description: pubKey,
                        rawName: rawName,
                        rawPubKey: pubKey
                    });
                } catch (e) {
                    // Skip if we can't get the address (e.g., it's a legacy or malformed key)
                }
            }
        });

        const selected = await vscode.window.showQuickPick<KeyIdentityItem>(items, {
            placeHolder: 'Select an identity to view options'
        });

        if (selected) {
            const action = await vscode.window.showQuickPick([
                { label: '$(copy) Copy Public Key', id: 'copy_pub' },
                { label: '$(star-empty) Use as Default Source', id: 'use_default' },
                { label: '$(rocket) Fund Account (Airdrop)', id: 'fund_account' }
            ], { placeHolder: `Actions for ${selected.rawName}` });

            if (action?.id === 'copy_pub') {
                await vscode.env.clipboard.writeText(selected.rawPubKey);
                vscode.window.showInformationMessage(`Copied public key for ${selected.rawName}`);
            } else if (action?.id === 'use_default') {
                const config = vscode.workspace.getConfiguration('stellarSuite');
                await config.update('source', selected.rawName, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage(`Set default source account to: ${selected.rawName}`);
            } else if (action?.id === 'fund_account') {
                await fundIdentity(selected.rawName);
            }
            await syncIdentitySecret(secretSync, selected.rawName, selected.rawPubKey);
        }
    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to list keys: ${e.message}`);
    }
}

async function syncIdentitySecret(secretSync: SecretSyncService | undefined, name: string, knownPublicKey?: string) {
    if (!secretSync) {
        return;
    }

    if (!secretSync.isEnabled()) {
        return;
    }

    const publicKey = knownPublicKey || (await execAsync(`stellar keys address ${name}`)).stdout.trim();
    const privateKey = await readPrivateKey(name);

    if (publicKey && privateKey) {
        await secretSync.storeIdentity({
            name,
            publicKey,
            network: vscode.workspace.getConfiguration('stellarSuite').get<string>('network', 'testnet')
        }, privateKey);
    }
}

async function readPrivateKey(name: string): Promise<string | undefined> {
    const commands = [
        `stellar keys show ${name} --secret`,
        `stellar keys secret ${name}`
    ];

    for (const command of commands) {
        try {
            const { stdout } = await execAsync(command);
            const secret = stdout.trim().split(/\s+/).find(part => /^S[A-Z2-7]{55}$/.test(part));
            if (secret) {
                return secret;
            }
        } catch {
        }
    }

    return undefined;
}
