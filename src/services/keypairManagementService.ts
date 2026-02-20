// ============================================================
// src/services/keypairManagementService.ts
// Secure keypair loading/storage utilities for signing workflows.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';

export interface KeypairData {
    secretKey: string;
    publicKey?: string;
}

export interface StoredKeypairMetadata {
    alias: string;
    publicKey?: string;
    createdAt: string;
    updatedAt: string;
    source: 'file' | 'interactive' | 'manual';
}

interface SecretStorageLike {
    get(key: string): PromiseLike<string | undefined>;
    store(key: string, value: string): PromiseLike<void>;
    delete(key: string): PromiseLike<void>;
}

interface MementoLike {
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
}

interface ExtensionContextLike {
    secrets: SecretStorageLike;
    globalState: MementoLike;
}

export interface KeypairFileLoadResult {
    success: boolean;
    keypair?: KeypairData;
    sourcePath: string;
    error?: string;
}

const KEYPAIR_INDEX_KEY = 'stellarSuite.signing.keypairIndex';
const KEYPAIR_SECRET_PREFIX = 'stellarSuite.signing.keypair.';

export class KeypairManagementService {
    constructor(private readonly context: ExtensionContextLike) {}

    public loadKeypairFromFile(filePath: string): KeypairFileLoadResult {
        try {
            const resolvedPath = path.resolve(filePath);
            const content = fs.readFileSync(resolvedPath, 'utf-8').trim();
            if (!content) {
                return {
                    success: false,
                    sourcePath: resolvedPath,
                    error: 'Keypair file is empty.',
                };
            }

            // JSON file formats
            if (content.startsWith('{')) {
                try {
                    const parsed = JSON.parse(content) as Record<string, unknown>;
                    const secretKey = readStringField(
                        parsed,
                        ['secretKey', 'secret', 'privateKey', 'stellarSecretKey']
                    );
                    const publicKey = readStringField(
                        parsed,
                        ['publicKey', 'accountId', 'address', 'stellarPublicKey']
                    );

                    if (!secretKey) {
                        return {
                            success: false,
                            sourcePath: resolvedPath,
                            error: 'JSON keypair file must include a secret key field.',
                        };
                    }
                    return {
                        success: true,
                        sourcePath: resolvedPath,
                        keypair: { secretKey, publicKey },
                    };
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    return {
                        success: false,
                        sourcePath: resolvedPath,
                        error: `Failed to parse JSON keypair file: ${message}`,
                    };
                }
            }

            // Environment file style: SECRET_KEY=...
            const envMatch = content.match(
                /(?:SECRET_KEY|STELLAR_SECRET_KEY|secret_key|private_key)\s*[=:]\s*["']?(S[A-Z2-7]{55})["']?/i
            );
            if (envMatch) {
                return {
                    success: true,
                    sourcePath: resolvedPath,
                    keypair: { secretKey: envMatch[1] },
                };
            }

            // Raw secret key
            const rawSecret = content.match(/\bS[A-Z2-7]{55}\b/);
            if (rawSecret) {
                return {
                    success: true,
                    sourcePath: resolvedPath,
                    keypair: { secretKey: rawSecret[0] },
                };
            }

            return {
                success: false,
                sourcePath: resolvedPath,
                error: 'No valid Stellar secret key was found in the selected file.',
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                success: false,
                sourcePath: path.resolve(filePath),
                error: `Failed to read keypair file: ${message}`,
            };
        }
    }

    public async storeKeypair(
        alias: string,
        keypair: KeypairData,
        source: StoredKeypairMetadata['source']
    ): Promise<void> {
        const normalizedAlias = normalizeAlias(alias);
        if (!normalizedAlias) {
            throw new Error('Keypair alias cannot be empty.');
        }

        const key = this.getSecretKey(normalizedAlias);
        const now = new Date().toISOString();
        const existing = await this.getMetadataByAlias(normalizedAlias);

        await this.context.secrets.store(
            key,
            JSON.stringify({
                secretKey: keypair.secretKey,
                publicKey: keypair.publicKey,
                updatedAt: now,
            })
        );

        const metadata = this.getIndex();
        const updatedEntry: StoredKeypairMetadata = {
            alias: normalizedAlias,
            publicKey: keypair.publicKey || existing?.publicKey,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
            source,
        };

        const filtered = metadata.filter(entry => entry.alias !== normalizedAlias);
        filtered.push(updatedEntry);
        filtered.sort((a, b) => a.alias.localeCompare(b.alias));
        await this.context.globalState.update(KEYPAIR_INDEX_KEY, filtered);
    }

    public async getStoredKeypair(alias: string): Promise<KeypairData | undefined> {
        const normalizedAlias = normalizeAlias(alias);
        if (!normalizedAlias) {
            return undefined;
        }

        const raw = await this.context.secrets.get(this.getSecretKey(normalizedAlias));
        if (!raw) {
            return undefined;
        }

        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const secretKey = typeof parsed.secretKey === 'string' ? parsed.secretKey : undefined;
            const publicKey = typeof parsed.publicKey === 'string' ? parsed.publicKey : undefined;
            if (!secretKey) {
                return undefined;
            }
            return { secretKey, publicKey };
        } catch {
            return undefined;
        }
    }

    public listStoredKeypairs(): StoredKeypairMetadata[] {
        return this.getIndex();
    }

    public async deleteStoredKeypair(alias: string): Promise<boolean> {
        const normalizedAlias = normalizeAlias(alias);
        if (!normalizedAlias) {
            return false;
        }

        const existing = this.getIndex();
        const next = existing.filter(entry => entry.alias !== normalizedAlias);
        if (next.length === existing.length) {
            return false;
        }

        await this.context.secrets.delete(this.getSecretKey(normalizedAlias));
        await this.context.globalState.update(KEYPAIR_INDEX_KEY, next);
        return true;
    }

    public getSecureStorageDescription(): string {
        return 'Keypairs are stored in VS Code SecretStorage and indexed in extension global state.';
    }

    private getSecretKey(alias: string): string {
        return `${KEYPAIR_SECRET_PREFIX}${alias}`;
    }

    private getIndex(): StoredKeypairMetadata[] {
        return this.context.globalState.get<StoredKeypairMetadata[]>(KEYPAIR_INDEX_KEY, []);
    }

    private async getMetadataByAlias(alias: string): Promise<StoredKeypairMetadata | undefined> {
        return this.getIndex().find(entry => entry.alias === alias);
    }
}

function normalizeAlias(alias: string): string {
    return alias.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function readStringField(obj: Record<string, unknown>, fieldNames: string[]): string | undefined {
    for (const field of fieldNames) {
        const value = obj[field];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return undefined;
}
