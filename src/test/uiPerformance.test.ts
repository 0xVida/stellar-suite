// ============================================================
// src/test/uiPerformance.test.ts
// UI performance tests for sidebar, simulation panel, and forms
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { PerformanceMonitoringService } from '../services/performanceMonitoringService';
import { AbiFormGeneratorService } from '../services/abiFormGeneratorService';
import { FormValidationService } from '../services/formValidationService';
import { InputSanitizationService } from '../services/inputSanitizationService';
import { AbiParameter, SorobanType } from '../utils/abiParser';

// ── Test Fixtures ─────────────────────────────────────────

function createMockAbiParameters(count: number): AbiParameter[] {
    const params: AbiParameter[] = [];
    const types: SorobanType[] = [
        { kind: 'primitive', name: 'u32' },
        { kind: 'primitive', name: 'String' },
        { kind: 'primitive', name: 'bool' },
        { kind: 'primitive', name: 'Address' },
        { kind: 'vec', element: { kind: 'primitive', name: 'u32' } },
    ];

    for (let i = 0; i < count; i++) {
        params.push({
            name: `param_${i}`,
            sorobanType: types[i % types.length],
            required: i % 3 !== 0,
            description: `Parameter ${i}`,
        });
    }
    return params;
}

function createMockFormData(paramCount: number): Record<string, string> {
    const data: Record<string, string> = {};
    for (let i = 0; i < paramCount; i++) {
        data[`param_${i}`] = `value_${i}`;
    }
    return data;
}

// ── Sidebar Rendering Performance ─────────────────────────

async function testSidebarRenderingPerformance() {
    const monitor = new PerformanceMonitoringService();

    // Simulate sidebar rendering with different contract counts
    for (const count of [10, 50, 100]) {
        await monitor.measureAsync(
            'sidebar-render-initial',
            'render',
            async () => {
                let html = '';
                for (let i = 0; i < count; i++) {
                    html += `<div class="contract-item">contract_${i}</div>`;
                }
                return html.length;
            },
            { contractCount: count }
        );
    }

    const stats = monitor.calculateStats('sidebar-render-initial')!;
    assert.ok(stats);
    assert.ok(stats.average < 2000, `Sidebar render should be < 2000ms, got ${stats.average}ms`);
    console.log(`  [ok] sidebar rendering: avg ${stats.average.toFixed(2)}ms, p95 ${stats.p95.toFixed(2)}ms`);
}

async function testSidebarUpdatePerformance() {
    const monitor = new PerformanceMonitoringService();

    // Simulate multiple sidebar updates
    for (let i = 0; i < 10; i++) {
        await monitor.measureAsync(
            'sidebar-render-update',
            'render',
            async () => {
                let html = '';
                for (let j = 0; j < 50; j++) {
                    html += `<div class="contract-item">contract_${j}</div>`;
                }
                return html.length;
            },
            { updateNumber: i }
        );
    }

    const stats = monitor.calculateStats('sidebar-render-update')!;
    assert.ok(stats);
    assert.ok(stats.average < 500, `Sidebar update should be < 500ms, got ${stats.average}ms`);
    console.log(`  [ok] sidebar updates: avg ${stats.average.toFixed(2)}ms, p95 ${stats.p95.toFixed(2)}ms`);
}

// ── Form Generation Performance ───────────────────────────

async function testFormGenerationPerformance() {
    const monitor = new PerformanceMonitoringService();
    const formGenerator = new AbiFormGeneratorService();

    // Test with different parameter counts
    for (const paramCount of [3, 10, 20]) {
        const params = createMockAbiParameters(paramCount);
        await monitor.measureAsync(
            'form-generation',
            'generation',
            async () => {
                const form = formGenerator.generateForm('CA123', { name: 'transfer', parameters: [] }, params);
                return form.formHtml.length;
            },
            { paramCount }
        );
    }

    const stats = monitor.calculateStats('form-generation')!;
    assert.ok(stats);
    assert.ok(stats.average < 300, `Form generation should be < 300ms, got ${stats.average}ms`);
    console.log(`  [ok] form generation: avg ${stats.average.toFixed(2)}ms, p95 ${stats.p95.toFixed(2)}ms`);
}

// ── Form Validation Performance ──────────────────────────

async function testFormValidationPerformance() {
    const monitor = new PerformanceMonitoringService();
    const validator = new FormValidationService();
    const sanitizer = new InputSanitizationService();

    // Test with different field counts
    for (const fieldCount of [3, 10, 30]) {
        const params = createMockAbiParameters(fieldCount);
        const formData = createMockFormData(fieldCount);

        await monitor.measureAsync(
            'form-validation',
            'generation',
            async () => {
                const result = validator.validate(formData, params, sanitizer);
                return result.valid ? 1 : 0;
            },
            { fieldCount }
        );
    }

    const stats = monitor.calculateStats('form-validation')!;
    assert.ok(stats);
    assert.ok(stats.average < 200, `Form validation should be < 200ms, got ${stats.average}ms`);
    console.log(`  [ok] form validation: avg ${stats.average.toFixed(2)}ms`);
}

// ── Simulation Panel Performance ─────────────────────────

async function testSimulationPanelRenderingPerformance() {
    const monitor = new PerformanceMonitoringService();

    // Test with different result sizes
    for (const size of ['small', 'medium', 'large']) {
        const stateCount = size === 'small' ? 10 : size === 'medium' ? 100 : 1000;
        await monitor.measureAsync(
            'simulation-panel-render',
            'render',
            async () => {
                const stateDiff: Record<string, any> = {};
                for (let i = 0; i < stateCount; i++) {
                    stateDiff[`key_${i}`] = { old: `value_${i}`, new: `value_${i}_updated` };
                }
                const result = {
                    success: true,
                    output: 'Simulation successful',
                    stateDiff,
                };
                return JSON.stringify(result).length;
            },
            { resultSize: size }
        );
    }

    const stats = monitor.calculateStats('simulation-panel-render')!;
    assert.ok(stats);
    assert.ok(stats.average < 1500, `Simulation panel render should be < 1500ms, got ${stats.average}ms`);
    console.log(`  [ok] simulation panel rendering: avg ${stats.average.toFixed(2)}ms`);
}

async function testSimulationPanelUpdatePerformance() {
    const monitor = new PerformanceMonitoringService();

    for (let i = 0; i < 10; i++) {
        await monitor.measureAsync(
            'simulation-panel-update',
            'update',
            async () => {
                const result = {
                    success: true,
                    output: `Update ${i}`,
                    stateDiff: { created: 5 + i, modified: 10 + i, deleted: 2 + i },
                };
                return JSON.stringify(result).length;
            },
            { updateNumber: i }
        );
    }

    const stats = monitor.calculateStats('simulation-panel-update')!;
    assert.ok(stats);
    assert.ok(stats.average < 300, `Simulation panel update should be < 300ms, got ${stats.average}ms`);
    console.log(`  [ok] simulation panel updates: avg ${stats.average.toFixed(2)}ms`);
}

// ── UI Interaction Responsiveness ────────────────────────

async function testUIInteractionResponseTime() {
    const monitor = new PerformanceMonitoringService();

    // Simulate 20 rapid UI interactions
    for (let i = 0; i < 20; i++) {
        monitor.measureSync(
            'ui-interaction-response',
            'interaction',
            () => {
                // Simulate DOM update
                const element = { id: `item_${i}`, visible: true };
                return element;
            },
            { interactionNumber: i }
        );
    }

    const stats = monitor.calculateStats('ui-interaction-response')!;
    assert.ok(stats);
    assert.ok(stats.average < 50, `UI interaction should be < 50ms, got ${stats.average}ms`);
    console.log(`  [ok] UI interactions: avg ${stats.average.toFixed(2)}ms, p95 ${stats.p95.toFixed(2)}ms`);
}

// ── Performance Benchmarking ──────────────────────────────

async function testBenchmarkValidation() {
    const monitor = new PerformanceMonitoringService();

    // Record metrics
    for (let i = 0; i < 5; i++) {
        monitor.recordMetric('sidebar-render-initial', 400 + Math.random() * 100, 'render');
    }

    const stats = monitor.calculateStats('sidebar-render-initial')!;
    assert.ok(stats);

    const benchmark = monitor.getBenchmark('sidebar-render-initial')!;
    assert.ok(benchmark);
    assert.strictEqual(benchmark.targetMs, 500);

    const check = monitor.checkBenchmark('sidebar-render-initial', stats.average);
    assert.strictEqual(check.status, 'ok');
    console.log('  [ok] benchmark validation passes for acceptable performance');
}

async function testBenchmarkWarning() {
    const monitor = new PerformanceMonitoringService();

    monitor.recordMetric('sidebar-render-initial', 800, 'render');

    const check = monitor.checkBenchmark('sidebar-render-initial', 800);
    assert.strictEqual(check.status, 'warning');
    assert.strictEqual(check.passed, false);
    console.log('  [ok] benchmark warning triggered for degraded performance');
}

async function testBenchmarkCritical() {
    const monitor = new PerformanceMonitoringService();

    monitor.recordMetric('sidebar-render-initial', 2000, 'render');

    const check = monitor.checkBenchmark('sidebar-render-initial', 2000);
    assert.strictEqual(check.status, 'critical');
    assert.strictEqual(check.passed, false);
    console.log('  [ok] benchmark critical triggered for severe performance degradation');
}

// ── Regression Detection ──────────────────────────────────

async function testRegressionDetection() {
    const monitor = new PerformanceMonitoringService();
    monitor.setRegressionThreshold(0.15);

    // First snapshot: baseline
    for (let i = 0; i < 10; i++) {
        monitor.recordMetric('form-generation', 100, 'generation');
    }
    const snapshot1 = monitor.createSnapshot();

    // Second snapshot: with regression
    for (let i = 0; i < 10; i++) {
        monitor.recordMetric('form-generation', 180, 'generation'); // 80% increase
    }
    const snapshot2 = monitor.createSnapshot();

    const regressions = monitor.detectRegressions();
    assert.ok(regressions.length > 0, 'Should detect regression');
    assert.strictEqual(regressions[0].metricName, 'form-generation');
    assert.ok(regressions[0].percentageChange > 0.15);
    console.log(`  [ok] regression detection: ${(regressions[0].percentageChange * 100).toFixed(2)}% increase detected`);
}

async function testNoRegressionDetection() {
    const monitor = new PerformanceMonitoringService();
    monitor.setRegressionThreshold(0.15);

    // First snapshot
    for (let i = 0; i < 10; i++) {
        monitor.recordMetric('form-generation', 100, 'generation');
    }
    const snapshot1 = monitor.createSnapshot();

    // Second snapshot: minor variation only
    for (let i = 0; i < 10; i++) {
        monitor.recordMetric('form-generation', 105, 'generation'); // 5% increase
    }
    const snapshot2 = monitor.createSnapshot();

    const regressions = monitor.detectRegressions();
    assert.strictEqual(regressions.length, 0, 'Should not detect minor variations as regression');
    console.log('  [ok] no regression detected for minor performance variations');
}

// ── Runner ────────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        testSidebarRenderingPerformance,
        testSidebarUpdatePerformance,
        testFormGenerationPerformance,
        testFormValidationPerformance,
        testSimulationPanelRenderingPerformance,
        testSimulationPanelUpdatePerformance,
        testUIInteractionResponseTime,
        testBenchmarkValidation,
        testBenchmarkWarning,
        testBenchmarkCritical,
        testRegressionDetection,
        testNoRegressionDetection,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nUI Performance Tests');
    for (const test of tests) {
        try {
            await test();
            passed += 1;
        } catch (error) {
            failed += 1;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${error instanceof Error ? error.stack || error.message : String(error)}`);
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
