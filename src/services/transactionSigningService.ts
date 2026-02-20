// ============================================================
// src/services/transactionSigningService.ts
// Transaction signing and signature validation service for
// contract deployment workflows.
// ============================================================

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export type DeploymentSigningMethod =
    | 'sourceAccount'
    | 'keypairFile'
    | 'storedKeypair'
    | 'interactive'
    | 'hardwareWallet';

export type DeploymentSigningStatus = 'signed' | 'verified' | 'delegated' | 'failed';

export interface DeploymentSigningPayload {
    kind: 'stellar-contract-deployment';
    version: number;
    wasmPath: string;
    wasmHash: string;
    network: string;
    source: string;
    contractDir?: string;
    cliPath?: string;
    requestedAt: string;
}

export interface DeploymentSigningRequest {
    method: DeploymentSigningMethod;
    payload: DeploymentSigningPayload;
    secretKey?: string;
    publicKey?: string;
    signature?: string;
    keypairAlias?: string;
}

export interface DeploymentSigningResult {
    success: boolean;
    method: DeploymentSigningMethod;
    status: DeploymentSigningStatus;
    payloadHash: string;
    validated: boolean;
    signedAt: string;
    signature?: string;
    publicKey?: string;
    keypairAlias?: string;
    warnings?: string[];
    error?: string;
}

export interface BuildSigningPayloadParams {
    wasmPath: string;
    network: string;
    source: string;
    contractDir?: string;
    cliPath?: string;
    requestedAt?: string;
}

export interface StellarSigningAdapter {
    isAvailable(): Promise<boolean>;
    derivePublicKey(secretKey: string): Promise<string>;
    signPayloadHash(secretKey: string, payloadHashHex: string): Promise<string>;
    verifySignature(publicKey: string, payloadHashHex: string, signatureHex: string): Promise<boolean>;
}

interface SimpleOutputChannel {
    appendLine(value: string): void;
}

const NOOP_OUTPUT: SimpleOutputChannel = {
    appendLine: () => { /* no-op */ },
};

/**
 * Runtime Stellar SDK adapter. Uses dynamic import so build/test can run even
 * when the SDK package is unavailable in constrained environments.
 */
export class StellarSdkSigningAdapter implements StellarSigningAdapter {
    private cachedSdk: any | undefined;
    private sdkLoadAttempted = false;

    public async isAvailable(): Promise<boolean> {
        const sdk = await this.loadSdk();
        return !!sdk && !!sdk.Keypair;
    }

    public async derivePublicKey(secretKey: string): Promise<string> {
        const sdk = await this.requireSdk();
        const keypair = sdk.Keypair.fromSecret(secretKey);
        return keypair.publicKey();
    }

    public async signPayloadHash(secretKey: string, payloadHashHex: string): Promise<string> {
        const sdk = await this.requireSdk();
        const keypair = sdk.Keypair.fromSecret(secretKey);
        const signatureBytes: Uint8Array = keypair.sign(Buffer.from(payloadHashHex, 'hex'));
        return Buffer.from(signatureBytes).toString('hex');
    }

    public async verifySignature(
        publicKey: string,
        payloadHashHex: string,
        signatureHex: string
    ): Promise<boolean> {
        const sdk = await this.requireSdk();
        const keypair = sdk.Keypair.fromPublicKey(publicKey);
        return keypair.verify(
            Buffer.from(payloadHashHex, 'hex'),
            Buffer.from(signatureHex, 'hex')
        );
    }

    private async requireSdk(): Promise<any> {
        const sdk = await this.loadSdk();
        if (!sdk || !sdk.Keypair) {
            throw new Error(
                'Stellar SDK is unavailable. Install "@stellar/stellar-sdk" to use signing workflows.'
            );
        }
        return sdk;
    }

    private async loadSdk(): Promise<any | undefined> {
        if (this.sdkLoadAttempted) {
            return this.cachedSdk;
        }
        this.sdkLoadAttempted = true;

        try {
            // Avoid compile-time dependency hard-coupling to keep this portable.
            const dynamicImport = new Function(
                'm',
                'return import(m);'
            ) as (moduleName: string) => Promise<any>;
            this.cachedSdk = await dynamicImport('@stellar/stellar-sdk');
        } catch {
            this.cachedSdk = undefined;
        }
        return this.cachedSdk;
    }
}

export class TransactionSigningService {
    constructor(
        private readonly adapter: StellarSigningAdapter = new StellarSdkSigningAdapter(),
        private readonly outputChannel: SimpleOutputChannel = NOOP_OUTPUT
    ) {}

    public async buildDeploymentSigningPayload(
        params: BuildSigningPayloadParams
    ): Promise<DeploymentSigningPayload> {
        const wasmHash = this.hashFile(params.wasmPath);
        return {
            kind: 'stellar-contract-deployment',
            version: 1,
            wasmPath: path.resolve(params.wasmPath),
            wasmHash,
            network: params.network,
            source: params.source,
            contractDir: params.contractDir ? path.resolve(params.contractDir) : undefined,
            cliPath: params.cliPath,
            requestedAt: params.requestedAt || new Date().toISOString(),
        };
    }

    public computePayloadHash(payload: DeploymentSigningPayload): string {
        const canonical = stableStringify(payload);
        return crypto.createHash('sha256').update(canonical, 'utf-8').digest('hex');
    }

    public async signDeployment(request: DeploymentSigningRequest): Promise<DeploymentSigningResult> {
        const payloadHash = this.computePayloadHash(request.payload);
        const signedAt = new Date().toISOString();

        try {
            if (request.method === 'sourceAccount') {
                this.outputChannel.appendLine(
                    '[Signing] Delegating signing to configured source account in Stellar CLI.'
                );
                return {
                    success: true,
                    method: request.method,
                    status: 'delegated',
                    payloadHash,
                    validated: false,
                    signedAt,
                    warnings: [
                        'No local signature artifact was produced. Deployment relies on source-account signing.',
                    ],
                };
            }

            if (request.method === 'hardwareWallet') {
                if (!request.publicKey || !request.signature) {
                    return this.failureResult(
                        request.method,
                        payloadHash,
                        signedAt,
                        'Hardware wallet signing requires both public key and signature.'
                    );
                }

                const isValid = await this.adapter.verifySignature(
                    request.publicKey,
                    payloadHash,
                    request.signature
                );

                if (!isValid) {
                    return this.failureResult(
                        request.method,
                        payloadHash,
                        signedAt,
                        'Hardware wallet signature validation failed.'
                    );
                }

                return {
                    success: true,
                    method: request.method,
                    status: 'verified',
                    payloadHash,
                    validated: true,
                    signedAt,
                    signature: request.signature,
                    publicKey: request.publicKey,
                    keypairAlias: request.keypairAlias,
                };
            }

            // Methods that produce signature from a secret key:
            if (!request.secretKey) {
                return this.failureResult(
                    request.method,
                    payloadHash,
                    signedAt,
                    'Signing secret key is required for the selected method.'
                );
            }

            const publicKey = request.publicKey || await this.adapter.derivePublicKey(request.secretKey);
            const signature = await this.adapter.signPayloadHash(request.secretKey, payloadHash);
            const isValid = await this.adapter.verifySignature(publicKey, payloadHash, signature);

            if (!isValid) {
                return this.failureResult(
                    request.method,
                    payloadHash,
                    signedAt,
                    'Generated signature failed validation.'
                );
            }

            return {
                success: true,
                method: request.method,
                status: 'signed',
                payloadHash,
                validated: true,
                signedAt,
                signature,
                publicKey,
                keypairAlias: request.keypairAlias,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.outputChannel.appendLine(`[Signing] ERROR: ${message}`);
            return this.failureResult(
                request.method,
                payloadHash,
                signedAt,
                message
            );
        }
    }

    private hashFile(filePath: string): string {
        const buffer = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    private failureResult(
        method: DeploymentSigningMethod,
        payloadHash: string,
        signedAt: string,
        error: string
    ): DeploymentSigningResult {
        return {
            success: false,
            method,
            status: 'failed',
            payloadHash,
            validated: false,
            signedAt,
            error,
        };
    }
}

function stableStringify(value: unknown): string {
    if (value === null || value === undefined) {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(v => stableStringify(v)).join(',')}]`;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b));
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
