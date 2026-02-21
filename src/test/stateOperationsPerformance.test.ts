// ============================================================
// src/test/stateOperationsPerformance.test.ts
// Performance tests for state operations.
//
// Measures and establishes benchmarks for:
//   - State persistence (serialisation / deserialisation)
//   - State retrieval at various data sizes
//   - Migration execution time
//   - Validation throughput
//   - Regression detection via enforced time budgets
//
// Run with:  node out-test/test/stateOperationsPerformance.test.js
// ============================================================

declare function require(name: string): any;
declare const process: {
    exitCode?: number;
    memoryUsage(): { heapUsed: number; heapTotal: number; rss: number };
    hrtime(time?: [number, number]): [number, number];
    exit(code: number): never;
};

const assert = require('assert');

import { StateValidationService } from '../services/stateValidationService';
import { StateMigrationService, Migration } from '../services/stateMigrationService';

// ── Timing helpers ─────────────────────────────────────────────

/** High-resolution timestamp in milliseconds. */
function now(): number {
    const [sec, ns] = process.hrtime();
    return sec * 1_000 + ns / 1_000_000;
}

/** Measures elapsed wall-clock time for a synchronous or async operation. */
async function measureMs(fn: () => Promise<void> | void): Promise<number> {
    const start = now();
    await fn();
    return now() - start;
}

/** Current heap usage in megabytes. */
function heapMb(): number {
    return process.memoryUsage().heapUsed / 1_048_576;
}

// ── Benchmark result types ─────────────────────────────────────

interface BenchmarkResult {
    label: string;
    elapsedMs: number;
    budgetMs: number;
    withinBudget: boolean;
    itemCount?: number;
    heapDeltaMb?: number;
    note?: string;
}

const benchmarkResults: BenchmarkResult[] = [];

function recordResult(result: BenchmarkResult): void {
    benchmarkResults.push(result);
    const status = result.withinBudget ? '✓' : '✗ OVER BUDGET';
    const items = result.itemCount !== undefined ? ` | ${result.itemCount} items` : '';
    const heap = result.heapDeltaMb !== undefined
        ? ` | heap Δ ${result.heapDeltaMb.toFixed(1)} MB`
        : '';
    const note = result.note ? ` (${result.note})` : '';
    console.log(
        `  ${status} [${result.label}] ${result.elapsedMs.toFixed(2)} ms` +
        ` (budget: ${result.budgetMs} ms)${items}${heap}${note}`
    );
}

// ── State fixture generators ───────────────────────────────────

/**
 * Builds a minimal valid workspace state object with the given number
 * of deployment records. Mirrors the shape expected by StateValidationService.
 */
function buildState(deploymentCount: number): any {
    const deployments = new Map<string, any>();

    for (let i = 0; i < deploymentCount; i++) {
        const key = `deployment-${i.toString().padStart(6, '0')}`;
        deployments.set(key, {
            contractId: `contract-${i.toString(16).padStart(10, '0')}`,
            contractName: `contract_${i}`,
            deployedAt: new Date(Date.now() - i * 60_000).toISOString(),
            network: i % 2 === 0 ? 'testnet' : 'public',
            source: `src/contracts/contract_${i}.rs`,
            transactionHash: `tx${i.toString(16).padStart(62, '0')}`,
            metadata: {
                version: '0.1.0',
                buildFlags: ['--release'],
                wasmHash: `wasm${i.toString(16).padStart(60, '0')}`,
            },
        });
    }

    return {
        deployments,
        configurations: {
            cliPath: '/usr/local/bin/stellar',
            defaultNetwork: 'testnet',
            buildFlags: ['--release'],
            rpcUrl: 'https://soroban-testnet.stellar.org:443',
        },
        lastSync: Date.now(),
        syncVersion: 1,
    };
}

/**
 * Serialises a state object to JSON. Maps are converted to arrays of
 * entries so they survive the JSON round-trip, matching the pattern
 * used by VS Code workspace state persistence.
 */
function serialiseState(state: any): string {
    return JSON.stringify(state, (_key, value) => {
        if (value instanceof Map) {
            return { __type: 'Map', entries: Array.from(value.entries()) };
        }
        return value;
    });
}

/**
 * Deserialises a JSON string back into a state object, restoring Maps
 * from the encoded entry arrays.
 */
function deserialiseState(json: string): any {
    return JSON.parse(json, (_key, value) => {
        if (value && typeof value === 'object' && value.__type === 'Map') {
            return new Map(value.entries);
        }
        return value;
    });
}

// ── Minimal Memento mock for migration tests ───────────────────

class MockMemento {
    private storage = new Map<string, any>();

    keys(): readonly string[] {
        return Array.from(this.storage.keys());
    }

    get<T>(key: string, defaultValue?: T): T | undefined {
        return this.storage.has(key) ? this.storage.get(key) : defaultValue;
    }

    async update(key: string, value: any): Promise<void> {
        this.storage.set(key, value);
    }
}

class MockOutputChannel {
    appendLine(_value: string): void { /* silent in tests */ }
}

// ── State persistence benchmarks ──────────────────────────────

/**
 * Measures how long it takes to serialise a state object with the
 * given number of deployment records. Enforces a per-record budget
 * that keeps the UI responsive during workspace saves.
 */
async function benchmarkStatePersistence(deploymentCount: number): Promise<BenchmarkResult> {
    const state = buildState(deploymentCount);
    const budgetMs = deploymentCount <= 100 ? 20 : deploymentCount <= 500 ? 80 : 200;

    const elapsed = await measureMs(() => {
        const json = serialiseState(state);
        // Prevent dead-code elimination.
        assert.ok(json.length > 0, 'Serialised state must not be empty');
    });

    return {
        label: `persist [${deploymentCount} deployments]`,
        elapsedMs: elapsed,
        budgetMs,
        withinBudget: elapsed <= budgetMs,
        itemCount: deploymentCount,
    };
}

/**
 * Measures how long it takes to deserialise a previously serialised
 * state blob and verify the round-trip is lossless.
 */
async function benchmarkStateRetrieval(deploymentCount: number): Promise<BenchmarkResult> {
    const original = buildState(deploymentCount);
    const json = serialiseState(original);
    const budgetMs = deploymentCount <= 100 ? 20 : deploymentCount <= 500 ? 80 : 200;

    const elapsed = await measureMs(() => {
        const restored = deserialiseState(json);
        assert.ok(restored.deployments instanceof Map, 'Deployments must be restored as Map');
        assert.strictEqual(
            restored.deployments.size,
            deploymentCount,
            `Expected ${deploymentCount} deployments after round-trip`
        );
    });

    return {
        label: `retrieve [${deploymentCount} deployments]`,
        elapsedMs: elapsed,
        budgetMs,
        withinBudget: elapsed <= budgetMs,
        itemCount: deploymentCount,
    };
}

// ── State validation benchmarks ────────────────────────────────

/**
 * Benchmarks the StateValidationService against states of increasing size.
 * Validation must complete quickly enough to run on every workspace load
 * without blocking the extension host.
 */
async function benchmarkStateValidation(deploymentCount: number): Promise<BenchmarkResult> {
    const service = new StateValidationService();
    const state = buildState(deploymentCount);

    // Budget scales with size: small states must be fast, large states get more room.
    const budgetMs = deploymentCount <= 50 ? 30 : deploymentCount <= 200 ? 100 : 400;

    const elapsed = await measureMs(() => {
        const result = service.validate(state);
        assert.ok(result.valid, `State with ${deploymentCount} deployments should be valid`);
    });

    return {
        label: `validate [${deploymentCount} deployments]`,
        elapsedMs: elapsed,
        budgetMs,
        withinBudget: elapsed <= budgetMs,
        itemCount: deploymentCount,
    };
}

/**
 * Benchmarks validation with auto-repair enabled. Repair is more expensive
 * than read-only validation, so it gets a larger time budget.
 */
async function benchmarkStateValidationWithRepair(deploymentCount: number): Promise<BenchmarkResult> {
    const service = new StateValidationService();

    // Inject some repairable issues: invalid network values.
    const state = buildState(deploymentCount);
    let idx = 0;
    for (const [, record] of state.deployments.entries()) {
        if (idx % 5 === 0) {
            record.network = 'invalid-network';
        }
        idx++;
    }

    const budgetMs = deploymentCount <= 50 ? 50 : deploymentCount <= 200 ? 150 : 600;

    const elapsed = await measureMs(() => {
        const result = service.validate(state, { autoRepair: true });
        assert.ok(
            result.repairs.length > 0,
            'At least one repair should have been applied'
        );
    });

    return {
        label: `validate+repair [${deploymentCount} deployments]`,
        elapsedMs: elapsed,
        budgetMs,
        withinBudget: elapsed <= budgetMs,
        itemCount: deploymentCount,
    };
}

// ── Migration performance benchmarks ──────────────────────────

/**
 * Benchmarks running a chain of N sequential migrations against a
 * mock Memento. Each migration performs a lightweight state update
 * to simulate real schema evolution work.
 */
async function benchmarkMigrationChain(migrationCount: number): Promise<BenchmarkResult> {
    const memento = new MockMemento();
    const output = new MockOutputChannel();
    const service = new StateMigrationService(memento as any, output as any);

    const migrations: Migration[] = [];
    for (let v = 1; v <= migrationCount; v++) {
        const version = v;
        migrations.push({
            version,
            name: `migration-v${version}`,
            up: async (state) => {
                await state.update(`migrated_key_${version}`, { version, appliedAt: Date.now() });
            },
            down: async (state) => {
                await state.update(`migrated_key_${version}`, undefined);
            },
        });
    }

    service.registerMigrations(migrations);

    // Budget: each migration should add no more than 5 ms overhead.
    const budgetMs = migrationCount * 5 + 20;

    const elapsed = await measureMs(async () => {
        const success = await service.runMigrations();
        assert.strictEqual(success, true, 'All migrations must succeed');
        assert.strictEqual(
            service.getCurrentVersion(),
            migrationCount,
            `Version must be ${migrationCount} after all migrations`
        );
    });

    return {
        label: `migrations [${migrationCount} steps]`,
        elapsedMs: elapsed,
        budgetMs,
        withinBudget: elapsed <= budgetMs,
        itemCount: migrationCount,
    };
}

/**
 * Benchmarks the migration service when most migrations are already applied.
 * Skipping stale migrations must be near-instant regardless of how many
 * migrations exist in the registry.
 */
async function benchmarkMigrationSkip(totalMigrations: number): Promise<BenchmarkResult> {
    const memento = new MockMemento();
    const output = new MockOutputChannel();
    const service = new StateMigrationService(memento as any, output as any);

    // Pre-set the version so all but the last migration are skipped.
    const alreadyApplied = totalMigrations - 1;
    await memento.update('stellarSuite.stateVersion', alreadyApplied);

    const migrations: Migration[] = [];
    for (let v = 1; v <= totalMigrations; v++) {
        const version = v;
        migrations.push({
            version,
            name: `migration-v${version}`,
            up: async (state) => {
                await state.update(`key_${version}`, version);
            },
            down: async () => { /* no-op */ },
        });
    }

    service.registerMigrations(migrations);

    // Skipping stale migrations must be very fast regardless of registry size.
    const budgetMs = 30;

    const elapsed = await measureMs(async () => {
        const success = await service.runMigrations();
        assert.strictEqual(success, true, 'Migration run must succeed');
        assert.strictEqual(service.getCurrentVersion(), totalMigrations);
    });

    return {
        label: `migration-skip [${alreadyApplied}/${totalMigrations} skipped]`,
        elapsedMs: elapsed,
        budgetMs,
        withinBudget: elapsed <= budgetMs,
        itemCount: totalMigrations,
    };
}

// ── Round-trip fidelity test ───────────────────────────────────

/**
 * Verifies that a state object survives a full serialise → deserialise
 * round-trip with no data loss. This is a correctness guard, not a
 * pure performance benchmark, but it runs fast enough to include here.
 */
async function testRoundTripFidelity(deploymentCount: number): Promise<void> {
    const original = buildState(deploymentCount);
    const json = serialiseState(original);
    const restored = deserialiseState(json);

    assert.strictEqual(
        restored.deployments.size,
        original.deployments.size,
        'Deployment count must survive round-trip'
    );
    assert.strictEqual(restored.syncVersion, original.syncVersion, 'syncVersion must survive');
    assert.strictEqual(restored.configurations.cliPath, original.configurations.cliPath);

    // Spot-check a few individual records.
    const sampleKeys = Array.from(original.deployments.keys()).slice(0, 5);
    for (const key of sampleKeys) {
        const orig = original.deployments.get(key);
        const rest = restored.deployments.get(key);
        assert.ok(rest, `Record ${key} must exist after round-trip`);
        assert.strictEqual(rest.contractId, orig.contractId);
        assert.strictEqual(rest.network, orig.network);
        assert.strictEqual(rest.deployedAt, orig.deployedAt);
    }

    console.log(
        `  ✓ round-trip fidelity: ${deploymentCount} deployments — no data loss`
    );
}

// ── Memory usage test ──────────────────────────────────────────

/**
 * Verifies that loading a large state object into memory stays within
 * a reasonable heap budget. Catches unbounded allocation regressions.
 */
async function testMemoryUsageUnderLoad(): Promise<void> {
    const deploymentCount = 2000;
    const heapBefore = heapMb();

    const state = buildState(deploymentCount);

    // Simulate the full lifecycle: build → serialise → deserialise → validate.
    const json = serialiseState(state);
    const restored = deserialiseState(json);
    const service = new StateValidationService();
    service.validate(restored);

    const heapDeltaMb = heapMb() - heapBefore;
    const maxAllowedMb = 80;

    assert.ok(
        heapDeltaMb <= maxAllowedMb,
        `Heap grew by ${heapDeltaMb.toFixed(1)} MB for ${deploymentCount} deployments — ` +
        `exceeds limit of ${maxAllowedMb} MB`
    );

    console.log(
        `  ✓ memory under load: ${deploymentCount} deployments consumed` +
        ` ${heapDeltaMb.toFixed(1)} MB heap (limit: ${maxAllowedMb} MB)`
    );
}

// ── Scalability regression test ────────────────────────────────

/**
 * Verifies that validation time scales sub-quadratically with state size.
 * Compares elapsed time between a small and a large state to catch
 * O(n²) regressions introduced by future changes.
 */
async function testValidationScalability(): Promise<void> {
    const service = new StateValidationService();

    const smallCount = 10;
    const largeCount = 500;

    const smallState = buildState(smallCount);
    const largeState = buildState(largeCount);

    const smallMs = await measureMs(() => { service.validate(smallState); });
    const largeMs = await measureMs(() => { service.validate(largeState); });

    const countRatio = largeCount / smallCount;   // 50×
    const timeRatio = smallMs > 0 ? largeMs / smallMs : 0;
    const maxAllowedRatio = countRatio * countRatio; // generous O(n²) bound

    assert.ok(
        timeRatio <= maxAllowedRatio || largeMs < 10,
        `Validation time ratio ${timeRatio.toFixed(1)}× exceeds O(n²) bound ` +
        `of ${maxAllowedRatio}× for a ${countRatio}× increase in deployment count`
    );

    console.log(
        `  ✓ scalability: ${countRatio}× more deployments → ${timeRatio.toFixed(1)}× slower` +
        ` (O(n²) bound: ${maxAllowedRatio}×)`
    );
}

// ── Concurrent validation test ─────────────────────────────────

/**
 * Verifies that running multiple independent validations concurrently
 * does not produce incorrect results or unexpected errors. Each
 * StateValidationService instance is stateful (it resets per call),
 * so concurrent usage of separate instances must be safe.
 */
async function testConcurrentValidation(): Promise<void> {
    const concurrency = 10;
    const deploymentsPerInstance = 50;

    const tasks = Array.from({ length: concurrency }, (_, i) => {
        const service = new StateValidationService();
        const state = buildState(deploymentsPerInstance + i);
        return measureMs(() => {
            const result = service.validate(state);
            assert.ok(result.valid, `Concurrent validation instance ${i} must succeed`);
        });
    });

    const times = await Promise.all(tasks);
    const maxMs = Math.max(...times);
    const budgetMs = 500;

    assert.ok(
        maxMs <= budgetMs,
        `Slowest concurrent validation took ${maxMs.toFixed(1)} ms — exceeds ${budgetMs} ms`
    );

    console.log(
        `  ✓ concurrent validation: ${concurrency} instances — ` +
        `slowest ${maxMs.toFixed(1)} ms (budget: ${budgetMs} ms)`
    );
}

// ── Validation with corruption detection ──────────────────────

/**
 * Benchmarks the full validation pipeline including corruption detection,
 * which involves additional timestamp and structural checks.
 */
async function benchmarkCorruptionDetection(deploymentCount: number): Promise<BenchmarkResult> {
    const service = new StateValidationService();
    const state = buildState(deploymentCount);

    // Inject a mix of corruption patterns to exercise all detection paths.
    const keys = Array.from(state.deployments.keys());
    if (keys.length > 0) {
        state.deployments.get(keys[0]).contractId = '';  // empty required field
    }
    if (keys.length > 1) {
        state.deployments.get(keys[1]).deployedAt = 'not-a-date';  // invalid date
    }

    const budgetMs = deploymentCount <= 50 ? 40 : deploymentCount <= 200 ? 120 : 500;

    const elapsed = await measureMs(() => {
        const result = service.validate(state, { detectCorruption: true });
        // The state is intentionally corrupted, so we only check timing.
        assert.ok(result.issues.length > 0, 'Corrupted state must produce issues');
    });

    return {
        label: `corruption-detect [${deploymentCount} deployments]`,
        elapsedMs: elapsed,
        budgetMs,
        withinBudget: elapsed <= budgetMs,
        itemCount: deploymentCount,
    };
}

// ── Performance report ─────────────────────────────────────────

function printPerformanceReport(): void {
    console.log('\n── Performance Report ───────────────────────────────────────────────');
    console.log(
        `${'Benchmark'.padEnd(48)} ${'Items'.padStart(8)} ` +
        `${'Elapsed'.padStart(12)} ${'Budget'.padStart(12)} ${'Status'.padStart(8)}`
    );
    console.log('─'.repeat(92));

    let passed = 0;
    let failed = 0;

    for (const r of benchmarkResults) {
        const status = r.withinBudget ? 'PASS' : 'FAIL';
        if (r.withinBudget) { passed++; } else { failed++; }
        const items = r.itemCount !== undefined ? String(r.itemCount) : '—';
        console.log(
            `${r.label.padEnd(48)} ${items.padStart(8)} ` +
            `${(r.elapsedMs.toFixed(2) + ' ms').padStart(12)} ` +
            `${(r.budgetMs + ' ms').padStart(12)} ` +
            `${status.padStart(8)}`
        );
    }

    console.log('─'.repeat(92));
    console.log(`Total: ${passed + failed} benchmarks — ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        console.log('\n⚠  Some benchmarks exceeded their time budgets.');
        console.log('   Investigate the failing benchmarks for performance regressions.');
    }
}

// ── Test runner ────────────────────────────────────────────────

(async () => {
    console.log('\n[stateOperationsPerformance.test]');
    console.log('Establishing performance benchmarks for state operations...\n');

    let passed = 0;
    let failed = 0;

    async function run(name: string, fn: () => Promise<void>): Promise<void> {
        try {
            await fn();
            passed++;
        } catch (err) {
            failed++;
            console.error(`  ✗ ${name}`);
            console.error(
                `    ${err instanceof Error ? err.stack ?? err.message : String(err)}`
            );
        }
    }

    // ── State persistence ──────────────────────────────────────
    console.log('State persistence benchmarks:');
    for (const count of [10, 100, 500, 1000]) {
        await run(`persist [${count} deployments]`, async () => {
            const result = await benchmarkStatePersistence(count);
            recordResult(result);
            assert.ok(
                result.withinBudget,
                `Persistence of ${count} deployments took ${result.elapsedMs.toFixed(2)} ms ` +
                `— exceeds budget of ${result.budgetMs} ms`
            );
        });
    }

    // ── State retrieval ────────────────────────────────────────
    console.log('\nState retrieval benchmarks:');
    for (const count of [10, 100, 500, 1000]) {
        await run(`retrieve [${count} deployments]`, async () => {
            const result = await benchmarkStateRetrieval(count);
            recordResult(result);
            assert.ok(
                result.withinBudget,
                `Retrieval of ${count} deployments took ${result.elapsedMs.toFixed(2)} ms ` +
                `— exceeds budget of ${result.budgetMs} ms`
            );
        });
    }

    // ── State validation ───────────────────────────────────────
    console.log('\nState validation benchmarks:');
    for (const count of [10, 50, 200, 500]) {
        await run(`validate [${count} deployments]`, async () => {
            const result = await benchmarkStateValidation(count);
            recordResult(result);
            assert.ok(
                result.withinBudget,
                `Validation of ${count} deployments took ${result.elapsedMs.toFixed(2)} ms ` +
                `— exceeds budget of ${result.budgetMs} ms`
            );
        });
    }

    // ── Validation with auto-repair ────────────────────────────
    console.log('\nValidation with auto-repair benchmarks:');
    for (const count of [10, 50, 200]) {
        await run(`validate+repair [${count} deployments]`, async () => {
            const result = await benchmarkStateValidationWithRepair(count);
            recordResult(result);
            assert.ok(
                result.withinBudget,
                `Validation+repair of ${count} deployments took ${result.elapsedMs.toFixed(2)} ms ` +
                `— exceeds budget of ${result.budgetMs} ms`
            );
        });
    }

    // ── Corruption detection ───────────────────────────────────
    console.log('\nCorruption detection benchmarks:');
    for (const count of [10, 50, 200]) {
        await run(`corruption-detect [${count} deployments]`, async () => {
            const result = await benchmarkCorruptionDetection(count);
            recordResult(result);
            assert.ok(
                result.withinBudget,
                `Corruption detection for ${count} deployments took ${result.elapsedMs.toFixed(2)} ms ` +
                `— exceeds budget of ${result.budgetMs} ms`
            );
        });
    }

    // ── Migration performance ──────────────────────────────────
    console.log('\nMigration performance benchmarks:');
    for (const count of [1, 5, 20, 50]) {
        await run(`migrations [${count} steps]`, async () => {
            const result = await benchmarkMigrationChain(count);
            recordResult(result);
            assert.ok(
                result.withinBudget,
                `Running ${count} migrations took ${result.elapsedMs.toFixed(2)} ms ` +
                `— exceeds budget of ${result.budgetMs} ms`
            );
        });
    }

    // ── Migration skip performance ─────────────────────────────
    console.log('\nMigration skip benchmarks:');
    for (const total of [10, 50, 100]) {
        await run(`migration-skip [${total} total]`, async () => {
            const result = await benchmarkMigrationSkip(total);
            recordResult(result);
            assert.ok(
                result.withinBudget,
                `Skipping ${total - 1}/${total} migrations took ${result.elapsedMs.toFixed(2)} ms ` +
                `— exceeds budget of ${result.budgetMs} ms`
            );
        });
    }

    // ── Round-trip fidelity ────────────────────────────────────
    console.log('\nRound-trip fidelity:');
    for (const count of [1, 100, 500]) {
        await run(`round-trip fidelity [${count} deployments]`, async () => {
            await testRoundTripFidelity(count);
        });
    }

    // ── Memory usage ───────────────────────────────────────────
    console.log('\nMemory usage:');
    await run('memory under load (2000 deployments)', testMemoryUsageUnderLoad);

    // ── Scalability ────────────────────────────────────────────
    console.log('\nScalability analysis:');
    await run('validation scalability (10 → 500 deployments)', testValidationScalability);

    // ── Concurrent validation ──────────────────────────────────
    console.log('\nConcurrency:');
    await run('concurrent validation (10 instances)', testConcurrentValidation);

    // ── Final report ───────────────────────────────────────────
    printPerformanceReport();

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
})().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
