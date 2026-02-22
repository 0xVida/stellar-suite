// ============================================================
// src/services/rpcAuthService.ts
// Core service for managing RPC authentication profiles.
// ============================================================

import {
    AuthMethodType,
    RpcAuthProfile,
    RpcAuthStoreState,
    RpcAuthValidation
} from '../types/rpcAuth';

// ── Store Interfaces ─────────────────────────────────────────

/**
 * Interface for persisting profile metadata (non-sensitive).
 * This follows the pattern of the CliConfigurationStore.
 */
export interface RpcAuthStore {
    get<T>(key: string, defaultValue: T): T;
    update<T>(key: string, value: T): PromiseLike<void>;
}

/**
 * Interface for securely storing secrets.
 * In VS Code this maps to `context.secrets` (SecretStorage).
 */
export interface RpcSecretStore {
    getSecret(key: string): Promise<string | undefined>;
    storeSecret(key: string, value: string): Promise<void>;
    deleteSecret(key: string): Promise<void>;
}

// ── Validation Helpers ───────────────────────────────────────

export function validateRpcAuthProfile(
    name: string,
    type: AuthMethodType,
    secret: string,
    username?: string,
    headerName?: string
): RpcAuthValidation {
    const errors: string[] = [];

    if (!name.trim()) {
        errors.push('Profile name is required.');
    }

    if (!secret.trim()) {
        errors.push('Authentication secret/token is required.');
    }

    if (type === 'basic' && !username?.trim()) {
        errors.push('Username is required for Basic authentication.');
    }

    if (type === 'custom-header' && !headerName?.trim()) {
        errors.push('Header name is required for Custom Header authentication.');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

// ── Utility ──────────────────────────────────────────────────

function generateId(name: string): string {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    return `${slug}-${Date.now().toString(36)}`;
}

// ── Service ──────────────────────────────────────────────────

const STORE_KEY = 'stellar-suite.rpcAuthProfiles';
const STORE_VERSION = 1;

export class RpcAuthService {
    constructor(
        private readonly stateStore: RpcAuthStore,
        private readonly secretStore: RpcSecretStore
    ) { }

    // ── Internal State Management ────────────────────────────────

    private getState(): RpcAuthStoreState {
        const state = this.stateStore.get<RpcAuthStoreState | undefined>(STORE_KEY, undefined);
        if (!state) {
            return {
                version: STORE_VERSION,
                profiles: [],
            };
        }
        return state;
    }

    private async saveState(state: RpcAuthStoreState): Promise<void> {
        await this.stateStore.update(STORE_KEY, state);
    }

    private getSecretKey(profileId: string): string {
        return `rpcAuth.secret.${profileId}`;
    }

    // ── Public API: Profiles ─────────────────────────────────────

    /**
     * Get all auth profiles (metadata only, no secrets).
     */
    public async getProfiles(): Promise<RpcAuthProfile[]> {
        return this.getState().profiles;
    }

    /**
     * Get the active profile ID, if any.
     */
    public async getActiveProfileId(): Promise<string | undefined> {
        return this.getState().activeProfileId;
    }

    /**
     * Get the active profile (metadata only).
     */
    public async getActiveProfile(): Promise<RpcAuthProfile | undefined> {
        const state = this.getState();
        if (!state.activeProfileId) {
            return undefined;
        }
        return state.profiles.find((p) => p.id === state.activeProfileId);
    }

    /**
     * Set the active profile.
     */
    public async setActiveProfile(profileId: string | undefined): Promise<void> {
        const state = this.getState();
        if (profileId !== undefined) {
            const exists = state.profiles.some((p) => p.id === profileId);
            if (!exists) {
                throw new Error(`Profile with ID "${profileId}" does not exist.`);
            }
        }
        state.activeProfileId = profileId;
        await this.saveState(state);
    }

    /**
     * Create a new auth profile and store its secret securely.
     */
    public async createProfile(
        name: string,
        type: AuthMethodType,
        secret: string,
        username?: string,
        headerName?: string
    ): Promise<RpcAuthProfile> {
        // 1. Validation
        const validation = validateRpcAuthProfile(name, type, secret, username, headerName);
        if (!validation.valid) {
            throw new Error(`Invalid profile: ${validation.errors.join(' ')}`);
        }

        const state = this.getState();
        const conflict = state.profiles.some((p) => p.name.toLowerCase() === name.toLowerCase());
        if (conflict) {
            throw new Error(`Profile name "${name}" already exists.`);
        }

        // 2. Metadata creation
        const now = new Date().toISOString();
        const profile: RpcAuthProfile = {
            id: generateId(name),
            name: name.trim(),
            type,
            createdAt: now,
            updatedAt: now,
        };

        if (type === 'basic') {
            profile.username = username?.trim();
        } else if (type === 'custom-header') {
            profile.headerName = headerName?.trim();
        }

        // 3. Store the secret using the OS keychain via secretStore
        const secretKey = this.getSecretKey(profile.id);
        await this.secretStore.storeSecret(secretKey, secret);

        // 4. Update the state
        state.profiles.push(profile);
        await this.saveState(state);

        return profile;
    }

    /**
     * Update an existing profile's metadata and/or fully replace its secret.
     */
    public async updateProfile(
        profileId: string,
        updates: {
            name?: string;
            type?: AuthMethodType;
            secret?: string;
            username?: string;
            headerName?: string;
        }
    ): Promise<RpcAuthProfile> {
        const state = this.getState();
        const index = state.profiles.findIndex((p) => p.id === profileId);
        if (index === -1) {
            throw new Error(`Profile with ID "${profileId}" not found.`);
        }

        const existing = state.profiles[index];
        const newName = updates.name?.trim() ?? existing.name;

        // Name uniqueness check if name is changing
        if (newName.toLowerCase() !== existing.name.toLowerCase()) {
            const conflict = state.profiles.some((p) => p.name.toLowerCase() === newName.toLowerCase());
            if (conflict) {
                throw new Error(`Profile name "${newName}" already exists.`);
            }
        }

        // Apply updates
        const updated: RpcAuthProfile = {
            ...existing,
            name: newName,
            updatedAt: new Date().toISOString(),
        };

        if (updates.type !== undefined) {
            updated.type = updates.type;
        }

        // We only require full validation if they are replacing the secret
        // Otherwise, we assume the existing secret is fine, but we still
        // validate the metadata fields (e.g. username required for basic).
        const dummySecret = updates.secret ?? 'EXISTING_SECRET_PLACEHOLDER';
        const updatedUsername = updates.username !== undefined ? updates.username.trim() : existing.username;
        const updatedHeaderName = updates.headerName !== undefined ? updates.headerName.trim() : existing.headerName;

        const validation = validateRpcAuthProfile(
            newName,
            updated.type,
            dummySecret,
            updatedUsername,
            updatedHeaderName
        );

        if (!validation.valid) {
            throw new Error(`Invalid profile updates: ${validation.errors.join(' ')}`);
        }

        // Update optional fields based on type
        if (updated.type === 'basic') {
            updated.username = updatedUsername;
            delete updated.headerName; // cleanup
        } else if (updated.type === 'custom-header') {
            updated.headerName = updatedHeaderName;
            delete updated.username; // cleanup
        } else {
            delete updated.username;
            delete updated.headerName;
        }

        // Update secret if provided
        if (updates.secret && updates.secret.trim() !== '') {
            const secretKey = this.getSecretKey(updated.id);
            await this.secretStore.storeSecret(secretKey, updates.secret);
        }

        state.profiles[index] = updated;
        await this.saveState(state);

        return updated;
    }

    /**
     * Delete an auth profile and its associated credentials.
     */
    public async deleteProfile(profileId: string): Promise<void> {
        const state = this.getState();
        const index = state.profiles.findIndex((p) => p.id === profileId);

        if (index === -1) {
            throw new Error(`Profile with ID "${profileId}" not found.`);
        }

        // Remove secret from secure storage
        const secretKey = this.getSecretKey(profileId);
        await this.secretStore.deleteSecret(secretKey);

        // Remove from state
        state.profiles.splice(index, 1);

        // Deactivate if it was active
        if (state.activeProfileId === profileId) {
            state.activeProfileId = undefined;
        }

        await this.saveState(state);
    }

    // ── Public API: Execution / Headers ──────────────────────────

    /**
     * Retrieves the HTTP headers required for authentication using the
     * currently active profile. Returns an empty object if no profile
     * is active or if the profile is invalid.
     */
    public async getAuthHeaders(): Promise<Record<string, string>> {
        const activeProfile = await this.getActiveProfile();
        if (!activeProfile) {
            return {};
        }

        const secretKey = this.getSecretKey(activeProfile.id);
        const secret = await this.secretStore.getSecret(secretKey);

        if (!secret) {
            // Secret was lost/deleted out of band, return nothing so we don't crash
            return {};
        }

        switch (activeProfile.type) {
            case 'bearer-token':
                return {
                    'Authorization': `Bearer ${secret}`
                };
            case 'api-key':
                // For Stellar RPC endpoints, X-Api-Key or Authorization are common.
                // We'll use X-Api-Key as a default convention.
                return {
                    'X-Api-Key': secret
                };
            case 'basic': {
                if (!activeProfile.username) {
                    return {};
                }
                const b64 = Buffer.from(`${activeProfile.username}:${secret}`).toString('base64');
                return {
                    'Authorization': `Basic ${b64}`
                };
            }
            case 'custom-header': {
                if (!activeProfile.headerName) {
                    return {};
                }
                return {
                    [activeProfile.headerName]: secret
                };
            }
            default:
                return {};
        }
    }
}
