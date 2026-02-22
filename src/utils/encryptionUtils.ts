import { WorkspaceStateEncryptionService } from '../services/workspaceStateEncryptionService';
import { DeploymentRecord } from '../services/workspaceStateSyncService';

/**
 * Field definitions for sensitive data in different record types
 */
export const SENSITIVE_FIELDS = {
    deployment: ['contractId', 'transactionHash', 'metadata'],
    configuration: ['apiKey', 'privateKey', 'endpoint', 'credentials'],
    credentials: ['password', 'token', 'secret', 'apiKey', 'privateKey']
};

/**
 * Encryption utilities for common workspace state operations
 */
export class EncryptionUtils {
    /**
     * Encrypt a deployment record
     */
    static encryptDeploymentRecord(
        record: DeploymentRecord,
        encryptionService: WorkspaceStateEncryptionService
    ): Record<string, any> {
        return encryptionService.encryptObject(record as any, SENSITIVE_FIELDS.deployment);
    }

    /**
     * Decrypt a deployment record
     */
    static decryptDeploymentRecord(
        encrypted: Record<string, any>,
        encryptionService: WorkspaceStateEncryptionService
    ): DeploymentRecord {
        return encryptionService.decryptObject(encrypted, SENSITIVE_FIELDS.deployment) as DeploymentRecord;
    }

    /**
     * Encrypt configuration object
     */
    static encryptConfiguration(
        config: Record<string, any>,
        encryptionService: WorkspaceStateEncryptionService
    ): Record<string, any> {
        return encryptionService.encryptObject(config, SENSITIVE_FIELDS.configuration);
    }

    /**
     * Decrypt configuration object
     */
    static decryptConfiguration(
        encrypted: Record<string, any>,
        encryptionService: WorkspaceStateEncryptionService
    ): Record<string, any> {
        return encryptionService.decryptObject(encrypted, SENSITIVE_FIELDS.configuration);
    }

    /**
     * Check if a record has encrypted fields
     */
    static hasEncryptedFields(obj: Record<string, any>): boolean {
        if (!obj || typeof obj !== 'object') {
            return false;
        }

        return Object.values(obj).some(value => {
            if (value && typeof value === 'object') {
                return (
                    'ciphertext' in value &&
                    'authTag' in value &&
                    'iv' in value &&
                    'algorithm' in value &&
                    value.algorithm === 'aes-256-gcm'
                );
            }
            return false;
        });
    }

    /**
     * Recursively encrypt sensitive fields in nested objects
     */
    static recursiveEncrypt(
        obj: any,
        sensitiveFieldNames: string[],
        encryptionService: WorkspaceStateEncryptionService
    ): any {
        if (Array.isArray(obj)) {
            return obj.map(item => this.recursiveEncrypt(item, sensitiveFieldNames, encryptionService));
        }

        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        const encrypted: Record<string, any> = {};

        for (const [key, value] of Object.entries(obj)) {
            if (sensitiveFieldNames.includes(key) && value !== null && value !== undefined) {
                try {
                    encrypted[key] = encryptionService.encrypt(value);
                } catch {
                    // If encryption fails, keep original value
                    encrypted[key] = value;
                }
            } else if (typeof value === 'object' && value !== null) {
                encrypted[key] = this.recursiveEncrypt(value, sensitiveFieldNames, encryptionService);
            } else {
                encrypted[key] = value;
            }
        }

        return encrypted;
    }

    /**
     * Recursively decrypt sensitive fields in nested objects
     */
    static recursiveDecrypt(
        obj: any,
        sensitiveFieldNames: string[],
        encryptionService: WorkspaceStateEncryptionService
    ): any {
        if (Array.isArray(obj)) {
            return obj.map(item => this.recursiveDecrypt(item, sensitiveFieldNames, encryptionService));
        }

        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        const decrypted: Record<string, any> = {};

        for (const [key, value] of Object.entries(obj)) {
            if (
                sensitiveFieldNames.includes(key) &&
                value &&
                typeof value === 'object' &&
                'ciphertext' in value
            ) {
                try {
                    decrypted[key] = encryptionService.decrypt(value as any);
                } catch {
                    // If decryption fails, keep encrypted value
                    decrypted[key] = value;
                }
            } else if (typeof value === 'object' && value !== null) {
                decrypted[key] = this.recursiveDecrypt(value, sensitiveFieldNames, encryptionService);
            } else {
                decrypted[key] = value;
            }
        }

        return decrypted;
    }

    /**
     * Get list of fields that need encryption for a given type
     */
    static getSensitiveFieldsForType(type: 'deployment' | 'configuration' | 'credentials'): string[] {
        return SENSITIVE_FIELDS[type] || [];
    }

    /**
     * Validate that all required sensitive fields are present in encrypted records
     */
    static validateEncryptedFields(
        record: Record<string, any>,
        requiredFields: string[]
    ): { valid: boolean; missingFields: string[] } {
        const missingFields = requiredFields.filter(field => {
            const value = record[field];
            return !value || (typeof value === 'object' && !('ciphertext' in value));
        });

        return {
            valid: missingFields.length === 0,
            missingFields
        };
    }
}
