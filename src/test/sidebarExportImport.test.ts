// ============================================================
// src/test/sidebarExportImport.test.ts
// Unit tests for the sidebar export / import system.
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import {
    SidebarExportFile,
    ExportedContract,
    EXPORT_FORMAT_VERSION,
    SUPPORTED_VERSIONS,
    VALID_NETWORKS,
    ImportSelection,
} from '../types/sidebarExport';

import {
    buildExportPayload,
    serializeExport,
    exportSidebar,
    ExportableContract,
} from '../services/sidebarExportService';

import {
    parseExportFile,
    validateAndPreview,
    applyImport,
    formatImportPreview,
    ExistingContract,
} from '../services/sidebarImportService';

// ── Silent logger for tests ───────────────────────────────────

const silentLogger = {
    info: () => { },
    warn: () => { },
    error: () => { },
    debug: () => { },
};

// ── Test runner ───────────────────────────────────────────────

type TestFn = () => Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn) {
    tests.push({ name, fn });
}

// ── Helpers ───────────────────────────────────────────────────

function makeContract(overrides: Partial<ExportableContract> = {}): ExportableContract {
    return {
        name: 'hello_world',
        path: '/workspace/contracts/hello_world/Cargo.toml',
        isBuilt: true,
        network: 'testnet',
        source: 'dev',
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
        isPinned: false,
        localVersion: '0.1.0',
        deployedVersion: '0.1.0',
        ...overrides,
    };
}

function makeExportFile(overrides: Partial<SidebarExportFile> = {}): SidebarExportFile {
    return {
        version: EXPORT_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        workspaceId: 'test-workspace',
        contracts: [
            {
                id: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
                name: 'hello_world',
                address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
                network: 'testnet',
                config: { source: 'dev' },
            },
        ],
        ...overrides,
    };
}

function makeExisting(overrides: Partial<ExistingContract> = {}): ExistingContract {
    return {
        id: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
        name: 'hello_world',
        address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
        network: 'testnet',
        ...overrides,
    };
}

// ═══════════════════════════════════════════════════════════════
// EXPORT TESTS
// ═══════════════════════════════════════════════════════════════

test('buildExportPayload: creates valid structure', async () => {
    const payload = buildExportPayload({
        contracts: [makeContract()],
        workspaceId: 'my-project',
        logger: silentLogger,
    });
    assert.strictEqual(payload.version, EXPORT_FORMAT_VERSION);
    assert.strictEqual(payload.workspaceId, 'my-project');
    assert.strictEqual(payload.contracts.length, 1);
    assert.ok(payload.exportedAt);
});

test('buildExportPayload: maps contract fields correctly', async () => {
    const payload = buildExportPayload({
        contracts: [makeContract({ name: 'token', contractId: 'CTOKEN123' + 'A'.repeat(47) })],
        workspaceId: 'ws',
        logger: silentLogger,
    });
    const c = payload.contracts[0];
    assert.strictEqual(c.name, 'token');
    assert.strictEqual(c.id, 'CTOKEN123' + 'A'.repeat(47));
    assert.strictEqual(c.address, 'CTOKEN123' + 'A'.repeat(47));
    assert.strictEqual(c.network, 'testnet');
});

test('buildExportPayload: strips runtime fields into config', async () => {
    const payload = buildExportPayload({
        contracts: [makeContract({ isPinned: true, source: 'alice', localVersion: '1.0.0' })],
        workspaceId: 'ws',
        logger: silentLogger,
    });
    const config = payload.contracts[0].config;
    assert.strictEqual(config.isPinned, true);
    assert.strictEqual(config.source, 'alice');
    assert.strictEqual(config.localVersion, '1.0.0');
});

test('buildExportPayload: handles contract without contractId', async () => {
    const payload = buildExportPayload({
        contracts: [makeContract({ contractId: undefined })],
        workspaceId: 'ws',
        logger: silentLogger,
    });
    const c = payload.contracts[0];
    assert.ok(c.id.startsWith('local:'));
    assert.strictEqual(c.address, '');
});

test('buildExportPayload: empty contracts array', async () => {
    const payload = buildExportPayload({
        contracts: [],
        workspaceId: 'ws',
        logger: silentLogger,
    });
    assert.strictEqual(payload.contracts.length, 0);
});

test('serializeExport: produces valid JSON', async () => {
    const payload = buildExportPayload({
        contracts: [makeContract()],
        workspaceId: 'ws',
        logger: silentLogger,
    });
    const json = serializeExport(payload);
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.version, EXPORT_FORMAT_VERSION);
    assert.strictEqual(parsed.contracts.length, 1);
});

test('exportSidebar: convenience function works', async () => {
    const json = exportSidebar({
        contracts: [makeContract()],
        workspaceId: 'ws',
        logger: silentLogger,
    });
    const parsed = JSON.parse(json);
    assert.ok(parsed.version);
    assert.ok(Array.isArray(parsed.contracts));
});

// ═══════════════════════════════════════════════════════════════
// PARSE TESTS
// ═══════════════════════════════════════════════════════════════

test('parseExportFile: valid JSON parses correctly', async () => {
    const file = makeExportFile();
    const json = JSON.stringify(file);
    const parsed = parseExportFile(json);
    assert.strictEqual(parsed.version, EXPORT_FORMAT_VERSION);
});

test('parseExportFile: empty string throws', async () => {
    try {
        parseExportFile('');
        assert.fail('Should have thrown');
    } catch (e) {
        assert.ok((e as Error).message.includes('empty'));
    }
});

test('parseExportFile: invalid JSON throws', async () => {
    try {
        parseExportFile('{ broken json ...');
        assert.fail('Should have thrown');
    } catch (e) {
        assert.ok((e as Error).message.includes('Invalid JSON'));
    }
});

test('parseExportFile: array root throws', async () => {
    try {
        parseExportFile('[]');
        assert.fail('Should have thrown');
    } catch (e) {
        assert.ok((e as Error).message.includes('object'));
    }
});

test('parseExportFile: null root throws', async () => {
    try {
        parseExportFile('null');
        assert.fail('Should have thrown');
    } catch (e) {
        assert.ok((e as Error).message.includes('object'));
    }
});

// ═══════════════════════════════════════════════════════════════
// VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════

test('validateAndPreview: valid file passes', async () => {
    const file = makeExportFile();
    const result = validateAndPreview(file, [], silentLogger);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.preview.newContracts.length, 1);
});

test('validateAndPreview: missing version fails', async () => {
    const file = makeExportFile({ version: '' });
    const result = validateAndPreview(file, [], silentLogger);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'MISSING_VERSION'));
});

test('validateAndPreview: unsupported version fails', async () => {
    const file = makeExportFile({ version: '99.0' });
    const result = validateAndPreview(file, [], silentLogger);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'UNSUPPORTED_VERSION'));
});

test('validateAndPreview: missing contracts array fails', async () => {
    const file = makeExportFile({ contracts: undefined as any });
    const result = validateAndPreview(file, [], silentLogger);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'MISSING_CONTRACTS'));
});

test('validateAndPreview: invalid contract missing id', async () => {
    const file = makeExportFile({
        contracts: [{ id: '', name: 'test', address: 'CADDR', network: 'testnet', config: {} }],
    });
    const result = validateAndPreview(file, [], silentLogger);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'INVALID_CONTRACT_ID'));
});

test('validateAndPreview: invalid contract missing name', async () => {
    const file = makeExportFile({
        contracts: [{ id: 'CID', name: '', address: 'CADDR', network: 'testnet', config: {} }],
    });
    const result = validateAndPreview(file, [], silentLogger);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'INVALID_CONTRACT_NAME'));
});

test('validateAndPreview: invalid network is a warning', async () => {
    const file = makeExportFile({
        contracts: [{
            id: 'CID',
            name: 'test',
            address: 'CADDR',
            network: 'unknownnet',
            config: {},
        }],
    });
    const result = validateAndPreview(file, [], silentLogger);
    assert.strictEqual(result.valid, true); // warning, not error
    assert.ok(result.warnings.some(w => w.code === 'UNKNOWN_NETWORK'));
});

test('validateAndPreview: duplicate IDs in file warned', async () => {
    const c = { id: 'CID', name: 'a', address: 'CADDR1', network: 'testnet', config: {} };
    const file = makeExportFile({ contracts: [c, { ...c, address: 'CADDR2' }] });
    const result = validateAndPreview(file, [], silentLogger);
    assert.ok(result.warnings.some(w => w.code === 'DUPLICATE_ID_IN_FILE'));
});

test('validateAndPreview: duplicate addresses in file warned', async () => {
    const file = makeExportFile({
        contracts: [
            { id: 'CID1', name: 'a', address: 'SAME_ADDR', network: 'testnet', config: {} },
            { id: 'CID2', name: 'b', address: 'SAME_ADDR', network: 'testnet', config: {} },
        ],
    });
    const result = validateAndPreview(file, [], silentLogger);
    assert.ok(result.warnings.some(w => w.code === 'DUPLICATE_ADDRESS_IN_FILE'));
});

test('validateAndPreview: conflict by ID detected', async () => {
    const file = makeExportFile();
    const existing = [makeExisting()]; // same ID as in file
    const result = validateAndPreview(file, existing, silentLogger);
    assert.strictEqual(result.preview.conflicts.length, 1);
    assert.strictEqual(result.preview.conflicts[0].reason, 'duplicate_id');
    assert.strictEqual(result.preview.newContracts.length, 0);
});

test('validateAndPreview: conflict by address detected', async () => {
    const file = makeExportFile({
        contracts: [{
            id: 'C_DIFFERENT_ID',
            name: 'test',
            address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
            network: 'testnet',
            config: {},
        }],
    });
    const existing = [makeExisting()]; // same address
    const result = validateAndPreview(file, existing, silentLogger);
    assert.strictEqual(result.preview.conflicts.length, 1);
    assert.strictEqual(result.preview.conflicts[0].reason, 'duplicate_address');
});

test('validateAndPreview: new contract with no conflicts', async () => {
    const file = makeExportFile({
        contracts: [{
            id: 'C_NEW_ID',
            name: 'new_contract',
            address: 'C_NEW_ADDR',
            network: 'testnet',
            config: {},
        }],
    });
    const result = validateAndPreview(file, [makeExisting()], silentLogger);
    assert.strictEqual(result.preview.newContracts.length, 1);
    assert.strictEqual(result.preview.conflicts.length, 0);
});

test('validateAndPreview: invalid entries separated from valid', async () => {
    const file = makeExportFile({
        contracts: [
            { id: 'GOOD', name: 'good', address: 'ADDR', network: 'testnet', config: {} },
            { id: '', name: '', address: 'ADDR2', network: 'testnet', config: {} }, // invalid
        ],
    });
    const result = validateAndPreview(file, [], silentLogger);
    assert.strictEqual(result.preview.newContracts.length, 1);
    assert.strictEqual(result.preview.invalidEntries.length, 1);
});

// ═══════════════════════════════════════════════════════════════
// APPLY IMPORT TESTS
// ═══════════════════════════════════════════════════════════════

test('applyImport: imports new contracts', async () => {
    const file = makeExportFile({
        contracts: [{
            id: 'C_NEW',
            name: 'new_contract',
            address: '',
            network: 'testnet',
            config: {},
        }],
    });
    const preview = validateAndPreview(file, [], silentLogger).preview;
    let applied: ExistingContract[] = [];

    const result = await applyImport(
        preview,
        { selectedIds: ['C_NEW'], conflictResolutions: {}, renamedNames: {} },
        {
            currentContracts: [],
            applyContracts: async (contracts) => { applied = contracts; },
        },
        silentLogger,
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.importedCount, 1);
    assert.strictEqual(applied.length, 1);
});

test('applyImport: skips unselected contracts', async () => {
    const file = makeExportFile({
        contracts: [
            { id: 'C1', name: 'a', address: '', network: 'testnet', config: {} },
            { id: 'C2', name: 'b', address: '', network: 'testnet', config: {} },
        ],
    });
    const preview = validateAndPreview(file, [], silentLogger).preview;
    let applied: ExistingContract[] = [];

    const result = await applyImport(
        preview,
        { selectedIds: ['C1'], conflictResolutions: {}, renamedNames: {} },
        {
            currentContracts: [],
            applyContracts: async (contracts) => { applied = contracts; },
        },
        silentLogger,
    );

    assert.strictEqual(result.importedCount, 1);
    assert.strictEqual(result.skippedCount, 1);
    assert.strictEqual(applied.length, 1);
});

test('applyImport: overwrite conflict replaces existing', async () => {
    const existingContract = makeExisting({ name: 'old_name' });
    const file = makeExportFile({
        contracts: [{
            id: existingContract.id,
            name: 'new_name',
            address: existingContract.address,
            network: 'testnet',
            config: {},
        }],
    });
    const preview = validateAndPreview(file, [existingContract], silentLogger).preview;
    let applied: ExistingContract[] = [];

    const result = await applyImport(
        preview,
        {
            selectedIds: [existingContract.id],
            conflictResolutions: { [existingContract.id]: 'overwrite' },
            renamedNames: {},
        },
        {
            currentContracts: [existingContract],
            applyContracts: async (contracts) => { applied = contracts; },
        },
        silentLogger,
    );

    assert.strictEqual(result.overwrittenCount, 1);
    assert.strictEqual(applied[0].name, 'new_name');
});

test('applyImport: rename conflict adds new entry', async () => {
    const existingContract = makeExisting();
    const file = makeExportFile({
        contracts: [{
            id: existingContract.id,
            name: 'duplicate',
            address: existingContract.address,
            network: 'testnet',
            config: {},
        }],
    });
    const preview = validateAndPreview(file, [existingContract], silentLogger).preview;
    let applied: ExistingContract[] = [];

    const result = await applyImport(
        preview,
        {
            selectedIds: [existingContract.id],
            conflictResolutions: { [existingContract.id]: 'rename' },
            renamedNames: { [existingContract.id]: 'duplicate (v2)' },
        },
        {
            currentContracts: [existingContract],
            applyContracts: async (contracts) => { applied = contracts; },
        },
        silentLogger,
    );

    assert.strictEqual(result.renamedCount, 1);
    assert.strictEqual(applied.length, 2); // original + renamed
    assert.ok(applied.some(c => c.name === 'duplicate (v2)'));
});

test('applyImport: skip conflict keeps existing', async () => {
    const existingContract = makeExisting();
    const file = makeExportFile();
    const preview = validateAndPreview(file, [existingContract], silentLogger).preview;
    let applied: ExistingContract[] = [];

    const result = await applyImport(
        preview,
        {
            selectedIds: [existingContract.id],
            conflictResolutions: { [existingContract.id]: 'skip' },
            renamedNames: {},
        },
        {
            currentContracts: [existingContract],
            applyContracts: async (contracts) => { applied = contracts; },
        },
        silentLogger,
    );

    assert.strictEqual(result.skippedCount, 1);
    assert.strictEqual(applied.length, 1);
    assert.strictEqual(applied[0].name, existingContract.name);
});

test('applyImport: rollback on failure (no partial state)', async () => {
    const file = makeExportFile({
        contracts: [{ id: 'C1', name: 'a', address: '', network: 'testnet', config: {} }],
    });
    const preview = validateAndPreview(file, [], silentLogger).preview;
    let applyCalled = false;

    const result = await applyImport(
        preview,
        { selectedIds: ['C1'], conflictResolutions: {}, renamedNames: {} },
        {
            currentContracts: [],
            applyContracts: async () => {
                applyCalled = true;
                throw new Error('Storage write failed');
            },
        },
        silentLogger,
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.errors.length, 1);
    assert.ok(result.errors[0].includes('Storage write failed'));
    assert.strictEqual(applyCalled, true); // it tried, but raised an error result
});

test('applyImport: cancellation (empty selection)', async () => {
    const file = makeExportFile();
    const preview = validateAndPreview(file, [], silentLogger).preview;
    let applied: ExistingContract[] = [];

    const result = await applyImport(
        preview,
        { selectedIds: [], conflictResolutions: {}, renamedNames: {} }, // nothing selected
        {
            currentContracts: [makeExisting()],
            applyContracts: async (contracts) => { applied = contracts; },
        },
        silentLogger,
    );

    assert.strictEqual(result.importedCount, 0);
    assert.strictEqual(result.skippedCount, 1); // the one new contract was skipped
});

// ═══════════════════════════════════════════════════════════════
// FORMAT TESTS
// ═══════════════════════════════════════════════════════════════

test('formatImportPreview: contains summary', async () => {
    const file = makeExportFile({
        contracts: [
            { id: 'NEW', name: 'new', address: '', network: 'testnet', config: {} },
        ],
    });
    const result = validateAndPreview(file, [], silentLogger);
    const text = formatImportPreview(result.preview);
    assert.ok(text.includes('Import Preview'));
    assert.ok(text.includes('new'));
});

test('formatImportPreview: shows conflicts', async () => {
    const file = makeExportFile();
    const result = validateAndPreview(file, [makeExisting()], silentLogger);
    const text = formatImportPreview(result.preview);
    assert.ok(text.includes('Conflicts'));
    assert.ok(text.includes('duplicate'));
});

// ═══════════════════════════════════════════════════════════════
// ROUND-TRIP TEST
// ═══════════════════════════════════════════════════════════════

test('round-trip: export then import produces valid preview', async () => {
    const contracts: ExportableContract[] = [
        makeContract({ name: 'alpha', contractId: 'CALPHA' + 'A'.repeat(50) }),
        makeContract({ name: 'beta', contractId: 'CBETA0' + 'B'.repeat(50) }),
    ];

    const json = exportSidebar({ contracts, workspaceId: 'rt', logger: silentLogger });
    const parsed = parseExportFile(json);
    const result = validateAndPreview(parsed, [], silentLogger);

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.preview.newContracts.length, 2);
    assert.strictEqual(result.preview.conflicts.length, 0);
});

test('round-trip: export then import with existing conflicts', async () => {
    const contracts: ExportableContract[] = [
        makeContract({ name: 'alpha', contractId: 'CALPHA' + 'A'.repeat(50) }),
    ];

    const json = exportSidebar({ contracts, workspaceId: 'rt', logger: silentLogger });
    const parsed = parseExportFile(json);

    const existing: ExistingContract[] = [{
        id: 'CALPHA' + 'A'.repeat(50),
        name: 'alpha',
        address: 'CALPHA' + 'A'.repeat(50),
        network: 'testnet',
    }];

    const result = validateAndPreview(parsed, existing, silentLogger);
    assert.strictEqual(result.preview.conflicts.length, 1);
    assert.strictEqual(result.preview.newContracts.length, 0);
});

// ═══════════════════════════════════════════════════════════════
// VERSION MISMATCH TEST
// ═══════════════════════════════════════════════════════════════

test('version mismatch: future version rejected', async () => {
    const file = makeExportFile({ version: '2.0' });
    const result = validateAndPreview(file, [], silentLogger);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'UNSUPPORTED_VERSION'));
});

// ═══════════════════════════════════════════════════════════════
// CORRUPTED FILE TESTS
// ═══════════════════════════════════════════════════════════════

test('corrupted: truncated JSON throws on parse', async () => {
    try {
        parseExportFile('{ "version": "1.0", "contracts": [');
        assert.fail('Should have thrown');
    } catch (e) {
        assert.ok((e as Error).message.includes('Invalid JSON'));
    }
});

test('corrupted: contracts field is object not array', async () => {
    const file = makeExportFile({ contracts: {} as any });
    const result = validateAndPreview(file, [], silentLogger);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'MISSING_CONTRACTS'));
});

// ═══════════════════════════════════════════════════════════════
// Test Runner
// ═══════════════════════════════════════════════════════════════

async function run() {
    let passed = 0;
    let failed = 0;

    console.log('\nsidebarExportImport unit tests');
    console.log('═'.repeat(50));

    for (const { name, fn } of tests) {
        try {
            await fn();
            passed += 1;
            console.log(`  [ok] ${name}`);
        } catch (err) {
            failed += 1;
            console.error(`  [FAIL] ${name}`);
            console.error(`         ${err instanceof Error ? err.message : String(err)}`);
            if (err instanceof Error && err.stack) {
                const stackLines = err.stack.split('\n').slice(1, 4);
                for (const line of stackLines) {
                    console.error(`         ${line.trim()}`);
                }
            }
        }
    }

    console.log('═'.repeat(50));
    console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch(err => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
