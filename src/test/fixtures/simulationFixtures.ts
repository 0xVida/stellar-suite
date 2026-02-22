// ============================================================
// src/test/fixtures/simulationFixtures.ts
// Test fixtures for simulation workflow integration tests
// ============================================================

import { SimulationResult } from '../../services/sorobanCliService';
import { StateSnapshot, StateDiff } from '../../types/simulationState';

export const SimulationFixtures = {
    // ── Successful simulation responses ──────────────────────

    SUCCESSFUL_CLI_SIMULATION: `{"result":"42","resource_usage":{"cpu_instructions":1234567,"memory_bytes":8192}}`,

    SUCCESSFUL_RPC_SIMULATION: {
        jsonrpc: '2.0',
        id: 1,
        result: {
            returnValue: 'success',
            resourceUsage: {
                cpuInstructions: 987654,
                memoryBytes: 4096,
            },
        },
    },

    // ── Error scenarios ──────────────────────────────────────

    CLI_ERROR_INVALID_CONTRACT: `error: contract not found: CINVALID123
help: Verify the contract ID is correct and deployed on the specified network`,

    CLI_ERROR_INVALID_FUNCTION: `error: function 'nonexistent' not found in contract
help: Use 'stellar contract inspect' to list available functions`,

    CLI_ERROR_INVALID_ARGS: `error: invalid argument type for parameter 'amount'
expected: u64
received: string`,

    CLI_ERROR_NETWORK_TIMEOUT: `error: network error: connection timed out
help: Check your network connection and RPC endpoint`,

    CLI_ERROR_EXECUTION_FAILED: `error: contract execution failed
code: CONTRACT_ERROR
message: insufficient balance`,

    RPC_ERROR_RATE_LIMIT: {
        jsonrpc: '2.0',
        id: 1,
        error: {
            code: 429,
            message: 'Rate limit exceeded. Please retry after 60 seconds.',
        },
    },

    RPC_ERROR_INVALID_PARAMS: {
        jsonrpc: '2.0',
        id: 1,
        error: {
            code: -32602,
            message: 'Invalid params: missing required field "contractId"',
        },
    },

    // ── State snapshots ──────────────────────────────────────

    STATE_SNAPSHOT_BEFORE: {
        capturedAt: '2024-01-01T12:00:00.000Z',
        source: 'before',
        entries: [
            { key: 'balance_alice', value: 1000, contractId: 'CTOKEN123' },
            { key: 'balance_bob', value: 500, contractId: 'CTOKEN123' },
            { key: 'total_supply', value: 1500, contractId: 'CTOKEN123' },
        ],
    } as StateSnapshot,

    STATE_SNAPSHOT_AFTER: {
        capturedAt: '2024-01-01T12:00:01.000Z',
        source: 'after',
        entries: [
            { key: 'balance_alice', value: 900, contractId: 'CTOKEN123' },
            { key: 'balance_bob', value: 600, contractId: 'CTOKEN123' },
            { key: 'total_supply', value: 1500, contractId: 'CTOKEN123' },
        ],
    } as StateSnapshot,

    STATE_SNAPSHOT_WITH_CREATION: {
        capturedAt: '2024-01-01T12:00:01.000Z',
        source: 'after',
        entries: [
            { key: 'balance_alice', value: 1000, contractId: 'CTOKEN123' },
            { key: 'balance_bob', value: 500, contractId: 'CTOKEN123' },
            { key: 'balance_charlie', value: 100, contractId: 'CTOKEN123' },
            { key: 'total_supply', value: 1600, contractId: 'CTOKEN123' },
        ],
    } as StateSnapshot,

    STATE_SNAPSHOT_WITH_DELETION: {
        capturedAt: '2024-01-01T12:00:01.000Z',
        source: 'after',
        entries: [
            { key: 'balance_alice', value: 1000, contractId: 'CTOKEN123' },
            { key: 'total_supply', value: 1000, contractId: 'CTOKEN123' },
        ],
    } as StateSnapshot,

    // ── Test contracts ───────────────────────────────────────

    TEST_CONTRACT_ID: 'CTEST1234567890123456789012345678901234567890123456789012345',
    TEST_CONTRACT_ID_2: 'CTEST2234567890123456789012345678901234567890123456789012345',

    // ── Test parameters ──────────────────────────────────────

    TRANSFER_PARAMS: {
        from: 'GABC123',
        to: 'GXYZ789',
        amount: 100,
    },

    MINT_PARAMS: {
        to: 'GABC123',
        amount: 1000,
    },

    COMPLEX_PARAMS: {
        nested: {
            field1: 'value1',
            field2: 42,
            array: [1, 2, 3],
        },
        flag: true,
    },

    // ── Expected results ─────────────────────────────────────

    EXPECTED_TRANSFER_RESULT: {
        success: true,
        result: true,
        resourceUsage: {
            cpuInstructions: 1234567,
            memoryBytes: 8192,
        },
    } as SimulationResult,

    EXPECTED_MINT_RESULT: {
        success: true,
        result: { balance: 1000 },
        resourceUsage: {
            cpuInstructions: 987654,
            memoryBytes: 4096,
        },
    } as SimulationResult,

    // ── Cache test data ──────────────────────────────────────

    CACHE_KEY_PARAMS: {
        backend: 'cli' as const,
        contractId: 'CTEST1234567890123456789012345678901234567890123456789012345',
        functionName: 'transfer',
        args: [{ from: 'GABC123', to: 'GXYZ789', amount: 100 }],
        network: 'testnet',
        source: 'dev',
    },

    // ── History test data ────────────────────────────────────

    HISTORY_ENTRY_SUCCESS: {
        contractId: 'CTEST1234567890123456789012345678901234567890123456789012345',
        functionName: 'transfer',
        args: [{ from: 'GABC123', to: 'GXYZ789', amount: 100 }],
        outcome: 'success' as const,
        result: true,
        network: 'testnet',
        source: 'dev',
        method: 'cli' as const,
        durationMs: 1234,
    },

    HISTORY_ENTRY_FAILURE: {
        contractId: 'CTEST1234567890123456789012345678901234567890123456789012345',
        functionName: 'transfer',
        args: [{ from: 'GABC123', to: 'GXYZ789', amount: 999999 }],
        outcome: 'failure' as const,
        error: 'insufficient balance',
        errorType: 'CONTRACT_ERROR',
        network: 'testnet',
        source: 'dev',
        method: 'cli' as const,
        durationMs: 567,
    },
};

/**
 * Factory functions for creating test data with variations
 */
export class SimulationFixtureFactory {
    static createSuccessResult(overrides: Partial<SimulationResult> = {}): SimulationResult {
        return {
            success: true,
            result: 'success',
            resourceUsage: {
                cpuInstructions: 1000000,
                memoryBytes: 4096,
            },
            ...overrides,
        };
    }

    static createFailureResult(
        error: string,
        overrides: Partial<SimulationResult> = {}
    ): SimulationResult {
        return {
            success: false,
            error,
            errorSummary: error.split('\n')[0],
            errorType: 'execution',
            ...overrides,
        };
    }

    static createStateSnapshot(
        entries: Array<{ key: string; value: unknown; contractId?: string }>,
        source: string = 'test'
    ): StateSnapshot {
        return {
            capturedAt: new Date().toISOString(),
            source,
            entries,
        };
    }

    static createStateDiff(
        before: StateSnapshot,
        after: StateSnapshot
    ): StateDiff {
        const beforeMap = new Map(before.entries.map(e => [e.key, e]));
        const afterMap = new Map(after.entries.map(e => [e.key, e]));

        const created = after.entries.filter(e => !beforeMap.has(e.key));
        const deleted = before.entries.filter(e => !afterMap.has(e.key));
        const modified = after.entries.filter(e => {
            const beforeEntry = beforeMap.get(e.key);
            return beforeEntry && JSON.stringify(beforeEntry.value) !== JSON.stringify(e.value);
        });

        return {
            before,
            after,
            created: created.map(e => ({
                type: 'created',
                key: e.key,
                contractId: e.contractId,
                afterValue: e.value,
                afterEntry: e,
            })),
            modified: modified.map(e => ({
                type: 'modified',
                key: e.key,
                contractId: e.contractId,
                beforeValue: beforeMap.get(e.key)!.value,
                afterValue: e.value,
                beforeEntry: beforeMap.get(e.key)!,
                afterEntry: e,
            })),
            deleted: deleted.map(e => ({
                type: 'deleted',
                key: e.key,
                contractId: e.contractId,
                beforeValue: e.value,
                beforeEntry: e,
            })),
            unchangedKeys: after.entries
                .filter(e => {
                    const beforeEntry = beforeMap.get(e.key);
                    return beforeEntry && JSON.stringify(beforeEntry.value) === JSON.stringify(e.value);
                })
                .map(e => e.key),
            summary: {
                totalEntriesBefore: before.entries.length,
                totalEntriesAfter: after.entries.length,
                created: created.length,
                modified: modified.length,
                deleted: deleted.length,
                unchanged: after.entries.length - created.length - modified.length,
                totalChanges: created.length + modified.length + deleted.length,
            },
            hasChanges: created.length + modified.length + deleted.length > 0,
        };
    }
}
