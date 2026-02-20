
// Unit tests for compilation status monitoring
// Run with:  node out-test/test/compilationStatus.test.js

declare function require(name: string): any;
declare const process: { exitCode?: number };

// ── Mock vscode ───────────────────────────────────────────────

const mockVscode = {
    EventEmitter: class {
        private listeners: any[] = [];
        fire(data: any) { this.listeners.forEach(l => l(data)); }
        event = (l: any) => {
            this.listeners.push(l);
            return { dispose: () => { this.listeners = this.listeners.filter(i => i !== l); } };
        };
        dispose() { }
    },
    window: {
        createOutputChannel: () => ({
            appendLine: () => { },
            dispose: () => { }
        })
    },
    workspace: {
        onDidChangeWorkspaceFolders: () => ({ dispose: () => { } })
    },
    CompilationStatus: {
        IDLE: 'IDLE',
        IN_PROGRESS: 'IN_PROGRESS',
        SUCCESS: 'SUCCESS',
        FAILED: 'FAILED',
        WARNING: 'WARNING',
        CANCELLED: 'CANCELLED'
    }
};

// Hack to mock the 'vscode' module in Node.js
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request: string, parent: any, isMain: boolean) {
    if (request === 'vscode') {
        return mockVscode;
    }
    return originalLoad.apply(this, arguments);
};

// ── Imports ───────────────────────────────────────────────────

const assert = require('assert');
import { CompilationStatusMonitor } from '../services/compilationStatusMonitor';
import {
    CompilationStatus,
    CompilationDiagnosticSeverity,
    CompilationMonitorConfig
} from '../types/compilationStatus';

// ============================================================
// Mock Extension Context
// ============================================================

class MockExtensionContext {
    private storage: Map<string, any> = new Map();

    workspaceState = {
        get: <T>(key: string, defaultValue?: T): T | undefined => {
            return this.storage.get(key) ?? defaultValue;
        },
        update: (key: string, value: any): Promise<void> => {
            this.storage.set(key, value);
            return Promise.resolve();
        }
    };

    globalState = {
        get: <T>(key: string, defaultValue?: T): T | undefined => {
            return this.storage.get(key) ?? defaultValue;
        },
        update: (key: string, value: any): Promise<void> => {
            this.storage.set(key, value);
            return Promise.resolve();
        }
    };

    extensionUri = { fsPath: '/test/extension' } as any;
    subscriptions: any[] = [];
}

const _tests: Array<{ name: string; fn: (done?: any) => void | Promise<void> }> = [];
let _setup: (() => void) | undefined;
let _teardown: (() => void) | undefined;

function suite(name: string, cb: () => void) { cb(); }
function setup(cb: () => void) { _setup = cb; }
function teardown(cb: () => void) { _teardown = cb; }
function test(name: string, cb: (done?: any) => void | Promise<void>) { 
    _tests.push({ name, fn: cb }); 
}


// Compilation Status tests
suite('CompilationStatusMonitor', () => {
    let monitor: CSMType;
    let mockContext: MockExtensionContext;
    const testContractPath = '/test/contracts/test-contract';

    setup(() => {
        mockContext = new MockExtensionContext();
        monitor = new CompilationStatusMonitor(mockContext as any);
    });

    teardown(() => {
        monitor.dispose();
    });
    

    const tests = [
        async function testStartCompilation() {
            setup();
            const event = monitor.startCompilation(testContractPath);
            assert.strictEqual(event.contractPath, testContractPath);
            assert.strictEqual(event.status, CompilationStatus.IN_PROGRESS);
            teardown();
        },
        async function testUpdateProgress() {
            setup();
            monitor.startCompilation(testContractPath);
            monitor.updateProgress(testContractPath, 50, 'Halfway done');
            const status = monitor.getCurrentStatus(testContractPath);
            assert.strictEqual(status?.progress, 50);
            teardown();
        },
        async function testReportSuccess() {
            setup();
            monitor.startCompilation(testContractPath);
            const record = monitor.reportSuccess(testContractPath, '/test/output.wasm');
            assert.strictEqual(record.status, CompilationStatus.SUCCESS);
            teardown();
        },
        async function testReportFailure() {
            setup();
            monitor.startCompilation(testContractPath);
            const record = monitor.reportFailure(testContractPath, 'Build failed', []);
            assert.strictEqual(record.status, CompilationStatus.FAILED);
            teardown();
        }
    ];

    console.log('\ncompilationStatus unit tests');
    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            await test();
            passed++;
            console.log(`  [ok] ${test.name}`);
        } catch (err) {
            failed++;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${err instanceof Error ? err.message : String(err)}`);
        }
    }

        const history = limitedMonitor.getContractHistory(testContractPath);
        assert.strictEqual(history?.records.length, 3);

        limitedMonitor.dispose();
    });

    test('should clear history for a contract', () => {
        monitor.startCompilation(testContractPath);
        monitor.reportSuccess(testContractPath, '/test/output.wasm');

        monitor.clearHistory(testContractPath);

        const history = monitor.getContractHistory(testContractPath);
        assert.strictEqual(history, undefined);
    });

    test('should clear all history', () => {
        const contract1 = '/test/contracts/contract1';
        const contract2 = '/test/contracts/contract2';

        monitor.startCompilation(contract1);
        monitor.reportSuccess(contract1, '/test/contract1.wasm');
        monitor.startCompilation(contract2);
        monitor.reportSuccess(contract2, '/test/contract2.wasm');

        monitor.clearAllHistory();

        assert.strictEqual(monitor.getContractHistory(contract1), undefined);
        assert.strictEqual(monitor.getContractHistory(contract2), undefined);
    });

    // ============================================================
    // Workspace Summary Tests
    // ============================================================

    test('should provide workspace summary', () => {
        const contract1 = '/test/contracts/contract1';
        const contract2 = '/test/contracts/contract2';
        const contract3 = '/test/contracts/contract3';

        monitor.startCompilation(contract1);
        monitor.reportSuccess(contract1, '/test/contract1.wasm');

        monitor.startCompilation(contract2);
        monitor.reportFailure(contract2, 'Build failed', []);

        monitor.startCompilation(contract3);
        // Leave in progress

        const summary = monitor.getWorkspaceSummary();
        assert.strictEqual(summary.totalContracts, 3);
        assert.strictEqual(summary.successful, 1);
        assert.strictEqual(summary.failed, 1);
        assert.strictEqual(summary.inProgress, 1);
    });

    // ============================================================
    // Configuration Tests
    // ============================================================

    test('should use default configuration', () => {
        const config = monitor.getConfig();
        assert.strictEqual(config.maxHistoryPerContract, 50);
        assert.strictEqual(config.enableRealTimeUpdates, true);
        assert.strictEqual(config.enableLogging, true);
        assert.strictEqual(config.showProgressNotifications, false);
    });

    test('should update configuration', () => {
        monitor.updateConfig({
            maxHistoryPerContract: 10,
            enableLogging: false
        });

        const config = monitor.getConfig();
        assert.strictEqual(config.maxHistoryPerContract, 10);
        assert.strictEqual(config.enableLogging, false);
        // Other values should remain unchanged
        assert.strictEqual(config.enableRealTimeUpdates, true);
    });

    // ============================================================
    // Reset Status Tests
    // ============================================================

    test('should reset status to idle', () => {
        monitor.startCompilation(testContractPath);
        monitor.reportSuccess(testContractPath, '/test/output.wasm');

        monitor.resetStatus(testContractPath);

        const status = monitor.getCurrentStatus(testContractPath);
        assert.strictEqual(status?.status, CompilationStatus.IDLE);
        assert.strictEqual(status?.progress, 0);
    });

    // ============================================================
    // Diagnostics Parsing Tests
    // ============================================================

    test('should parse error diagnostics from output', () => {
        const output = `
error[E0001]: type mismatch
  --> src/lib.rs:42:10
   |
42 |     let x: i32 = "string";
   |                    ^^^^^^^ expected i32, found &str

error: aborting due to previous error
        `;

        const diagnostics = monitor.parseDiagnostics(output, testContractPath);
        assert.strictEqual(diagnostics.length, 2);
        assert.strictEqual(diagnostics[0].severity, CompilationDiagnosticSeverity.ERROR);
        assert.strictEqual(diagnostics[0].code, 'E0001');
        assert.strictEqual(diagnostics[0].file, 'src/lib.rs');
        assert.strictEqual(diagnostics[0].line, 42);
        assert.strictEqual(diagnostics[0].column, 10);
    });

    test('should parse warning diagnostics from output', () => {
        const output = `
warning: unused variable
  --> src/main.rs:10:5
   |
10 |     let unused = 42;
   |         ^^^^^^
   |
   = note: #[warn(unused_variables)] on by default
        `;

        const diagnostics = monitor.parseDiagnostics(output, testContractPath);
        assert.strictEqual(diagnostics.length, 1);
        assert.strictEqual(diagnostics[0].severity, CompilationDiagnosticSeverity.WARNING);
        assert.strictEqual(diagnostics[0].file, 'src/main.rs');
        assert.strictEqual(diagnostics[0].line, 10);
        assert.strictEqual(diagnostics[0].column, 5);
    });

    test('should handle empty output', () => {
        const diagnostics = monitor.parseDiagnostics('', testContractPath);
        assert.strictEqual(diagnostics.length, 0);
    });

    // ============================================================
    // Event Emission Tests
    // ============================================================

    test('should emit status change events', (done) => {
        let eventReceived = false;

        monitor.onStatusChange((event: any) => {
            if (!eventReceived) {
                eventReceived = true;
                assert.strictEqual(event.contractPath, testContractPath);
                assert.strictEqual(event.previousStatus, CompilationStatus.IDLE);
                assert.strictEqual(event.currentStatus, CompilationStatus.IN_PROGRESS);
                assert.ok(event.timestamp > 0);
                done();
            }
        });

        monitor.startCompilation(testContractPath);
    });

    test('should emit compilation events', (done) => {
        let eventCount = 0;

        monitor.onCompilationEvent((event: any) => {
            eventCount++;
            if (eventCount === 1) {
                assert.strictEqual(event.status, CompilationStatus.IN_PROGRESS);
                // Progress updates don't change the event status
                done();
            }
        });

        monitor.startCompilation(testContractPath);
    });

    // ============================================================
    // Edge Case Tests
    // ============================================================

    test('should handle non-existent contract status', () => {
        const status = monitor.getCurrentStatus('/non/existent/path');
        assert.strictEqual(status, undefined);
    });

    test('should handle progress update for non-existent compilation', () => {
        // Should not throw
        monitor.updateProgress('/non/existent/path', 50, 'Halfway');

        const status = monitor.getCurrentStatus('/non/existent/path');
        assert.strictEqual(status, undefined);
    });

    test('should handle multiple start calls for same contract', () => {
        const event1 = monitor.startCompilation(testContractPath);
        const event2 = monitor.startCompilation(testContractPath);

run().catch(err => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});

// Run tests
async function run() {
    let passed = 0;
    let failed = 0;

    console.log('\nCompilationStatusMonitor unit tests');
    for (const t of _tests) {
        try {
            if (_setup) _setup();

            if (t.fn.length > 0) {
                await new Promise<void>((resolve, reject) => {
                    t.fn((err?: any) => err ? reject(err) : resolve());
                });
            } else {
                const res = t.fn();
                if (res instanceof Promise) await res;
            }

            passed += 1;
            console.log(`  [ok] ${t.name}`);
        } catch (error) {
            failed += 1;
            console.error(`  [fail] ${t.name}`);
            console.error(`         ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            if (_teardown) _teardown();
        }
    }

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
}

run().catch(error => {
    console.error('Test runner error:', error);
    process.exitCode = 1;
});
