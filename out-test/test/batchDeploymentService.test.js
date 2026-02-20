"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
class CancellationTokenSource {
    constructor() {
        this.cancelled = false;
        this.token = {
            isCancellationRequested: false,
            onCancellationRequested: (listener) => {
                this.listener = listener;
                return { dispose: () => { this.listener = undefined; } };
            }
        };
    }
    cancel() {
        this.cancelled = true;
        this.token.isCancellationRequested = true;
        this.listener?.();
    }
    dispose() { }
}
const batchDeploymentService_1 = require("../services/batchDeploymentService");
const contractDeployer_1 = require("../services/contractDeployer");
// --- Simple helper to wait ---
const sleep = (ms) => new Promise(res => setTimeout(res, ms));
function patchMethod(obj, key, impl) {
    const original = obj[key];
    obj[key] = impl;
    return () => { obj[key] = original; };
}
async function testSequential_success() {
    const svc = new batchDeploymentService_1.BatchDeploymentService();
    const calls = [];
    const restore1 = patchMethod(contractDeployer_1.ContractDeployer.prototype, 'buildAndDeploy', async function (contractDir) {
        calls.push(`build:${contractDir}`);
        return { success: true, contractId: `C_${contractDir}`, transactionHash: 'abc' };
    });
    const items = [
        { id: 'a', name: 'A', contractDir: 'A' },
        { id: 'b', name: 'B', contractDir: 'B' },
    ];
    const res = await svc.runBatch({
        batchId: 'batch-1',
        mode: 'sequential',
        items,
        cliPath: 'stellar',
        source: 'dev',
        network: 'testnet',
    });
    restore1();
    assert.strictEqual(res.results.length, 2);
    assert.strictEqual(res.results[0].status, 'succeeded');
    assert.strictEqual(res.results[1].status, 'succeeded');
    assert.deepStrictEqual(calls, ['build:A', 'build:B']);
    console.log('  ✓ batchDeploymentService: sequential success');
}
async function testSequential_dependencySkip() {
    const svc = new batchDeploymentService_1.BatchDeploymentService();
    const restore = patchMethod(contractDeployer_1.ContractDeployer.prototype, 'buildAndDeploy', async function (contractDir) {
        if (contractDir === 'A') {
            return { success: false, error: 'boom', errorSummary: 'boom', errorType: 'execution' };
        }
        return { success: true, contractId: `C_${contractDir}` };
    });
    const items = [
        { id: 'a', name: 'A', contractDir: 'A' },
        { id: 'b', name: 'B', contractDir: 'B', dependsOn: ['a'] },
    ];
    const res = await svc.runBatch({
        batchId: 'batch-2',
        mode: 'sequential',
        items,
        cliPath: 'stellar',
        source: 'dev',
        network: 'testnet',
    });
    restore();
    const a = res.results.find(r => r.id === 'a');
    const b = res.results.find(r => r.id === 'b');
    assert.strictEqual(a.status, 'failed');
    assert.strictEqual(b.status, 'skipped');
    console.log('  ✓ batchDeploymentService: dependency skip');
}
async function testParallel_respectsConcurrencyAndCompletes() {
    const svc = new batchDeploymentService_1.BatchDeploymentService();
    let inFlight = 0;
    let maxInFlight = 0;
    const restore = patchMethod(contractDeployer_1.ContractDeployer.prototype, 'buildAndDeploy', async function (contractDir) {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await sleep(30);
        inFlight -= 1;
        return { success: true, contractId: `C_${contractDir}` };
    });
    const items = [
        { id: 'a', name: 'A', contractDir: 'A' },
        { id: 'b', name: 'B', contractDir: 'B' },
        { id: 'c', name: 'C', contractDir: 'C' },
        { id: 'd', name: 'D', contractDir: 'D' },
    ];
    const res = await svc.runBatch({
        batchId: 'batch-3',
        mode: 'parallel',
        items,
        cliPath: 'stellar',
        source: 'dev',
        network: 'testnet',
        concurrency: 2,
    });
    restore();
    assert.strictEqual(res.results.length, 4);
    assert.ok(res.results.every(r => r.status === 'succeeded'));
    assert.ok(maxInFlight <= 2, `expected max concurrency <= 2, got ${maxInFlight}`);
    console.log('  ✓ batchDeploymentService: parallel concurrency');
}
async function testCancellation_stopsNewWork() {
    const svc = new batchDeploymentService_1.BatchDeploymentService();
    const cts = new CancellationTokenSource();
    const restore = patchMethod(contractDeployer_1.ContractDeployer.prototype, 'buildAndDeploy', async function (contractDir) {
        // simulate long-running work
        await sleep(80);
        return { success: true, contractId: `C_${contractDir}` };
    });
    const items = [
        { id: 'a', name: 'A', contractDir: 'A' },
        { id: 'b', name: 'B', contractDir: 'B' },
        { id: 'c', name: 'C', contractDir: 'C' },
    ];
    const p = svc.runBatch({
        batchId: 'batch-4',
        mode: 'sequential',
        items,
        cliPath: 'stellar',
        source: 'dev',
        network: 'testnet',
        cancellationToken: cts.token,
    });
    // cancel shortly after starting
    await sleep(20);
    cts.cancel();
    const res = await p;
    restore();
    cts.dispose();
    // At least first may finish or be cancelled depending on timing,
    // but remaining should be cancelled.
    assert.strictEqual(res.cancelled, true);
    assert.strictEqual(res.results.length, 3);
    const cancelledCount = res.results.filter(r => r.status === 'cancelled').length;
    assert.ok(cancelledCount >= 1, 'expected at least one cancelled item');
    console.log('  ✓ batchDeploymentService: cancellation');
}
(async () => {
    console.log('\n[batchDeploymentService.test]');
    await testSequential_success();
    await testSequential_dependencySkip();
    await testParallel_respectsConcurrencyAndCompletes();
    await testCancellation_stopsNewWork();
    console.log('  [ok] batchDeploymentService tests passed');
})().catch((e) => {
    console.error('  [fail] batchDeploymentService tests failed:', e);
    process.exit(1);
});
