import * as assert from 'assert';

import {
    DeploymentRetryService,
    classifyDeploymentError,
    RetryDeploymentParams,
} from '../services/deploymentRetryService';
import { ContractDeployer } from '../services/contractDeployer';
import {
    DeploymentErrorClass,
    DeploymentRetryStatus,
    DeploymentRetryEvent,
} from '../types/deploymentRetry';

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

type AnyFn = (...args: any[]) => any;

function patchMethod<T extends object, K extends keyof T>(
    obj: T,
    key: K,
    impl: AnyFn
): () => void {
    const original = (obj as any)[key];
    (obj as any)[key] = impl;
    return () => { (obj as any)[key] = original; };
}

/** Build minimal RetryDeploymentParams with fast backoff for tests */
function makeParams(overrides: Partial<RetryDeploymentParams> = {}): RetryDeploymentParams {
    return {
        wasmPath: '/fake/contract.wasm',
        network: 'testnet',
        source: 'dev',
        cliPath: 'stellar',
        retryConfig: {
            maxAttempts: 3,
            initialDelayMs: 10,
            maxDelayMs: 50,
            backoffMultiplier: 2,
            useJitter: false,
            attemptTimeoutMs: 5000,
        },
        ...overrides,
    };
}

// ── classifyDeploymentError ───────────────────────────────────────────────────

async function testClassify_transientNetworkErrors() {
    const transientMessages = [
        'network error occurred',
        'connection refused',
        'econnrefused',
        'econnreset',
        'etimedout',
        'request timed out',
        'socket hang up',
        '503 service unavailable',
        '502 bad gateway',
        '504 gateway timeout',
        '429 rate limit exceeded',
        'rate limit hit',
        'service unavailable',
    ];

    for (const msg of transientMessages) {
        const result = classifyDeploymentError(msg);
        assert.strictEqual(
            result,
            DeploymentErrorClass.TRANSIENT,
            `Expected TRANSIENT for: "${msg}", got ${result}`
        );
    }
    console.log('  ✓ classifyDeploymentError: transient network errors');
}

async function testClassify_permanentErrors() {
    const permanentMessages = [
        'unauthorized access',
        'forbidden resource',
        'invalid wasm file',
        'wasm file not found: /path/to/file.wasm',
        'validation failed: missing field',
        '400 bad request',
        '401 unauthorized',
        '403 forbidden',
        '404 not found',
    ];

    for (const msg of permanentMessages) {
        const result = classifyDeploymentError(msg);
        assert.strictEqual(
            result,
            DeploymentErrorClass.PERMANENT,
            `Expected PERMANENT for: "${msg}", got ${result}`
        );
    }
    console.log('  ✓ classifyDeploymentError: permanent errors');
}

async function testClassify_unknownDefaultsToTransient() {
    // Unknown errors should default to TRANSIENT so we don't give up prematurely
    const result = classifyDeploymentError('some completely unknown error xyz');
    assert.strictEqual(result, DeploymentErrorClass.TRANSIENT);
    console.log('  ✓ classifyDeploymentError: unknown errors default to TRANSIENT');
}

// ── DeploymentRetryService ────────────────────────────────────────────────────

async function testSuccessOnFirstAttempt() {
    const svc = new DeploymentRetryService();

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => ({ success: true, contractId: 'CABC123', transactionHash: 'txhash1' })
    );

    const record = await svc.deploy(makeParams());
    restore();

    assert.strictEqual(record.status, DeploymentRetryStatus.SUCCEEDED);
    assert.strictEqual(record.attempts.length, 1);
    assert.strictEqual(record.attempts[0].success, true);
    assert.strictEqual(record.contractId, 'CABC123');
    assert.strictEqual(record.transactionHash, 'txhash1');
    assert.ok(record.finishedAt, 'finishedAt should be set');
    console.log('  ✓ succeeds on first attempt');
}

async function testRetryOnTransientFailure_thenSucceeds() {
    const svc = new DeploymentRetryService();
    let callCount = 0;

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => {
            callCount++;
            if (callCount < 3) {
                return { success: false, error: 'network error', errorSummary: 'network error' };
            }
            return { success: true, contractId: 'CDEF456', transactionHash: 'txhash2' };
        }
    );

    const record = await svc.deploy(makeParams());
    restore();

    assert.strictEqual(record.status, DeploymentRetryStatus.SUCCEEDED);
    assert.strictEqual(record.attempts.length, 3);
    assert.strictEqual(record.attempts[0].success, false);
    assert.strictEqual(record.attempts[1].success, false);
    assert.strictEqual(record.attempts[2].success, true);
    assert.strictEqual(record.contractId, 'CDEF456');
    assert.strictEqual(callCount, 3);
    console.log('  ✓ retries on transient failure and succeeds on 3rd attempt');
}

async function testNoRetryOnPermanentFailure() {
    const svc = new DeploymentRetryService();
    let callCount = 0;

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => {
            callCount++;
            return {
                success: false,
                error: 'unauthorized: invalid credentials',
                errorSummary: 'unauthorized: invalid credentials',
            };
        }
    );

    const record = await svc.deploy(makeParams());
    restore();

    // Permanent error — should not retry
    assert.strictEqual(record.status, DeploymentRetryStatus.FAILED);
    assert.strictEqual(callCount, 1, 'Should not retry permanent errors');
    assert.strictEqual(record.attempts.length, 1);
    assert.strictEqual(record.attempts[0].errorClass, DeploymentErrorClass.PERMANENT);
    console.log('  ✓ does not retry permanent errors');
}

async function testExhaustAllAttempts() {
    const svc = new DeploymentRetryService();
    let callCount = 0;

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => {
            callCount++;
            return { success: false, error: 'network timeout', errorSummary: 'network timeout' };
        }
    );

    const record = await svc.deploy(makeParams());
    restore();

    assert.strictEqual(record.status, DeploymentRetryStatus.FAILED);
    assert.strictEqual(callCount, 3, 'Should attempt exactly maxAttempts times');
    assert.strictEqual(record.attempts.length, 3);
    assert.ok(record.summary?.includes('3 attempt'), `summary should mention 3 attempts: ${record.summary}`);
    console.log('  ✓ exhausts all attempts and marks session as FAILED');
}

async function testCancellationBetweenRetries() {
    const svc = new DeploymentRetryService();
    let callCount = 0;
    let sessionId: string | undefined;

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => {
            callCount++;
            return { success: false, error: 'network error', errorSummary: 'network error' };
        }
    );

    // Capture session ID from the first status event, then cancel during the wait
    const disposer = svc.onStatusChange((event: DeploymentRetryEvent) => {
        if (!sessionId) {
            sessionId = event.sessionId;
        }
        // Cancel as soon as we enter the WAITING state (between retries)
        if (event.status === DeploymentRetryStatus.WAITING) {
            svc.cancel(event.sessionId);
        }
    });

    const record = await svc.deploy(makeParams());
    restore();
    disposer();

    assert.strictEqual(record.status, DeploymentRetryStatus.CANCELLED);
    // Should have made exactly 1 attempt before being cancelled during the wait
    assert.ok(record.attempts.length >= 1, 'At least one attempt should have been recorded');
    assert.ok(record.summary?.includes('cancelled'), `summary should mention cancellation: ${record.summary}`);
    console.log('  ✓ cancellation between retries stops further attempts');
}

async function testCancelAll() {
    const svc = new DeploymentRetryService();
    let resolveBlock: (() => void) | undefined;

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => {
            // Block until cancelled
            await new Promise<void>(resolve => { resolveBlock = resolve; });
            return { success: false, error: 'network error', errorSummary: 'network error' };
        }
    );

    const deployPromise = svc.deploy(makeParams());

    // Wait a tick for the deploy to start, then cancel all
    await sleep(20);
    assert.strictEqual(svc.getActiveSessions().length, 1);
    svc.cancelAll();

    // Unblock the stuck deployContract call
    resolveBlock?.();

    const record = await deployPromise;
    restore();

    assert.strictEqual(record.status, DeploymentRetryStatus.CANCELLED);
    assert.strictEqual(svc.getActiveSessions().length, 0);
    console.log('  ✓ cancelAll() cancels all active sessions');
}

async function testStatusEventsEmitted() {
    const svc = new DeploymentRetryService();
    const events: DeploymentRetryEvent[] = [];
    let callCount = 0;

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => {
            callCount++;
            if (callCount === 1) {
                return { success: false, error: 'network error', errorSummary: 'network error' };
            }
            return { success: true, contractId: 'CGHI789' };
        }
    );

    const disposer = svc.onStatusChange((e: DeploymentRetryEvent) => events.push(e));
    await svc.deploy(makeParams());
    restore();
    disposer();

    const statuses = events.map(e => e.status);
    assert.ok(statuses.includes(DeploymentRetryStatus.RUNNING), 'Should emit RUNNING');
    assert.ok(statuses.includes(DeploymentRetryStatus.WAITING), 'Should emit WAITING');
    assert.ok(statuses.includes(DeploymentRetryStatus.SUCCEEDED), 'Should emit SUCCEEDED');

    // All events should carry the same session ID
    const sessionIds = new Set(events.map(e => e.sessionId));
    assert.strictEqual(sessionIds.size, 1, 'All events should share one session ID');

    console.log('  ✓ emits RUNNING → WAITING → SUCCEEDED status events');
}

async function testStatusListenerDisposer() {
    const svc = new DeploymentRetryService();
    const events: DeploymentRetryEvent[] = [];

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => ({ success: true, contractId: 'CJKL012' })
    );

    const disposer = svc.onStatusChange((e: DeploymentRetryEvent) => events.push(e));
    disposer(); // remove listener immediately

    await svc.deploy(makeParams());
    restore();

    assert.strictEqual(events.length, 0, 'Disposed listener should not receive events');
    console.log('  ✓ onStatusChange disposer removes the listener');
}

async function testRetryHistory() {
    const svc = new DeploymentRetryService();

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => ({ success: true, contractId: 'CMNOP345' })
    );

    assert.strictEqual(svc.getHistory().length, 0);

    await svc.deploy(makeParams());
    await svc.deploy(makeParams());
    restore();

    assert.strictEqual(svc.getHistory().length, 2);

    svc.clearHistory();
    assert.strictEqual(svc.getHistory().length, 0);
    console.log('  ✓ retry history is stored and clearable');
}

async function testHistoryReturnsMostRecentFirst() {
    const svc = new DeploymentRetryService();
    let counter = 0;

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => ({ success: true, contractId: `C${++counter}` })
    );

    await svc.deploy(makeParams({ wasmPath: '/first.wasm' }));
    await svc.deploy(makeParams({ wasmPath: '/second.wasm' }));
    restore();

    const history = svc.getHistory();
    assert.strictEqual(history[0].wasmPath, '/second.wasm', 'Most recent should be first');
    assert.strictEqual(history[1].wasmPath, '/first.wasm');
    console.log('  ✓ getHistory() returns most-recent-first');
}

async function testGetSessionById() {
    const svc = new DeploymentRetryService();

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => ({ success: true, contractId: 'CQRS678' })
    );

    const record = await svc.deploy(makeParams());
    restore();

    const found = svc.getSession(record.id);
    assert.ok(found, 'Should find session by ID');
    assert.strictEqual(found!.id, record.id);
    assert.strictEqual(svc.getSession('nonexistent-id'), undefined);
    console.log('  ✓ getSession() retrieves session by ID');
}

async function testExponentialBackoffDelayGrows() {
    const svc = new DeploymentRetryService();
    const waitDelays: number[] = [];
    let callCount = 0;

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => {
            callCount++;
            return { success: false, error: 'network error', errorSummary: 'network error' };
        }
    );

    const disposer = svc.onStatusChange((e: DeploymentRetryEvent) => {
        if (e.status === DeploymentRetryStatus.WAITING && e.nextRetryInMs !== undefined) {
            waitDelays.push(e.nextRetryInMs);
        }
    });

    await svc.deploy(makeParams({
        retryConfig: {
            maxAttempts: 3,
            initialDelayMs: 10,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
            useJitter: false,
            attemptTimeoutMs: 5000,
        },
    }));

    restore();
    disposer();

    // With multiplier=2, initialDelay=10: attempt 1 → 10ms, attempt 2 → 20ms
    assert.strictEqual(waitDelays.length, 2, 'Should have 2 wait periods for 3 attempts');
    assert.ok(
        waitDelays[1] >= waitDelays[0],
        `Second delay (${waitDelays[1]}) should be >= first delay (${waitDelays[0]})`
    );
    console.log(`  ✓ exponential backoff delays grow: ${waitDelays.join('ms, ')}ms`);
}

async function testMaxDelayIsCapped() {
    const svc = new DeploymentRetryService();
    const waitDelays: number[] = [];

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => ({ success: false, error: 'network error', errorSummary: 'network error' })
    );

    const disposer = svc.onStatusChange((e: DeploymentRetryEvent) => {
        if (e.status === DeploymentRetryStatus.WAITING && e.nextRetryInMs !== undefined) {
            waitDelays.push(e.nextRetryInMs);
        }
    });

    await svc.deploy(makeParams({
        retryConfig: {
            maxAttempts: 3,
            initialDelayMs: 100,
            maxDelayMs: 50,   // cap lower than initial to force capping
            backoffMultiplier: 10,
            useJitter: false,
            attemptTimeoutMs: 5000,
        },
    }));

    restore();
    disposer();

    for (const delay of waitDelays) {
        assert.ok(delay <= 50, `Delay ${delay}ms exceeds maxDelayMs of 50ms`);
    }
    console.log('  ✓ backoff delay is capped at maxDelayMs');
}

async function testAttemptRecordsHaveTimestamps() {
    const svc = new DeploymentRetryService();

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => ({ success: true, contractId: 'CTUV901' })
    );

    const record = await svc.deploy(makeParams());
    restore();

    assert.strictEqual(record.attempts.length, 1);
    const attempt = record.attempts[0];
    assert.ok(attempt.startedAt, 'startedAt should be set');
    assert.ok(attempt.finishedAt, 'finishedAt should be set');
    assert.ok(attempt.durationMs >= 0, 'durationMs should be non-negative');
    assert.strictEqual(attempt.attempt, 1);
    console.log('  ✓ attempt records include timestamps and duration');
}

async function testCancelReturnsFalseForUnknownSession() {
    const svc = new DeploymentRetryService();
    const result = svc.cancel('nonexistent-session-id');
    assert.strictEqual(result, false);
    console.log('  ✓ cancel() returns false for unknown session ID');
}

async function testContractDeployer_deployWithRetry() {
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet');
    let callCount = 0;

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => {
            callCount++;
            if (callCount === 1) {
                return { success: false, error: 'network error', errorSummary: 'network error' };
            }
            return { success: true, contractId: 'CWXY234', transactionHash: 'txhashX' };
        }
    );

    const record = await deployer.deployWithRetry('/some/contract.wasm', {
        maxAttempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 50,
        useJitter: false,
        attemptTimeoutMs: 5000,
    });
    restore();

    assert.strictEqual(record.status, DeploymentRetryStatus.SUCCEEDED);
    assert.strictEqual(record.contractId, 'CWXY234');
    assert.strictEqual(callCount, 2);
    console.log('  ✓ ContractDeployer.deployWithRetry() integrates with retry service');
}

async function testContractDeployer_getRetryHistory() {
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet');

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => ({ success: true, contractId: 'CZAB567' })
    );

    assert.strictEqual(deployer.getRetryHistory().length, 0);
    await deployer.deployWithRetry('/contract.wasm', { maxAttempts: 1, initialDelayMs: 10 });
    restore();

    assert.strictEqual(deployer.getRetryHistory().length, 1);
    console.log('  ✓ ContractDeployer.getRetryHistory() returns session records');
}

async function testContractDeployer_onRetryStatusChange() {
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet');
    const events: DeploymentRetryEvent[] = [];

    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => ({ success: true, contractId: 'CCDE890' })
    );

    const disposer = deployer.onRetryStatusChange((e: DeploymentRetryEvent) => events.push(e));
    await deployer.deployWithRetry('/contract.wasm', { maxAttempts: 1, initialDelayMs: 10 });
    restore();
    disposer();

    assert.ok(events.length > 0, 'Should have received status events');
    assert.ok(
        events.some(e => e.status === DeploymentRetryStatus.SUCCEEDED),
        'Should have received a SUCCEEDED event'
    );
    console.log('  ✓ ContractDeployer.onRetryStatusChange() receives events');
}

async function testContractDeployer_cancelRetry() {
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet');

    // Cancel a non-existent session — should return false gracefully
    const result = deployer.cancelRetry('fake-session-id');
    assert.strictEqual(result, false);
    console.log('  ✓ ContractDeployer.cancelRetry() returns false for unknown session');
}

// ── Runner ────────────────────────────────────────────────────────────────────

(async () => {
    console.log('\n[deploymentRetry.test]');

    const tests: Array<() => Promise<void>> = [
        // classifyDeploymentError
        testClassify_transientNetworkErrors,
        testClassify_permanentErrors,
        testClassify_unknownDefaultsToTransient,
        // DeploymentRetryService
        testSuccessOnFirstAttempt,
        testRetryOnTransientFailure_thenSucceeds,
        testNoRetryOnPermanentFailure,
        testExhaustAllAttempts,
        testCancellationBetweenRetries,
        testCancelAll,
        testStatusEventsEmitted,
        testStatusListenerDisposer,
        testRetryHistory,
        testHistoryReturnsMostRecentFirst,
        testGetSessionById,
        testExponentialBackoffDelayGrows,
        testMaxDelayIsCapped,
        testAttemptRecordsHaveTimestamps,
        testCancelReturnsFalseForUnknownSession,
        // ContractDeployer integration
        testContractDeployer_deployWithRetry,
        testContractDeployer_getRetryHistory,
        testContractDeployer_onRetryStatusChange,
        testContractDeployer_cancelRetry,
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            await test();
            passed++;
        } catch (err) {
            failed++;
            console.error(`  ✗ ${test.name}`);
            console.error(`    ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
        }
    }

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
})().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
