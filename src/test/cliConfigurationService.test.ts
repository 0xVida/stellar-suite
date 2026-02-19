declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import {
    CliConfiguration,
    CliConfigurationService,
    CliConfigurationStore,
    DEFAULT_CLI_CONFIGURATION,
    normalizeCliConfiguration,
    validateCliConfiguration,
} from '../services/cliConfigurationService';

class MemoryStore implements CliConfigurationStore {
    private data = new Map<string, unknown>();

    get<T>(key: string, defaultValue: T): T {
        return this.data.has(key) ? this.data.get(key) as T : defaultValue;
    }

    update<T>(key: string, value: T): Promise<void> {
        this.data.set(key, value);
        return Promise.resolve();
    }
}

function createService(base?: Partial<CliConfiguration>): CliConfigurationService {
    const store = new MemoryStore();
    return new CliConfigurationService(
        store,
        () => normalizeCliConfiguration({
            ...DEFAULT_CLI_CONFIGURATION,
            ...(base || {}),
        }),
    );
}

async function testLoadsDefaultConfiguration() {
    const service = createService();
    const resolved = await service.getResolvedConfiguration();

    assert.strictEqual(resolved.configuration.cliPath, 'stellar');
    assert.strictEqual(resolved.profile, undefined);
    assert.strictEqual(resolved.validation.valid, true);
    console.log('  [ok] loads default configuration');
}

async function testCreateAndActivateProfile() {
    const service = createService();
    const profile = await service.createProfile('Mainnet Profile', {
        network: 'mainnet',
        source: 'ops',
    }, 'for mainnet deploys');
    await service.setActiveProfile(profile.id);

    const resolved = await service.getResolvedConfiguration();
    assert.strictEqual(resolved.profile?.id, profile.id);
    assert.strictEqual(resolved.configuration.network, 'mainnet');
    assert.strictEqual(resolved.configuration.source, 'ops');
    console.log('  [ok] creates and activates profile');
}

async function testValidationFailsForBadRpc() {
    const service = createService();
    const validation = validateCliConfiguration(normalizeCliConfiguration({
        useLocalCli: false,
        rpcUrl: 'not-a-url',
    }));

    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors.some((error: string) => error.includes('valid http(s) URL')));
    console.log('  [ok] validates invalid rpc url');
}

async function testUpdateAndDeleteProfile() {
    const service = createService();
    const profile = await service.createProfile('Dev Profile', { network: 'testnet' });
    await service.updateProfile(profile.id, {
        name: 'Dev Profile Updated',
        configuration: { network: 'futurenet' },
    });

    let profiles = await service.getProfiles();
    assert.strictEqual(profiles[0].name, 'Dev Profile Updated');
    assert.strictEqual(profiles[0].configuration.network, 'futurenet');

    await service.setActiveProfile(profile.id);
    await service.deleteProfile(profile.id);

    profiles = await service.getProfiles();
    assert.strictEqual(profiles.length, 0);
    assert.strictEqual(await service.getActiveProfileId(), undefined);
    console.log('  [ok] updates and deletes profile');
}

async function testExportImportProfiles() {
    const sourceService = createService();
    const profile = await sourceService.createProfile('Exported Profile', {
        network: 'mainnet',
        useLocalCli: false,
        rpcUrl: 'https://example-rpc.invalid',
    });
    await sourceService.setActiveProfile(profile.id);
    const serialized = await sourceService.exportProfiles();

    const targetService = createService();
    const result = await targetService.importProfiles(serialized, {
        replaceExisting: false,
        activateImportedProfile: true,
    });

    assert.strictEqual(result.imported, 1);
    assert.strictEqual(result.replaced, 0);
    assert.strictEqual(result.skipped, 0);

    const resolved = await targetService.getResolvedConfiguration();
    assert.strictEqual(resolved.profile?.name, 'Exported Profile');
    assert.strictEqual(resolved.configuration.network, 'mainnet');
    console.log('  [ok] exports and imports profiles');
}

async function testImportRejectsMalformedPayload() {
    const service = createService();
    let failed = false;
    try {
        await service.importProfiles('{"unexpected":true}');
    } catch (error) {
        failed = true;
        assert.ok((error as Error).message.includes('Invalid configuration file format'));
    }
    assert.strictEqual(failed, true);
    console.log('  [ok] rejects malformed import payload');
}

async function run() {
    const tests: Array<() => Promise<void>> = [
        testLoadsDefaultConfiguration,
        testCreateAndActivateProfile,
        testValidationFailsForBadRpc,
        testUpdateAndDeleteProfile,
        testExportImportProfiles,
        testImportRejectsMalformedPayload,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\ncliConfigurationService unit tests');
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
