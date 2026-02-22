// ============================================================
// src/test/keypairManagementService.test.ts
// Unit tests for secure keypair management utilities.
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

import { KeypairManagementService } from '../services/keypairManagementService';

function createMockContext() {
    const secretStore = new Map<string, string>();
    const globalStore = new Map<string, unknown>();

    return {
        context: {
            secrets: {
                get: async (key: string) => secretStore.get(key),
                store: async (key: string, value: string) => {
                    secretStore.set(key, value);
                },
                delete: async (key: string) => {
                    secretStore.delete(key);
                },
            },
            globalState: {
                get: <T>(key: string, defaultValue: T) =>
                    (globalStore.get(key) as T) ?? defaultValue,
                update: async (key: string, value: unknown) => {
                    globalStore.set(key, value);
                },
            },
        },
        secretStore,
        globalStore,
    };
}

async function testLoadJsonKeypairFile() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keypair-test-'));
    try {
        const filePath = path.join(tmpDir, 'keypair.json');
        fs.writeFileSync(filePath, JSON.stringify({
            secretKey: 'SJSONSECRET',
            publicKey: 'GJSONPUBLIC',
        }));

        const { context } = createMockContext();
        const service = new KeypairManagementService(context as any);
        const result = service.loadKeypairFromFile(filePath);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.keypair!.secretKey, 'SJSONSECRET');
        assert.strictEqual(result.keypair!.publicKey, 'GJSONPUBLIC');
        console.log('  ✓ loads keypair from JSON file');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function testLoadEnvKeypairFile() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keypair-test-'));
    try {
        const filePath = path.join(tmpDir, '.env');
        const secret = `S${'A'.repeat(55)}`;
        fs.writeFileSync(filePath, `SECRET_KEY=${secret}`);

        const { context } = createMockContext();
        const service = new KeypairManagementService(context as any);
        const result = service.loadKeypairFromFile(filePath);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.keypair!.secretKey, secret);
        console.log('  ✓ loads keypair from env-style file');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function testStoreAndRetrieveKeypair() {
    const { context } = createMockContext();
    const service = new KeypairManagementService(context as any);

    await service.storeKeypair(
        'deploy-mainnet',
        { secretKey: 'SSTOREDKEY', publicKey: 'GSTOREDPUBLIC' },
        'manual'
    );

    const loaded = await service.getStoredKeypair('deploy-mainnet');
    assert.ok(loaded, 'stored keypair should load');
    assert.strictEqual(loaded!.secretKey, 'SSTOREDKEY');
    assert.strictEqual(loaded!.publicKey, 'GSTOREDPUBLIC');

    const aliases = service.listStoredKeypairs();
    assert.strictEqual(aliases.length, 1);
    assert.strictEqual(aliases[0].alias, 'deploy-mainnet');
    console.log('  ✓ stores and retrieves keypairs from secure storage');
}

async function testDeleteStoredKeypair() {
    const { context } = createMockContext();
    const service = new KeypairManagementService(context as any);

    await service.storeKeypair('to-delete', { secretKey: 'SDELETE' }, 'manual');
    const deleted = await service.deleteStoredKeypair('to-delete');
    assert.strictEqual(deleted, true);

    const loaded = await service.getStoredKeypair('to-delete');
    assert.strictEqual(loaded, undefined);
    console.log('  ✓ deletes stored keypair metadata and secret');
}

async function run() {
    const tests: Array<() => Promise<void>> = [
        testLoadJsonKeypairFile,
        testLoadEnvKeypairFile,
        testStoreAndRetrieveKeypair,
        testDeleteStoredKeypair,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\n● KeypairManagementService');
    for (const test of tests) {
        try {
            await test();
            passed++;
        } catch (err) {
            failed++;
            console.error(`  ✕ ${test.name}`);
            console.error(`    ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(50));

    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch((err) => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
