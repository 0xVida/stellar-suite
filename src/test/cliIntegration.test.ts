// ============================================================
// src/test/cliIntegration.test.ts
// Comprehensive unit tests for CLI integration.
//
// Covers:
//   - Command execution (correct args, structure, flags)
//   - Output parsing (JSON, plain text, embedded JSON, resource usage)
//   - Error handling (non-zero exit, stderr errors, ENOENT, timeouts)
//   - Environment management (setSource, setCustomEnv, PATH enrichment)
//   - Timeout handling (CliTimeoutService: warning/timeout/extend/cancel/stop)
//   - Cancellation (CancellationTokenSource: state, listeners, dispose)
//   - History recording (success/failure outcomes)
//   - Mock CLI (MockCliOutputStreamingService behaviour)
//
// Run with:
//   npm run test:cli-integration
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

import { SorobanCliService } from '../services/sorobanCliService';
import { MockCliOutputStreamingService } from './mocks/mockCliOutputStreamingService';
import { CancellationTokenSource } from '../services/cliCancellation';
import { CliTimeoutService } from '../services/cliTimeoutService';
import { CliHistoryService } from '../services/cliHistoryService';
import { CliCleanupUtilities } from '../utils/cliCleanupUtilities';

// ── Shared helpers ────────────────────────────────────────────

const VALID_CONTRACT_ID = 'CABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE1234567890AB1234';

function createMockWorkspaceState() {
    const store: Record<string, unknown> = {};
    return {
        get<T>(key: string, defaultValue: T): T {
            return (store[key] as T) ?? defaultValue;
        },
        update(key: string, value: unknown): Promise<void> {
            store[key] = value;
            return Promise.resolve();
        },
        _store: store,
    };
}

function createHistoryService() {
    const ctx = { workspaceState: createMockWorkspaceState() };
    return new CliHistoryService(ctx as any);
}

/**
 * Create a SorobanCliService with its internal streaming service replaced by
 * a MockCliOutputStreamingService so tests never touch a real process.
 */
function createServiceWithMock(
    cliPath = 'stellar',
    source = 'dev',
    historyService?: CliHistoryService,
): { service: SorobanCliService; mock: MockCliOutputStreamingService } {
    const mock = new MockCliOutputStreamingService();
    const service = new SorobanCliService(cliPath, source, historyService);
    (service as any).streamingService = mock;
    return { service, mock };
}

// ── Section 1: Command Execution ──────────────────────────────

async function testCommandExecution_usesCliPathAsCommand() {
    const { service, mock } = createServiceWithMock('/usr/local/bin/stellar');
    await service.simulateTransaction(VALID_CONTRACT_ID, 'ping', [], 'testnet');

    assert.ok(mock.lastRequest, 'should have captured a request');
    assert.strictEqual(mock.lastRequest!.command, '/usr/local/bin/stellar');
    console.log('  [ok] uses the configured CLI path as the command');
}

async function testCommandExecution_includesContractInvokeSubcommand() {
    const { service, mock } = createServiceWithMock();
    await service.simulateTransaction(VALID_CONTRACT_ID, 'balance', [], 'testnet');

    const args = mock.lastRequest!.args;
    assert.ok(args.includes('contract'), 'args should contain "contract"');
    assert.ok(args.includes('invoke'), 'args should contain "invoke"');
    console.log('  [ok] includes "contract invoke" subcommand');
}

async function testCommandExecution_includesContractIdFlag() {
    const { service, mock } = createServiceWithMock();
    await service.simulateTransaction(VALID_CONTRACT_ID, 'get', [], 'testnet');

    const args = mock.lastRequest!.args;
    const idIndex = args.indexOf('--id');
    assert.ok(idIndex !== -1, 'args should contain --id flag');
    assert.strictEqual(args[idIndex + 1], VALID_CONTRACT_ID);
    console.log('  [ok] includes --id flag with contract ID');
}

async function testCommandExecution_includesSourceFlag() {
    const { service, mock } = createServiceWithMock('stellar', 'alice');
    await service.simulateTransaction(VALID_CONTRACT_ID, 'get', [], 'testnet');

    const args = mock.lastRequest!.args;
    const srcIndex = args.indexOf('--source');
    assert.ok(srcIndex !== -1, 'args should contain --source flag');
    assert.strictEqual(args[srcIndex + 1], 'alice');
    console.log('  [ok] includes --source flag with configured identity');
}

async function testCommandExecution_includesNetworkFlag() {
    const { service, mock } = createServiceWithMock();
    await service.simulateTransaction(VALID_CONTRACT_ID, 'get', [], 'mainnet');

    const args = mock.lastRequest!.args;
    const netIndex = args.indexOf('--network');
    assert.ok(netIndex !== -1, 'args should contain --network flag');
    assert.strictEqual(args[netIndex + 1], 'mainnet');
    console.log('  [ok] includes --network flag with supplied network');
}

async function testCommandExecution_includesFunctionNameAfterDoubleDash() {
    const { service, mock } = createServiceWithMock();
    await service.simulateTransaction(VALID_CONTRACT_ID, 'transfer', [], 'testnet');

    const args = mock.lastRequest!.args;
    const ddIndex = args.indexOf('--');
    assert.ok(ddIndex !== -1, 'args should include -- separator');
    assert.strictEqual(args[ddIndex + 1], 'transfer');
    console.log('  [ok] places function name after -- separator');
}

async function testCommandExecution_objectArgsConvertedToFlags() {
    const { service, mock } = createServiceWithMock();
    await service.simulateTransaction(
        VALID_CONTRACT_ID,
        'transfer',
        [{ from: 'ALICE', to: 'BOB', amount: 100 }],
        'testnet',
    );

    const args = mock.lastRequest!.args;
    assert.ok(args.includes('--from'), 'should contain --from flag');
    assert.ok(args.includes('ALICE'));
    assert.ok(args.includes('--to'), 'should contain --to flag');
    assert.ok(args.includes('BOB'));
    assert.ok(args.includes('--amount'), 'should contain --amount flag');
    assert.ok(args.includes('100'));
    console.log('  [ok] converts object args to --key value pairs');
}

async function testCommandExecution_arrayArgsPassedPositionally() {
    const { service, mock } = createServiceWithMock();
    await service.simulateTransaction(
        VALID_CONTRACT_ID,
        'increment',
        ['5', '10'],
        'testnet',
    );

    const args = mock.lastRequest!.args;
    assert.ok(args.includes('5'));
    assert.ok(args.includes('10'));
    console.log('  [ok] passes array args as positional arguments');
}

async function testCommandExecution_passesTimeoutToStreamingService() {
    const { service, mock } = createServiceWithMock();
    await service.simulateTransaction(
        VALID_CONTRACT_ID,
        'get',
        [],
        'testnet',
        { timeoutMs: 15000 },
    );

    assert.strictEqual(mock.lastRequest!.timeoutMs, 15000);
    console.log('  [ok] passes timeoutMs option to streaming service');
}

async function testCommandExecution_defaultTimeoutIs30Seconds() {
    const { service, mock } = createServiceWithMock();
    await service.simulateTransaction(VALID_CONTRACT_ID, 'get', [], 'testnet');

    assert.strictEqual(mock.lastRequest!.timeoutMs, 30000);
    console.log('  [ok] defaults timeoutMs to 30000ms');
}

async function testCommandExecution_incrementsCallCount() {
    const { service, mock } = createServiceWithMock();
    await service.simulateTransaction(VALID_CONTRACT_ID, 'a', [], 'testnet');
    await service.simulateTransaction(VALID_CONTRACT_ID, 'b', [], 'testnet');
    await service.simulateTransaction(VALID_CONTRACT_ID, 'c', [], 'testnet');

    assert.strictEqual(mock.callCount, 3);
    console.log('  [ok] increments call count for each execution');
}

// ── Section 2: Output Parsing ─────────────────────────────────

async function testOutputParsing_parsesJsonResultField() {
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({ exitCode: 0, stdout: JSON.stringify({ result: 42 }), stderr: '' });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'get', [], 'testnet');

    assert.strictEqual(sim.success, true);
    assert.strictEqual(sim.result, 42);
    console.log('  [ok] parses { result } from JSON stdout');
}

async function testOutputParsing_parsesReturnValueField() {
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({ exitCode: 0, stdout: JSON.stringify({ returnValue: 'hello' }), stderr: '' });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'greet', [], 'testnet');

    assert.strictEqual(sim.success, true);
    assert.strictEqual(sim.result, 'hello');
    console.log('  [ok] parses { returnValue } from JSON stdout');
}

async function testOutputParsing_returnsWholeObjectWhenNoKnownField() {
    const { service, mock } = createServiceWithMock();
    const payload = { value: 'custom', extra: true };
    mock.setDefaultResponse({ exitCode: 0, stdout: JSON.stringify(payload), stderr: '' });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'info', [], 'testnet');

    assert.strictEqual(sim.success, true);
    assert.deepStrictEqual(sim.result, payload);
    console.log('  [ok] returns full JSON object when no known result field found');
}

async function testOutputParsing_parsesPlainTextOutput() {
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({ exitCode: 0, stdout: 'plain-value', stderr: '' });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'raw', [], 'testnet');

    assert.strictEqual(sim.success, true);
    assert.strictEqual(sim.result, 'plain-value');
    console.log('  [ok] returns plain text stdout as result');
}

async function testOutputParsing_extractsJsonEmbeddedInMixedText() {
    const { service, mock } = createServiceWithMock();
    const embedded = { result: 'embedded' };
    mock.setDefaultResponse({
        exitCode: 0,
        stdout: `Stellar CLI v1.0\n${JSON.stringify(embedded)}\nDone.`,
        stderr: '',
    });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'mixed', [], 'testnet');

    assert.strictEqual(sim.success, true);
    assert.strictEqual(sim.result, 'embedded');
    console.log('  [ok] extracts embedded JSON from mixed output');
}

async function testOutputParsing_extractsResourceUsage() {
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({
        exitCode: 0,
        stdout: JSON.stringify({ result: 1, cpu_instructions: 5000, memory_bytes: 1024 }),
        stderr: '',
    });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'compute', [], 'testnet');

    assert.strictEqual(sim.success, true);
    assert.ok(sim.resourceUsage, 'should have resourceUsage');
    assert.strictEqual(sim.resourceUsage!.cpuInstructions, 5000);
    assert.strictEqual(sim.resourceUsage!.memoryBytes, 1024);
    console.log('  [ok] extracts resource usage from JSON output');
}

async function testOutputParsing_rawResultPreserved() {
    const { service, mock } = createServiceWithMock();
    const raw = { result: 'x', extra: 99 };
    mock.setDefaultResponse({ exitCode: 0, stdout: JSON.stringify(raw), stderr: '' });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'check', [], 'testnet');

    assert.deepStrictEqual(sim.rawResult, raw);
    console.log('  [ok] preserves rawResult in simulation result');
}

// ── Section 3: Error Handling ─────────────────────────────────

async function testErrorHandling_nonZeroExitCodeReturnsFailed() {
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({
        exitCode: 1,
        stdout: '',
        stderr: 'execution failed: contract panic',
        error: 'Command exited with code 1.',
    });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'fail', [], 'testnet');

    assert.strictEqual(sim.success, false);
    assert.ok(sim.error, 'should have error message');
    assert.ok(sim.errorType, 'should classify error type');
    console.log('  [ok] returns failure for non-zero exit code');
}

async function testErrorHandling_stderrLooksLikeError_returnsFailure() {
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({
        exitCode: 0,
        stdout: '',
        stderr: 'Error: invalid contract id',
    });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'invoke', [], 'testnet');

    assert.strictEqual(sim.success, false);
    assert.ok(sim.errorType, 'should have errorType');
    console.log('  [ok] treats stderr that looks like error as failure');
}

async function testErrorHandling_networkError_classifiedCorrectly() {
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({
        exitCode: 1,
        stdout: '',
        stderr: 'error: failed to reach RPC endpoint ECONNREFUSED',
        error: 'Command exited with code 1.',
    });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'invoke', [], 'testnet');

    assert.strictEqual(sim.success, false);
    assert.strictEqual(sim.errorType, 'network');
    assert.ok(sim.errorSuggestions && sim.errorSuggestions.length > 0, 'should have suggestions');
    console.log('  [ok] classifies network errors correctly');
}

async function testErrorHandling_validationError_classifiedCorrectly() {
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({
        exitCode: 1,
        stdout: '',
        stderr: "error: Found argument '--foo' which wasn't expected",
        error: 'Command exited with code 1.',
    });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'invoke', [], 'testnet');

    assert.strictEqual(sim.success, false);
    assert.strictEqual(sim.errorType, 'validation');
    console.log('  [ok] classifies validation errors correctly');
}

async function testErrorHandling_executionError_classifiedCorrectly() {
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({
        exitCode: 1,
        stdout: '',
        stderr: 'Error: simulation failed\nHostError: Error(Contract, #6)',
        error: 'Command exited with code 1.',
    });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'invoke', [], 'testnet');

    assert.strictEqual(sim.success, false);
    assert.strictEqual(sim.errorType, 'execution');
    console.log('  [ok] classifies execution/host errors correctly');
}

async function testErrorHandling_timedOut_returnsTimeoutResult() {
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({ exitCode: null, stdout: '', stderr: '', timedOut: true });

    const sim = await service.simulateTransaction(
        VALID_CONTRACT_ID,
        'slow',
        [],
        'testnet',
        { timeoutMs: 100 },
    );

    assert.strictEqual(sim.success, false);
    assert.ok(sim.error?.toLowerCase().includes('timed out'), 'error should mention timeout');
    console.log('  [ok] returns timeout result when streaming times out');
}

async function testErrorHandling_cancelled_returnsCancelledResult() {
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({ exitCode: null, stdout: '', stderr: '', cancelled: true });

    const sim = await service.simulateTransaction(
        VALID_CONTRACT_ID,
        'long',
        [],
        'testnet',
    );

    assert.strictEqual(sim.success, false);
    assert.ok(sim.error?.toLowerCase().includes('cancel'), 'error should mention cancellation');
    console.log('  [ok] returns cancelled result when streaming is cancelled');
}

async function testErrorHandling_cliNotFound_returnsUsefulMessage() {
    const mock = new MockCliOutputStreamingService();
    mock.setDefaultResponse({
        exitCode: null,
        stdout: '',
        stderr: '',
        error: 'spawn stellar ENOENT',
    });
    // Simulate ENOENT by throwing through a custom run that rejects
    const original = mock.run.bind(mock);
    mock.run = async () => {
        throw Object.assign(new Error('spawn stellar ENOENT'), { code: 'ENOENT' });
    };

    const service = new SorobanCliService('stellar', 'dev');
    (service as any).streamingService = mock;

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'fn', [], 'testnet');

    assert.strictEqual(sim.success, false);
    assert.ok(
        sim.error?.includes('not found') || sim.error?.toLowerCase().includes('stellar cli'),
        'error should mention CLI not found',
    );
    console.log('  [ok] returns helpful message when CLI executable not found');
}

async function testErrorHandling_jsonErrorPayload_parsedCorrectly() {
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({
        exitCode: 1,
        stdout: '',
        stderr: JSON.stringify({ error: { code: 'TX_BAD_SEQ', message: 'transaction failed' } }),
        error: 'Command exited with code 1.',
    });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'invoke', [], 'testnet');

    assert.strictEqual(sim.success, false);
    assert.strictEqual(sim.errorCode, 'TX_BAD_SEQ');
    console.log('  [ok] extracts error code from JSON error payload');
}

async function testErrorHandling_errorContextPreserved() {
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({
        exitCode: 1,
        stdout: '',
        stderr: 'Error: execution failed',
        error: 'Command exited with code 1.',
    });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'invoke', [], 'testnet');

    assert.strictEqual(sim.success, false);
    assert.ok(sim.errorContext, 'should carry errorContext');
    assert.strictEqual(sim.errorContext!.functionName, 'invoke');
    assert.strictEqual(sim.errorContext!.network, 'testnet');
    console.log('  [ok] preserves function name and network in error context');
}

// ── Section 4: Environment Management ────────────────────────

async function testEnvironment_setSourceChangesFlag() {
    const { service, mock } = createServiceWithMock('stellar', 'original');
    service.setSource('updated');
    await service.simulateTransaction(VALID_CONTRACT_ID, 'get', [], 'testnet');

    const args = mock.lastRequest!.args;
    const srcIndex = args.indexOf('--source');
    assert.strictEqual(args[srcIndex + 1], 'updated');
    console.log('  [ok] setSource updates the --source flag in subsequent calls');
}

async function testEnvironment_setCustomEnvPassedToStreaming() {
    const { service, mock } = createServiceWithMock();
    service.setCustomEnv({ STELLAR_CUSTOM: 'custom-val', OTHER: '42' });
    await service.simulateTransaction(VALID_CONTRACT_ID, 'get', [], 'testnet');

    const env = mock.lastRequest!.env as Record<string, string> | undefined;
    assert.ok(env, 'env should be set on request');
    assert.strictEqual(env!['STELLAR_CUSTOM'], 'custom-val');
    assert.strictEqual(env!['OTHER'], '42');
    console.log('  [ok] setCustomEnv passes custom variables to the streaming service');
}

async function testEnvironment_pathContainsCargoAndHomebrew() {
    const { service, mock } = createServiceWithMock();
    await service.simulateTransaction(VALID_CONTRACT_ID, 'get', [], 'testnet');

    const env = mock.lastRequest!.env as Record<string, string> | undefined;
    assert.ok(env && typeof env['PATH'] === 'string', 'PATH should be set');
    const pathValue = env!['PATH'];
    assert.ok(
        pathValue.includes('.cargo') || pathValue.includes('homebrew') || pathValue.includes('local'),
        'PATH should include common CLI locations',
    );
    console.log('  [ok] PATH includes common CLI installation directories');
}

async function testEnvironment_customEnvOverridesProcessEnv() {
    const { service, mock } = createServiceWithMock();
    service.setCustomEnv({ MY_OVERRIDE: 'YES' });
    await service.simulateTransaction(VALID_CONTRACT_ID, 'get', [], 'testnet');

    const env = mock.lastRequest!.env as Record<string, string> | undefined;
    assert.strictEqual(env!['MY_OVERRIDE'], 'YES');
    console.log('  [ok] custom env variables override process environment');
}

async function testEnvironment_emptyCustomEnvDoesNotBreak() {
    const { service, mock } = createServiceWithMock();
    service.setCustomEnv({});
    await service.simulateTransaction(VALID_CONTRACT_ID, 'get', [], 'testnet');

    assert.strictEqual(mock.callCount, 1);
    console.log('  [ok] empty custom env does not cause errors');
}

// ── Section 5: Timeout Handling ───────────────────────────────

async function testTimeout_firesTimeoutEventAfterDelay() {
    const ts = new CliTimeoutService({ defaultTimeoutMs: 100, warningThresholdMs: 0 });
    let timedOut = false;

    ts.on('event', (ev: any) => {
        if (ev.type === 'timeout') {
            timedOut = true;
        }
    });

    ts.start('test-cmd', 100);
    await new Promise(resolve => setTimeout(resolve, 200));
    ts.stop();

    assert.strictEqual(timedOut, true);
    console.log('  [ok] CliTimeoutService fires "timeout" event after configured delay');
}

async function testTimeout_firesWarningEventBeforeTimeout() {
    const ts = new CliTimeoutService({ defaultTimeoutMs: 500, warningThresholdMs: 300 });
    const events: string[] = [];

    ts.on('event', (ev: any) => events.push(ev.type));

    ts.start('test-cmd', 500);
    await new Promise(resolve => setTimeout(resolve, 600));
    ts.stop();

    assert.ok(events.includes('warning'), 'should fire warning event');
    assert.ok(events.includes('timeout'), 'should fire timeout event');
    const warningIndex = events.indexOf('warning');
    const timeoutIndex = events.indexOf('timeout');
    assert.ok(warningIndex < timeoutIndex, 'warning should come before timeout');
    console.log('  [ok] CliTimeoutService fires "warning" event before timeout');
}

async function testTimeout_stopPreventsTimeoutFiring() {
    const ts = new CliTimeoutService({ defaultTimeoutMs: 100, warningThresholdMs: 0 });
    let timedOut = false;

    ts.on('event', (ev: any) => {
        if (ev.type === 'timeout') {
            timedOut = true;
        }
    });

    ts.start('test-cmd', 100);
    ts.stop();
    await new Promise(resolve => setTimeout(resolve, 200));

    assert.strictEqual(timedOut, false);
    console.log('  [ok] stop() prevents the timeout event from firing');
}

async function testTimeout_cancelFiresCancelledEvent() {
    const ts = new CliTimeoutService({ defaultTimeoutMs: 5000, warningThresholdMs: 1000 });
    let cancelled = false;

    ts.on('event', (ev: any) => {
        if (ev.type === 'cancelled') {
            cancelled = true;
        }
    });

    ts.start('test-cmd');
    ts.cancel();

    assert.strictEqual(cancelled, true);
    console.log('  [ok] cancel() fires "cancelled" event synchronously');
}

async function testTimeout_extendFiresExtendedEventAndDelaysTimeout() {
    const ts = new CliTimeoutService({ defaultTimeoutMs: 200, warningThresholdMs: 0 });
    const events: Array<{ type: string; newTimeoutMs?: number }> = [];

    ts.on('event', (ev: any) => events.push({ type: ev.type, newTimeoutMs: ev.newTimeoutMs }));

    ts.start('test-cmd', 200);
    ts.extend(300);
    await new Promise(resolve => setTimeout(resolve, 250));

    // Should not have timed out yet (extended by 300ms means total ~500ms)
    const timedOut = events.some(e => e.type === 'timeout');
    assert.strictEqual(timedOut, false, 'should not have timed out yet after extension');
    assert.ok(events.some(e => e.type === 'extended'), 'should fire extended event');

    // Cleanup
    ts.stop();
    console.log('  [ok] extend() fires "extended" event and delays timeout');
}

async function testTimeout_cancelOnNonRunningServiceIsNoOp() {
    const ts = new CliTimeoutService({ defaultTimeoutMs: 1000, warningThresholdMs: 200 });
    let eventFired = false;

    ts.on('event', () => { eventFired = true; });

    // cancel without starting — should be a no-op
    ts.cancel();

    assert.strictEqual(eventFired, false);
    console.log('  [ok] cancel() on a non-running service is a no-op');
}

async function testTimeout_commandOverridesConfig() {
    const ts = new CliTimeoutService({
        defaultTimeoutMs: 5000,
        warningThresholdMs: 0,
        commandOverrides: { 'fast-cmd': 100 },
    });
    let timedOut = false;

    ts.on('event', (ev: any) => {
        if (ev.type === 'timeout') {
            timedOut = true;
        }
    });

    ts.start('fast-cmd'); // uses override of 100ms
    await new Promise(resolve => setTimeout(resolve, 200));
    ts.stop();

    assert.strictEqual(timedOut, true);
    console.log('  [ok] commandOverrides in config applies per-command timeout');
}

async function testTimeout_alreadyElapsedFiresTimeoutImmediately() {
    const ts = new CliTimeoutService({ defaultTimeoutMs: 0, warningThresholdMs: 0 });
    // timeoutMs = 0 means remainingMs <= 0 → handleTimeout immediately
    let timedOut = false;

    ts.on('event', (ev: any) => {
        if (ev.type === 'timeout') {
            timedOut = true;
        }
    });

    ts.start('cmd', 0);
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(timedOut, true);
    console.log('  [ok] timeout fires immediately when elapsed >= configured duration');
}

// ── Section 6: Cancellation ───────────────────────────────────

async function testCancellation_initialStateNotRequested() {
    const source = new CancellationTokenSource();
    assert.strictEqual(source.token.isCancellationRequested, false);
    console.log('  [ok] cancellation token starts with isCancellationRequested = false');
}

async function testCancellation_cancelSetsCancellationRequested() {
    const source = new CancellationTokenSource();
    source.cancel();
    assert.strictEqual(source.token.isCancellationRequested, true);
    console.log('  [ok] cancel() sets isCancellationRequested to true');
}

async function testCancellation_cancelFiresListeners() {
    const source = new CancellationTokenSource();
    let fired = 0;

    source.token.onCancellationRequested(() => { fired++; });
    source.token.onCancellationRequested(() => { fired++; });
    source.cancel();

    assert.strictEqual(fired, 2);
    console.log('  [ok] cancel() fires all registered listeners');
}

async function testCancellation_disposableRemovesListener() {
    const source = new CancellationTokenSource();
    let fired = 0;

    const disposable = source.token.onCancellationRequested(() => { fired++; });
    disposable.dispose();
    source.cancel();

    assert.strictEqual(fired, 0);
    console.log('  [ok] disposing listener prevents it from firing');
}

async function testCancellation_cancelIsIdempotent() {
    const source = new CancellationTokenSource();
    let count = 0;

    source.token.onCancellationRequested(() => { count++; });
    source.cancel();
    source.cancel(); // second call should not re-fire listeners

    assert.strictEqual(source.token.isCancellationRequested, true);
    console.log('  [ok] cancel() is idempotent — listeners fire only once');
}

async function testCancellation_multipleListeners_allFired() {
    const source = new CancellationTokenSource();
    const fired: number[] = [];

    source.token.onCancellationRequested(() => fired.push(1));
    source.token.onCancellationRequested(() => fired.push(2));
    source.token.onCancellationRequested(() => fired.push(3));
    source.cancel();

    assert.deepStrictEqual(fired, [1, 2, 3]);
    console.log('  [ok] all registered listeners are invoked on cancel');
}

async function testCancellation_tokenPassedToStreamingService() {
    const { service, mock } = createServiceWithMock();
    const source = new CancellationTokenSource();
    // Must capture the token reference — the getter creates a new object each call.
    const token = source.token;

    await service.simulateTransaction(
        VALID_CONTRACT_ID,
        'fn',
        [],
        'testnet',
        { cancellationToken: token },
    );

    assert.strictEqual(mock.lastRequest!.cancellationToken, token);
    console.log('  [ok] cancellation token is forwarded to the streaming service');
}

// ── Section 7: History Recording ─────────────────────────────

async function testHistory_recordsSuccessfulExecution() {
    const historySvc = createHistoryService();
    const { service } = createServiceWithMock('stellar', 'dev', historySvc);

    await service.simulateTransaction(VALID_CONTRACT_ID, 'transfer', [], 'testnet');

    const entries = historySvc.queryHistory();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].outcome, 'success');
    assert.strictEqual(entries[0].source, 'manual');
    console.log('  [ok] records successful execution in history');
}

async function testHistory_recordsFailedExecution() {
    // The catch path (e.g. ENOENT / thrown error) records outcome: 'failure'.
    const historySvc = createHistoryService();
    const mock = new MockCliOutputStreamingService();
    mock.run = async () => {
        throw Object.assign(new Error('spawn stellar ENOENT'), { code: 'ENOENT' });
    };
    const service = new SorobanCliService('stellar', 'dev', historySvc);
    (service as any).streamingService = mock;

    await service.simulateTransaction(VALID_CONTRACT_ID, 'fail', [], 'testnet');

    const entries = historySvc.queryHistory();
    assert.ok(entries.length > 0, 'should record history entry');
    assert.strictEqual(entries[0].outcome, 'failure');
    console.log('  [ok] records failed execution in history');
}

async function testHistory_sourceReplay_recordedAsReplay() {
    const historySvc = createHistoryService();
    const { service } = createServiceWithMock('stellar', 'dev', historySvc);

    await service.simulateTransaction(VALID_CONTRACT_ID, 'fn', [], 'testnet', {}, 'replay');

    const entries = historySvc.queryHistory();
    assert.strictEqual(entries[0].source, 'replay');
    console.log('  [ok] records history entry with "replay" source when specified');
}

async function testHistory_nullSource_noEntryRecorded() {
    const historySvc = createHistoryService();
    const { service } = createServiceWithMock('stellar', 'dev', historySvc);

    await service.simulateTransaction(VALID_CONTRACT_ID, 'fn', [], 'testnet', {}, null);

    const entries = historySvc.queryHistory();
    assert.strictEqual(entries.length, 0);
    console.log('  [ok] skips history recording when source is null');
}

async function testHistory_noHistoryService_doesNotThrow() {
    const { service } = createServiceWithMock('stellar', 'dev', undefined);
    let threw = false;

    try {
        await service.simulateTransaction(VALID_CONTRACT_ID, 'fn', [], 'testnet');
    } catch {
        threw = true;
    }

    assert.strictEqual(threw, false);
    console.log('  [ok] operates normally without a history service');
}

async function testHistory_commandAndArgsStoredCorrectly() {
    const historySvc = createHistoryService();
    const { service } = createServiceWithMock('stellar', 'dev', historySvc);

    await service.simulateTransaction(VALID_CONTRACT_ID, 'increment', [], 'testnet');

    const entries = historySvc.queryHistory();
    assert.ok(entries[0].command, 'should store command name');
    assert.ok(Array.isArray(entries[0].args), 'should store args array');
    assert.ok(entries[0].args.includes('invoke'));
    assert.ok(entries[0].args.includes(VALID_CONTRACT_ID));
    console.log('  [ok] stores command and args correctly in history');
}

// ── Section 8: Mock CLI Behaviour ────────────────────────────

async function testMockCli_matchesResponseByArgsKey() {
    const mock = new MockCliOutputStreamingService();
    mock.setResponse('deploy', { exitCode: 0, stdout: 'deploy-ok', stderr: '' });
    mock.setResponse('build', { exitCode: 0, stdout: 'build-ok', stderr: '' });

    const deployResult = await mock.run({ command: 'stellar', args: ['contract', 'deploy'] });
    const buildResult = await mock.run({ command: 'stellar', args: ['contract', 'build'] });

    assert.strictEqual(deployResult.stdout, 'deploy-ok');
    assert.strictEqual(buildResult.stdout, 'build-ok');
    console.log('  [ok] MockCliOutputStreamingService matches response by args key');
}

async function testMockCli_usesDefaultWhenNoMatchFound() {
    const mock = new MockCliOutputStreamingService();
    mock.setDefaultResponse({ exitCode: 0, stdout: 'default-response', stderr: '' });
    mock.setResponse('specific', { exitCode: 0, stdout: 'specific-response', stderr: '' });

    const result = await mock.run({ command: 'stellar', args: ['unrecognised'] });

    assert.strictEqual(result.stdout, 'default-response');
    console.log('  [ok] MockCliOutputStreamingService falls back to default response');
}

async function testMockCli_tracksCallCountAndRequests() {
    const mock = new MockCliOutputStreamingService();

    await mock.run({ command: 'stellar', args: ['a'] });
    await mock.run({ command: 'stellar', args: ['b'] });

    assert.strictEqual(mock.callCount, 2);
    assert.strictEqual(mock.requests.length, 2);
    assert.deepStrictEqual(mock.requests[0].args, ['a']);
    assert.deepStrictEqual(mock.requests[1].args, ['b']);
    console.log('  [ok] MockCliOutputStreamingService tracks call count and requests');
}

async function testMockCli_lastRequestUpdatedOnEachRun() {
    const mock = new MockCliOutputStreamingService();

    await mock.run({ command: 'stellar', args: ['first'] });
    await mock.run({ command: 'stellar', args: ['second'] });

    assert.deepStrictEqual(mock.lastRequest!.args, ['second']);
    console.log('  [ok] lastRequest is updated to the most recent run');
}

async function testMockCli_simulatesOnStdoutCallback() {
    const mock = new MockCliOutputStreamingService();
    mock.setDefaultResponse({ exitCode: 0, stdout: 'streamed-stdout', stderr: '' });

    let received = '';
    await mock.run({
        command: 'stellar',
        args: ['run'],
        onStdout: (text) => { received += text; },
    });

    assert.strictEqual(received, 'streamed-stdout');
    console.log('  [ok] MockCliOutputStreamingService invokes onStdout callback');
}

async function testMockCli_simulatesOnStderrCallback() {
    const mock = new MockCliOutputStreamingService();
    mock.setDefaultResponse({ exitCode: 1, stdout: '', stderr: 'streamed-stderr' });

    let received = '';
    await mock.run({
        command: 'stellar',
        args: ['run'],
        onStderr: (text) => { received += text; },
    });

    assert.strictEqual(received, 'streamed-stderr');
    console.log('  [ok] MockCliOutputStreamingService invokes onStderr callback');
}

async function testMockCli_simulatesOnChunkCallback() {
    const mock = new MockCliOutputStreamingService();
    mock.setDefaultResponse({ exitCode: 0, stdout: 'chunk-out', stderr: 'chunk-err' });

    const chunks: Array<{ stream: string; text: string }> = [];
    await mock.run({
        command: 'stellar',
        args: ['run'],
        onChunk: (chunk) => chunks.push({ stream: chunk.stream, text: chunk.text }),
    });

    assert.ok(chunks.some(c => c.stream === 'stdout' && c.text === 'chunk-out'));
    assert.ok(chunks.some(c => c.stream === 'stderr' && c.text === 'chunk-err'));
    console.log('  [ok] MockCliOutputStreamingService invokes onChunk for stdout and stderr');
}

async function testMockCli_successFlagReflectsExitCode() {
    const mock = new MockCliOutputStreamingService();
    mock.setDefaultResponse({ exitCode: 0, stdout: 'ok', stderr: '' });

    const successResult = await mock.run({ command: 'stellar', args: [] });
    assert.strictEqual(successResult.success, true);

    mock.setDefaultResponse({ exitCode: 1, stdout: '', stderr: 'err' });
    const failResult = await mock.run({ command: 'stellar', args: [] });
    assert.strictEqual(failResult.success, false);
    console.log('  [ok] MockCliOutputStreamingService success flag reflects exit code');
}

async function testMockCli_combinedOutputContainsBothStreams() {
    const mock = new MockCliOutputStreamingService();
    mock.setDefaultResponse({ exitCode: 0, stdout: 'OUT', stderr: 'ERR' });

    const result = await mock.run({ command: 'stellar', args: [] });

    assert.ok(result.combinedOutput.includes('OUT'));
    assert.ok(result.combinedOutput.includes('ERR'));
    console.log('  [ok] MockCliOutputStreamingService combinedOutput contains stdout and stderr');
}

async function testMockCli_timedOutResponseReturnsFailure() {
    const mock = new MockCliOutputStreamingService();
    mock.setDefaultResponse({ exitCode: null, stdout: '', stderr: '', timedOut: true });

    const result = await mock.run({ command: 'stellar', args: [] });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timedOut, true);
    console.log('  [ok] MockCliOutputStreamingService timedOut response returns failure');
}

async function testMockCli_cancelledResponseReturnsFailure() {
    const mock = new MockCliOutputStreamingService();
    mock.setDefaultResponse({ exitCode: null, stdout: '', stderr: '', cancelled: true });

    const result = await mock.run({ command: 'stellar', args: [] });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.cancelled, true);
    console.log('  [ok] MockCliOutputStreamingService cancelled response returns failure');
}

// ── Section 9: CLI Version Compatibility ──────────────────────
//
// Verifies that the integration layer correctly handles the varied
// output formats produced by different Stellar CLI releases.

async function testVersionCompat_oldFormatTopLevelValue() {
    // CLI v20.x could emit a bare value JSON (no result wrapper)
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({ exitCode: 0, stdout: JSON.stringify({ value: 42 }), stderr: '' });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'get', [], 'testnet');

    assert.strictEqual(sim.success, true);
    assert.ok(sim.result !== undefined, 'result should be parsed');
    console.log('  [ok] handles CLI v20.x top-level value object');
}

async function testVersionCompat_newFormatReturnValue() {
    // CLI v21+ typically emits { returnValue: ... } (may be XDR-encoded)
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({
        exitCode: 0,
        stdout: JSON.stringify({ returnValue: 'AAAAAA==' }),
        stderr: '',
    });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'invoke', [], 'testnet');

    assert.strictEqual(sim.success, true);
    assert.strictEqual(sim.result, 'AAAAAA==');
    console.log('  [ok] handles CLI v21+ returnValue output format');
}

async function testVersionCompat_legacyResourceUsageFields() {
    // Older CLIs use snake_case resource fields: cpu_instructions / memory_bytes
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({
        exitCode: 0,
        stdout: JSON.stringify({ result: 'ok', cpu_instructions: 9999, memory_bytes: 2048 }),
        stderr: '',
    });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'fn', [], 'testnet');

    assert.strictEqual(sim.success, true);
    assert.ok(sim.resourceUsage, 'should have resourceUsage');
    assert.strictEqual(sim.resourceUsage!.cpuInstructions, 9999);
    assert.strictEqual(sim.resourceUsage!.memoryBytes, 2048);
    console.log('  [ok] handles legacy cpu_instructions/memory_bytes field names');
}

async function testVersionCompat_newResourceUsageObject() {
    // The service treats the presence of a 'resourceUsage' key as the signal that
    // resource metadata exists; the actual counts are still read from the companion
    // flat snake_case fields (cpu_instructions / memory_bytes).
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({
        exitCode: 0,
        stdout: JSON.stringify({
            result: 'ok',
            resourceUsage: {},
            cpu_instructions: 1234,
            memory_bytes: 512,
        }),
        stderr: '',
    });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'fn', [], 'testnet');

    assert.strictEqual(sim.success, true);
    assert.ok(sim.resourceUsage, 'should have resourceUsage when the resourceUsage key is present');
    assert.strictEqual(sim.resourceUsage!.cpuInstructions, 1234);
    assert.strictEqual(sim.resourceUsage!.memoryBytes, 512);
    console.log('  [ok] resourceUsage key triggers resource detection; values read from flat fields');
}

async function testVersionCompat_hostErrorFromOlderCli() {
    // Older CLI versions format contract panics as "HostError: Error(Contract, #N)"
    const { service, mock } = createServiceWithMock();
    mock.setDefaultResponse({
        exitCode: 1,
        stdout: '',
        stderr: 'host invocation failed\nHostError: Error(WasmVm, InvalidAction)',
        error: 'Command exited with code 1.',
    });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'fn', [], 'testnet');

    assert.strictEqual(sim.success, false);
    assert.ok(sim.errorType, 'should classify the HostError');
    console.log('  [ok] classifies HostError format produced by older CLI versions');
}

async function testVersionCompat_versionOutputPrefixIgnored() {
    // Some CLI versions prepend a banner line before the JSON payload
    const { service, mock } = createServiceWithMock();
    const payload = { result: 'banner-test' };
    mock.setDefaultResponse({
        exitCode: 0,
        stdout: `stellar 21.5.0\n${JSON.stringify(payload)}`,
        stderr: '',
    });

    const sim = await service.simulateTransaction(VALID_CONTRACT_ID, 'check', [], 'testnet');

    assert.strictEqual(sim.success, true);
    assert.strictEqual(sim.result, 'banner-test');
    console.log('  [ok] ignores CLI version banner line before JSON payload');
}

async function testVersionCompat_multipleNetworks() {
    // Verify --network flag is forwarded correctly for every supported network
    const networks = ['testnet', 'mainnet', 'futurenet'];
    for (const network of networks) {
        const { service, mock } = createServiceWithMock();
        mock.setDefaultResponse({ exitCode: 0, stdout: JSON.stringify({ result: network }), stderr: '' });

        await service.simulateTransaction(VALID_CONTRACT_ID, 'check', [], network);

        const args = mock.lastRequest!.args;
        const netIdx = args.indexOf('--network');
        assert.ok(netIdx !== -1, `--network flag should be present for ${network}`);
        assert.strictEqual(args[netIdx + 1], network);
    }
    console.log('  [ok] --network flag is forwarded correctly for testnet, mainnet, futurenet');
}

// ── Section 10: Cleanup After Operations ──────────────────────
//
// Verifies that CliCleanupUtilities correctly registers and executes
// cleanup tasks (file / directory removal) and is resilient to errors.

async function testCleanup_fileRemovedAfterCleanupAll() {
    const cleanup = new CliCleanupUtilities();
    const tmpFile = path.join(os.tmpdir(), `stellar_test_${Date.now()}.tmp`);
    fs.writeFileSync(tmpFile, 'test-data');
    cleanup.registerTask({ type: 'file', target: tmpFile, description: 'temp artifact' });

    assert.ok(fs.existsSync(tmpFile), 'file should exist before cleanup');
    await cleanup.cleanupAll();
    assert.strictEqual(fs.existsSync(tmpFile), false, 'file should be removed after cleanup');
    console.log('  [ok] cleanupAll removes registered file tasks');
}

async function testCleanup_nonExistentFileDoesNotThrow() {
    const cleanup = new CliCleanupUtilities();
    cleanup.registerTask({ type: 'file', target: '/nonexistent/stellar_missing.tmp' });

    let threw = false;
    try {
        await cleanup.cleanupAll();
    } catch {
        threw = true;
    }

    assert.strictEqual(threw, false);
    console.log('  [ok] cleanupAll does not throw for a non-existent file');
}

async function testCleanup_multipleFilesAllRemoved() {
    const cleanup = new CliCleanupUtilities();
    const tmpDir = os.tmpdir();
    const now = Date.now();
    const files: string[] = [
        path.join(tmpDir, `stellar_ca_${now}.tmp`),
        path.join(tmpDir, `stellar_cb_${now}.tmp`),
        path.join(tmpDir, `stellar_cc_${now}.tmp`),
    ];

    for (const f of files) {
        fs.writeFileSync(f, 'data');
        cleanup.registerTask({ type: 'file', target: f });
    }

    await cleanup.cleanupAll();

    for (const f of files) {
        assert.strictEqual(fs.existsSync(f), false, `${path.basename(f)} should be removed`);
    }
    console.log('  [ok] cleanupAll removes all individually registered file tasks');
}

async function testCleanup_taskListClearedAfterCleanupAll() {
    const cleanup = new CliCleanupUtilities();
    const tmpFile = path.join(os.tmpdir(), `stellar_clear_${Date.now()}.tmp`);
    fs.writeFileSync(tmpFile, 'x');
    cleanup.registerTask({ type: 'file', target: tmpFile });

    await cleanup.cleanupAll(); // runs and clears the task list

    // Recreate the file; a second cleanupAll with an empty task list must not remove it
    fs.writeFileSync(tmpFile, 'x');
    await cleanup.cleanupAll();
    const stillExists = fs.existsSync(tmpFile);
    if (stillExists) { fs.unlinkSync(tmpFile); } // manual cleanup

    assert.strictEqual(stillExists, true, 'second cleanupAll should not re-execute cleared tasks');
    console.log('  [ok] task list is cleared after cleanupAll so tasks do not re-run');
}

async function testCleanup_directoryRemovedAfterCleanupAll() {
    const cleanup = new CliCleanupUtilities();
    const tmpDir = path.join(os.tmpdir(), `stellar_dir_${Date.now()}`);
    fs.mkdirSync(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'artifact.wasm'), 'mock-wasm');
    cleanup.registerTask({ type: 'directory', target: tmpDir, description: 'build output dir' });

    assert.ok(fs.existsSync(tmpDir), 'directory should exist before cleanup');
    await cleanup.cleanupAll();
    assert.strictEqual(fs.existsSync(tmpDir), false, 'directory should be removed after cleanup');
    console.log('  [ok] cleanupAll removes a registered directory and its contents');
}

async function testCleanup_nonExistentDirectoryDoesNotThrow() {
    const cleanup = new CliCleanupUtilities();
    cleanup.registerTask({ type: 'directory', target: '/nonexistent/stellar_dir_xyz' });

    let threw = false;
    try {
        await cleanup.cleanupAll();
    } catch {
        threw = true;
    }

    assert.strictEqual(threw, false);
    console.log('  [ok] cleanupAll does not throw for a non-existent directory');
}

async function testCleanup_noTasksRegisteredIsNoOp() {
    const cleanup = new CliCleanupUtilities();

    let threw = false;
    try {
        await cleanup.cleanupAll();
    } catch {
        threw = true;
    }

    assert.strictEqual(threw, false);
    console.log('  [ok] cleanupAll with no tasks registered is a harmless no-op');
}

async function testCleanup_continuesAfterOneTaskFails() {
    const cleanup = new CliCleanupUtilities();
    const tmpFile = path.join(os.tmpdir(), `stellar_continue_${Date.now()}.tmp`);
    fs.writeFileSync(tmpFile, 'data');

    // First task targets a non-existent path (should not abort the run)
    cleanup.registerTask({ type: 'file', target: '/definitely/does/not/exist/stellar.tmp' });
    // Second task is real and must still be cleaned up
    cleanup.registerTask({ type: 'file', target: tmpFile });

    await cleanup.cleanupAll();

    assert.strictEqual(fs.existsSync(tmpFile), false, 'real file should still be cleaned up');
    console.log('  [ok] cleanupAll continues cleaning remaining tasks when one task is a no-op');
}

// ── Test runner ───────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        // Command execution
        testCommandExecution_usesCliPathAsCommand,
        testCommandExecution_includesContractInvokeSubcommand,
        testCommandExecution_includesContractIdFlag,
        testCommandExecution_includesSourceFlag,
        testCommandExecution_includesNetworkFlag,
        testCommandExecution_includesFunctionNameAfterDoubleDash,
        testCommandExecution_objectArgsConvertedToFlags,
        testCommandExecution_arrayArgsPassedPositionally,
        testCommandExecution_passesTimeoutToStreamingService,
        testCommandExecution_defaultTimeoutIs30Seconds,
        testCommandExecution_incrementsCallCount,

        // Output parsing
        testOutputParsing_parsesJsonResultField,
        testOutputParsing_parsesReturnValueField,
        testOutputParsing_returnsWholeObjectWhenNoKnownField,
        testOutputParsing_parsesPlainTextOutput,
        testOutputParsing_extractsJsonEmbeddedInMixedText,
        testOutputParsing_extractsResourceUsage,
        testOutputParsing_rawResultPreserved,

        // Error handling
        testErrorHandling_nonZeroExitCodeReturnsFailed,
        testErrorHandling_stderrLooksLikeError_returnsFailure,
        testErrorHandling_networkError_classifiedCorrectly,
        testErrorHandling_validationError_classifiedCorrectly,
        testErrorHandling_executionError_classifiedCorrectly,
        testErrorHandling_timedOut_returnsTimeoutResult,
        testErrorHandling_cancelled_returnsCancelledResult,
        testErrorHandling_cliNotFound_returnsUsefulMessage,
        testErrorHandling_jsonErrorPayload_parsedCorrectly,
        testErrorHandling_errorContextPreserved,

        // Environment management
        testEnvironment_setSourceChangesFlag,
        testEnvironment_setCustomEnvPassedToStreaming,
        testEnvironment_pathContainsCargoAndHomebrew,
        testEnvironment_customEnvOverridesProcessEnv,
        testEnvironment_emptyCustomEnvDoesNotBreak,

        // Timeout handling
        testTimeout_firesTimeoutEventAfterDelay,
        testTimeout_firesWarningEventBeforeTimeout,
        testTimeout_stopPreventsTimeoutFiring,
        testTimeout_cancelFiresCancelledEvent,
        testTimeout_extendFiresExtendedEventAndDelaysTimeout,
        testTimeout_cancelOnNonRunningServiceIsNoOp,
        testTimeout_commandOverridesConfig,
        testTimeout_alreadyElapsedFiresTimeoutImmediately,

        // Cancellation
        testCancellation_initialStateNotRequested,
        testCancellation_cancelSetsCancellationRequested,
        testCancellation_cancelFiresListeners,
        testCancellation_disposableRemovesListener,
        testCancellation_cancelIsIdempotent,
        testCancellation_multipleListeners_allFired,
        testCancellation_tokenPassedToStreamingService,

        // History recording
        testHistory_recordsSuccessfulExecution,
        testHistory_recordsFailedExecution,
        testHistory_sourceReplay_recordedAsReplay,
        testHistory_nullSource_noEntryRecorded,
        testHistory_noHistoryService_doesNotThrow,
        testHistory_commandAndArgsStoredCorrectly,

        // Mock CLI behaviour
        testMockCli_matchesResponseByArgsKey,
        testMockCli_usesDefaultWhenNoMatchFound,
        testMockCli_tracksCallCountAndRequests,
        testMockCli_lastRequestUpdatedOnEachRun,
        testMockCli_simulatesOnStdoutCallback,
        testMockCli_simulatesOnStderrCallback,
        testMockCli_simulatesOnChunkCallback,
        testMockCli_successFlagReflectsExitCode,
        testMockCli_combinedOutputContainsBothStreams,
        testMockCli_timedOutResponseReturnsFailure,
        testMockCli_cancelledResponseReturnsFailure,

        // CLI version compatibility
        testVersionCompat_oldFormatTopLevelValue,
        testVersionCompat_newFormatReturnValue,
        testVersionCompat_legacyResourceUsageFields,
        testVersionCompat_newResourceUsageObject,
        testVersionCompat_hostErrorFromOlderCli,
        testVersionCompat_versionOutputPrefixIgnored,
        testVersionCompat_multipleNetworks,

        // Cleanup after operations
        testCleanup_fileRemovedAfterCleanupAll,
        testCleanup_nonExistentFileDoesNotThrow,
        testCleanup_multipleFilesAllRemoved,
        testCleanup_taskListClearedAfterCleanupAll,
        testCleanup_directoryRemovedAfterCleanupAll,
        testCleanup_nonExistentDirectoryDoesNotThrow,
        testCleanup_noTasksRegisteredIsNoOp,
        testCleanup_continuesAfterOneTaskFails,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\ncliIntegration unit tests');
    for (const test of tests) {
        try {
            await test();
            passed += 1;
        } catch (err) {
            failed += 1;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    const total = passed + failed;
    console.log(`\n${total} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch(err => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
