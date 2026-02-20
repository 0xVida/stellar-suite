import * as assert from 'assert';
class CancellationTokenSource {
  private cancelled = false;
  public token = {
    isCancellationRequested: false,
    onCancellationRequested: (listener: () => void) => {
      this.listener = listener;
      return { dispose: () => { this.listener = undefined; } };
    }
  };
  private listener?: () => void;

  cancel() {
    this.cancelled = true;
    this.token.isCancellationRequested = true;
    this.listener?.();
  }

  dispose() { /* no-op */ }
}

import { BatchDeploymentService } from '../services/batchDeploymentService';
import { BatchDeploymentItem } from '../types/batchDeployment';
import { ContractDeployer } from '../services/contractDeployer';

// --- Simple helper to wait ---
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// --- Monkey-patch helpers (no external libs) ---
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

async function testSequential_success() {
  const svc = new BatchDeploymentService();

  const calls: string[] = [];

  const restore1 = patchMethod(
    ContractDeployer.prototype,
    'buildAndDeploy',
    async function (this: any, contractDir: string) {
      calls.push(`build:${contractDir}`);
      return { success: true, contractId: `C_${contractDir}`, transactionHash: 'abc' };
    }
  );

  const items: BatchDeploymentItem[] = [
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
  const svc = new BatchDeploymentService();

  const restore = patchMethod(
    ContractDeployer.prototype,
    'buildAndDeploy',
    async function (this: any, contractDir: string) {
      if (contractDir === 'A') {
        return { success: false, error: 'boom', errorSummary: 'boom', errorType: 'execution' };
      }
      return { success: true, contractId: `C_${contractDir}` };
    }
  );

  const items: BatchDeploymentItem[] = [
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

  const a = res.results.find(r => r.id === 'a')!;
  const b = res.results.find(r => r.id === 'b')!;
  assert.strictEqual(a.status, 'failed');
  assert.strictEqual(b.status, 'skipped');
  console.log('  ✓ batchDeploymentService: dependency skip');
}

async function testParallel_respectsConcurrencyAndCompletes() {
  const svc = new BatchDeploymentService();

  let inFlight = 0;
  let maxInFlight = 0;

  const restore = patchMethod(
    ContractDeployer.prototype,
    'buildAndDeploy',
    async function (this: any, contractDir: string) {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await sleep(30);
      inFlight -= 1;
      return { success: true, contractId: `C_${contractDir}` };
    }
  );

  const items: BatchDeploymentItem[] = [
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
  const svc = new BatchDeploymentService();
  const cts = new CancellationTokenSource();

  const restore = patchMethod(
    ContractDeployer.prototype,
    'buildAndDeploy',
    async function (this: any, contractDir: string) {
      // simulate long-running work
      await sleep(80);
      return { success: true, contractId: `C_${contractDir}` };
    }
  );

  const items: BatchDeploymentItem[] = [
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