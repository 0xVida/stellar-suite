declare function require(name: string): any;
declare const process: { exitCode?: number; env: Record<string, string | undefined> };

const assert = require('assert');

import { CliVersionService, DEFAULT_CLI_VERSION_CONFIG } from '../services/cliVersionService';
import { parseVersion, formatVersion, compareVersions } from '../utils/versionParser';

// ── Helpers ──────────────────────────────────────────────────

function createService(overrides?: Partial<typeof DEFAULT_CLI_VERSION_CONFIG>) {
    return new CliVersionService({ ...DEFAULT_CLI_VERSION_CONFIG, ...overrides });
}

// ── Tests ────────────────────────────────────────────────────

// 1. Version string parsing

async function testParseStandardVersionOutput() {
    // "stellar 21.5.0" → version "21.5.0"
    const v = parseVersion('21.5.0');
    assert.ok(v);
    assert.strictEqual(v!.major, 21);
    assert.strictEqual(v!.minor, 5);
    assert.strictEqual(v!.patch, 0);
    console.log('  [ok] parses standard version "21.5.0"');
}

async function testParsePreReleaseVersion() {
    const v = parseVersion('21.0.0-rc.1');
    assert.ok(v);
    assert.strictEqual(v!.major, 21);
    assert.strictEqual(v!.minor, 0);
    assert.strictEqual(v!.patch, 0);
    assert.strictEqual(v!.preRelease, 'rc.1');
    console.log('  [ok] parses pre-release version "21.0.0-rc.1"');
}

async function testParseEmptyString() {
    const v = parseVersion('');
    assert.strictEqual(v, undefined);
    console.log('  [ok] returns undefined for empty string');
}

async function testParseGarbageInput() {
    const v = parseVersion('not-a-version');
    assert.strictEqual(v, undefined);
    console.log('  [ok] returns undefined for garbage input');
}

async function testExtractVersionFromCliOutput() {
    // Simulates extracting from "stellar 21.5.0"
    const raw = 'stellar 21.5.0';
    const re = /(?:stellar|stellar-cli)\s+(\d+\.\d+\.\d+\S*)/i;
    const match = re.exec(raw);
    assert.ok(match);
    const v = parseVersion(match![1]);
    assert.ok(v);
    assert.strictEqual(formatVersion(v!), '21.5.0');
    console.log('  [ok] extracts version from "stellar 21.5.0"');
}

async function testExtractVersionFromStellarCli() {
    const raw = 'stellar-cli 21.5.0';
    const re = /(?:stellar|stellar-cli)\s+(\d+\.\d+\.\d+\S*)/i;
    const match = re.exec(raw);
    assert.ok(match);
    const v = parseVersion(match![1]);
    assert.ok(v);
    assert.strictEqual(formatVersion(v!), '21.5.0');
    console.log('  [ok] extracts version from "stellar-cli 21.5.0"');
}

// 2. Compatibility checks

async function testCompatibleVersionIsGreater() {
    const service = createService();
    const result = service.checkCompatibility('21.5.0', '21.0.0');
    assert.strictEqual(result.compatible, true);
    assert.strictEqual(result.currentVersion, '21.5.0');
    assert.strictEqual(result.requiredVersion, '21.0.0');
    assert.ok(!result.upgradeCommand);
    console.log('  [ok] 21.5.0 >= 21.0.0 is compatible');
}

async function testCompatibleVersionIsEqual() {
    const service = createService();
    const result = service.checkCompatibility('21.0.0', '21.0.0');
    assert.strictEqual(result.compatible, true);
    console.log('  [ok] 21.0.0 >= 21.0.0 is compatible (equal)');
}

async function testIncompatibleVersionIsLesser() {
    const service = createService();
    const result = service.checkCompatibility('20.9.0', '21.0.0');
    assert.strictEqual(result.compatible, false);
    assert.ok(result.upgradeCommand);
    assert.ok(result.message.includes('below'));
    console.log('  [ok] 20.9.0 < 21.0.0 is incompatible');
}

async function testPreReleaseIsLessThanRelease() {
    // 21.0.0-rc.1 < 21.0.0
    const current = parseVersion('21.0.0-rc.1')!;
    const required = parseVersion('21.0.0')!;
    const cmp = compareVersions(current, required);
    assert.strictEqual(cmp, 'lesser');
    console.log('  [ok] 21.0.0-rc.1 < 21.0.0 (pre-release is lesser)');
}

async function testUnparseableCurrentVersion() {
    const service = createService();
    const result = service.checkCompatibility('garbage', '21.0.0');
    assert.strictEqual(result.compatible, false);
    assert.ok(result.message.includes('Unable to parse'));
    console.log('  [ok] unparseable current version returns incompatible');
}

// 3. Cache behavior

async function testCacheReturnedWithinTTL() {
    const service = createService({ checkIntervalMinutes: 60 });
    // Manually set cache via detectVersion with a dummy that won't be called
    // Instead, use checkCompatibility and internal state
    // Use the cache setter indirectly through the service
    const info = {
        version: 'stellar 21.5.0',
        parsed: parseVersion('21.5.0'),
        detectedAt: Date.now(),
        cliPath: 'stellar',
    };
    // Access cache through the service - simulate by calling detectVersion won't work
    // without a real CLI. Instead test the cache logic directly.
    (service as any).cache = info;
    const cached = service.getCachedVersion();
    assert.ok(cached);
    assert.strictEqual(cached!.version, 'stellar 21.5.0');
    console.log('  [ok] cached version returned within TTL');
}

async function testCacheExpiredAfterTTL() {
    const service = createService({ checkIntervalMinutes: 1 }); // 1 minute TTL
    const info = {
        version: 'stellar 21.5.0',
        parsed: parseVersion('21.5.0'),
        detectedAt: Date.now() - 120_000, // 2 minutes ago
        cliPath: 'stellar',
    };
    (service as any).cache = info;
    const cached = service.getCachedVersion();
    assert.strictEqual(cached, undefined);
    console.log('  [ok] cached version expired after TTL');
}

async function testClearCacheWorks() {
    const service = createService({ checkIntervalMinutes: 60 });
    (service as any).cache = {
        version: 'stellar 21.5.0',
        parsed: parseVersion('21.5.0'),
        detectedAt: Date.now(),
        cliPath: 'stellar',
    };
    assert.ok(service.getCachedVersion());
    service.clearCache();
    assert.strictEqual(service.getCachedVersion(), undefined);
    console.log('  [ok] clearCache() clears cached version');
}

async function testCacheWithZeroIntervalNeverExpires() {
    const service = createService({ checkIntervalMinutes: 0 });
    (service as any).cache = {
        version: 'stellar 21.5.0',
        parsed: parseVersion('21.5.0'),
        detectedAt: Date.now() - 999_999_999, // very old
        cliPath: 'stellar',
    };
    const cached = service.getCachedVersion();
    assert.ok(cached);
    console.log('  [ok] cache never expires when intervalMinutes is 0');
}

// 4. Upgrade command

async function testUpgradeCommandPopulated() {
    const service = createService();
    const result = service.checkCompatibility('20.0.0', '21.0.0');
    assert.strictEqual(result.compatible, false);
    assert.strictEqual(result.upgradeCommand, 'cargo install --locked stellar-cli');
    console.log('  [ok] upgrade command populated for incompatible version');
}

async function testNoUpgradeCommandWhenCompatible() {
    const service = createService();
    const result = service.checkCompatibility('21.5.0', '21.0.0');
    assert.strictEqual(result.compatible, true);
    assert.strictEqual(result.upgradeCommand, undefined);
    console.log('  [ok] no upgrade command when compatible');
}

// 5. Error handling

async function testDetectVersionWithNonexistentCli() {
    const service = createService();
    const result = await service.detectVersion('/nonexistent/path/to/stellar');
    assert.strictEqual(result, undefined);
    console.log('  [ok] returns undefined for non-existent CLI path (ENOENT)');
}

async function testCheckVersionWhenDisabled() {
    const service = createService({ enabled: false });
    const result = await service.checkVersion('stellar');
    assert.strictEqual(result, undefined);
    console.log('  [ok] checkVersion returns undefined when disabled');
}

// 6. Config management

async function testDefaultConfig() {
    const service = createService();
    const config = service.getConfig();
    assert.strictEqual(config.enabled, true);
    assert.strictEqual(config.minimumVersion, '21.0.0');
    assert.strictEqual(config.checkIntervalMinutes, 60);
    console.log('  [ok] default config values are correct');
}

async function testUpdateConfig() {
    const service = createService();
    service.updateConfig({ minimumVersion: '22.0.0', checkIntervalMinutes: 30 });
    const config = service.getConfig();
    assert.strictEqual(config.minimumVersion, '22.0.0');
    assert.strictEqual(config.checkIntervalMinutes, 30);
    assert.strictEqual(config.enabled, true); // unchanged
    console.log('  [ok] updateConfig merges partial config');
}

async function testOnWarningCallback() {
    const service = createService();
    let warningResult: any = null;
    service.onWarning((result) => { warningResult = result; });

    const result = service.checkCompatibility('20.0.0', '21.0.0');
    // checkCompatibility doesn't fire callback, only checkVersion does
    assert.strictEqual(warningResult, null);

    // Simulate via checkVersion with a cached incompatible version
    (service as any).cache = {
        version: 'stellar 20.0.0',
        parsed: parseVersion('20.0.0'),
        detectedAt: Date.now(),
        cliPath: 'stellar',
    };
    await service.checkVersion('stellar');
    assert.ok(warningResult);
    assert.strictEqual(warningResult.compatible, false);
    console.log('  [ok] onWarning callback fires for incompatible version');
}

async function testDisposeStopsPeriodicCheck() {
    const service = createService({ checkIntervalMinutes: 1 });
    service.startPeriodicCheck('stellar');
    assert.ok((service as any).intervalHandle !== undefined);
    service.dispose();
    assert.strictEqual((service as any).intervalHandle, undefined);
    assert.strictEqual((service as any).cache, undefined);
    console.log('  [ok] dispose clears interval and cache');
}

async function testGetEnvironmentWithPath() {
    const service = createService();
    const env = service.getEnvironmentWithPath();
    assert.ok(env.PATH);
    assert.ok(env.PATH!.includes('.cargo'));
    console.log('  [ok] getEnvironmentWithPath includes cargo bin');
}

// ── Runner ───────────────────────────────────────────────────

async function main() {
    const tests = [
        // Version parsing
        testParseStandardVersionOutput,
        testParsePreReleaseVersion,
        testParseEmptyString,
        testParseGarbageInput,
        testExtractVersionFromCliOutput,
        testExtractVersionFromStellarCli,
        // Compatibility
        testCompatibleVersionIsGreater,
        testCompatibleVersionIsEqual,
        testIncompatibleVersionIsLesser,
        testPreReleaseIsLessThanRelease,
        testUnparseableCurrentVersion,
        // Cache
        testCacheReturnedWithinTTL,
        testCacheExpiredAfterTTL,
        testClearCacheWorks,
        testCacheWithZeroIntervalNeverExpires,
        // Upgrade command
        testUpgradeCommandPopulated,
        testNoUpgradeCommandWhenCompatible,
        // Error handling
        testDetectVersionWithNonexistentCli,
        testCheckVersionWhenDisabled,
        // Config
        testDefaultConfig,
        testUpdateConfig,
        testOnWarningCallback,
        testDisposeStopsPeriodicCheck,
        testGetEnvironmentWithPath,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\ncliVersion unit tests');
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

main();
