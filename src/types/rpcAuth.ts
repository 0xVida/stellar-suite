// ============================================================
// src/types/rpcAuth.ts
// Shared types for RPC authentication management.
// ============================================================

/**
 * Supported authentication methods for RPC endpoints.
 */
export type AuthMethodType = 'api-key' | 'bearer-token' | 'basic' | 'custom-header';

/**
 * Metadata for an RPC authentication profile.
 * This object does NOT contain any actual secrets or sensitive credentials.
 */
export interface RpcAuthProfile {
    /** Unique identifier for the profile */
    id: string;
    /** Human-readable display name */
    name: string;
    /** The type of authentication used */
    type: AuthMethodType;
    /** For 'custom-header' type, the name of the HTTP header */
    headerName?: string;
    /** For 'basic' auth type, the username */
    username?: string;
    /** Profile creation timestamp (ISO string) */
    createdAt: string;
    /** Profile modification timestamp (ISO string) */
    updatedAt: string;
}

/**
 * The actual sensitive credentials for an auth profile.
 * These are stored securely in the OS keychain via VS Code SecretStorage,
 * and matched to the `RpcAuthProfile` via the profile `id`.
 */
export interface RpcAuthCredentials {
    /** The profile ID these credentials belong to */
    id: string;
    /** 
     * The auth token, API key, password, or header value.
     * What this field represents depends on the `AuthMethodType`. 
     */
    secret: string;
}

/**
 * State persisted by the RpcAuthStore.
 */
export interface RpcAuthStoreState {
    version: number;
    activeProfileId?: string;
    profiles: RpcAuthProfile[];
}

/**
 * Validation result for auth profiles.
 */
export interface RpcAuthValidation {
    valid: boolean;
    errors: string[];
}
