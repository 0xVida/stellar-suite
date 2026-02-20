// ============================================================
// src/test/sidebarAutoRefreshService.test.ts
// Unit tests for SidebarAutoRefreshService debouncing/relevance.
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { SidebarAutoRefreshService } from '../services/sidebarAutoRefreshService';

type RefreshPayload = { source?: string; changedPaths?: string[] };

function createService(overrides: { debounceMs?: number; minRefreshIntervalMs?: number } = {}) {
    const refreshCalls: RefreshPayload[] = [];
    const sidebarProvider = {
        refresh(payload?: RefreshPayload) {
            refreshCalls.push(payload || {});
        },
    } as any;

    const outputChannel = {
        appendLine: (_msg: string) => undefined,
    } as any;

    const service = new SidebarAutoRefreshService(sidebarProvider, outputChannel, {
        debounceMs: overrides.debounceMs ?? 20,
        minRefreshIntervalMs: overrides.minRefreshIntervalMs ?? 40,
    });

    return { service, refreshCalls };
}

async function delay(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function testRelevantPathFiltering() {
    const { service } = createService();

    assert.strictEqual(service.isRelevantPath('/workspace/contracts/alpha/Cargo.toml'), true);
    assert.strictEqual(service.isRelevantPath('/workspace/contracts/alpha/README.md'), false);
    assert.strictEqual(
        service.isRelevantPath('/workspace/contracts/alpha/target/wasm32-unknown-unknown/release/alpha.wasm'),
        true
    );

    service.dispose();
    console.log('  [ok] path relevance detection for Cargo.toml and target wasm');
}

async function testDebounceBatchesRapidChanges() {
    const { service, refreshCalls } = createService({ debounceMs: 25, minRefreshIntervalMs: 1 });

    service.queueFileChange('/workspace/contracts/a/Cargo.toml');
    service.queueFileChange('/workspace/contracts/b/Cargo.toml');
    service.queueFileChange('/workspace/contracts/a/Cargo.toml');

    await delay(45);

    assert.strictEqual(refreshCalls.length, 1, 'rapid changes should debounce into one refresh');
    assert.strictEqual(refreshCalls[0].source, 'auto');
    assert.deepStrictEqual(
        (refreshCalls[0].changedPaths || []).sort(),
        ['/workspace/contracts/a/Cargo.toml', '/workspace/contracts/b/Cargo.toml'].sort()
    );

    service.dispose();
    console.log('  [ok] debounces rapid file changes into a single refresh');
}

async function testRespectsMinimumRefreshInterval() {
    const { service, refreshCalls } = createService({ debounceMs: 10, minRefreshIntervalMs: 80 });

    service.queueFileChange('/workspace/contracts/a/Cargo.toml');
    await delay(25);
    assert.strictEqual(refreshCalls.length, 1, 'first refresh should execute quickly');

    service.queueFileChange('/workspace/contracts/b/Cargo.toml');
    await delay(30);
    assert.strictEqual(refreshCalls.length, 1, 'second refresh should be deferred by min interval');

    await delay(70);
    assert.strictEqual(refreshCalls.length, 2, 'deferred refresh eventually runs');

    service.dispose();
    console.log('  [ok] enforces minimum refresh interval between auto refreshes');
}

async function testManualRefreshTrigger() {
    const { service, refreshCalls } = createService();

    service.triggerManualRefresh();

    assert.strictEqual(refreshCalls.length, 1);
    assert.strictEqual(refreshCalls[0].source, 'manual');

    service.dispose();
    console.log('  [ok] manual refresh trigger delegates to sidebar refresh');
}

async function run() {
    console.log('\n[sidebar-auto-refresh] Running tests...');

    await testRelevantPathFiltering();
    await testDebounceBatchesRapidChanges();
    await testRespectsMinimumRefreshInterval();
    await testManualRefreshTrigger();

    console.log('[sidebar-auto-refresh] All tests passed.');
}

run().catch((error: unknown) => {
    console.error('[sidebar-auto-refresh] Test run failed:', error);
    process.exitCode = 1;
});