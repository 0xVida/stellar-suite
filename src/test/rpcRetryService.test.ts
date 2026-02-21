declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { RpcRetryService, ErrorType, RetryConfig } from '../services/rpcRetryService';
import { CircuitState } from '../services/circuitBreaker';

function createRetryService(
    retryConfig?: RetryConfig,
    enableLogging: boolean = false
): RpcRetryService {
    return new RpcRetryService(
        { failureThreshold: 5, consecutiveFailuresThreshold: 3, resetTimeout: 500, successThreshold: 2 },
        retryConfig,
        enableLogging
    );
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Successful execution tests ────────────────────────────────

async function testExecuteWithRetrySuccess() {
    const service = createRetryService({ maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 });
    const result = await service.executeWithRetry('test-op', async () => 'success');

    assert.strictEqual(result, 'success');
    service.dispose();
    console.log('  [ok] executeWithRetry returns result on success');
}

async function testExecuteWithRetrySuccessAfterTransientFailure() {
    const service = createRetryService({ maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 });

    let attempt = 0;
    const result = await service.executeWithRetry('test-op', async () => {
        attempt++;
        if (attempt < 3) {
            throw new Error('ECONNREFUSED');
        }
        return 'recovered';
    });

    assert.strictEqual(result, 'recovered');
    assert.strictEqual(attempt, 3);
    service.dispose();
    console.log('  [ok] retries on transient errors and succeeds');
}

// ── Retry exhaustion tests ────────────────────────────────────

async function testExhaustAllRetries() {
    const service = createRetryService({ maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 50 });

    let attempts = 0;
    let threw = false;
    try {
        await service.executeWithRetry('failing-op', async () => {
            attempts++;
            throw new Error('ETIMEDOUT');
        });
    } catch (error) {
        threw = true;
        assert.ok((error as Error).message.includes('failing-op'));
        assert.ok((error as Error).message.includes('3 attempts'));
    }

    assert.strictEqual(threw, true);
    assert.strictEqual(attempts, 3);
    service.dispose();
    console.log('  [ok] throws after exhausting all retry attempts');
}

// ── Permanent error tests ─────────────────────────────────────

async function testPermanentErrorNoRetry() {
    const service = createRetryService({ maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 });

    let attempts = 0;
    let threw = false;
    try {
        await service.executeWithRetry('perm-op', async () => {
            attempts++;
            throw new Error('401 Unauthorized');
        });
    } catch (error) {
        threw = true;
        assert.ok((error as Error).message.includes('401'));
    }

    assert.strictEqual(threw, true);
    assert.strictEqual(attempts, 1);
    service.dispose();
    console.log('  [ok] permanent errors are not retried');
}

async function testCustomErrorClassifier() {
    const service = createRetryService({ maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 });

    let attempts = 0;
    let threw = false;
    const classifier = (_error: any) => ErrorType.PERMANENT;

    try {
        await service.executeWithRetry('custom-op', async () => {
            attempts++;
            throw new Error('custom failure');
        }, classifier);
    } catch {
        threw = true;
    }

    assert.strictEqual(threw, true);
    assert.strictEqual(attempts, 1);
    service.dispose();
    console.log('  [ok] custom error classifier is respected');
}

// ── Default error classifier tests ────────────────────────────

async function testDefaultClassifierTransientErrors() {
    const transientErrors = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'timeout', 'network', '429', '503', '502', '504'];

    for (const errMsg of transientErrors) {
        const service = createRetryService({ maxAttempts: 2, initialDelayMs: 10, maxDelayMs: 50 });
        let attempts = 0;
        try {
            await service.executeWithRetry(`transient-${errMsg}`, async () => {
                attempts++;
                throw new Error(errMsg);
            });
        } catch {
            // expected
        }
        assert.strictEqual(attempts, 2, `"${errMsg}" should be retried`);
        service.dispose();
    }

    console.log('  [ok] default classifier identifies transient errors');
}

async function testDefaultClassifierPermanentErrors() {
    const permanentErrors = ['401', '403', '400', 'invalid input', 'unauthorized', 'forbidden'];

    for (const errMsg of permanentErrors) {
        const service = createRetryService({ maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 50 });
        let attempts = 0;
        try {
            await service.executeWithRetry(`permanent-${errMsg}`, async () => {
                attempts++;
                throw new Error(errMsg);
            });
        } catch {
            // expected
        }
        assert.strictEqual(attempts, 1, `"${errMsg}" should not be retried`);
        service.dispose();
    }

    console.log('  [ok] default classifier identifies permanent errors');
}

// ── Exponential backoff tests ─────────────────────────────────

async function testExponentialBackoff() {
    const service = createRetryService({
        maxAttempts: 3,
        initialDelayMs: 50,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        useJitter: false
    });

    const timestamps: number[] = [];
    try {
        await service.executeWithRetry('backoff-op', async () => {
            timestamps.push(Date.now());
            throw new Error('ECONNREFUSED');
        });
    } catch {
        // expected
    }

    assert.strictEqual(timestamps.length, 3);

    const delay1 = timestamps[1] - timestamps[0];
    const delay2 = timestamps[2] - timestamps[1];

    // First delay should be ~50ms (initialDelayMs)
    assert.ok(delay1 >= 40, `First delay ${delay1}ms should be >= 40ms`);
    // Second delay should be ~100ms (50 * 2^1)
    assert.ok(delay2 >= 80, `Second delay ${delay2}ms should be >= 80ms`);
    assert.ok(delay2 > delay1, 'Subsequent delays should increase');

    service.dispose();
    console.log('  [ok] backoff delays increase exponentially');
}

async function testMaxDelayIsCapped() {
    const service = createRetryService({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 120,
        backoffMultiplier: 10,
        useJitter: false
    });

    const timestamps: number[] = [];
    try {
        await service.executeWithRetry('cap-op', async () => {
            timestamps.push(Date.now());
            throw new Error('network');
        });
    } catch {
        // expected
    }

    if (timestamps.length >= 3) {
        const delay2 = timestamps[2] - timestamps[1];
        // Should be capped at maxDelayMs (120ms), not 100 * 10 = 1000ms
        assert.ok(delay2 < 300, `Delay ${delay2}ms should be capped near maxDelayMs`);
    }

    service.dispose();
    console.log('  [ok] delay is capped at maxDelayMs');
}

// ── Circuit breaker integration tests ─────────────────────────

async function testCircuitBreakerOpens() {
    const service = createRetryService({ maxAttempts: 1, initialDelayMs: 10, maxDelayMs: 50 });

    // Trigger enough failures to open the circuit
    for (let i = 0; i < 4; i++) {
        try {
            await service.executeWithRetry(`fail-${i}`, async () => {
                throw new Error('ECONNREFUSED');
            });
        } catch {
            // expected
        }
    }

    const state = service.getCircuitState();
    assert.strictEqual(state, CircuitState.OPEN);

    service.dispose();
    console.log('  [ok] circuit breaker opens after consecutive failures');
}

async function testCircuitBreakerRejectsWhenOpen() {
    const service = createRetryService({ maxAttempts: 1, initialDelayMs: 10, maxDelayMs: 50 });

    // Open the circuit
    for (let i = 0; i < 4; i++) {
        try {
            await service.executeWithRetry(`fail-${i}`, async () => {
                throw new Error('ECONNREFUSED');
            });
        } catch {
            // expected
        }
    }

    assert.strictEqual(service.getCircuitState(), CircuitState.OPEN);

    let threw = false;
    try {
        await service.executeWithRetry('blocked-op', async () => 'should not run');
    } catch (error) {
        threw = true;
        assert.ok((error as Error).message.includes('Circuit breaker OPEN'));
    }

    assert.strictEqual(threw, true);
    service.dispose();
    console.log('  [ok] circuit breaker rejects requests when open');
}

async function testCircuitBreakerReset() {
    const service = createRetryService({ maxAttempts: 1, initialDelayMs: 10, maxDelayMs: 50 });

    // Open the circuit
    for (let i = 0; i < 4; i++) {
        try {
            await service.executeWithRetry(`fail-${i}`, async () => {
                throw new Error('ECONNREFUSED');
            });
        } catch {
            // expected
        }
    }

    assert.strictEqual(service.getCircuitState(), CircuitState.OPEN);

    service.resetCircuit();
    assert.strictEqual(service.getCircuitState(), CircuitState.CLOSED);

    const result = await service.executeWithRetry('after-reset', async () => 'works again');
    assert.strictEqual(result, 'works again');

    service.dispose();
    console.log('  [ok] circuit breaker can be manually reset');
}

// ── Statistics tests ──────────────────────────────────────────

async function testRetryStatsTracking() {
    const service = createRetryService({ maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 50 });

    await service.executeWithRetry('stats-op', async () => 'ok');

    const stats = service.getRetryStats('stats-op');
    assert.ok(stats);
    assert.strictEqual(stats!.successfulAttempts, 1);
    assert.strictEqual(stats!.totalAttempts, 1);
    assert.ok(stats!.lastAttemptTime !== null);

    service.dispose();
    console.log('  [ok] retry stats track successful operations');
}

async function testRetryStatsAfterFailure() {
    const service = createRetryService({ maxAttempts: 2, initialDelayMs: 10, maxDelayMs: 50 });

    let attempt = 0;
    await service.executeWithRetry('stats-fail', async () => {
        attempt++;
        if (attempt === 1) throw new Error('ECONNREFUSED');
        return 'ok';
    });

    const stats = service.getRetryStats('stats-fail');
    assert.ok(stats);
    assert.strictEqual(stats!.successfulAttempts, 1);
    assert.strictEqual(stats!.totalAttempts, 1);

    service.dispose();
    console.log('  [ok] retry stats track attempts and successes');
}

async function testGetAllRetryStats() {
    const service = createRetryService({ maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 50 });

    await service.executeWithRetry('op-a', async () => 'a');
    await service.executeWithRetry('op-b', async () => 'b');

    const allStats = service.getAllRetryStats();
    assert.strictEqual(allStats.size, 2);
    assert.ok(allStats.has('op-a'));
    assert.ok(allStats.has('op-b'));

    service.dispose();
    console.log('  [ok] getAllRetryStats returns stats for all operations');
}

async function testRetryHistory() {
    const service = createRetryService({ maxAttempts: 2, initialDelayMs: 10, maxDelayMs: 50 });

    await service.executeWithRetry('history-op', async () => 'ok');

    const history = service.getRetryHistory();
    assert.ok(history.length >= 1);
    assert.strictEqual(history[history.length - 1].success, true);

    service.dispose();
    console.log('  [ok] retry history records attempts');
}

async function testRetryHistoryLimit() {
    const service = createRetryService({ maxAttempts: 1, initialDelayMs: 10, maxDelayMs: 50 });

    for (let i = 0; i < 10; i++) {
        await service.executeWithRetry(`op-${i}`, async () => 'ok');
    }

    const history = service.getRetryHistory(5);
    assert.ok(history.length <= 5);

    service.dispose();
    console.log('  [ok] retry history respects limit parameter');
}

async function testClearStats() {
    const service = createRetryService({ maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 50 });

    await service.executeWithRetry('clear-op', async () => 'ok');
    assert.ok(service.getRetryStats('clear-op'));

    service.clearStats();
    assert.strictEqual(service.getRetryStats('clear-op'), undefined);
    assert.strictEqual(service.getRetryHistory().length, 0);

    service.dispose();
    console.log('  [ok] clearStats resets all statistics');
}

// ── Circuit breaker stats ─────────────────────────────────────

async function testCircuitBreakerStats() {
    const service = createRetryService({ maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 50 });

    await service.executeWithRetry('cb-op', async () => 'ok');
    const stats = service.getCircuitStats();

    assert.strictEqual(stats.state, CircuitState.CLOSED);
    assert.ok(stats.successCount >= 1);
    assert.strictEqual(stats.consecutiveFailures, 0);

    service.dispose();
    console.log('  [ok] circuit breaker stats reflect current state');
}

// ── Logging tests ─────────────────────────────────────────────

async function testLoggingEnabled() {
    const service = createRetryService(
        { maxAttempts: 2, initialDelayMs: 10, maxDelayMs: 50 },
        true
    );

    await service.executeWithRetry('log-op', async () => 'ok');

    // Just verifying no errors when logging is enabled
    service.dispose();
    console.log('  [ok] service operates correctly with logging enabled');
}

// ── Dispose test ──────────────────────────────────────────────

async function testDispose() {
    const service = createRetryService({ maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 50 });
    await service.executeWithRetry('dispose-op', async () => 'ok');

    // Should not throw
    service.dispose();
    console.log('  [ok] dispose cleans up resources');
}

// ── Config defaults test ──────────────────────────────────────

async function testDefaultConfigValues() {
    const service = new RpcRetryService();

    const result = await service.executeWithRetry('default-cfg', async () => 'ok');
    assert.strictEqual(result, 'ok');

    service.dispose();
    console.log('  [ok] service works with default config values');
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        testExecuteWithRetrySuccess,
        testExecuteWithRetrySuccessAfterTransientFailure,
        testExhaustAllRetries,
        testPermanentErrorNoRetry,
        testCustomErrorClassifier,
        testDefaultClassifierTransientErrors,
        testDefaultClassifierPermanentErrors,
        testExponentialBackoff,
        testMaxDelayIsCapped,
        testCircuitBreakerOpens,
        testCircuitBreakerRejectsWhenOpen,
        testCircuitBreakerReset,
        testRetryStatsTracking,
        testRetryStatsAfterFailure,
        testGetAllRetryStats,
        testRetryHistory,
        testRetryHistoryLimit,
        testClearStats,
        testCircuitBreakerStats,
        testLoggingEnabled,
        testDispose,
        testDefaultConfigValues
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nrpcRetryService unit tests');
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
