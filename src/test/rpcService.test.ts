declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { RpcService, SimulationResult } from '../services/rpcService';
import {
    MockRpcServer,
    createSimulationSuccessResponse,
    createSimulationErrorResponse,
    createHttpErrorResponse,
    createHealthResponse,
    createRateLimitResponse
} from './mocks/mockRpcServer';

const originalFetch = global.fetch;
const mockServer = new MockRpcServer();
const createdServices: RpcService[] = [];

function installMock(): void {
    global.fetch = mockServer.createFetchHandler() as any;
}

function restoreFetch(): void {
    global.fetch = originalFetch;
}

function createService(url: string = 'https://rpc.testnet.stellar.org'): RpcService {
    const service = new RpcService(url);
    createdServices.push(service);
    return service;
}

// ── simulateTransaction tests ─────────────────────────────────

async function testSimulateTransactionSuccess() {
    mockServer.reset();
    mockServer.setDefaultResponse(createSimulationSuccessResponse('hello_world'));

    const service = createService();
    const result = await service.simulateTransaction('CABC123', 'greet', ['Alice']);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, 'hello_world');
    assert.ok(result.resourceUsage);
    assert.strictEqual(result.resourceUsage!.cpuInstructions, 12500);
    assert.strictEqual(result.resourceUsage!.memoryBytes, 4096);

    const lastReq = mockServer.getLastRequest();
    assert.ok(lastReq);
    assert.strictEqual(lastReq!.method, 'POST');
    assert.ok(lastReq!.url.endsWith('/rpc'));
    assert.strictEqual(lastReq!.body.method, 'simulateTransaction');
    assert.strictEqual(lastReq!.body.params.transaction.contractId, 'CABC123');
    assert.strictEqual(lastReq!.body.params.transaction.functionName, 'greet');
    console.log('  [ok] simulateTransaction returns success with result and resource usage');
}

async function testSimulateTransactionRpcError() {
    mockServer.reset();
    mockServer.setDefaultResponse(createSimulationErrorResponse('contract not found'));

    const service = createService();
    const result = await service.simulateTransaction('CXYZ789', 'missing_fn', []);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'contract not found');
    console.log('  [ok] simulateTransaction handles RPC error response');
}

async function testSimulateTransactionHttpError() {
    mockServer.reset();
    mockServer.setDefaultResponse(createHttpErrorResponse(500, 'Internal Server Error'));

    const service = createService();
    const result = await service.simulateTransaction('C123', 'fn', []);

    assert.strictEqual(result.success, false);
    assert.ok(result.error!.includes('500'));
    console.log('  [ok] simulateTransaction handles HTTP error status');
}

async function testSimulateTransactionNetworkError() {
    mockServer.reset();
    global.fetch = async () => {
        throw new TypeError('fetch failed');
    };

    const service = createService();
    const result = await service.simulateTransaction('C123', 'fn', []);

    assert.strictEqual(result.success, false);
    assert.ok(result.error!.includes('Network error'));
    assert.ok(result.error!.includes('rpc.testnet.stellar.org'));
    installMock();
    console.log('  [ok] simulateTransaction handles network errors');
}

async function testSimulateTransactionTimeout() {
    mockServer.reset();
    global.fetch = async (_url: any, init: any) => {
        if (init?.signal) {
            const controller = new AbortController();
            controller.abort();
            throw new DOMException('The operation was aborted.', 'AbortError');
        }
        throw new Error('timeout');
    };

    const service = createService();
    const result = await service.simulateTransaction('C123', 'fn', []);

    assert.strictEqual(result.success, false);
    assert.ok(result.error!.includes('timed out'));
    installMock();
    console.log('  [ok] simulateTransaction handles request timeout');
}

async function testSimulateTransactionWithEmptyArgs() {
    mockServer.reset();
    mockServer.setDefaultResponse(createSimulationSuccessResponse(42));

    const service = createService();
    const result = await service.simulateTransaction('CABC123', 'get_value', []);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, 42);

    const lastReq = mockServer.getLastRequest();
    assert.deepStrictEqual(lastReq!.body.params.transaction.args, []);
    console.log('  [ok] simulateTransaction works with empty args');
}

async function testSimulateTransactionRequestFormat() {
    mockServer.reset();
    mockServer.setDefaultResponse(createSimulationSuccessResponse('ok'));

    const service = createService();
    await service.simulateTransaction('CABC', 'hello', ['arg1', 'arg2']);

    const lastReq = mockServer.getLastRequest();
    assert.strictEqual(lastReq!.body.jsonrpc, '2.0');
    assert.strictEqual(lastReq!.body.id, 1);
    assert.strictEqual(lastReq!.body.method, 'simulateTransaction');
    assert.deepStrictEqual(lastReq!.body.params.transaction.args, [
        { value: 'arg1' },
        { value: 'arg2' }
    ]);
    assert.strictEqual(lastReq!.headers['Content-Type'], 'application/json');
    console.log('  [ok] simulateTransaction sends properly formatted JSON-RPC request');
}

async function testSimulateTransactionWithRawResult() {
    mockServer.reset();
    mockServer.setDefaultResponse({
        status: 200,
        body: {
            jsonrpc: '2.0',
            id: 1,
            result: {
                returnValue: 'calculated',
                resourceUsage: { cpuInstructions: 5000, memoryBytes: 2048 },
                extraField: 'preserved'
            }
        }
    });

    const service = createService();
    const result = await service.simulateTransaction('C1', 'calc', [1, 2]);

    assert.strictEqual(result.success, true);
    assert.ok(result.rawResult);
    assert.strictEqual((result.rawResult as any).extraField, 'preserved');
    console.log('  [ok] simulateTransaction preserves raw result');
}

// ── URL normalization tests ───────────────────────────────────

async function testUrlNormalizationTrailingSlash() {
    mockServer.reset();
    mockServer.setDefaultResponse(createSimulationSuccessResponse('ok'));

    const service = createService('https://rpc.testnet.stellar.org/');
    await service.simulateTransaction('C1', 'fn', []);

    const lastReq = mockServer.getLastRequest();
    const path = new URL(lastReq!.url).pathname;
    assert.strictEqual(path, '/rpc');
    console.log('  [ok] normalizes URL by stripping trailing slash');
}

async function testUrlNormalizationNoTrailingSlash() {
    mockServer.reset();
    mockServer.setDefaultResponse(createSimulationSuccessResponse('ok'));

    const service = createService('https://rpc.testnet.stellar.org');
    await service.simulateTransaction('C1', 'fn', []);

    const lastReq = mockServer.getLastRequest();
    assert.ok(lastReq!.url.endsWith('/rpc'));
    console.log('  [ok] handles URL without trailing slash');
}

// ── isAvailable tests ─────────────────────────────────────────

async function testIsAvailableHealthy() {
    mockServer.reset();
    mockServer.setDefaultResponse(createHealthResponse(true));

    const service = createService();
    const available = await service.isAvailable();

    assert.strictEqual(available, true);
    console.log('  [ok] isAvailable returns true for healthy endpoint');
}

async function testIsAvailableUnhealthy() {
    mockServer.reset();
    mockServer.setDefaultResponse(createHealthResponse(false));

    const service = createService();
    const available = await service.isAvailable();

    assert.strictEqual(available, false);
    console.log('  [ok] isAvailable returns false for unhealthy endpoint');
}

async function testIsAvailableFallbackToRpc() {
    mockServer.reset();
    let callCount = 0;
    global.fetch = async (url: any, init?: any) => {
        callCount++;
        if (String(url).includes('/health')) {
            throw new Error('health endpoint not found');
        }
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    };

    const service = createService();
    const available = await service.isAvailable();

    assert.strictEqual(available, true);
    assert.ok(callCount >= 2, 'Should try health endpoint first, then fallback to /rpc');
    installMock();
    console.log('  [ok] isAvailable falls back to /rpc when /health fails');
}

async function testIsAvailableNetworkFailure() {
    mockServer.reset();
    global.fetch = async () => {
        throw new Error('ECONNREFUSED');
    };

    const service = createService();
    const available = await service.isAvailable();

    assert.strictEqual(available, false);
    installMock();
    console.log('  [ok] isAvailable returns false on network failure');
}

// ── Auth headers tests ────────────────────────────────────────

async function testSetAuthHeaders() {
    mockServer.reset();
    mockServer.setDefaultResponse(createSimulationSuccessResponse('ok'));

    const service = createService();
    service.setAuthHeaders({ 'Authorization': 'Bearer test-token', 'X-Api-Key': 'key123' });
    await service.simulateTransaction('C1', 'fn', []);

    const lastReq = mockServer.getLastRequest();
    assert.strictEqual(lastReq!.headers['Authorization'], 'Bearer test-token');
    assert.strictEqual(lastReq!.headers['X-Api-Key'], 'key123');
    console.log('  [ok] auth headers are included in requests');
}

async function testAuthHeadersOnHealthCheck() {
    mockServer.reset();
    mockServer.setDefaultResponse(createHealthResponse(true));

    const service = createService();
    service.setAuthHeaders({ 'Authorization': 'Bearer token' });
    await service.isAvailable();

    const lastReq = mockServer.getLastRequest();
    assert.strictEqual(lastReq!.headers['Authorization'], 'Bearer token');
    console.log('  [ok] auth headers are included in health check requests');
}

async function testAuthHeadersImmutability() {
    mockServer.reset();
    mockServer.setDefaultResponse(createSimulationSuccessResponse('ok'));

    const service = createService();
    const headers = { 'Authorization': 'Bearer token1' };
    service.setAuthHeaders(headers);

    headers['Authorization'] = 'Bearer modified';

    await service.simulateTransaction('C1', 'fn', []);
    const lastReq = mockServer.getLastRequest();
    assert.strictEqual(lastReq!.headers['Authorization'], 'Bearer token1');
    console.log('  [ok] auth headers are copied, not referenced');
}

// ── Logger integration tests ──────────────────────────────────

async function testSetLogger() {
    const service = createService();
    const logger = { logRequest: () => 'req-1' };
    service.setLogger(logger);
    assert.strictEqual(service.getLogger(), logger);
    console.log('  [ok] setLogger and getLogger work correctly');
}

async function testLoggerCalledOnRequest() {
    mockServer.reset();
    mockServer.setDefaultResponse(createSimulationSuccessResponse('ok'));

    const loggedCalls: string[] = [];
    const logger = {
        logRequest: (method: string, url: string, body: any) => {
            loggedCalls.push(`request:${method}`);
            return 'req-id';
        },
        logResponse: (reqId: string, method: string, status: number, data: any) => {
            loggedCalls.push(`response:${method}:${status}`);
        },
        logError: (reqId: string, method: string, error: string) => {
            loggedCalls.push(`error:${method}`);
        }
    };

    const service = createService();
    service.setLogger(logger);
    await service.simulateTransaction('C1', 'fn', []);

    assert.ok(loggedCalls.includes('request:simulateTransaction'));
    assert.ok(loggedCalls.includes('response:simulateTransaction:200'));
    console.log('  [ok] logger is called for request and response');
}

async function testLoggerCalledOnError() {
    mockServer.reset();
    mockServer.setDefaultResponse(createSimulationErrorResponse('test error'));

    const loggedCalls: string[] = [];
    const logger = {
        logRequest: (method: string) => {
            loggedCalls.push(`request:${method}`);
            return 'req-id';
        },
        logResponse: (reqId: string, method: string, status: number) => {
            loggedCalls.push(`response:${method}:${status}`);
        },
        logError: (reqId: string, method: string, error: string) => {
            loggedCalls.push(`error:${method}:${error}`);
        }
    };

    const service = createService();
    service.setLogger(logger);
    await service.simulateTransaction('C1', 'fn', []);

    assert.ok(loggedCalls.some(c => c.startsWith('error:simulateTransaction')));
    console.log('  [ok] logger is called on RPC error');
}

// ── Rate limiter access test ──────────────────────────────────

async function testGetRateLimiter() {
    const service = createService();
    const limiter = service.getRateLimiter();
    assert.ok(limiter);
    assert.strictEqual(typeof limiter.fetch, 'function');
    assert.strictEqual(typeof limiter.getIsRateLimited, 'function');
    limiter.dispose();
    console.log('  [ok] getRateLimiter returns limiter instance');
}

// ── Connection pooling / sequential requests ──────────────────

async function testMultipleSequentialRequests() {
    mockServer.reset();
    mockServer.enqueueResponses([
        createSimulationSuccessResponse('result1'),
        createSimulationSuccessResponse('result2'),
        createSimulationSuccessResponse('result3')
    ]);

    const service = createService();
    const r1 = await service.simulateTransaction('C1', 'fn1', []);
    const r2 = await service.simulateTransaction('C2', 'fn2', []);
    const r3 = await service.simulateTransaction('C3', 'fn3', []);

    assert.strictEqual(r1.success, true);
    assert.strictEqual(r1.result, 'result1');
    assert.strictEqual(r2.success, true);
    assert.strictEqual(r2.result, 'result2');
    assert.strictEqual(r3.success, true);
    assert.strictEqual(r3.result, 'result3');
    assert.strictEqual(mockServer.getRequestCount(), 3);
    console.log('  [ok] multiple sequential requests work correctly');
}

async function testConcurrentRequests() {
    mockServer.reset();
    mockServer.setDefaultResponse(createSimulationSuccessResponse('concurrent'));

    const service = createService();
    const results = await Promise.all([
        service.simulateTransaction('C1', 'fn', []),
        service.simulateTransaction('C2', 'fn', []),
        service.simulateTransaction('C3', 'fn', [])
    ]);

    assert.strictEqual(results.length, 3);
    for (const r of results) {
        assert.strictEqual(r.success, true);
        assert.strictEqual(r.result, 'concurrent');
    }
    assert.strictEqual(mockServer.getRequestCount(), 3);
    console.log('  [ok] concurrent requests are handled independently');
}

// ── Response parsing edge cases ───────────────────────────────

async function testResponseWithResultField() {
    mockServer.reset();
    mockServer.setDefaultResponse({
        status: 200,
        body: {
            jsonrpc: '2.0',
            id: 1,
            result: {
                result: 'nested_result',
                resource_usage: { cpuInstructions: 100, memoryBytes: 50 }
            }
        }
    });

    const service = createService();
    const result = await service.simulateTransaction('C1', 'fn', []);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, 'nested_result');
    console.log('  [ok] parses response with nested result field');
}

async function testResponseWithReturnValueField() {
    mockServer.reset();
    mockServer.setDefaultResponse({
        status: 200,
        body: {
            jsonrpc: '2.0',
            id: 1,
            result: {
                returnValue: { type: 'i128', value: '999' }
            }
        }
    });

    const service = createService();
    const result = await service.simulateTransaction('C1', 'fn', []);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.result, { type: 'i128', value: '999' });
    console.log('  [ok] parses response with returnValue field');
}

async function testResponseWithResourceUsageSnakeCase() {
    mockServer.reset();
    mockServer.setDefaultResponse({
        status: 200,
        body: {
            jsonrpc: '2.0',
            id: 1,
            result: {
                returnValue: 'ok',
                resource_usage: { cpuInstructions: 300, memoryBytes: 128 }
            }
        }
    });

    const service = createService();
    const result = await service.simulateTransaction('C1', 'fn', []);

    assert.strictEqual(result.success, true);
    assert.ok(result.resourceUsage);
    assert.strictEqual(result.resourceUsage!.cpuInstructions, 300);
    console.log('  [ok] parses resource_usage in snake_case');
}

async function testResponseWithoutResourceUsage() {
    mockServer.reset();
    mockServer.setDefaultResponse({
        status: 200,
        body: {
            jsonrpc: '2.0',
            id: 1,
            result: { returnValue: 'minimal' }
        }
    });

    const service = createService();
    const result = await service.simulateTransaction('C1', 'fn', []);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, 'minimal');
    assert.strictEqual(result.resourceUsage, undefined);
    console.log('  [ok] handles response without resource usage');
}

async function testRpcErrorWithoutMessage() {
    mockServer.reset();
    mockServer.setDefaultResponse({
        status: 200,
        body: {
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32600 }
        }
    });

    const service = createService();
    const result = await service.simulateTransaction('C1', 'fn', []);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'RPC error occurred');
    console.log('  [ok] handles RPC error without message');
}

// ── HTTP status code tests ────────────────────────────────────

async function testHttp400BadRequest() {
    mockServer.reset();
    mockServer.setDefaultResponse(createHttpErrorResponse(400));

    const service = createService();
    const result = await service.simulateTransaction('C1', 'fn', []);

    assert.strictEqual(result.success, false);
    assert.ok(result.error!.includes('400'));
    console.log('  [ok] handles 400 Bad Request');
}

async function testHttp401Unauthorized() {
    mockServer.reset();
    mockServer.setDefaultResponse(createHttpErrorResponse(401));

    const service = createService();
    const result = await service.simulateTransaction('C1', 'fn', []);

    assert.strictEqual(result.success, false);
    assert.ok(result.error!.includes('401'));
    console.log('  [ok] handles 401 Unauthorized');
}

async function testHttp403Forbidden() {
    mockServer.reset();
    mockServer.setDefaultResponse(createHttpErrorResponse(403));

    const service = createService();
    const result = await service.simulateTransaction('C1', 'fn', []);

    assert.strictEqual(result.success, false);
    assert.ok(result.error!.includes('403'));
    console.log('  [ok] handles 403 Forbidden');
}

async function testHttp503ServiceUnavailable() {
    mockServer.reset();
    mockServer.setDefaultResponse(createHttpErrorResponse(503));

    const service = createService();
    const result = await service.simulateTransaction('C1', 'fn', []);

    assert.strictEqual(result.success, false);
    assert.ok(result.error!.includes('503'));
    console.log('  [ok] handles 503 Service Unavailable');
}

// ── Timing and stats delegation ───────────────────────────────

async function testGetTimingStatsWithLogger() {
    const timingData = { avgMs: 50, p99Ms: 120 };
    const logger = { getTimingStats: () => timingData };

    const service = createService();
    service.setLogger(logger);

    assert.deepStrictEqual(service.getTimingStats(), timingData);
    console.log('  [ok] getTimingStats delegates to logger');
}

async function testGetTimingStatsWithoutLogger() {
    const service = createService();
    assert.strictEqual(service.getTimingStats(), undefined);
    console.log('  [ok] getTimingStats returns undefined without logger');
}

async function testGetErrorStatsWithLogger() {
    const errorData = { total: 3, byType: {} };
    const logger = { getErrorStats: () => errorData };

    const service = createService();
    service.setLogger(logger);

    assert.deepStrictEqual(service.getErrorStats(), errorData);
    console.log('  [ok] getErrorStats delegates to logger');
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        // simulateTransaction
        testSimulateTransactionSuccess,
        testSimulateTransactionRpcError,
        testSimulateTransactionHttpError,
        testSimulateTransactionNetworkError,
        testSimulateTransactionTimeout,
        testSimulateTransactionWithEmptyArgs,
        testSimulateTransactionRequestFormat,
        testSimulateTransactionWithRawResult,
        // URL normalization
        testUrlNormalizationTrailingSlash,
        testUrlNormalizationNoTrailingSlash,
        // isAvailable
        testIsAvailableHealthy,
        testIsAvailableUnhealthy,
        testIsAvailableFallbackToRpc,
        testIsAvailableNetworkFailure,
        // Auth headers
        testSetAuthHeaders,
        testAuthHeadersOnHealthCheck,
        testAuthHeadersImmutability,
        // Logger
        testSetLogger,
        testLoggerCalledOnRequest,
        testLoggerCalledOnError,
        // Rate limiter
        testGetRateLimiter,
        // Connection / sequential / concurrent
        testMultipleSequentialRequests,
        testConcurrentRequests,
        // Response parsing
        testResponseWithResultField,
        testResponseWithReturnValueField,
        testResponseWithResourceUsageSnakeCase,
        testResponseWithoutResourceUsage,
        testRpcErrorWithoutMessage,
        // HTTP status codes
        testHttp400BadRequest,
        testHttp401Unauthorized,
        testHttp403Forbidden,
        testHttp503ServiceUnavailable,
        // Stats delegation
        testGetTimingStatsWithLogger,
        testGetTimingStatsWithoutLogger,
        testGetErrorStatsWithLogger
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nrpcService unit tests');
    for (const test of tests) {
        try {
            installMock();
            await test();
            passed += 1;
        } catch (error) {
            failed += 1;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${error instanceof Error ? error.stack || error.message : String(error)}`);
        }
    }

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

    restoreFetch();
    for (const svc of createdServices) {
        svc.getRateLimiter().dispose();
    }

    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch(error => {
    console.error('Test runner error:', error);
    process.exitCode = 1;
});
