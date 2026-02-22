// src/test/contractAbi.test.ts
// Unit tests for contract ABI generation, storage, validation,
// import/export, and staleness detection.
// No vscode dependency — pure TypeScript modules only.

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { ContractAbiService } from '../services/contractAbiService';
import { ContractFunction, FunctionParameter } from '../services/contractInspector';
import { ABI_SCHEMA_VERSION, ContractAbi, AbiExportPayload } from '../types/contractAbi';

// ── Test helpers ──────────────────────────────────────────────

/** In-memory workspace state mock (same pattern as other tests). */
function createMockContext() {
    const store: Record<string, unknown> = {};
    return {
        workspaceState: {
            get<T>(key: string, defaultValue: T): T {
                return (store[key] as T) ?? defaultValue;
            },
            update(key: string, value: unknown): Promise<void> {
                store[key] = value;
                return Promise.resolve();
            },
        },
    };
}

const logs: string[] = [];
function createMockOutput() {
    return { appendLine: (msg: string) => { logs.push(msg); } };
}

function makeFn(name: string, params: FunctionParameter[], desc?: string): ContractFunction {
    return { name, parameters: params, description: desc };
}

function sampleFunctions(): ContractFunction[] {
    return [
        makeFn('transfer', [
            { name: 'from', type: 'Address', required: true },
            { name: 'to', type: 'Address', required: true },
            { name: 'amount', type: 'i128', required: true },
        ], 'Transfer tokens'),
        makeFn('balance', [
            { name: 'account', type: 'Address', required: true },
        ], 'Get balance'),
    ];
}

// ── Test: ABI generation ──────────────────────────────────────

async function testGenerateAbiBasic() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());
    const functions = sampleFunctions();

    const abi = svc.generateAbi('CABC123', functions, { network: 'testnet', source: 'dev' });

    assert.strictEqual(abi.schemaVersion, ABI_SCHEMA_VERSION);
    assert.strictEqual(abi.contractId, 'CABC123');
    assert.strictEqual(abi.version, '1.0.0');
    assert.strictEqual(abi.functions.length, 2);
    assert.strictEqual(abi.network, 'testnet');
    assert.strictEqual(abi.source, 'dev');
    assert.ok(abi.generatedAt);
    console.log('  [ok] generateAbi: creates correct ABI structure');
}

async function testGenerateAbiParsesParameters() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const abi = svc.generateAbi('CABC123', sampleFunctions());
    const transferFn = abi.functions.find(f => f.name === 'transfer')!;

    assert.strictEqual(transferFn.parameters.length, 3);
    assert.strictEqual(transferFn.parameters[0].name, 'from');
    assert.strictEqual(transferFn.parameters[0].sorobanType.kind, 'primitive');
    assert.strictEqual(transferFn.description, 'Transfer tokens');
    console.log('  [ok] generateAbi: parses function parameters correctly');
}

async function testGenerateAbiCustomVersion() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const abi = svc.generateAbi('CABC123', sampleFunctions(), { version: '2.5.0' });
    assert.strictEqual(abi.version, '2.5.0');
    console.log('  [ok] generateAbi: respects custom version');
}

async function testGenerateAbiEmptyFunctions() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const abi = svc.generateAbi('CABC123', []);
    assert.strictEqual(abi.functions.length, 0);
    console.log('  [ok] generateAbi: handles empty function list');
}

// ── Test: Store / Retrieve ────────────────────────────────────

async function testStoreAndGetAbi() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const abi = svc.generateAbi('CABC123', sampleFunctions());
    await svc.storeAbi(abi);

    const retrieved = svc.getAbi('CABC123');
    assert.ok(retrieved);
    assert.strictEqual(retrieved!.contractId, 'CABC123');
    assert.strictEqual(retrieved!.functions.length, 2);
    console.log('  [ok] storeAbi + getAbi: roundtrip works');
}

async function testGetAbiNotFound() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const result = svc.getAbi('NONEXISTENT');
    assert.strictEqual(result, undefined);
    console.log('  [ok] getAbi: returns undefined for missing contract');
}

async function testGetAllAbis() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    await svc.storeAbi(svc.generateAbi('CONTRACT_A', sampleFunctions()));
    await svc.storeAbi(svc.generateAbi('CONTRACT_B', sampleFunctions()));

    const all = svc.getAllAbis();
    assert.strictEqual(all.length, 2);
    const ids = all.map(a => a.contractId).sort();
    assert.deepStrictEqual(ids, ['CONTRACT_A', 'CONTRACT_B']);
    console.log('  [ok] getAllAbis: returns all stored ABIs');
}

async function testRemoveAbi() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    await svc.storeAbi(svc.generateAbi('CABC123', sampleFunctions()));

    const removed = await svc.removeAbi('CABC123');
    assert.strictEqual(removed, true);
    assert.strictEqual(svc.getAbi('CABC123'), undefined);
    console.log('  [ok] removeAbi: deletes stored ABI');
}

async function testRemoveAbiNotFound() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const removed = await svc.removeAbi('NONEXISTENT');
    assert.strictEqual(removed, false);
    console.log('  [ok] removeAbi: returns false for missing ABI');
}

async function testClearAllAbis() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    await svc.storeAbi(svc.generateAbi('A', sampleFunctions()));
    await svc.storeAbi(svc.generateAbi('B', sampleFunctions()));
    await svc.clearAllAbis();

    assert.strictEqual(svc.getAllAbis().length, 0);
    console.log('  [ok] clearAllAbis: removes all stored ABIs');
}

// ── Test: Export / Import ─────────────────────────────────────

async function testExportAbi() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    await svc.storeAbi(svc.generateAbi('CABC123', sampleFunctions()));
    const json = svc.exportAbi('CABC123');

    assert.ok(json);
    const parsed = JSON.parse(json!) as AbiExportPayload;
    assert.strictEqual(parsed.format, 'stellarSuite.contractAbi');
    assert.strictEqual(parsed.abis.length, 1);
    assert.strictEqual(parsed.abis[0].contractId, 'CABC123');
    console.log('  [ok] exportAbi: produces valid JSON payload');
}

async function testExportAbiNotFound() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const json = svc.exportAbi('NONEXISTENT');
    assert.strictEqual(json, undefined);
    console.log('  [ok] exportAbi: returns undefined for missing ABI');
}

async function testExportAllAbis() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    await svc.storeAbi(svc.generateAbi('A', sampleFunctions()));
    await svc.storeAbi(svc.generateAbi('B', sampleFunctions()));

    const json = svc.exportAllAbis();
    const parsed = JSON.parse(json) as AbiExportPayload;
    assert.strictEqual(parsed.format, 'stellarSuite.contractAbi');
    assert.strictEqual(parsed.abis.length, 2);
    console.log('  [ok] exportAllAbis: exports all stored ABIs');
}

async function testImportAbiRoundTrip() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    // Generate and export
    await svc.storeAbi(svc.generateAbi('CABC123', sampleFunctions()));
    const exported = svc.exportAbi('CABC123')!;

    // Clear and import
    await svc.clearAllAbis();
    const result = await svc.importAbi(exported);

    assert.strictEqual(result.imported, 1);
    assert.strictEqual(result.errors.length, 0);
    assert.ok(svc.getAbi('CABC123'));
    console.log('  [ok] importAbi: export → import round-trip works');
}

async function testImportAbiInvalidJson() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const result = await svc.importAbi('not valid json {{{');
    assert.strictEqual(result.imported, 0);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('Invalid JSON'));
    console.log('  [ok] importAbi: rejects invalid JSON');
}

async function testImportAbiWrongFormat() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const result = await svc.importAbi(JSON.stringify({ format: 'wrong', abis: [] }));
    assert.strictEqual(result.imported, 0);
    assert.ok(result.errors[0].includes('Invalid format'));
    console.log('  [ok] importAbi: rejects wrong format identifier');
}

async function testImportAbiWithInvalidEntry() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const payload: AbiExportPayload = {
        format: 'stellarSuite.contractAbi',
        exportedAt: new Date().toISOString(),
        abis: [
            { contractId: '', version: '1.0.0', schemaVersion: 1, functions: [], generatedAt: new Date().toISOString() } as ContractAbi,
        ],
    };

    const result = await svc.importAbi(JSON.stringify(payload));
    assert.strictEqual(result.imported, 0);
    assert.ok(result.errors.length > 0);
    console.log('  [ok] importAbi: rejects invalid ABI entries');
}

// ── Test: Validation ──────────────────────────────────────────

async function testValidateValidAbi() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const abi = svc.generateAbi('CABC123', sampleFunctions());
    const result = svc.validateAbi(abi);

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
    console.log('  [ok] validateAbi: valid ABI passes validation');
}

async function testValidateNullAbi() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const result = svc.validateAbi(null);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
    console.log('  [ok] validateAbi: null is rejected');
}

async function testValidateMissingFields() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const result = svc.validateAbi({ schemaVersion: 1 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('contractId')));
    assert.ok(result.errors.some(e => e.includes('version')));
    assert.ok(result.errors.some(e => e.includes('functions')));
    console.log('  [ok] validateAbi: detects missing required fields');
}

async function testValidateInvalidFunction() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const result = svc.validateAbi({
        schemaVersion: 1,
        contractId: 'CABC123',
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        functions: [{ name: '', parameters: [] }],
    });

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('functions[0]')));
    console.log('  [ok] validateAbi: detects invalid function entries');
}

// ── Test: Staleness / Versioning ──────────────────────────────

async function testIsStaleNoStoredAbi() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const stale = svc.isStale('CABC123', sampleFunctions());
    assert.strictEqual(stale, true);
    console.log('  [ok] isStale: returns true when no ABI is stored');
}

async function testIsStaleUnchanged() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());
    const functions = sampleFunctions();

    await svc.storeAbi(svc.generateAbi('CABC123', functions));
    const stale = svc.isStale('CABC123', functions);
    assert.strictEqual(stale, false);
    console.log('  [ok] isStale: returns false when ABI matches');
}

async function testIsStaleChanged() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    await svc.storeAbi(svc.generateAbi('CABC123', sampleFunctions()));

    const newFunctions = [
        ...sampleFunctions(),
        makeFn('mint', [{ name: 'amount', type: 'u64', required: true }]),
    ];
    const stale = svc.isStale('CABC123', newFunctions);
    assert.strictEqual(stale, true);
    console.log('  [ok] isStale: returns true when functions change');
}

async function testRefreshAbiWhenStale() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    const result = await svc.refreshAbi('CABC123', sampleFunctions());
    assert.strictEqual(result.wasRefreshed, true);
    assert.strictEqual(result.abi.contractId, 'CABC123');

    // Should now be stored
    assert.ok(svc.getAbi('CABC123'));
    console.log('  [ok] refreshAbi: generates and stores when no prior ABI');
}

async function testRefreshAbiWhenFresh() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());
    const functions = sampleFunctions();

    await svc.storeAbi(svc.generateAbi('CABC123', functions));
    const result = await svc.refreshAbi('CABC123', functions);

    assert.strictEqual(result.wasRefreshed, false);
    console.log('  [ok] refreshAbi: skips regeneration when ABI is current');
}

// ── Test: Store replaces existing ─────────────────────────────

async function testStoreReplacesExisting() {
    const ctx = createMockContext();
    const svc = new ContractAbiService(ctx, createMockOutput());

    await svc.storeAbi(svc.generateAbi('CABC123', sampleFunctions(), { version: '1.0.0' }));
    await svc.storeAbi(svc.generateAbi('CABC123', sampleFunctions(), { version: '2.0.0' }));

    const abi = svc.getAbi('CABC123');
    assert.strictEqual(abi!.version, '2.0.0');
    assert.strictEqual(svc.getAllAbis().length, 1);
    console.log('  [ok] storeAbi: replaces existing ABI for same contractId');
}

// ── Test Runner ───────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        testGenerateAbiBasic,
        testGenerateAbiParsesParameters,
        testGenerateAbiCustomVersion,
        testGenerateAbiEmptyFunctions,
        testStoreAndGetAbi,
        testGetAbiNotFound,
        testGetAllAbis,
        testRemoveAbi,
        testRemoveAbiNotFound,
        testClearAllAbis,
        testExportAbi,
        testExportAbiNotFound,
        testExportAllAbis,
        testImportAbiRoundTrip,
        testImportAbiInvalidJson,
        testImportAbiWrongFormat,
        testImportAbiWithInvalidEntry,
        testValidateValidAbi,
        testValidateNullAbi,
        testValidateMissingFields,
        testValidateInvalidFunction,
        testIsStaleNoStoredAbi,
        testIsStaleUnchanged,
        testIsStaleChanged,
        testRefreshAbiWhenStale,
        testRefreshAbiWhenFresh,
        testStoreReplacesExisting,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\ncontractAbi unit tests');
    for (const test of tests) {
        try {
            await test();
            passed += 1;
        } catch (err) {
            failed += 1;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch(err => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
