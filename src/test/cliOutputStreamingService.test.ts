declare function require(name: string): any;
declare const process: {
    exitCode?: number;
    execPath: string;
};

type CancellationListener = () => void;

const assert = require('assert');

import {
    CliOutputStreamingService,
    CliStreamingCancellationToken,
} from '../services/cliOutputStreamingService';

class TestCancellationToken implements CliStreamingCancellationToken {
    public isCancellationRequested = false;
    private listeners: CancellationListener[] = [];

    public onCancellationRequested(listener: CancellationListener): { dispose(): void } {
        this.listeners.push(listener);
        return {
            dispose: () => {
                this.listeners = this.listeners.filter(current => current !== listener);
            },
        };
    }

    public cancel(): void {
        if (this.isCancellationRequested) {
            return;
        }
        this.isCancellationRequested = true;
        for (const listener of this.listeners) {
            listener();
        }
    }
}

async function testStreamsStdoutAndStderrInRealtime() {
    const service = new CliOutputStreamingService();
    const chunks: Array<{ stream: string; text: string }> = [];

    const script = [
        "process.stdout.write('stdout-line-1\\n');",
        "setTimeout(() => process.stderr.write('stderr-line-1\\n'), 20);",
        "setTimeout(() => process.stdout.write('stdout-line-2\\n'), 40);",
        "setTimeout(() => process.exit(0), 60);",
    ].join('');

    const result = await service.run({
        command: process.execPath,
        args: ['-e', script],
        timeoutMs: 2000,
        onChunk: (chunk) => {
            chunks.push({ stream: chunk.stream, text: chunk.text });
        },
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.stdout.includes('stdout-line-1'));
    assert.ok(result.stdout.includes('stdout-line-2'));
    assert.ok(result.stderr.includes('stderr-line-1'));
    assert.ok(result.combinedOutput.includes('stdout-line-1'));
    assert.ok(result.combinedOutput.includes('stderr-line-1'));
    assert.ok(chunks.some(chunk => chunk.stream === 'stdout'));
    assert.ok(chunks.some(chunk => chunk.stream === 'stderr'));
    console.log('  [ok] streams stdout/stderr chunks in real-time');
}

async function testHandlesLargeOutputWithBufferTruncation() {
    const service = new CliOutputStreamingService();
    const encoder = new TextEncoder();
    const largeLine = 'x'.repeat(4096);
    const script = `for (let i = 0; i < 20; i++) { process.stdout.write('${largeLine}\\n'); }`;

    const result = await service.run({
        command: process.execPath,
        args: ['-e', script],
        maxBufferedBytes: 1024,
        timeoutMs: 2000,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.truncated, true);
    assert.ok(encoder.encode(result.stdout).length <= 1024);
    assert.ok(result.stdout.length > 0);
    console.log('  [ok] truncates buffered output for large streams');
}

async function testSupportsCancellation() {
    const service = new CliOutputStreamingService();
    const token = new TestCancellationToken();

    const script = [
        "let i = 0;",
        "const timer = setInterval(() => {",
        "  process.stdout.write(`tick-${i++}\\n`);",
        "  if (i > 1000) { clearInterval(timer); process.exit(0); }",
        "}, 20);",
    ].join('');

    const pending = service.run({
        command: process.execPath,
        args: ['-e', script],
        cancellationToken: token,
        timeoutMs: 5000,
    });

    setTimeout(() => token.cancel(), 120);

    const result = await pending;
    assert.strictEqual(result.cancelled, true);
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.toLowerCase().includes('cancel'));
    console.log('  [ok] supports cancellation via token');
}

async function testHandlesTimeouts() {
    const service = new CliOutputStreamingService();
    const script = "setTimeout(() => process.exit(0), 1000);";

    const result = await service.run({
        command: process.execPath,
        args: ['-e', script],
        timeoutMs: 100,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timedOut, true);
    assert.ok(result.error?.toLowerCase().includes('timed out'));
    console.log('  [ok] times out long-running commands');
}

async function testReturnsFailureForNonZeroExit() {
    const service = new CliOutputStreamingService();

    const result = await service.run({
        command: process.execPath,
        args: ['-e', "process.stderr.write('bad\\n'); process.exit(2);"]
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('bad'));
    assert.ok(result.error?.includes('code 2'));
    console.log('  [ok] returns structured failure for non-zero exit');
}

async function run() {
    const tests = [
        testStreamsStdoutAndStderrInRealtime,
        testHandlesLargeOutputWithBufferTruncation,
        testSupportsCancellation,
        testHandlesTimeouts,
        testReturnsFailureForNonZeroExit,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\ncliOutputStreamingService unit tests');
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
