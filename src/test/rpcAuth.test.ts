declare function require(name: string): any;
declare const process: { exitCode?: number; env: Record<string, string | undefined> };

const assert = require('assert');

import { RpcAuthService, RpcAuthStore, RpcSecretStore } from '../services/rpcAuthService';
import { AuthMethodType } from '../types/rpcAuth';

// ── In-memory stores ──────────────────────────────────────────

class MemoryAuthStore implements RpcAuthStore {
    private data = new Map<string, unknown>();

    get<T>(key: string, defaultValue: T): T {
        return this.data.has(key) ? this.data.get(key) as T : defaultValue;
    }

    update<T>(key: string, value: T): Promise<void> {
        this.data.set(key, value);
        return Promise.resolve();
    }
}

class MemorySecretStore implements RpcSecretStore {
    private secrets = new Map<string, string>();

    getSecret(key: string): Promise<string | undefined> {
        return Promise.resolve(this.secrets.get(key));
    }

    storeSecret(key: string, value: string): Promise<void> {
        this.secrets.set(key, value);
        return Promise.resolve();
    }

    deleteSecret(key: string): Promise<void> {
        this.secrets.delete(key);
        return Promise.resolve();
    }
}

function createService(): RpcAuthService {
    return new RpcAuthService(new MemoryAuthStore(), new MemorySecretStore());
}

// ── Tests ─────────────────────────────────────────────────────

async function testDefaultStateIsEmpty() {
    const service = createService();
    const profiles = await service.getProfiles();
    assert.strictEqual(profiles.length, 0);
    assert.strictEqual(await service.getActiveProfileId(), undefined);
    assert.strictEqual(await service.getActiveProfile(), undefined);

    const headers = await service.getAuthHeaders();
    assert.deepStrictEqual(headers, {});
    console.log('  [ok] default state is empty');
}

async function testCreateApiKeyProfile() {
    const service = createService();
    const profile = await service.createProfile('My API', 'api-key', 'supersecret');

    assert.ok(profile.id);
    assert.strictEqual(profile.name, 'My API');
    assert.strictEqual(profile.type, 'api-key');

    const profiles = await service.getProfiles();
    assert.strictEqual(profiles.length, 1);
    console.log('  [ok] creates api-key profile');
}

async function testCreateBearerProfile() {
    const service = createService();
    await service.createProfile('Bearer', 'bearer-token', 'mytoken123');

    const profiles = await service.getProfiles();
    assert.strictEqual(profiles.length, 1);
    assert.strictEqual(profiles[0].type, 'bearer-token');
    console.log('  [ok] creates bearer-token profile');
}

async function testCreateBasicProfileRejectsWithoutUsername() {
    const service = createService();
    let failed = false;
    try {
        await service.createProfile('Basic', 'basic', 'mypassword');
    } catch (err) {
        failed = true;
        assert.ok((err as Error).message.includes('Username is required'));
    }
    assert.strictEqual(failed, true);
    console.log('  [ok] basic auth rejects missing username');
}

async function testCreateBasicProfile() {
    const service = createService();
    const profile = await service.createProfile('Basic', 'basic', 'mypassword', 'admin');
    assert.strictEqual(profile.username, 'admin');
    console.log('  [ok] creates basic auth profile');
}

async function testCreateCustomHeaderProfileRejectsWithoutHeaderName() {
    const service = createService();
    let failed = false;
    try {
        await service.createProfile('Custom', 'custom-header', 'token');
    } catch (err) {
        failed = true;
        assert.ok((err as Error).message.includes('Header name is required'));
    }
    assert.strictEqual(failed, true);
    console.log('  [ok] custom header auth rejects missing header name');
}

async function testCreateCustomHeaderProfile() {
    const service = createService();
    const profile = await service.createProfile('Custom', 'custom-header', 'token', undefined, 'X-My-Auth');
    assert.strictEqual(profile.headerName, 'X-My-Auth');
    console.log('  [ok] creates custom header auth profile');
}

async function testSetActiveProfile() {
    const service = createService();
    const profile = await service.createProfile('Active', 'api-key', 'key');
    await service.setActiveProfile(profile.id);

    assert.strictEqual(await service.getActiveProfileId(), profile.id);
    const active = await service.getActiveProfile();
    assert.strictEqual(active?.name, 'Active');
    console.log('  [ok] sets and gets active profile');
}

async function testAuthHeadersForApiKey() {
    const service = createService();
    const profile = await service.createProfile('API', 'api-key', 'my-api-key');
    await service.setActiveProfile(profile.id);

    const headers = await service.getAuthHeaders();
    assert.deepStrictEqual(headers, { 'X-Api-Key': 'my-api-key' });
    console.log('  [ok] generates correct headers for api-key');
}

async function testAuthHeadersForBearerToken() {
    const service = createService();
    const profile = await service.createProfile('Bearer', 'bearer-token', 'my-token');
    await service.setActiveProfile(profile.id);

    const headers = await service.getAuthHeaders();
    assert.deepStrictEqual(headers, { 'Authorization': 'Bearer my-token' });
    console.log('  [ok] generates correct headers for bearer-token');
}

async function testAuthHeadersForBasicAuth() {
    const service = createService();
    const profile = await service.createProfile('Basic', 'basic', 'pass', 'user');
    await service.setActiveProfile(profile.id);

    const headers = await service.getAuthHeaders();
    // 'user:pass' base64 encoded is 'dXNlcjpwYXNz'
    assert.deepStrictEqual(headers, { 'Authorization': 'Basic dXNlcjpwYXNz' });
    console.log('  [ok] generates correct headers for basic auth');
}

async function testAuthHeadersForCustomHeader() {
    const service = createService();
    const profile = await service.createProfile('Custom', 'custom-header', 'token', undefined, 'X-Secret');
    await service.setActiveProfile(profile.id);

    const headers = await service.getAuthHeaders();
    assert.deepStrictEqual(headers, { 'X-Secret': 'token' });
    console.log('  [ok] generates correct headers for custom-header');
}

async function testUpdateProfileName() {
    const service = createService();
    const profile = await service.createProfile('Original', 'api-key', 'secret');

    const updated = await service.updateProfile(profile.id, { name: 'Updated' });
    assert.strictEqual(updated.name, 'Updated');

    const profiles = await service.getProfiles();
    assert.strictEqual(profiles[0].name, 'Updated');
    console.log('  [ok] updates profile name');
}

async function testUpdateProfileSecret() {
    const service = createService();
    const profile = await service.createProfile('UpdateSec', 'bearer-token', 'old');
    await service.setActiveProfile(profile.id);

    await service.updateProfile(profile.id, { secret: 'new' });

    // Check that getAuthHeaders picks up the new secret without changing the active state
    const headers = await service.getAuthHeaders();
    assert.deepStrictEqual(headers, { 'Authorization': 'Bearer new' });
    console.log('  [ok] updates profile secret');
}

async function testDeleteProfile() {
    const service = createService();
    const profile = await service.createProfile('ToDelete', 'api-key', 'sec');
    await service.setActiveProfile(profile.id);

    await service.deleteProfile(profile.id);

    const profiles = await service.getProfiles();
    assert.strictEqual(profiles.length, 0);
    assert.strictEqual(await service.getActiveProfileId(), undefined);

    const headers = await service.getAuthHeaders();
    assert.deepStrictEqual(headers, {});
    console.log('  [ok] deletes profile and clears active state');
}

async function testSecretIsRemovedOnDelete() {
    // We pass our own memory store so we can inspect it
    const secretStore = new MemorySecretStore();
    const service = new RpcAuthService(new MemoryAuthStore(), secretStore);

    const profile = await service.createProfile('DelSec', 'api-key', 'secret_value');

    const secretKey = `rpcAuth.secret.${profile.id}`;
    assert.strictEqual(await secretStore.getSecret(secretKey), 'secret_value');

    await service.deleteProfile(profile.id);

    assert.strictEqual(await secretStore.getSecret(secretKey), undefined);
    console.log('  [ok] deletes secret from secure storage when profile is deleted');
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        testDefaultStateIsEmpty,
        testCreateApiKeyProfile,
        testCreateBearerProfile,
        testCreateBasicProfileRejectsWithoutUsername,
        testCreateBasicProfile,
        testCreateCustomHeaderProfileRejectsWithoutHeaderName,
        testCreateCustomHeaderProfile,
        testSetActiveProfile,
        testAuthHeadersForApiKey,
        testAuthHeadersForBearerToken,
        testAuthHeadersForBasicAuth,
        testAuthHeadersForCustomHeader,
        testUpdateProfileName,
        testUpdateProfileSecret,
        testDeleteProfile,
        testSecretIsRemovedOnDelete,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nrpcAuth unit tests');
    for (const test of tests) {
        try {
            await test();
            passed += 1;
        } catch (error) {
            failed += 1;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch(error => {
    console.error('Test runner error:', error);
    process.exitCode = 1;
});
