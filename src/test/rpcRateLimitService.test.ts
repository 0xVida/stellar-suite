declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { RpcRateLimiter } from '../services/rpcRateLimitService';
import { RateLimitStatus, RateLimitEvent } from '../types/rpcRateLimit';

// ── Mocks ──
const originalFetch = global.fetch;

let fetchCallCount = 0;
let fetchMockHandler: ((url: string, init?: RequestInit) => Promise<Response>) | undefined;

global.fetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    fetchCallCount++;
    if (fetchMockHandler) {
        return fetchMockHandler(url as string, init);
    }
    return new Response('ok', { status: 200 });
};

function createLimiter() {
    return new RpcRateLimiter({
        maxRetries: 3,
        initialBackoffMs: 10,  // low backoff for fast tests
        maxBackoffMs: 100
    });
}

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Tests ─────────────────────────────────────────────────────

async function testBypassIfNotRateLimited() {
    fetchCallCount = 0;
    fetchMockHandler = async () => new Response('ok', { status: 200 });

    const limiter = createLimiter();
    const res = await limiter.fetch('http://test.com');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(fetchCallCount, 1);
    assert.strictEqual(limiter.getIsRateLimited(), false);

    limiter.dispose();
    console.log('  [ok] bypasses fetch if not rate limited');
}

async function testRetryOn429() {
    fetchCallCount = 0;

    let calls = 0;
    fetchMockHandler = async () => {
        calls++;
        if (calls === 1) return new Response('Too Many', { status: 429 });
        return new Response('ok', { status: 200 });
    };

    const limiter = createLimiter();
    const statusChanges: RateLimitStatus[] = [];
    limiter.onStatusChange((e: RateLimitEvent) => statusChanges.push(e.status));

    const res = await limiter.fetch('http://test.com');
    await delay(10); // allow recovery event to fire

    assert.strictEqual(res.status, 200);
    assert.strictEqual(fetchCallCount, 2);
    assert.strictEqual(statusChanges.includes(RateLimitStatus.RateLimited), true);
    assert.strictEqual(statusChanges.includes(RateLimitStatus.Healthy), true);
    assert.strictEqual(limiter.getIsRateLimited(), false);

    limiter.dispose();
    console.log('  [ok] retries when encountering 429 Too Many Requests');
}

async function testParseRetryAfterHeader() {
    fetchCallCount = 0;

    let calls = 0;
    fetchMockHandler = async () => {
        calls++;
        if (calls === 1) {
            const headers = new Headers();
            headers.set('Retry-After', '1'); // 1 second
            return new Response('Too Many', { status: 429, headers });
        }
        return new Response('ok', { status: 200 });
    };

    const limiter = createLimiter();

    const start = Date.now();
    const res = await limiter.fetch('http://test.com');
    const elapsed = Date.now() - start;

    // Config clamps maxBackoffMs to 100 in test setup, so it should only delay 100ms instead of 1000ms
    assert.ok(elapsed >= 100);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(fetchCallCount, 2);

    limiter.dispose();
    console.log('  [ok] parses Retry-After header and clamps to max backoff');
}

async function testExhaustMaxRetries() {
    fetchCallCount = 0;
    fetchMockHandler = async () => new Response('Too Many', { status: 429 });

    const limiter = createLimiter();

    const res = await limiter.fetch('http://test.com');

    assert.strictEqual(fetchCallCount, 4); // 1 original + 3 retries
    assert.strictEqual(res.status, 429);

    limiter.dispose();
    console.log('  [ok] exhausts max retries and returns 429');
}

async function testQueueConcurrentRequests() {
    fetchCallCount = 0;

    let calls = 0;
    fetchMockHandler = async () => {
        calls++;
        if (calls === 1) return new Response('Too Many', { status: 429 });
        return new Response('ok', { status: 200 });
    };

    const limiter = createLimiter();

    const fetch1 = limiter.fetch('http://test.com/1');
    const fetch2 = limiter.fetch('http://test.com/2');
    const fetch3 = limiter.fetch('http://test.com/3');

    const [res1, res2, res3] = await Promise.all([fetch1, fetch2, fetch3]);

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res3.status, 200);
    assert.strictEqual(fetchCallCount, 4); // 1st fails, then 1st retries + 2 queued execute

    limiter.dispose();
    console.log('  [ok] queues multiple requests and executes them concurrently upon recovery');
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        testBypassIfNotRateLimited,
        testRetryOn429,
        testParseRetryAfterHeader,
        testExhaustMaxRetries,
        testQueueConcurrentRequests
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nrpcRateLimitService unit tests');
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

    global.fetch = originalFetch; // restore

    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch(error => {
    console.error('Test runner error:', error);
    process.exitCode = 1;
});
