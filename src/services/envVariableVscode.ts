// ============================================================
// src/services/envVariableVscode.ts
// VS Code bridge for the environment variable service.
// Wraps workspace state as an EnvVariableStore.
// ============================================================

import * as vscode from 'vscode';
import { EnvVariableService, EnvVariableStore } from './envVariableService';

class WorkspaceStateEnvVariableStore implements EnvVariableStore {
    constructor(private readonly state: vscode.Memento) { }

    get<T>(key: string, defaultValue: T): T {
        return this.state.get<T>(key, defaultValue);
    }

    update<T>(key: string, value: T): PromiseLike<void> {
        return this.state.update(key, value);
    }
}

/**
 * Create an EnvVariableService backed by VS Code workspace state.
 */
export function createEnvVariableService(
    context: vscode.ExtensionContext,
): EnvVariableService {
    return new EnvVariableService(
        new WorkspaceStateEnvVariableStore(context.workspaceState),
    );
}
