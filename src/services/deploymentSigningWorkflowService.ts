// ============================================================
// src/services/deploymentSigningWorkflowService.ts
// Interactive signing workflow for deployment commands.
// ============================================================

import * as vscode from 'vscode';
import * as path from 'path';
import {
    DeploymentSigningMethod,
    DeploymentSigningPayload,
    DeploymentSigningResult,
    TransactionSigningService,
} from './transactionSigningService';
import { KeypairManagementService } from './keypairManagementService';

export interface DeploymentSigningWorkflowRequest {
    payload: DeploymentSigningPayload;
    defaultMethod?: DeploymentSigningMethod;
    requireValidatedSignature?: boolean;
    enableSecureKeyStorage?: boolean;
}

export class DeploymentSigningWorkflowService {
    private readonly signingService: TransactionSigningService;
    private readonly keypairService: KeypairManagementService;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly outputChannel: vscode.OutputChannel
    ) {
        this.signingService = new TransactionSigningService(undefined, outputChannel);
        this.keypairService = new KeypairManagementService(context as any);
    }

    public async run(request: DeploymentSigningWorkflowRequest): Promise<DeploymentSigningResult | undefined> {
        const method = await this.pickSigningMethod(request.defaultMethod || 'interactive');
        if (!method) {
            return undefined;
        }

        this.outputChannel.appendLine(`[Signing] Selected signing method: ${method}`);

        const result = await this.collectAndSign(method, request.payload, {
            enableSecureKeyStorage: request.enableSecureKeyStorage !== false,
        });

        if (!result) {
            return undefined;
        }

        if (!result.success) {
            vscode.window.showErrorMessage(`Signing failed: ${result.error}`);
            return result;
        }

        if (request.requireValidatedSignature && !result.validated && method !== 'sourceAccount') {
            const message = 'Signing completed but signature could not be validated.';
            this.outputChannel.appendLine(`[Signing] ${message}`);
            return {
                ...result,
                success: false,
                status: 'failed',
                error: message,
            };
        }

        if (request.requireValidatedSignature && method === 'sourceAccount') {
            const proceed = await vscode.window.showWarningMessage(
                'Source-account signing does not produce a local signature artifact. Continue anyway?',
                'Continue',
                'Cancel'
            );
            if (proceed !== 'Continue') {
                return undefined;
            }
        }

        return result;
    }

    public getSigningService(): TransactionSigningService {
        return this.signingService;
    }

    private async pickSigningMethod(
        defaultMethod: DeploymentSigningMethod
    ): Promise<DeploymentSigningMethod | undefined> {
        const picks: Array<vscode.QuickPickItem & { value: DeploymentSigningMethod }> = [
            {
                label: 'Interactive Signing',
                description: defaultMethod === 'interactive' ? 'default' : '',
                detail: 'Enter a secret key in a secure prompt for this deployment.',
                value: 'interactive',
            },
            {
                label: 'Keypair File',
                description: defaultMethod === 'keypairFile' ? 'default' : '',
                detail: 'Load signing keypair from a local file.',
                value: 'keypairFile',
            },
            {
                label: 'Stored Keypair',
                description: defaultMethod === 'storedKeypair' ? 'default' : '',
                detail: 'Use a keypair already stored in VS Code secure storage.',
                value: 'storedKeypair',
            },
            {
                label: 'Hardware Wallet',
                description: defaultMethod === 'hardwareWallet' ? 'default' : '',
                detail: 'Provide externally signed payload hash from a hardware wallet.',
                value: 'hardwareWallet',
            },
            {
                label: 'Source Account (CLI)',
                description: defaultMethod === 'sourceAccount' ? 'default' : '',
                detail: 'Delegate signing to Stellar CLI source account resolution.',
                value: 'sourceAccount',
            },
        ];

        const selection = await vscode.window.showQuickPick(picks, {
            title: 'Deployment Signing Method',
            placeHolder: 'Choose how the deployment transaction should be signed.',
            matchOnDetail: true,
        });

        if (!selection) {
            return undefined;
        }

        await this.context.workspaceState.update('stellarSuite.lastSigningMethod', selection.value);
        return selection.value;
    }

    private async collectAndSign(
        method: DeploymentSigningMethod,
        payload: DeploymentSigningPayload,
        options: { enableSecureKeyStorage: boolean }
    ): Promise<DeploymentSigningResult | undefined> {
        if (method === 'sourceAccount') {
            return this.signingService.signDeployment({ method, payload });
        }

        if (method === 'keypairFile') {
            const fileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                title: 'Select keypair file',
                filters: {
                    'Key files': ['json', 'txt', 'env'],
                    'All files': ['*'],
                },
            });

            if (!fileUri || fileUri.length === 0) {
                return undefined;
            }

            const parsed = this.keypairService.loadKeypairFromFile(fileUri[0].fsPath);
            if (!parsed.success || !parsed.keypair) {
                return {
                    success: false,
                    method,
                    status: 'failed',
                    payloadHash: this.signingService.computePayloadHash(payload),
                    validated: false,
                    signedAt: new Date().toISOString(),
                    error: parsed.error || 'Unable to parse keypair file.',
                };
            }

            const alias = path.basename(fileUri[0].fsPath, path.extname(fileUri[0].fsPath));
            const signed = await this.signingService.signDeployment({
                method,
                payload,
                secretKey: parsed.keypair.secretKey,
                publicKey: parsed.keypair.publicKey,
                keypairAlias: alias,
            });

            if (signed.success && options.enableSecureKeyStorage) {
                await this.offerStoreKeypair(alias, parsed.keypair.secretKey, signed.publicKey, 'file');
            }
            return signed;
        }

        if (method === 'storedKeypair') {
            const aliases = this.keypairService.listStoredKeypairs();
            if (!aliases.length) {
                return {
                    success: false,
                    method,
                    status: 'failed',
                    payloadHash: this.signingService.computePayloadHash(payload),
                    validated: false,
                    signedAt: new Date().toISOString(),
                    error: 'No stored keypairs were found. Store one first with interactive or file signing.',
                };
            }

            const selection = await vscode.window.showQuickPick(
                aliases.map(item => ({
                    label: item.alias,
                    description: item.publicKey || 'public key unavailable',
                    detail: `Stored ${item.updatedAt}`,
                    value: item.alias,
                })),
                {
                    title: 'Select stored keypair',
                    placeHolder: 'Choose a stored keypair alias for deployment signing.',
                }
            );

            if (!selection) {
                return undefined;
            }

            const stored = await this.keypairService.getStoredKeypair(selection.value);
            if (!stored) {
                return {
                    success: false,
                    method,
                    status: 'failed',
                    payloadHash: this.signingService.computePayloadHash(payload),
                    validated: false,
                    signedAt: new Date().toISOString(),
                    error: `Stored keypair "${selection.value}" could not be loaded.`,
                };
            }

            return this.signingService.signDeployment({
                method,
                payload,
                secretKey: stored.secretKey,
                publicKey: stored.publicKey,
                keypairAlias: selection.value,
            });
        }

        if (method === 'interactive') {
            const secretKey = await vscode.window.showInputBox({
                title: 'Interactive Deployment Signing',
                prompt: 'Enter the Stellar secret key (S...) for signing',
                placeHolder: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                password: true,
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value || !value.trim()) {
                        return 'Secret key is required for interactive signing.';
                    }
                    return undefined;
                },
            });

            if (!secretKey) {
                return undefined;
            }

            const signed = await this.signingService.signDeployment({
                method,
                payload,
                secretKey: secretKey.trim(),
            });

            if (signed.success && options.enableSecureKeyStorage) {
                const aliasInput = await vscode.window.showInputBox({
                    title: 'Store keypair securely?',
                    prompt: 'Enter alias to store this keypair in VS Code SecretStorage (optional)',
                    placeHolder: 'e.g., deploy-mainnet',
                    ignoreFocusOut: true,
                });
                if (aliasInput && aliasInput.trim()) {
                    await this.keypairService.storeKeypair(
                        aliasInput.trim(),
                        { secretKey: secretKey.trim(), publicKey: signed.publicKey },
                        'interactive'
                    );
                    this.outputChannel.appendLine(`[Signing] Stored interactive keypair as "${aliasInput.trim()}".`);
                }
            }

            return signed;
        }

        // hardwareWallet method
        const payloadHash = this.signingService.computePayloadHash(payload);
        this.outputChannel.appendLine(`[Signing] Payload hash to sign: ${payloadHash}`);
        await vscode.env.clipboard.writeText(payloadHash);

        vscode.window.showInformationMessage(
            'Deployment payload hash copied to clipboard. Sign this hash with your hardware wallet and paste the signature.'
        );

        const publicKey = await vscode.window.showInputBox({
            title: 'Hardware Wallet Signing',
            prompt: 'Enter signer public key (G...)',
            placeHolder: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            ignoreFocusOut: true,
        });

        if (!publicKey) {
            return undefined;
        }

        const signature = await vscode.window.showInputBox({
            title: 'Hardware Wallet Signing',
            prompt: 'Enter payload signature (hex)',
            placeHolder: 'a1b2c3...',
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value || !value.trim()) {
                    return 'Signature is required.';
                }
                if (!/^[0-9a-f]+$/i.test(value.trim())) {
                    return 'Signature must be a hex string.';
                }
                return undefined;
            },
        });

        if (!signature) {
            return undefined;
        }

        return this.signingService.signDeployment({
            method,
            payload,
            publicKey: publicKey.trim(),
            signature: signature.trim(),
        });
    }

    private async offerStoreKeypair(
        suggestedAlias: string,
        secretKey: string,
        publicKey: string | undefined,
        source: 'file' | 'interactive' | 'manual'
    ): Promise<void> {
        const shouldStore = await vscode.window.showQuickPick(
            [
                { label: 'Store keypair in secure storage', value: 'store' },
                { label: 'Do not store', value: 'skip' },
            ],
            {
                title: 'Secure Key Storage',
                placeHolder: this.keypairService.getSecureStorageDescription(),
            }
        );

        if (!shouldStore || shouldStore.value !== 'store') {
            return;
        }

        const alias = await vscode.window.showInputBox({
            title: 'Store Keypair Alias',
            prompt: 'Choose an alias for this keypair',
            value: suggestedAlias,
            validateInput: (value) => {
                if (!value || !value.trim()) {
                    return 'Alias is required.';
                }
                return undefined;
            },
        });

        if (!alias) {
            return;
        }

        await this.keypairService.storeKeypair(
            alias.trim(),
            { secretKey, publicKey },
            source
        );
        this.outputChannel.appendLine(`[Signing] Stored keypair as "${alias.trim()}".`);
    }

}
