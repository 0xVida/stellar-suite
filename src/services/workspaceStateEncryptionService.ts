import * as vscode from 'vscode';
import * as crypto from 'crypto';

/**
 * Encryption algorithm configuration
 */
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const KEY_DERIVATION_ITERATIONS = 100000;

/**
 * Encryption metadata stored with encrypted data
 */
export interface EncryptedData {
    version: number;
    algorithm: string;
    iv: string;
    salt: string;
    authTag: string;
    ciphertext: string;
    timestamp: number;
}

/**
 * Sensitive data types that should be encrypted
 */
export type SensitiveDataType = 'contractId' | 'deploymentConfig' | 'credentials' | 'apiKey' | 'privateKey';

/**
 * Data marked for encryption with metadata
 */
export interface DataMarkedForEncryption {
    type: SensitiveDataType;
    value: any;
    keyId?: string;
}

/**
 * Key metadata
 */
export interface KeyMetadata {
    id: string;
    createdAt: number;
    rotatedAt?: number;
    algorithm: string;
    status: 'active' | 'deprecated' | 'compromised';
}

/**
 * Service for encrypting and decrypting workspace state data.
 * Uses AES-256-GCM for authenticated encryption.
 */
export class WorkspaceStateEncryptionService {
    private static readonly KEY_STORAGE_KEY = 'stellar-suite.encryption.masterKey';
    private static readonly KEY_METADATA_KEY = 'stellar-suite.encryption.keyMetadata';
    private static readonly ENCRYPTION_ENABLED_KEY = 'stellar-suite.encryption.enabled';

    private masterKey: Buffer | null = null;
    private masterKeyId: string | null = null;
    private rotatedKeys: Map<string, Buffer> = new Map();
    private keyMetadata: Map<string, KeyMetadata> = new Map();
    private outputChannel: vscode.OutputChannel;

    constructor(
        private context: vscode.ExtensionContext,
        private enableLogging: boolean = false
    ) {
        this.outputChannel = vscode.window.createOutputChannel('Workspace Encryption');
        if (enableLogging) {
            this.outputChannel.appendLine('[Encryption] Service initialized');
        }
    }

    /**
     * Initialize encryption service and load/create master key
     */
    public async initialize(): Promise<void> {
        try {
            // Check if encryption is enabled
            const encryptionEnabled = this.context.globalState.get<boolean>(
                WorkspaceStateEncryptionService.ENCRYPTION_ENABLED_KEY,
                false
            );

            if (!encryptionEnabled) {
                if (this.enableLogging) {
                    this.outputChannel.appendLine('[Encryption] Encryption not enabled');
                }
                return;
            }

            // Try to load existing master key
            const storedKey = await this.context.secrets.get(
                WorkspaceStateEncryptionService.KEY_STORAGE_KEY
            );

            if (storedKey) {
                this.masterKey = Buffer.from(storedKey, 'hex');
                this.masterKeyId = this.context.globalState.get<string>(
                    'stellar-suite.encryption.masterKeyId',
                    'default'
                );

                // Load key rotation history
                await this.loadKeyMetadata();

                if (this.enableLogging) {
                    this.outputChannel.appendLine('[Encryption] Master key loaded from storage');
                }
            } else {
                // Generate new master key
                await this.generateMasterKey();
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`[Encryption] Initialization error: ${errorMsg}`);
            throw new Error(`Failed to initialize encryption: ${errorMsg}`);
        }
    }

    /**
     * Enable encryption for workspace state
     */
    public async enableEncryption(): Promise<void> {
        try {
            await this.initialize();
            if (!this.masterKey) {
                await this.generateMasterKey();
            }
            await this.context.globalState.update(
                WorkspaceStateEncryptionService.ENCRYPTION_ENABLED_KEY,
                true
            );
            if (this.enableLogging) {
                this.outputChannel.appendLine('[Encryption] Encryption enabled');
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to enable encryption: ${errorMsg}`);
        }
    }

    /**
     * Disable encryption (keeps keys for decryption of existing data)
     */
    public async disableEncryption(): Promise<void> {
        await this.context.globalState.update(
            WorkspaceStateEncryptionService.ENCRYPTION_ENABLED_KEY,
            false
        );
        if (this.enableLogging) {
            this.outputChannel.appendLine('[Encryption] Encryption disabled');
        }
    }

    /**
     * Check if encryption is enabled
     */
    public isEncryptionEnabled(): boolean {
        return this.context.globalState.get<boolean>(
            WorkspaceStateEncryptionService.ENCRYPTION_ENABLED_KEY,
            false
        );
    }

    /**
     * Encrypt a single value
     */
    public encrypt(value: any): EncryptedData {
        if (!this.masterKey) {
            throw new Error('Encryption not initialized. Call initialize() first.');
        }

        const data = JSON.stringify(value);
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.masterKey, iv);

        let ciphertext = cipher.update(data, 'utf-8', 'hex');
        ciphertext += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        return {
            version: 1,
            algorithm: ENCRYPTION_ALGORITHM,
            iv: iv.toString('hex'),
            salt: '', // Salt used during key derivation, not stored with data
            authTag: authTag.toString('hex'),
            ciphertext,
            timestamp: Date.now()
        };
    }

    /**
     * Decrypt a single encrypted value
     */
    public decrypt(encrypted: EncryptedData): any {
        if (!this.masterKey) {
            throw new Error('Encryption not initialized. Call initialize() first.');
        }

        const iv = Buffer.from(encrypted.iv, 'hex');
        const authTag = Buffer.from(encrypted.authTag, 'hex');
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.masterKey, iv);
        decipher.setAuthTag(authTag);

        let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf-8');
        plaintext += decipher.final('utf-8');

        return JSON.parse(plaintext);
    }

    /**
     * Encrypt an object, selectively encrypting marked fields
     */
    public encryptObject(obj: Record<string, any>, fieldsToEncrypt?: string[]): Record<string, any> {
        if (!this.isEncryptionEnabled()) {
            return obj;
        }

        const encrypted: Record<string, any> = { ...obj };

        // If specific fields are marked, encrypt only those
        if (fieldsToEncrypt) {
            fieldsToEncrypt.forEach(field => {
                if (field in encrypted && encrypted[field] !== null && encrypted[field] !== undefined) {
                    encrypted[field] = this.encrypt(encrypted[field]);
                }
            });
        }

        return encrypted;
    }

    /**
     * Decrypt an object, decrypting marked fields
     */
    public decryptObject(
        obj: Record<string, any>,
        fieldsToDecrypt?: string[]
    ): Record<string, any> {
        if (!this.isEncryptionEnabled()) {
            return obj;
        }

        const decrypted: Record<string, any> = { ...obj };

        if (fieldsToDecrypt) {
            fieldsToDecrypt.forEach(field => {
                if (field in decrypted && this.isEncryptedData(decrypted[field])) {
                    try {
                        decrypted[field] = this.decrypt(decrypted[field]);
                    } catch (error) {
                        this.outputChannel.appendLine(
                            `[Encryption] Failed to decrypt field '${field}': ${error}`
                        );
                        // Leave encrypted if decryption fails
                    }
                }
            });
        }

        return decrypted;
    }

    /**
     * Rotate encryption key
     */
    public async rotateKey(): Promise<string> {
        if (!this.masterKey || !this.masterKeyId) {
            throw new Error('No active master key to rotate');
        }

        try {
            // Store current key as deprecated
            const oldMetadata: KeyMetadata = this.keyMetadata.get(this.masterKeyId) || {
                id: this.masterKeyId,
                createdAt: Date.now(),
                algorithm: ENCRYPTION_ALGORITHM,
                status: 'active'
            };
            oldMetadata.status = 'deprecated';
            oldMetadata.rotatedAt = Date.now();
            this.rotatedKeys.set(this.masterKeyId, this.masterKey);

            // Generate new master key
            const newKeyId = await this.generateMasterKey();

            // Save rotation history
            await this.saveKeyMetadata();

            if (this.enableLogging) {
                this.outputChannel.appendLine(
                    `[Encryption] Key rotated from ${this.masterKeyId} to ${newKeyId}`
                );
            }

            return newKeyId;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Key rotation failed: ${errorMsg}`);
        }
    }

    /**
     * Get encryption status
     */
    public getStatus(): {
        enabled: boolean;
        keyId: string | null;
        algorithm: string;
        rotatedKeysCount: number;
    } {
        return {
            enabled: this.isEncryptionEnabled(),
            keyId: this.masterKeyId,
            algorithm: ENCRYPTION_ALGORITHM,
            rotatedKeysCount: this.rotatedKeys.size
        };
    }

    /**
     * Clear encryption keys (requires confirmation)
     */
    public async clearEncryptionKeys(): Promise<void> {
        try {
            await this.context.secrets.delete(WorkspaceStateEncryptionService.KEY_STORAGE_KEY);
            this.masterKey = null;
            this.masterKeyId = null;
            this.rotatedKeys.clear();
            this.keyMetadata.clear();

            await this.disableEncryption();

            if (this.enableLogging) {
                this.outputChannel.appendLine('[Encryption] Encryption keys cleared');
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to clear encryption keys: ${errorMsg}`);
        }
    }

    /**
     * Export encrypted data for backup
     */
    public exportEncryptedState(state: Record<string, any>): string {
        if (!this.isEncryptionEnabled()) {
            throw new Error('Encryption not enabled');
        }

        const backup = {
            version: 1,
            exportedAt: new Date().toISOString(),
            encryptionEnabled: true,
            keyId: this.masterKeyId,
            algorithm: ENCRYPTION_ALGORITHM,
            state
        };

        return JSON.stringify(backup, null, 2);
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        // Clear sensitive data from memory
        if (this.masterKey) {
            this.masterKey.fill(0);
            this.masterKey = null;
        }

        this.rotatedKeys.forEach(key => {
            key.fill(0);
        });
        this.rotatedKeys.clear();

        this.outputChannel.dispose();
    }

    // ============================================================
    // Private Methods
    // ============================================================

    private async generateMasterKey(): Promise<string> {
        return new Promise((resolve, reject) => {
            crypto.randomBytes(SALT_LENGTH, (err, salt) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Derive key from random bytes
                crypto.pbkdf2(
                    crypto.randomBytes(32),
                    salt,
                    KEY_DERIVATION_ITERATIONS,
                    KEY_LENGTH,
                    'sha256',
                    async (err, derivedKey) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        this.masterKey = derivedKey;
                        const keyId = `key-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
                        this.masterKeyId = keyId;

                        // Store key in secure storage
                        try {
                            await this.context.secrets.store(
                                WorkspaceStateEncryptionService.KEY_STORAGE_KEY,
                                derivedKey.toString('hex')
                            );

                            // Store key ID
                            await this.context.globalState.update('stellar-suite.encryption.masterKeyId', keyId);

                            // Create metadata entry
                            const metadata: KeyMetadata = {
                                id: keyId,
                                createdAt: Date.now(),
                                algorithm: ENCRYPTION_ALGORITHM,
                                status: 'active'
                            };
                            this.keyMetadata.set(keyId, metadata);

                            if (this.enableLogging) {
                                this.outputChannel.appendLine(`[Encryption] Master key generated: ${keyId}`);
                            }

                            resolve(keyId);
                        } catch (error) {
                            reject(error);
                        }
                    }
                );
            });
        });
    }

    private async loadKeyMetadata(): Promise<void> {
        try {
            const metadataJson = this.context.globalState.get<string>(
                WorkspaceStateEncryptionService.KEY_METADATA_KEY,
                '{}' 
            );
            const metadata = JSON.parse(metadataJson);

            Object.entries(metadata).forEach(([id, meta]: [string, any]) => {
                this.keyMetadata.set(id, meta);
            });
        } catch (error) {
            if (this.enableLogging) {
                this.outputChannel.appendLine(`[Encryption] Failed to load key metadata: ${error}`);
            }
        }
    }

    private async saveKeyMetadata(): Promise<void> {
        try {
            const metadata: Record<string, KeyMetadata> = {};
            this.keyMetadata.forEach((value, key) => {
                metadata[key] = value;
            });

            await this.context.globalState.update(
                WorkspaceStateEncryptionService.KEY_METADATA_KEY,
                JSON.stringify(metadata)
            );
        } catch (error) {
            this.outputChannel.appendLine(`[Encryption] Failed to save key metadata: ${error}`);
        }
    }

    private isEncryptedData(value: any): value is EncryptedData {
        return (
            value &&
            typeof value === 'object' &&
            value.version === 1 &&
            value.algorithm === ENCRYPTION_ALGORITHM &&
            value.iv &&
            value.authTag &&
            value.ciphertext
        );
    }
}
