import {
    BackupEntry,
    BackupTrigger,
} from '../../services/stateBackupService';

import {
    ContractDeploymentRecord,
    PersistedContractMetadata,
    WorkspaceContractState,
    ContractWorkspaceStateSnapshot,
} from '../../services/contractWorkStateService';

// ── Mock workspace state (Memento-compatible) ─────────────────

export function createMockMemento(initial: Record<string, unknown> = {}) {
    const store = new Map<string, unknown>(Object.entries(initial));
    return {
        get<T>(key: string, defaultValue?: T): T {
            return (store.has(key) ? store.get(key) : defaultValue) as T;
        },
        async update(key: string, value: unknown): Promise<void> {
            store.set(key, value);
        },
        keys(): readonly string[] {
            return Array.from(store.keys());
        },
        _store: store,
    };
}

// ── Mock output channel ───────────────────────────────────────

export function createMockOutputChannel() {
    const lines: string[] = [];
    return {
        appendLine(value: string) { lines.push(value); },
        show() {},
        dispose() {},
        lines,
    };
}

// ── Mock extension context ────────────────────────────────────

export function createMockContext(initialState: Record<string, unknown> = {}) {
    const memento = createMockMemento(initialState);
    return {
        workspaceState: memento,
        _store: memento._store,
    };
}

// ── Sample deployment records ─────────────────────────────────

export function makeDeploymentRecord(overrides: Partial<ContractDeploymentRecord> = {}): ContractDeploymentRecord {
    return {
        contractId: 'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
        contractName: 'TokenContract',
        deployedAt: new Date().toISOString(),
        network: 'testnet',
        source: 'src/contracts/token.rs',
        transactionHash: 'tx_abc123def456',
        ...overrides,
    };
}

export function makeSecondDeploymentRecord(): ContractDeploymentRecord {
    return makeDeploymentRecord({
        contractId: 'CXYZ789ABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKL',
        contractName: 'SwapContract',
        network: 'mainnet',
        source: 'src/contracts/swap.rs',
        transactionHash: 'tx_xyz789ghi012',
    });
}

// ── Sample metadata ───────────────────────────────────────────

export function makeContractMetadata(overrides: Partial<PersistedContractMetadata> = {}): PersistedContractMetadata {
    return {
        contractPath: 'src/contracts/token.rs',
        contractName: 'TokenContract',
        version: '1.0.0',
        updatedAt: new Date().toISOString(),
        data: { abi: ['transfer', 'balance', 'mint'] },
        ...overrides,
    };
}

// ── Full workspace state snapshot ─────────────────────────────

export function makeWorkspaceState(overrides: Partial<WorkspaceContractState> = {}): WorkspaceContractState {
    return {
        deployedContracts: { 'src/contracts/token.rs': 'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST' },
        deploymentHistory: [makeDeploymentRecord()],
        metadata: { 'src/contracts/token.rs': makeContractMetadata() },
        preferences: { selectedNetwork: 'testnet', pinnedContracts: ['token'] },
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

export function makeSnapshot(workspaceId: string = '/test/workspace'): ContractWorkspaceStateSnapshot {
    return {
        schemaVersion: 2,
        workspaces: {
            [workspaceId]: makeWorkspaceState(),
        },
    };
}

// ── Pre-populated initial states for integration flows ────────

export function makePopulatedState(): Record<string, unknown> {
    return {
        'stellarSuite.deployedContracts': {
            'src/contracts/token.rs': 'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
        },
        'stellarSuite.deploymentHistory': [makeDeploymentRecord()],
        'stellarSuite.userPreferences': { theme: 'dark', autoSave: true },
        'stellarSuite.networkConfig': { defaultNetwork: 'testnet', rpcUrl: 'https://soroban-testnet.stellar.org' },
    };
}

export function makeCorruptedBackupEntry(): BackupEntry {
    return {
        id: 'bak_corrupted_001',
        createdAt: new Date().toISOString(),
        trigger: 'manual' as BackupTrigger,
        snapshot: { key1: 'value1' },
        checksum: 'deadbeef',
        sizeBytes: 9999,
        status: 'unknown' as const,
    };
}

export function makeValidBackupEntry(): BackupEntry {
    const snapshot = { 'stellarSuite.testKey': 'testValue' };
    const serialized = JSON.stringify(snapshot);
    return {
        id: 'bak_valid_001',
        createdAt: new Date().toISOString(),
        trigger: 'manual' as BackupTrigger,
        snapshot,
        checksum: computeChecksum(serialized),
        sizeBytes: serialized.length,
        status: 'valid' as const,
    };
}

// ── Checksum (mirrors StateBackupService.computeChecksum) ─────

export function computeChecksum(data: string): string {
    let hash = 5381;
    for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) + hash + data.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

// ── Validation state factories ────────────────────────────────

export function makeValidValidationState(): Record<string, unknown> {
    return {
        deployments: new Map([
            ['dep-1', {
                contractId: 'contract-abc',
                contractName: 'TestContract',
                deployedAt: new Date().toISOString(),
                network: 'testnet',
                source: 'src/test.rs',
                transactionHash: 'tx_hash_1',
            }],
        ]),
        configurations: {
            cliPath: '/usr/local/bin/soroban',
            defaultNetwork: 'testnet',
            buildFlags: ['--release'],
        },
        lastSync: Date.now(),
        syncVersion: 1,
    };
}

export function makeMissingFieldsState(): Record<string, unknown> {
    return {
        deployments: new Map(),
    };
}

export function makeInvalidTypesState(): Record<string, unknown> {
    return {
        deployments: 'not_a_map',
        configurations: null,
        lastSync: 'not_a_number',
        syncVersion: 1,
    };
}
