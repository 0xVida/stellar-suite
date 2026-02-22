declare const process: { exitCode?: number };

import * as assert from 'assert';
import { ProgressIndicatorService } from '../services/progressIndicatorService';

class TestCancellationTokenSource {
    private listeners = new Set<() => void>();
    public token = {
        isCancellationRequested: false,
        onCancellationRequested: (listener: () => void) => {
            this.listeners.add(listener);
            return { dispose: () => this.listeners.delete(listener) };
        },
    };

    cancel(): void {
        this.token.isCancellationRequested = true;
        for (const listener of [...this.listeners]) {
            listener();
        }
    }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function testProgressAndEta() {
    const service = new ProgressIndicatorService();
    const op = service.createOperation({ id: 'op1', title: 'Operation' });

    op.start('Starting');
    await sleep(20);
    op.report({ percentage: 50, message: 'Halfway' });

    const snapshot = op.getSnapshot();
    assert.strictEqual(snapshot.status, 'running');
    assert.strictEqual(snapshot.percentage, 50);
    assert.strictEqual(snapshot.indeterminate, false);
    assert.ok(typeof snapshot.estimatedRemainingMs === 'number');
    assert.ok((snapshot.estimatedRemainingMs ?? 0) >= 0);

    op.dispose();
    console.log('  [ok] progress + ETA is computed');
}

async function testIndeterminateProgress() {
    const service = new ProgressIndicatorService();
    const op = service.createOperation({ id: 'op2', title: 'Operation' });

    op.start('Starting');
    op.report({ percentage: 25, message: 'Known progress' });
    op.setIndeterminate('Waiting on external step');

    const snapshot = op.getSnapshot();
    assert.strictEqual(snapshot.indeterminate, true);
    assert.strictEqual(snapshot.percentage, undefined);

    op.dispose();
    console.log('  [ok] supports indeterminate mode');
}

async function testCancellationBinding() {
    const service = new ProgressIndicatorService();
    const op = service.createOperation({ id: 'op3', title: 'Operation', cancellable: true });
    const cts = new TestCancellationTokenSource();

    op.start('Starting');
    op.bindCancellationToken(cts.token);

    cts.cancel();

    const snapshot = op.getSnapshot();
    assert.strictEqual(snapshot.cancellationRequested, true);

    op.cancel('Cancelled by user');
    assert.strictEqual(op.getSnapshot().status, 'cancelled');

    op.dispose();
    console.log('  [ok] supports cancellation');
}

async function testErrorAndSuccessTransitions() {
    const service = new ProgressIndicatorService();

    const failedOp = service.createOperation({ id: 'op4', title: 'Fail Operation' });
    failedOp.start('Running');
    failedOp.fail('boom', 'Failed intentionally');

    const failed = failedOp.getSnapshot();
    assert.strictEqual(failed.status, 'failed');
    assert.strictEqual(failed.error, 'boom');
    assert.ok(typeof failed.completedAt === 'number');

    const successOp = service.createOperation({ id: 'op5', title: 'Success Operation' });
    successOp.start('Running');
    successOp.succeed('Done');

    const succeeded = successOp.getSnapshot();
    assert.strictEqual(succeeded.status, 'succeeded');
    assert.strictEqual(succeeded.percentage, 100);

    failedOp.dispose();
    successOp.dispose();
    console.log('  [ok] handles success and failure transitions');
}

async function run() {
    const tests: Array<() => Promise<void>> = [
        testProgressAndEta,
        testIndeterminateProgress,
        testCancellationBinding,
        testErrorAndSuccessTransitions,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nprogressIndicatorService tests');
    for (const test of tests) {
        try {
            await test();
            passed += 1;
        } catch (error) {
            failed += 1;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${error instanceof Error ? error.message : String(error)}`);
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
