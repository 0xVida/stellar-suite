declare function require(name: string): any;
declare const process: { exitCode?: number; env: Record<string, string | undefined> };

const assert = require('assert');

import {
    EnvVariableService,
    EnvVariableStore,
    validateEnvVariable,
    validateEnvVariableProfile,
} from '../services/envVariableService';
import { EnvVariable } from '../types/envVariable';

// ── In-memory store (same pattern as cliConfigurationService.test.ts) ──

class MemoryStore implements EnvVariableStore {
    private data = new Map<string, unknown>();

    get<T>(key: string, defaultValue: T): T {
        return this.data.has(key) ? this.data.get(key) as T : defaultValue;
    }

    update<T>(key: string, value: T): Promise<void> {
        this.data.set(key, value);
        return Promise.resolve();
    }
}

function createService(): EnvVariableService {
    return new EnvVariableService(new MemoryStore());
}

// ── Tests ─────────────────────────────────────────────────────

async function testDefaultStateIsEmpty() {
    const service = createService();
    const profiles = await service.getProfiles();
    assert.strictEqual(profiles.length, 0);
    assert.strictEqual(await service.getActiveProfileId(), undefined);
    assert.strictEqual(await service.getActiveProfile(), undefined);

    const vars = await service.getResolvedVariables();
    assert.deepStrictEqual(vars, {});
    console.log('  [ok] default state is empty');
}

async function testValidateEnvVariableValidName() {
    const result = validateEnvVariable({ name: 'MY_VAR', value: 'hello' });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
    console.log('  [ok] validates valid env variable');
}

async function testValidateEnvVariableInvalidName() {
    const result = validateEnvVariable({ name: '123-bad', value: 'x' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e: string) => e.includes('invalid')));
    console.log('  [ok] catches invalid env variable name');
}

async function testValidateEnvVariableEmptyName() {
    const result = validateEnvVariable({ name: '', value: 'x' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e: string) => e.includes('empty')));
    console.log('  [ok] catches empty env variable name');
}

async function testValidateEnvVariableSensitiveWarning() {
    const result = validateEnvVariable({ name: 'STELLAR_SECRET_KEY', value: 'secret', sensitive: false });
    assert.strictEqual(result.valid, true);
    assert.ok(result.warnings.some((w: string) => w.includes('sensitive')));
    console.log('  [ok] warns on sensitive variable not marked as sensitive');
}

async function testValidateEnvVariableSensitiveNoWarning() {
    const result = validateEnvVariable({ name: 'STELLAR_SECRET_KEY', value: 'secret', sensitive: true });
    assert.strictEqual(result.warnings.length, 0);
    console.log('  [ok] no warning when sensitive flag is set');
}

async function testValidateProfileDuplicateNames() {
    const vars: EnvVariable[] = [
        { name: 'FOO', value: '1' },
        { name: 'FOO', value: '2' },
    ];
    const result = validateEnvVariableProfile(vars);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e: string) => e.includes('Duplicate')));
    console.log('  [ok] catches duplicate variable names in profile');
}

async function testCreateProfile() {
    const service = createService();
    const profile = await service.createProfile('Dev Env', [
        { name: 'API_KEY', value: 'abc123' },
        { name: 'DEBUG', value: 'true' },
    ], 'Development environment');

    assert.ok(profile.id);
    assert.strictEqual(profile.name, 'Dev Env');
    assert.strictEqual(profile.description, 'Development environment');
    assert.strictEqual(profile.variables.length, 2);

    const profiles = await service.getProfiles();
    assert.strictEqual(profiles.length, 1);
    console.log('  [ok] creates profile');
}

async function testCreateProfileRejectsEmptyName() {
    const service = createService();
    let failed = false;
    try {
        await service.createProfile('', [{ name: 'X', value: 'y' }]);
    } catch (err) {
        failed = true;
        assert.ok((err as Error).message.includes('required'));
    }
    assert.strictEqual(failed, true);
    console.log('  [ok] rejects empty profile name');
}

async function testCreateProfileRejectsDuplicateName() {
    const service = createService();
    await service.createProfile('TestProfile', [{ name: 'A', value: '1' }]);
    let failed = false;
    try {
        await service.createProfile('testprofile', [{ name: 'B', value: '2' }]);
    } catch (err) {
        failed = true;
        assert.ok((err as Error).message.includes('already exists'));
    }
    assert.strictEqual(failed, true);
    console.log('  [ok] rejects duplicate profile name (case-insensitive)');
}

async function testCreateProfileRejectsInvalidVars() {
    const service = createService();
    let failed = false;
    try {
        await service.createProfile('BadVars', [{ name: '123', value: 'x' }]);
    } catch (err) {
        failed = true;
        assert.ok((err as Error).message.includes('Invalid'));
    }
    assert.strictEqual(failed, true);
    console.log('  [ok] rejects profile with invalid variables');
}

async function testSetAndGetActiveProfile() {
    const service = createService();
    const profile = await service.createProfile('Active', [{ name: 'FOO', value: 'bar' }]);
    await service.setActiveProfile(profile.id);

    assert.strictEqual(await service.getActiveProfileId(), profile.id);
    const active = await service.getActiveProfile();
    assert.strictEqual(active?.name, 'Active');

    const vars = await service.getResolvedVariables();
    assert.deepStrictEqual(vars, { FOO: 'bar' });
    console.log('  [ok] sets and gets active profile with resolved variables');
}

async function testSetActiveProfileRejectsNonexistent() {
    const service = createService();
    let failed = false;
    try {
        await service.setActiveProfile('nonexistent-id');
    } catch (err) {
        failed = true;
        assert.ok((err as Error).message.includes('does not exist'));
    }
    assert.strictEqual(failed, true);
    console.log('  [ok] rejects setting nonexistent active profile');
}

async function testUpdateProfile() {
    const service = createService();
    const profile = await service.createProfile('Original', [{ name: 'A', value: '1' }]);

    const updated = await service.updateProfile(profile.id, {
        name: 'Updated',
        variables: [
            { name: 'A', value: '100' },
            { name: 'B', value: '200' },
        ],
    });

    assert.strictEqual(updated.name, 'Updated');
    assert.strictEqual(updated.variables.length, 2);
    assert.strictEqual(updated.variables[0].value, '100');
    console.log('  [ok] updates profile');
}

async function testDeleteProfile() {
    const service = createService();
    const profile = await service.createProfile('ToDelete', [{ name: 'X', value: 'y' }]);
    await service.setActiveProfile(profile.id);
    await service.deleteProfile(profile.id);

    const profiles = await service.getProfiles();
    assert.strictEqual(profiles.length, 0);
    assert.strictEqual(await service.getActiveProfileId(), undefined);
    console.log('  [ok] deletes profile and clears active');
}

async function testDeleteProfileRejectsNonexistent() {
    const service = createService();
    let failed = false;
    try {
        await service.deleteProfile('missing-id');
    } catch (err) {
        failed = true;
        assert.ok((err as Error).message.includes('not found'));
    }
    assert.strictEqual(failed, true);
    console.log('  [ok] rejects deleting nonexistent profile');
}

async function testBuildEnvForExecution() {
    const service = createService();
    await service.createProfile('Exec', [
        { name: 'CUSTOM_VAR', value: 'custom_value' },
        { name: 'OVERRIDE', value: 'new' },
    ]);
    const profile = (await service.getProfiles())[0];
    await service.setActiveProfile(profile.id);

    const baseEnv = { EXISTING: 'keep', OVERRIDE: 'old' } as NodeJS.ProcessEnv;
    const result = await service.buildEnvForExecution(baseEnv);

    assert.strictEqual(result.EXISTING, 'keep');
    assert.strictEqual(result.CUSTOM_VAR, 'custom_value');
    assert.strictEqual(result.OVERRIDE, 'new'); // Profile overrides base
    console.log('  [ok] buildEnvForExecution merges profile over base');
}

async function testBuildEnvForExecutionEmpty() {
    const service = createService();
    // No active profile
    const baseEnv = { EXISTING: 'keep' } as NodeJS.ProcessEnv;
    const result = await service.buildEnvForExecution(baseEnv);
    assert.strictEqual(result.EXISTING, 'keep');
    console.log('  [ok] buildEnvForExecution works with no active profile');
}

async function testExportImportRoundTrip() {
    const source = createService();
    const p1 = await source.createProfile('Export A', [
        { name: 'KEY_A', value: 'val_a' },
    ]);
    const p2 = await source.createProfile('Export B', [
        { name: 'KEY_B', value: 'val_b', sensitive: true },
    ]);
    await source.setActiveProfile(p1.id);

    const serialized = await source.exportProfiles();

    const target = createService();
    const result = await target.importProfiles(serialized, {
        replaceExisting: false,
        activateImportedProfile: true,
    });

    assert.strictEqual(result.imported, 2);
    assert.strictEqual(result.replaced, 0);
    assert.strictEqual(result.skipped, 0);

    const imported = await target.getProfiles();
    assert.strictEqual(imported.length, 2);

    const active = await target.getActiveProfile();
    assert.strictEqual(active?.name, 'Export A');
    console.log('  [ok] exports and imports profiles round-trip');
}

async function testImportSkipsDuplicates() {
    const service = createService();
    const profile = await service.createProfile('Existing', [{ name: 'X', value: '1' }]);

    const json = JSON.stringify({
        profiles: [{
            id: profile.id,
            name: 'Existing',
            variables: [{ name: 'X', value: '2' }],
        }],
    });

    const result = await service.importProfiles(json, { replaceExisting: false });
    assert.strictEqual(result.skipped, 1);
    assert.strictEqual(result.imported, 0);

    // Original value unchanged
    const profiles = await service.getProfiles();
    assert.strictEqual(profiles[0].variables[0].value, '1');
    console.log('  [ok] import skips duplicates when replaceExisting=false');
}

async function testImportReplacesDuplicates() {
    const service = createService();
    const profile = await service.createProfile('Existing', [{ name: 'X', value: '1' }]);

    const json = JSON.stringify({
        profiles: [{
            id: profile.id,
            name: 'Existing',
            variables: [{ name: 'X', value: '2' }],
        }],
    });

    const result = await service.importProfiles(json, { replaceExisting: true });
    assert.strictEqual(result.replaced, 1);
    assert.strictEqual(result.imported, 0);

    const profiles = await service.getProfiles();
    assert.strictEqual(profiles[0].variables[0].value, '2');
    console.log('  [ok] import replaces duplicates when replaceExisting=true');
}

async function testImportRejectsMalformed() {
    const service = createService();
    let failed = false;
    try {
        await service.importProfiles('{"unexpected":true}');
    } catch (err) {
        failed = true;
        assert.ok((err as Error).message.includes('Invalid environment variable file format'));
    }
    assert.strictEqual(failed, true);
    console.log('  [ok] rejects malformed import payload');
}

async function testDeactivateProfile() {
    const service = createService();
    const profile = await service.createProfile('Temp', [{ name: 'A', value: '1' }]);
    await service.setActiveProfile(profile.id);
    assert.ok(await service.getActiveProfileId());

    await service.setActiveProfile(undefined);
    assert.strictEqual(await service.getActiveProfileId(), undefined);
    console.log('  [ok] deactivates profile');
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        testDefaultStateIsEmpty,
        testValidateEnvVariableValidName,
        testValidateEnvVariableInvalidName,
        testValidateEnvVariableEmptyName,
        testValidateEnvVariableSensitiveWarning,
        testValidateEnvVariableSensitiveNoWarning,
        testValidateProfileDuplicateNames,
        testCreateProfile,
        testCreateProfileRejectsEmptyName,
        testCreateProfileRejectsDuplicateName,
        testCreateProfileRejectsInvalidVars,
        testSetAndGetActiveProfile,
        testSetActiveProfileRejectsNonexistent,
        testUpdateProfile,
        testDeleteProfile,
        testDeleteProfileRejectsNonexistent,
        testBuildEnvForExecution,
        testBuildEnvForExecutionEmpty,
        testExportImportRoundTrip,
        testImportSkipsDuplicates,
        testImportReplacesDuplicates,
        testImportRejectsMalformed,
        testDeactivateProfile,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nenvVariable unit tests');
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
