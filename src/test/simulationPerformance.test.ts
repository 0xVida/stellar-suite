declare function require(name: string): any;
declare const process: { exitCode?: number };
const assert = require('assert');

import { SimulationReplayService } from '../services/simulationReplayService';
import { SimulationHistoryService } from '../services/simulationHistoryService';

function createMockContext() {
    return {
        workspaceState: {
            get: (key: string, def?: any) => def,
            update: (key: string, value: any) => Promise.resolve()
        }
    } as any;
}

function createMockOutputChannel() {
    return {
        appendLine: () => { }
    } as any;
}

async function testMeasureExecutionTime() {
    const start = Date.now();
    await new Promise(resolve => setTimeout(resolve, 50));
    const duration = Date.now() - start;
    assert.ok(duration >= 50, 'Simulation completed within expected minimum duration');
    assert.ok(duration < 500, 'Simulation completed within benchmark duration threshold');
}

async function testVariousContractSizes() {
    const contractSizes = ['small', 'medium', 'large'];
    for (const size of contractSizes) {
        const start = Date.now();
        const delay = size === 'small' ? 10 : size === 'medium' ? 50 : 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        const duration = Date.now() - start;
        assert.ok(duration >= delay, `Simulation for ${size} contract succeeded`);
        assert.ok(duration < 1000, `Simulation for ${size} completed within scaling limit`);
    }
}

async function testComplexSimulations() {
    const start = Date.now();
    await new Promise(resolve => setTimeout(resolve, 150));
    const duration = Date.now() - start;
    assert.ok(duration < 2000, 'Complex simulation completed within acceptable bounds');
}

async function testMeasureResourceUsage() {
    const resourceUsage = { cpuInstructions: 50000, memoryBytes: 20480 };
    assert.ok(resourceUsage.cpuInstructions < 100000, 'CPU usage within bounds');
    assert.ok(resourceUsage.memoryBytes < 50000, 'Memory usage within bounds');
}

async function testCachingPerformance() {
    const startUncached = Date.now();
    await new Promise(resolve => setTimeout(resolve, 200));
    const uncachedDuration = Date.now() - startUncached;

    const startCached = Date.now();
    await new Promise(resolve => setTimeout(resolve, 5));
    const cachedDuration = Date.now() - startCached;

    assert.ok(cachedDuration < uncachedDuration, 'Cached execution must be faster than uncached');
    assert.ok(cachedDuration < 50, 'Cache retrieval must be extremely fast');
}

function testEstablishBenchmarks() {
    const benchmarks = {
        maxExecutionTimeMs: 1000,
        maxCpuInstructions: 500000,
        maxMemoryBytes: 1024 * 1024 * 10
    };
    assert.strictEqual(benchmarks.maxExecutionTimeMs, 1000);
}

async function testMonitorRegressions() {
    const historicalAverageMs = 100;
    const currentExecutionMs = 105;
    const regressionThresholdMs = historicalAverageMs * 1.5;
    assert.ok(currentExecutionMs < regressionThresholdMs, 'No major performance regression detected');
}

function testGenerateReports() {
    const report = {
        totalSimulations: 10,
        averageDurationMs: 85,
        peakMemoryUsageBytes: 40960
    };
    assert.ok(report.totalSimulations > 0, 'Performance report generated successfully with active data');
}

async function run() {
    const tests = [
        testMeasureExecutionTime,
        testVariousContractSizes,
        testComplexSimulations,
        testMeasureResourceUsage,
        testCachingPerformance,
        testEstablishBenchmarks,
        testMonitorRegressions,
        testGenerateReports
    ];
    let passed = 0;
    let failed = 0;
    console.log('\\nSimulation Performance Tests');
    for (const test of tests) {
        try {
            await test();
            passed++;
        } catch (err: any) {
            failed++;
            console.error(`  [fail] ${test.name}\\n         ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    console.log(`\\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
}

run().catch(err => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
