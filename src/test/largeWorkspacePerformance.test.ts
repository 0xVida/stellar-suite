// ============================================================
// src/test/largeWorkspacePerformance.test.ts
// Performance tests for large workspace handling.
//
// Measures extension behaviour at various workspace scales:
//   - Contract detection time
//   - Memory footprint during detection
//   - Sidebar filter/search throughput
//   - State serialisation and persistence overhead
//   - Dependency graph resolution time
//   - Regression detection via enforced time budgets
//
// Run with:  node out-test/test/largeWorkspacePerformance.test.js
// ============================================================

declare function require(name: string): any;
declare const process: {
    exitCode?: number;
    memoryUsage(): { heapUsed: number; heapTotal: number; rss: number };
    hrtime(time?: [number, number]): [number, number];
    exit(code: number): never;
};

const assert = require('assert');

import {
    generateWorkspace,
    generateDeploymentHistory,
    toSidebarItems,
    WORKSPACE_SCALES,
    FILTER_SCENARIOS,
    WorkspaceScale,
    SidebarContractItem,
    ContractFilterState,
} from './fixtures/largeWorkspaceFixtures';
import { resolveDeploymentDependencies } from '../services/deploymentDependencyResolver';

// ── Timing helpers ────────────────────────────────────────────

/** Returns a high-resolution timestamp in milliseconds. */
function now(): number {
    const [sec, ns] = process.hrtime();
    return sec * 1_000 + ns / 1_000_000;
}

/** Measures elapsed wall-clock time for an async operation. */
async function measureMs(fn: () => Promise<void> | void): Promise<number> {
    const start = now();
    await fn();
    return now() - start;
}

/** Returns current heap usage in megabytes. */
function heapMb(): number {
    return process.memoryUsage().heapUsed / 1_048_576;
}

// ── Performance result types ──────────────────────────────────

interface BenchmarkResult {
    label: string;
    contractCount: number;
    elapsedMs: number;
    budgetMs: number;
    withinBudget: boolean;
    heapDeltaMb?: number;
}

/** Accumulated results for the final performance report. */
const benchmarkResults: BenchmarkResult[] = [];

function recordResult(result: BenchmarkResult): void {
    benchmarkResults.push(result);
    const status = result.withinBudget ? '✓' : '✗ OVER BUDGET';
    const heap = result.heapDeltaMb !== undefined
        ? ` | heap Δ ${result.heapDeltaMb.toFixed(1)} MB`
        : '';
    console.log(
        `  ${status} [${result.label}] ${result.contractCount} contracts` +
        ` — ${result.elapsedMs.toFixed(1)} ms (budget: ${result.budgetMs} ms)${heap}`
    );
}

// ── Contract detection simulation ────────────────────────────

/**
 * Simulates the workspace scan step that discovers and parses
 * Cargo.toml files. In production this involves filesystem I/O;
 * here we measure the pure in-memory processing cost of building
 * the contract metadata index from pre-parsed data.
 */
async function simulateContractDetection(
    scale: WorkspaceScale
): Promise<BenchmarkResult> {
    const { contracts } = generateWorkspace(scale.contractCount);

    const heapBefore = heapMb();
    const elapsed = await measureMs(() => {
        // Simulate the indexing step: build lookup maps by name and path,
        // which mirrors what ContractMetadataService does internally.
        const byName = new Map<string, typeof contracts[0]>();
        const byPath = new Map<string, typeof contracts[0]>();

        for (const c of contracts) {
            byName.set(c.contractName, c);
            byPath.set(c.cargoTomlPath, c);
        }

        // Simulate the template-category detection pass that iterates
        // all contracts and checks keyword/dependency patterns.
        let tokenCount = 0;
        let escrowCount = 0;
        for (const c of contracts) {
            if (c.contractName.includes('token')) { tokenCount++; }
            if (c.contractName.includes('escrow')) { escrowCount++; }
        }

        // Ensure the compiler doesn't optimise away the work.
        assert.ok(byName.size === scale.contractCount);
        assert.ok(byPath.size === scale.contractCount);
        assert.ok(tokenCount >= 0);
        assert.ok(escrowCount >= 0);
    });
    const heapDeltaMb = heapMb() - heapBefore;

    return {
        label: `detection [${scale.label}]`,
        contractCount: scale.contractCount,
        elapsedMs: elapsed,
        budgetMs: scale.detectionBudgetMs,
        withinBudget: elapsed <= scale.detectionBudgetMs,
        heapDeltaMb,
    };
}

// ── Memory usage test ─────────────────────────────────────────

/**
 * Measures heap growth when loading a large workspace into memory.
 * Asserts that memory usage stays within a reasonable bound relative
 * to the number of contracts (no unbounded allocations).
 */
async function testMemoryUsageWithLargeWorkspace(): Promise<void> {
    const contractCount = 1000;
    const { contracts } = generateWorkspace(contractCount);

    const heapBefore = heapMb();

    // Build the full in-memory index that the sidebar and services use.
    const index = new Map<string, typeof contracts[0]>();
    for (const c of contracts) {
        index.set(c.contractName, c);
    }

    const heapAfter = heapMb();
    const deltaMb = heapAfter - heapBefore;

    // Each contract record is small; 1000 contracts should not exceed 50 MB.
    const maxAllowedMb = 50;
    assert.ok(
        deltaMb <= maxAllowedMb,
        `Heap grew by ${deltaMb.toFixed(1)} MB for ${contractCount} contracts — ` +
        `exceeds limit of ${maxAllowedMb} MB`
    );

    console.log(
        `  ✓ memory usage: ${contractCount} contracts consumed` +
        ` ${deltaMb.toFixed(1)} MB heap (limit: ${maxAllowedMb} MB)`
    );
}

// ── Sidebar filter/search benchmarks ─────────────────────────

/**
 * Applies a filter predicate to a list of sidebar contract items.
 * This mirrors the filter logic embedded in the sidebar webview.
 */
function applyFilter(
    items: SidebarContractItem[],
    filter: ContractFilterState
): SidebarContractItem[] {
    return items.filter(item => {
        if (filter.build === 'built' && !item.isBuilt) { return false; }
        if (filter.build === 'not-built' && item.isBuilt) { return false; }
        if (filter.deploy === 'deployed' && !item.contractId) { return false; }
        if (filter.deploy === 'not-deployed' && item.contractId) { return false; }
        if (filter.template && item.templateCategory !== filter.template) { return false; }
        if (filter.search) {
            const q = filter.search.toLowerCase();
            if (!item.name.toLowerCase().includes(q)) { return false; }
        }
        return true;
    });
}

/**
 * Benchmarks the filter/search path across all scale presets and
 * all representative filter scenarios.
 */
async function benchmarkFilterPerformance(scale: WorkspaceScale): Promise<BenchmarkResult> {
    const { contracts } = generateWorkspace(scale.contractCount);
    const deployedIds = new Set(
        contracts
            .filter((_, i) => i % 3 === 0)
            .map(c => c.contractName)
    );
    const items = toSidebarItems(contracts, deployedIds);

    let totalElapsed = 0;

    for (const scenario of FILTER_SCENARIOS) {
        const elapsed = await measureMs(() => {
            const results = applyFilter(items, scenario);
            // Prevent dead-code elimination.
            assert.ok(results.length >= 0);
        });
        totalElapsed += elapsed;
    }

    const avgElapsed = totalElapsed / FILTER_SCENARIOS.length;

    return {
        label: `filter [${scale.label}]`,
        contractCount: scale.contractCount,
        elapsedMs: avgElapsed,
        budgetMs: scale.filterBudgetMs,
        withinBudget: avgElapsed <= scale.filterBudgetMs,
    };
}

// ── State persistence benchmarks ──────────────────────────────

/**
 * Benchmarks JSON serialisation and deserialisation of the deployment
 * history — the primary state blob persisted to VS Code workspace state.
 * Large histories must round-trip quickly to avoid blocking the UI.
 */
async function benchmarkStatePersistence(recordCount: number): Promise<void> {
    const history = generateDeploymentHistory(recordCount);

    const serializeBudgetMs = 50;
    const deserializeBudgetMs = 50;

    const serializeMs = await measureMs(() => {
        const serialized = JSON.stringify(history);
        assert.ok(serialized.length > 0);
    });

    const serialized = JSON.stringify(history);

    const deserializeMs = await measureMs(() => {
        const parsed = JSON.parse(serialized);
        assert.ok(Array.isArray(parsed));
        assert.strictEqual(parsed.length, recordCount);
    });

    assert.ok(
        serializeMs <= serializeBudgetMs,
        `Serialisation of ${recordCount} records took ${serializeMs.toFixed(1)} ms ` +
        `— exceeds budget of ${serializeBudgetMs} ms`
    );
    assert.ok(
        deserializeMs <= deserializeBudgetMs,
        `Deserialisation of ${recordCount} records took ${deserializeMs.toFixed(1)} ms ` +
        `— exceeds budget of ${deserializeBudgetMs} ms`
    );

    console.log(
        `  ✓ state persistence: ${recordCount} records — ` +
        `serialize ${serializeMs.toFixed(1)} ms, ` +
        `deserialize ${deserializeMs.toFixed(1)} ms`
    );
}

// ── Dependency graph resolution benchmarks ────────────────────

/**
 * Benchmarks the topological sort and cycle-detection pass that
 * determines deployment order for a workspace with many contracts.
 */
async function benchmarkDependencyResolution(scale: WorkspaceScale): Promise<BenchmarkResult> {
    const { contracts } = generateWorkspace(scale.contractCount);

    // Budget for dependency resolution is more generous than detection
    // because the graph algorithm is O(V + E).
    const resolutionBudgetMs = scale.detectionBudgetMs * 2;

    const elapsed = await measureMs(() => {
        const result = resolveDeploymentDependencies(contracts as any);
        assert.ok(result.nodes.length === scale.contractCount);
        assert.ok(result.cycles.length === 0, 'Synthetic workspace should have no cycles');
    });

    return {
        label: `dep-resolution [${scale.label}]`,
        contractCount: scale.contractCount,
        elapsedMs: elapsed,
        budgetMs: resolutionBudgetMs,
        withinBudget: elapsed <= resolutionBudgetMs,
    };
}

// ── Search performance benchmark ──────────────────────────────

/**
 * Measures substring search throughput across a large contract list.
 * This simulates the user typing in the sidebar search box and
 * verifies that results are returned fast enough for a responsive UI.
 */
async function benchmarkSearchPerformance(): Promise<void> {
    const contractCount = 1000;
    const { contracts } = generateWorkspace(contractCount);
    const deployedIds = new Set(contracts.filter((_, i) => i % 4 === 0).map(c => c.contractName));
    const items = toSidebarItems(contracts, deployedIds);

    const queries = ['token', 'escrow', 'voting', 'amm', 'nft', '0001', '0500', 'contract'];
    const budgetPerQueryMs = 10;

    for (const query of queries) {
        const elapsed = await measureMs(() => {
            const results = items.filter(item =>
                item.name.toLowerCase().includes(query.toLowerCase())
            );
            assert.ok(results.length >= 0);
        });

        assert.ok(
            elapsed <= budgetPerQueryMs,
            `Search for "${query}" over ${contractCount} contracts took ${elapsed.toFixed(1)} ms ` +
            `— exceeds budget of ${budgetPerQueryMs} ms`
        );
    }

    console.log(
        `  ✓ search performance: ${queries.length} queries over ${contractCount} contracts` +
        ` — all within ${budgetPerQueryMs} ms each`
    );
}

// ── Scalability benchmark ─────────────────────────────────────

/**
 * Verifies that detection time scales sub-quadratically with workspace size.
 * Compares the ratio of elapsed times between the small and large presets
 * against the ratio of contract counts to catch O(n²) regressions.
 */
async function testScalabilityCharacteristics(): Promise<void> {
    const smallScale = WORKSPACE_SCALES[0];  // 10 contracts
    const largeScale = WORKSPACE_SCALES[2];  // 500 contracts

    const { contracts: smallContracts } = generateWorkspace(smallScale.contractCount);
    const { contracts: largeContracts } = generateWorkspace(largeScale.contractCount);

    const smallMs = await measureMs(() => {
        const m = new Map<string, typeof smallContracts[0]>();
        for (const c of smallContracts) { m.set(c.contractName, c); }
        assert.ok(m.size === smallScale.contractCount);
    });

    const largeMs = await measureMs(() => {
        const m = new Map<string, typeof largeContracts[0]>();
        for (const c of largeContracts) { m.set(c.contractName, c); }
        assert.ok(m.size === largeScale.contractCount);
    });

    const countRatio = largeScale.contractCount / smallScale.contractCount;  // 50×
    const timeRatio = smallMs > 0 ? largeMs / smallMs : 0;

    // For O(n) behaviour, timeRatio ≈ countRatio.
    // We allow up to countRatio² as a generous upper bound that still
    // catches catastrophic O(n²) regressions.
    const maxAllowedRatio = countRatio * countRatio;

    assert.ok(
        timeRatio <= maxAllowedRatio || largeMs < 5,
        `Time ratio ${timeRatio.toFixed(1)}× exceeds the O(n²) bound of ${maxAllowedRatio}× ` +
        `for a ${countRatio}× increase in contract count`
    );

    console.log(
        `  ✓ scalability: ${countRatio}× more contracts → ${timeRatio.toFixed(1)}× slower` +
        ` (O(n²) bound: ${maxAllowedRatio}×)`
    );
}

// ── UI rendering simulation ───────────────────────────────────

/**
 * Simulates the HTML generation step that the sidebar webview performs
 * when rendering a large list of contract cards. Measures the time to
 * produce the full HTML string for the contract list.
 */
async function benchmarkUiRendering(contractCount: number): Promise<void> {
    const { contracts } = generateWorkspace(contractCount);
    const deployedIds = new Set(contracts.filter((_, i) => i % 3 === 0).map(c => c.contractName));
    const items = toSidebarItems(contracts, deployedIds);

    const renderBudgetMs = contractCount <= 100 ? 20 : contractCount <= 500 ? 100 : 300;

    const elapsed = await measureMs(() => {
        // Simulate the template rendering loop inside the sidebar webview.
        const parts: string[] = [];
        for (const item of items) {
            parts.push(renderContractCard(item));
        }
        const html = parts.join('\n');
        assert.ok(html.length > 0);
    });

    assert.ok(
        elapsed <= renderBudgetMs,
        `Rendering ${contractCount} contract cards took ${elapsed.toFixed(1)} ms ` +
        `— exceeds budget of ${renderBudgetMs} ms`
    );

    console.log(
        `  ✓ UI rendering: ${contractCount} cards — ${elapsed.toFixed(1)} ms` +
        ` (budget: ${renderBudgetMs} ms)`
    );
}

/** Produces a minimal HTML snippet for a single contract card. */
function renderContractCard(item: SidebarContractItem): string {
    const buildBadge = item.isBuilt
        ? '<span class="badge built">Built</span>'
        : '<span class="badge not-built">Not Built</span>';
    const deployBadge = item.contractId
        ? `<span class="badge deployed">Deployed</span>`
        : '<span class="badge not-deployed">Not Deployed</span>';
    const templateBadge = `<span class="badge template">${escapeHtml(item.templateCategory)}</span>`;

    return [
        `<div class="contract-card" data-name="${escapeHtml(item.name)}">`,
        `  <h3>${escapeHtml(item.name)}</h3>`,
        `  <div class="badges">${buildBadge}${deployBadge}${templateBadge}</div>`,
        item.contractId ? `  <p class="contract-id">${escapeHtml(item.contractId)}</p>` : '',
        `</div>`,
    ].join('\n');
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Performance report ────────────────────────────────────────

function printPerformanceReport(): void {
    console.log('\n── Performance Report ───────────────────────────────────────');
    console.log(
        `${'Benchmark'.padEnd(40)} ${'Contracts'.padStart(10)} ` +
        `${'Elapsed'.padStart(12)} ${'Budget'.padStart(12)} ${'Status'.padStart(12)}`
    );
    console.log('─'.repeat(90));

    let passed = 0;
    let failed = 0;

    for (const r of benchmarkResults) {
        const status = r.withinBudget ? 'PASS' : 'FAIL';
        if (r.withinBudget) { passed++; } else { failed++; }
        console.log(
            `${r.label.padEnd(40)} ${String(r.contractCount).padStart(10)} ` +
            `${(r.elapsedMs.toFixed(1) + ' ms').padStart(12)} ` +
            `${(r.budgetMs + ' ms').padStart(12)} ` +
            `${status.padStart(12)}`
        );
    }

    console.log('─'.repeat(90));
    console.log(`Total: ${passed + failed} benchmarks — ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        console.log('\n⚠  Some benchmarks exceeded their time budgets.');
        console.log('   Review the results above and investigate regressions.');
    }
}

// ── Test runner ───────────────────────────────────────────────

(async () => {
    console.log('\n[largeWorkspacePerformance.test]');
    console.log('Establishing performance baselines for large workspace handling...\n');

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

    // ── Detection benchmarks across all scales ────────────────
    console.log('Contract detection benchmarks:');
    for (const scale of WORKSPACE_SCALES) {
        await run(`detection [${scale.label}]`, async () => {
            const result = await simulateContractDetection(scale);
            recordResult(result);
            assert.ok(
                result.withinBudget,
                `Detection for ${scale.contractCount} contracts took ${result.elapsedMs.toFixed(1)} ms ` +
                `— exceeds budget of ${scale.detectionBudgetMs} ms`
            );
        });
    }

    // ── Memory usage ──────────────────────────────────────────
    console.log('\nMemory usage:');
    await run('memory usage with 1000 contracts', testMemoryUsageWithLargeWorkspace);

    // ── Filter/search benchmarks ──────────────────────────────
    console.log('\nFilter and search benchmarks:');
    for (const scale of WORKSPACE_SCALES) {
        await run(`filter [${scale.label}]`, async () => {
            const result = await benchmarkFilterPerformance(scale);
            recordResult(result);
            assert.ok(
                result.withinBudget,
                `Filter for ${scale.contractCount} contracts took ${result.elapsedMs.toFixed(1)} ms avg ` +
                `— exceeds budget of ${scale.filterBudgetMs} ms`
            );
        });
    }

    // ── Search performance ────────────────────────────────────
    console.log('\nSearch performance:');
    await run('search performance (1000 contracts, 8 queries)', benchmarkSearchPerformance);

    // ── State persistence ─────────────────────────────────────
    console.log('\nState persistence benchmarks:');
    for (const recordCount of [100, 500, 1000]) {
        await run(`state persistence (${recordCount} records)`, async () => {
            await benchmarkStatePersistence(recordCount);
        });
    }

    // ── Dependency resolution ─────────────────────────────────
    console.log('\nDependency resolution benchmarks:');
    for (const scale of WORKSPACE_SCALES) {
        await run(`dep-resolution [${scale.label}]`, async () => {
            const result = await benchmarkDependencyResolution(scale);
            recordResult(result);
            assert.ok(
                result.withinBudget,
                `Dependency resolution for ${scale.contractCount} contracts took ` +
                `${result.elapsedMs.toFixed(1)} ms — exceeds budget of ${result.budgetMs} ms`
            );
        });
    }

    // ── UI rendering ──────────────────────────────────────────
    console.log('\nUI rendering benchmarks:');
    for (const count of [50, 100, 500, 1000]) {
        await run(`UI rendering (${count} cards)`, async () => {
            await benchmarkUiRendering(count);
        });
    }

    // ── Scalability characteristics ───────────────────────────
    console.log('\nScalability analysis:');
    await run('scalability characteristics (10 → 500 contracts)', testScalabilityCharacteristics);

    // ── Final report ──────────────────────────────────────────
    printPerformanceReport();

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
})().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
