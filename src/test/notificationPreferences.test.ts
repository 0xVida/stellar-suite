// ============================================================
// src/test/notificationPreferences.test.ts
// Unit tests for notification preferences service
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import {
    NotificationPreferencesService,
    validateNotificationPreferences,
    DEFAULT_PREFERENCES,
    NOTIFICATION_PRESETS,
    NOTIFICATION_PREFERENCES_KEY
} from '../services/notificationPreferencesService';
import { ToastPosition } from '../types/toastNotification';
import { NotificationPresetId } from '../types/notificationPreferences';

// ── Mock store ──

function createMockStore(initial: Record<string, unknown> = {}): {
    data: Record<string, unknown>;
    get: (key: string) => unknown;
    update: (key: string, value: unknown) => Promise<void>;
} {
    const data: Record<string, unknown> = { ...initial };
    return {
        data,
        get(key: string): unknown {
            return data[key];
        },
        update(key: string, value: unknown): Promise<void> {
            data[key] = value;
            return Promise.resolve();
        }
    };
}

// ── Validation tests ──

function testValidateValidPreferences() {
    const result = validateNotificationPreferences({
        duration: 5000,
        maxVisible: 3,
        maxQueued: 10,
        position: ToastPosition.BottomRight
    });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
    console.log('  [ok] validates valid preferences');
}

function testValidateInvalidDuration() {
    const result = validateNotificationPreferences({ duration: -1 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e: string) => e.includes('duration')));
    const result2 = validateNotificationPreferences({ duration: 400000 });
    assert.strictEqual(result2.valid, false);
    console.log('  [ok] rejects invalid duration');
}

function testValidateInvalidMaxVisible() {
    const result = validateNotificationPreferences({ maxVisible: 0 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e: string) => e.includes('maxVisible')));
    const result2 = validateNotificationPreferences({ maxVisible: 99 });
    assert.strictEqual(result2.valid, false);
    console.log('  [ok] rejects invalid maxVisible');
}

function testValidateInvalidMaxQueued() {
    const result = validateNotificationPreferences({ maxQueued: 0 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e: string) => e.includes('maxQueued')));
    console.log('  [ok] rejects invalid maxQueued');
}

function testValidateInvalidPosition() {
    const result = validateNotificationPreferences({
        position: 'invalid' as ToastPosition
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e: string) => e.includes('position')));
    console.log('  [ok] rejects invalid position');
}

function testValidateTypesMustBeBoolean() {
    const result = validateNotificationPreferences({
        types: { success: true, error: 'yes' as unknown as boolean, warning: true, info: true }
    });
    assert.strictEqual(result.valid, false);
    console.log('  [ok] requires types to be boolean');
}

// ── Service: getPreferences ──

function testGetPreferencesReturnsDefaultsWhenEmpty() {
    const store = createMockStore();
    const service = new NotificationPreferencesService(store);
    const prefs = service.getPreferences();
    assert.strictEqual(prefs.enabled, DEFAULT_PREFERENCES.enabled);
    assert.strictEqual(prefs.duration, DEFAULT_PREFERENCES.duration);
    assert.strictEqual(prefs.position, DEFAULT_PREFERENCES.position);
    assert.deepStrictEqual(prefs.types, DEFAULT_PREFERENCES.types);
    console.log('  [ok] getPreferences returns defaults when store empty');
}

function testGetPreferencesReturnsStoredWhenPresent() {
    const stored = {
        enabled: false,
        duration: 10000,
        position: ToastPosition.TopLeft,
        types: { success: false, error: true, warning: false, info: false }
    };
    const store = createMockStore({ [NOTIFICATION_PREFERENCES_KEY]: stored });
    const service = new NotificationPreferencesService(store);
    const prefs = service.getPreferences();
    assert.strictEqual(prefs.enabled, false);
    assert.strictEqual(prefs.duration, 10000);
    assert.strictEqual(prefs.position, ToastPosition.TopLeft);
    assert.strictEqual(prefs.types.success, false);
    assert.strictEqual(prefs.types.error, true);
    console.log('  [ok] getPreferences returns stored values');
}

// ── Service: setPreferences ──

async function testSetPreferencesValidSaves() {
    const store = createMockStore();
    const service = new NotificationPreferencesService(store);
    const result = await service.setPreferences({
        duration: 3000,
        enabled: true
    });
    assert.strictEqual(result.valid, true);
    const prefs = service.getPreferences();
    assert.strictEqual(prefs.duration, 3000);
    assert.strictEqual(prefs.enabled, true);
    assert.ok(store.data[NOTIFICATION_PREFERENCES_KEY]);
    console.log('  [ok] setPreferences saves valid preferences');
}

async function testSetPreferencesInvalidDoesNotSave() {
    const store = createMockStore();
    const service = new NotificationPreferencesService(store);
    const result = await service.setPreferences({
        duration: -100
    });
    assert.strictEqual(result.valid, false);
    assert.strictEqual(store.data[NOTIFICATION_PREFERENCES_KEY], undefined);
    console.log('  [ok] setPreferences does not save invalid preferences');
}

// ── Service: presets ──

function testGetPresetsReturnsAll() {
    const store = createMockStore();
    const service = new NotificationPreferencesService(store);
    const presets = service.getPresets();
    assert.ok(presets.length >= 3);
    const ids = presets.map((p: { id: string }) => p.id);
    assert.ok(ids.includes('minimal'));
    assert.ok(ids.includes('normal'));
    assert.ok(ids.includes('verbose'));
    console.log('  [ok] getPresets returns built-in presets');
}

async function testApplyPresetSavesAndUpdatesGetPreferences() {
    const store = createMockStore();
    const service = new NotificationPreferencesService(store);
    const ok = await service.applyPreset('minimal' as NotificationPresetId);
    assert.strictEqual(ok, true);
    const prefs = service.getPreferences();
    assert.strictEqual(prefs.types.error, true);
    assert.strictEqual(prefs.types.success, false);
    assert.strictEqual(prefs.types.info, false);
    assert.strictEqual(prefs.presetId, 'minimal');
    console.log('  [ok] applyPreset saves and getPreferences reflects it');
}

async function testApplyPresetInvalidReturnsFalse() {
    const store = createMockStore();
    const service = new NotificationPreferencesService(store);
    const ok = await service.applyPreset('nonexistent' as NotificationPresetId);
    assert.strictEqual(ok, false);
    console.log('  [ok] applyPreset returns false for unknown preset');
}

// ── Service: preferencesToQueueConfig ──

function testPreferencesToQueueConfig() {
    const store = createMockStore();
    const service = new NotificationPreferencesService(store);
    const prefs = service.getPreferences();
    const config = service.preferencesToQueueConfig(prefs);
    assert.strictEqual(config.maxVisible, prefs.maxVisible);
    assert.strictEqual(config.maxQueued, prefs.maxQueued);
    assert.strictEqual(config.defaultDuration, prefs.duration);
    assert.strictEqual(config.position, prefs.position);
    assert.strictEqual(config.enableAnimations, prefs.enableAnimations);
    assert.strictEqual(config.enabled, prefs.enabled);
    assert.strictEqual(config.actionsEnabled, prefs.actionsEnabled);
    assert.ok(config.enabledTypes);
    assert.strictEqual(config.enabledTypes.success, prefs.types.success);
    console.log('  [ok] preferencesToQueueConfig maps correctly');
}

// ── Service: onDidChangePreferences ──

async function testOnDidChangePreferencesFiresOnSet() {
    const store = createMockStore();
    const service = new NotificationPreferencesService(store);
    let fired = false;
    const sub = service.onDidChangePreferences(() => {
        fired = true;
    });
    await service.setPreferences({ duration: 1000 });
    assert.strictEqual(fired, true);
    sub.dispose();
    console.log('  [ok] onDidChangePreferences fires when setPreferences');
}

async function testOnDidChangePreferencesFiresOnApplyPreset() {
    const store = createMockStore();
    const service = new NotificationPreferencesService(store);
    let fired = false;
    const sub = service.onDidChangePreferences(() => {
        fired = true;
    });
    await service.applyPreset('verbose' as NotificationPresetId);
    assert.strictEqual(fired, true);
    sub.dispose();
    console.log('  [ok] onDidChangePreferences fires when applyPreset');
}

// ── Preset content ──

function testPresetMinimalContent() {
    const minimal = NOTIFICATION_PRESETS.find(p => p.id === 'minimal');
    assert.ok(minimal);
    assert.strictEqual(minimal.preferences.types.error, true);
    assert.strictEqual(minimal.preferences.types.success, false);
    assert.strictEqual(minimal.preferences.maxVisible, 1);
    assert.strictEqual(minimal.preferences.actionsEnabled, false);
    console.log('  [ok] minimal preset has expected content');
}

function testPresetNormalContent() {
    const normal = NOTIFICATION_PRESETS.find(p => p.id === 'normal');
    assert.ok(normal);
    assert.strictEqual(normal.preferences.enabled, true);
    assert.strictEqual(normal.preferences.duration, 5000);
    console.log('  [ok] normal preset has expected content');
}

// ── Run all ──

async function runTests() {
    console.log('\n=== Notification Preferences Service Tests ===\n');

    const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [
        { name: 'Validate valid preferences', fn: testValidateValidPreferences },
        { name: 'Validate invalid duration', fn: testValidateInvalidDuration },
        { name: 'Validate invalid maxVisible', fn: testValidateInvalidMaxVisible },
        { name: 'Validate invalid maxQueued', fn: testValidateInvalidMaxQueued },
        { name: 'Validate invalid position', fn: testValidateInvalidPosition },
        { name: 'Validate types must be boolean', fn: testValidateTypesMustBeBoolean },
        { name: 'GetPreferences defaults', fn: testGetPreferencesReturnsDefaultsWhenEmpty },
        { name: 'GetPreferences stored', fn: testGetPreferencesReturnsStoredWhenPresent },
        { name: 'SetPreferences valid saves', fn: testSetPreferencesValidSaves },
        { name: 'SetPreferences invalid does not save', fn: testSetPreferencesInvalidDoesNotSave },
        { name: 'GetPresets returns all', fn: testGetPresetsReturnsAll },
        { name: 'ApplyPreset saves', fn: testApplyPresetSavesAndUpdatesGetPreferences },
        { name: 'ApplyPreset invalid', fn: testApplyPresetInvalidReturnsFalse },
        { name: 'PreferencesToQueueConfig', fn: testPreferencesToQueueConfig },
        { name: 'OnDidChange fires on set', fn: testOnDidChangePreferencesFiresOnSet },
        { name: 'OnDidChange fires on preset', fn: testOnDidChangePreferencesFiresOnApplyPreset },
        { name: 'Preset minimal content', fn: testPresetMinimalContent },
        { name: 'Preset normal content', fn: testPresetNormalContent }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            await test.fn();
            passed++;
        } catch (error) {
            failed++;
            console.error(`  [FAIL] ${test.name}:`, error);
        }
    }

    console.log(`\n=== Test Summary ===`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${tests.length}\n`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
