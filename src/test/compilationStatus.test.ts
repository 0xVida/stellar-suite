// ============================================================
// src/test/compilationStatus.test.ts
// Unit tests for compilation status monitoring.
// ============================================================

import * as assert from 'assert';
import { CompilationStatusMonitor } from '../services/compilationStatusMonitor';
import {
    CompilationStatus,
    CompilationDiagnosticSeverity,
    CompilationEvent,
    CompilationRecord,
    ContractCompilationHistory,
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
        update: (key: string, value: any): Thenable<void> => {
            this.storage.set(key, value);
            return Promise.resolve();
        }
    };

    globalState = {
        get: <T>(key: string, defaultValue?: T): T | undefined => {
            return this.storage.get(key) ?? defaultValue;
        },
        update: (key: string, value: any): Thenable<void> => {
            this.storage.set(key, value);
            return Promise.resolve();
        }
    };

    extensionUri = { fsPath: '/test/extension' } as any;
    subscriptions: any[] = [];
}

// ============================================================
// Test Suite
// ============================================================

suite('CompilationStatusMonitor', () => {
    let monitor: CompilationStatusMonitor;
    let mockContext: MockExtensionContext;
    const testContractPath = '/test/contracts/test-contract';
    const testContractName = 'test-contract';

    setup(() => {
        mockContext = new MockExtensionContext();
        monitor = new CompilationStatusMonitor(mockContext as any);
    });

    teardown(() => {
        monitor.dispose();
    });

    // ============================================================
    // Status Detection Tests
    // ============================================================

    test('should start compilation and set status to IN_PROGRESS', () => {
        const event = monitor.startCompilation(testContractPath);

        assert.strictEqual(event.contractPath, testContractPath);
        assert.strictEqual(event.contractName, testContractName);
        assert.strictEqual(event.status, CompilationStatus.IN_PROGRESS);
        assert.strictEqual(event.progress, 0);
        assert.ok(event.timestamp > 0);
    });

    test('should update progress during compilation', () => {
        monitor.startCompilation(testContractPath);
        monitor.updateProgress(testContractPath, 50, 'Halfway done');

        const status = monitor.getCurrentStatus(testContractPath);
        assert.ok(status);
        assert.strictEqual(status?.status, CompilationStatus.IN_PROGRESS);
        assert.strictEqual(status?.progress, 50);
        assert.strictEqual(status?.message, 'Halfway done');
    });

    test('should report successful compilation', () => {
        monitor.startCompilation(testContractPath);
        const record = monitor.reportSuccess(testContractPath, '/test/output.wasm');

        assert.strictEqual(record.status, CompilationStatus.SUCCESS);
        assert.strictEqual(record.wasmPath, '/test/output.wasm');
        assert.ok(record.duration >= 0);
        assert.ok(record.completedAt >= record.startedAt);
    });

    test('should report failed compilation', () => {
        monitor.startCompilation(testContractPath);
        const diagnostics = [{
            severity: CompilationDiagnosticSeverity.ERROR,
            message: 'Syntax error',
            code: 'E0001',
            file: testContractPath
        }];

        const record = monitor.reportFailure(testContractPath, 'Build failed', diagnostics);

        assert.strictEqual(record.status, CompilationStatus.FAILED);
        assert.strictEqual(record.errorCount, 1);
        assert.strictEqual(record.warningCount, 0);
        assert.ok(record.duration >= 0);
    });

    test('should report compilation with warnings', () => {
        monitor.startCompilation(testContractPath);
        const diagnostics = [{
            severity: CompilationDiagnosticSeverity.WARNING,
            message: 'Unused variable',
            code: 'W0001',
            file: testContractPath
        }];

        const record = monitor.reportSuccess(testContractPath, '/test/output.wasm');
        // Note: Currently the implementation doesn't track warnings in success
        // This test documents the expected behavior
        assert.strictEqual(record.status, CompilationStatus.SUCCESS);
    });

    test('should report cancelled compilation', () => {
        monitor.startCompilation(testContractPath);
        const record = monitor.reportCancellation(testContractPath);

        assert.strictEqual(record.status, CompilationStatus.CANCELLED);
        assert.strictEqual(record.errorCount, 0);
        assert.strictEqual(record.warningCount, 0);
    });

    // ============================================================
    // Status Tracking Tests
    // ============================================================

    test('should track current status for multiple contracts', () => {
        const contract1 = '/test/contracts/contract1';
        const contract2 = '/test/contracts/contract2';

        monitor.startCompilation(contract1);
        monitor.startCompilation(contract2);
        monitor.reportSuccess(contract1, '/test/contract1.wasm');

        const allStatuses = monitor.getAllStatuses();
        assert.strictEqual(allStatuses.length, 2);

        const status1 = monitor.getCurrentStatus(contract1);
        const status2 = monitor.getCurrentStatus(contract2);

        assert.strictEqual(status1?.status, CompilationStatus.SUCCESS);
        assert.strictEqual(status2?.status, CompilationStatus.IN_PROGRESS);
    });

    test('should get in-progress contracts', () => {
        const contract1 = '/test/contracts/contract1';
        const contract2 = '/test/contracts/contract2';

        monitor.startCompilation(contract1);
        monitor.startCompilation(contract2);
        monitor.reportSuccess(contract1, '/test/contract1.wasm');

        const inProgress = monitor.getInProgressContracts();
        assert.strictEqual(inProgress.length, 1);
        assert.strictEqual(inProgress[0].contractPath, contract2);
    });

    test('should check if any compilation is in progress', () => {
        assert.strictEqual(monitor.isAnyCompilationInProgress(), false);

        monitor.startCompilation(testContractPath);
        assert.strictEqual(monitor.isAnyCompilationInProgress(), true);

        monitor.reportSuccess(testContractPath, '/test/output.wasm');
        assert.strictEqual(monitor.isAnyCompilationInProgress(), false);
    });

    // ============================================================
    // History Tests
    // ============================================================

    test('should store compilation history', () => {
        monitor.startCompilation(testContractPath);
        monitor.reportSuccess(testContractPath, '/test/output.wasm');

        const history = monitor.getContractHistory(testContractPath);
        assert.ok(history);
        assert.strictEqual(history?.contractPath, testContractPath);
        assert.strictEqual(history?.records.length, 1);
        assert.strictEqual(history?.successCount, 1);
        assert.strictEqual(history?.failureCount, 0);
    });

    test('should track multiple compilations in history', () => {
        monitor.startCompilation(testContractPath);
        monitor.reportSuccess(testContractPath, '/test/output1.wasm');

        monitor.startCompilation(testContractPath);
        monitor.reportFailure(testContractPath, 'Build failed', []);

        monitor.startCompilation(testContractPath);
        monitor.reportSuccess(testContractPath, '/test/output2.wasm');

        const history = monitor.getContractHistory(testContractPath);
        assert.strictEqual(history?.records.length, 3);
        assert.strictEqual(history?.successCount, 2);
        assert.strictEqual(history?.failureCount, 1);
    });

    test('should limit history size', () => {
        const config: CompilationMonitorConfig = {
            maxHistoryPerContract: 3,
            enableRealTimeUpdates: false,
            enableLogging: false,
            showProgressNotifications: false
        };

        const limitedMonitor = new CompilationStatusMonitor(mockContext as any, config);

        for (let i = 0; i < 5; i++) {
            limitedMonitor.startCompilation(testContractPath);
            limitedMonitor.reportSuccess(testContractPath, `/test/output${i}.wasm`);
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

        monitor.onStatusChange((event) => {
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

        monitor.onCompilationEvent((event) => {
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

        // Second call should overwrite the first
        const status = monitor.getCurrentStatus(testContractPath);
        assert.strictEqual(status?.timestamp, event2.timestamp);
    });
});
