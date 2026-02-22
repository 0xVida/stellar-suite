// ============================================================
// src/services/rpcAuthVscode.ts
// VS Code bridge for the RPC Authentication service.
// Wraps workspace state (for metadata) and SecretStorage (for secrets).
// ============================================================

import * as vscode from 'vscode';
import { RpcAuthStore, RpcSecretStore, RpcAuthService } from './rpcAuthService';

class WorkspaceStateRpcAuthStore implements RpcAuthStore {
    constructor(private readonly state: vscode.Memento) { }

    get<T>(key: string, defaultValue: T): T {
        return this.state.get<T>(key, defaultValue);
    }

    update<T>(key: string, value: T): PromiseLike<void> {
        return this.state.update(key, value);
    }
}

class VscodeSecretStore implements RpcSecretStore {
    constructor(private readonly secretStorage: vscode.SecretStorage) { }

    async getSecret(key: string): Promise<string | undefined> {
        return await this.secretStorage.get(key);
    }

    async storeSecret(key: string, value: string): Promise<void> {
        await this.secretStorage.store(key, value);
    }

    async deleteSecret(key: string): Promise<void> {
        await this.secretStorage.delete(key);
    }
}

/**
 * Creates an RpcAuthService backed by VS Code's workspaceState
 * and native SecretStorage.
 */
export function createRpcAuthService(
    context: vscode.ExtensionContext
): RpcAuthService {
    return new RpcAuthService(
        new WorkspaceStateRpcAuthStore(context.workspaceState),
        new VscodeSecretStore(context.secrets)
    );
}
