declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');
const http = require('http') as typeof import('http');

import { RpcConnectionPool } from '../services/rpcConnectionPoolService';
import { RpcService } from '../services/rpcService';

interface TestServer {
    baseUrl: string;
    getPorts: () => number[];
    close: () => Promise<void>;
}

async function startServer(delayMs = 0): Promise<TestServer> {
    const seenPorts = new Set<number>();

    const server = http.createServer((req, res) => {
        const remotePort = req.socket.remotePort;
        if (remotePort) {
            seenPorts.add(remotePort);
        }

        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        if (req.url === '/rpc' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
                body += chunk.toString();
            });

            req.on('end', () => {
                const payload = body.length ? JSON.parse(body) : {};
                setTimeout(() => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ result: { returnValue: payload.method ?? 'ok' } }));
                }, delayMs);
            });
            return;
        }

        if (req.url === '/slow') {
            setTimeout(() => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            }, 200);
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Unable to resolve test server address');
    }

    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        getPorts: () => Array.from(seenPorts),
        close: async () => {
            await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        }
    };
}

async function testConnectionReuseAndStats() {
    const testServer = await startServer();
    const pool = new RpcConnectionPool({ maxConnections: 2, maxQueueSize: 10, requestTimeoutMs: 500 });
    const target = new URL(testServer.baseUrl);

    for (let i = 0; i < 5; i++) {
        const response = await pool.requestJson<{ result: { returnValue: string } }>(target, 'POST', '/rpc', {
            jsonrpc: '2.0',
            method: `call-${i}`
        });
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.data.result.returnValue, `call-${i}`);
    }

    const stats = pool.getStats();
    assert.strictEqual(stats.totalRequests, 5);
    assert.strictEqual(stats.successfulRequests, 5);
    assert.strictEqual(stats.failedRequests, 0);
    assert.ok(testServer.getPorts().length <= 2, 'expected keep-alive reuse to limit socket count');

    pool.dispose();
    await testServer.close();
    console.log('  [ok] reuses connections and tracks successful stats');
}

async function testPoolExhaustion() {
    const testServer = await startServer(150);
    const pool = new RpcConnectionPool({ maxConnections: 1, maxQueueSize: 1, requestTimeoutMs: 1000 });
    const target = new URL(testServer.baseUrl);

    const pendingA = pool.requestJson(target, 'POST', '/rpc', { method: 'a' });
    const pendingB = pool.requestJson(target, 'POST', '/rpc', { method: 'b' });

    let exhaustionError: string | undefined;
    try {
        await pool.requestJson(target, 'POST', '/rpc', { method: 'c' });
    } catch (error) {
        exhaustionError = error instanceof Error ? error.message : String(error);
    }

    assert.ok(exhaustionError?.includes('exhausted'));
    await Promise.all([pendingA, pendingB]);

    const stats = pool.getStats();
    assert.strictEqual(stats.poolExhaustionCount, 1);

    pool.dispose();
    await testServer.close();
    console.log('  [ok] handles pool exhaustion when queue is full');
}

async function testTimeoutAndHealth() {
    const testServer = await startServer();
    const pool = new RpcConnectionPool({ maxConnections: 1, maxQueueSize: 2, requestTimeoutMs: 50 });
    const target = new URL(testServer.baseUrl);

    let timeoutError = '';
    try {
        await pool.requestJson(target, 'GET', '/slow');
    } catch (error) {
        timeoutError = error instanceof Error ? error.message : String(error);
    }

    assert.ok(timeoutError.includes('timed out'));

    const stats = pool.getStats();
    assert.strictEqual(stats.timedOutRequests, 1);
    assert.strictEqual(stats.failedRequests, 1);

    const health = pool.getHealth();
    assert.strictEqual(health.healthy, true);
    assert.strictEqual(health.consecutiveFailures, 1);

    pool.dispose();
    await testServer.close();
    console.log('  [ok] tracks timeouts and pool health');
}

async function testRpcServiceIntegration() {
    const testServer = await startServer();
    const rpcService = new RpcService(testServer.baseUrl, undefined, {
        maxConnections: 2,
        maxQueueSize: 5,
        requestTimeoutMs: 500
    });

    const simulation = await rpcService.simulateTransaction('contract-id', 'do_work', ['x']);
    assert.strictEqual(simulation.success, true);
    assert.strictEqual(simulation.result, 'simulateTransaction');

    const available = await rpcService.isAvailable();
    assert.strictEqual(available, true);

    const stats = rpcService.getPoolStats();
    assert.ok(stats.totalRequests >= 2);

    const health = rpcService.getPoolHealth();
    assert.strictEqual(health.healthy, true);

    await testServer.close();
    console.log('  [ok] integrates pool with RpcService');
}

async function run() {
    console.log('Running rpc connection pool tests...');
    await testConnectionReuseAndStats();
    await testPoolExhaustion();
    await testTimeoutAndHealth();
    await testRpcServiceIntegration();
    console.log('All rpc connection pool tests passed.');
}

run().catch((error) => {
    console.error('rpcConnectionPool tests failed:', error);
    process.exitCode = 1;
});
