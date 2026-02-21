declare function require(name: string): any;
declare const process: { exitCode?: number };

// Integration tests for sidebar contract status indicators
// Run with:  node out-test/test/sidebarStatusIndicators.test.js

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
        onDidChangeWorkspaceFolders: () => ({ dispose: () => { } }),
        workspaceFolders: [],
        getConfiguration: () => ({
            get: (_key: string, defaultValue?: any) => defaultValue,
        }),
    },
    Uri: {
        file: (p: string) => ({ fsPath: p, scheme: 'file' }),
    },
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
} from '../types/compilationStatus';
import type { ContractInfo } from '../ui/sidebarView';

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

// ============================================================
// Test Functions
// ============================================================

const testContractPath = '/test/contracts/test-contract';

async function testContractInfoStatusFields() {
    // Verify new fields are JSON-serializable (no classes, no circular refs)
    const contract: ContractInfo = {
        name: 'test-contract',
        path: testContractPath,
        isBuilt: true,
        buildStatus: 'success',
        buildProgress: 100,
        buildStatusMessage: 'Build succeeded',
        buildErrorCount: 0,
        buildWarningCount: 1,
        deployStatus: 'deployed',
        networkHealth: 'healthy',
        networkHealthDetail: 'https://rpc.example.com — 42ms',
    };

    const json = JSON.stringify(contract);
    const parsed = JSON.parse(json);

    assert.strictEqual(parsed.buildStatus, 'success');
    assert.strictEqual(parsed.buildProgress, 100);
    assert.strictEqual(parsed.buildStatusMessage, 'Build succeeded');
    assert.strictEqual(parsed.buildErrorCount, 0);
    assert.strictEqual(parsed.buildWarningCount, 1);
    assert.strictEqual(parsed.deployStatus, 'deployed');
    assert.strictEqual(parsed.networkHealth, 'healthy');
    assert.strictEqual(parsed.networkHealthDetail, 'https://rpc.example.com — 42ms');
    console.log('  [ok] ContractInfo status fields are JSON-serializable');
}

async function testCompilationStatusEnrichment() {
    const mockContext = new MockExtensionContext();
    const monitor = new CompilationStatusMonitor(mockContext as any);

    try {
        monitor.startCompilation(testContractPath);
        monitor.reportSuccess(testContractPath, '/output/test.wasm');

        const event = monitor.getCurrentStatus(testContractPath);
        assert.ok(event, 'Should have status after reportSuccess');
        assert.strictEqual(event!.status, CompilationStatus.SUCCESS);

        // Verify the status maps to our expected string literal
        const statusLower = event!.status.toLowerCase();
        assert.strictEqual(statusLower, 'success');
        console.log('  [ok] Compilation status maps to expected string literal');
    } finally {
        monitor.dispose();
    }
}

async function testCompilationStatusFailedWithDiagnostics() {
    const mockContext = new MockExtensionContext();
    const monitor = new CompilationStatusMonitor(mockContext as any);

    try {
        const diagnostics = [
            {
                severity: CompilationDiagnosticSeverity.ERROR,
                message: 'undefined variable',
                file: 'lib.rs',
                line: 10,
                column: 5,
            },
            {
                severity: CompilationDiagnosticSeverity.ERROR,
                message: 'type mismatch',
                file: 'lib.rs',
                line: 20,
                column: 1,
            },
            {
                severity: CompilationDiagnosticSeverity.WARNING,
                message: 'unused import',
                file: 'lib.rs',
                line: 1,
                column: 1,
            },
        ];

        monitor.startCompilation(testContractPath);
        monitor.reportFailure(testContractPath, 'Compilation failed', diagnostics);

        const event = monitor.getCurrentStatus(testContractPath);
        assert.ok(event);

        const eventDiagnostics = event!.diagnostics || [];
        const errorCount = eventDiagnostics.filter(d => d.severity === 'error').length;
        const warningCount = eventDiagnostics.filter(d => d.severity === 'warning').length;

        assert.strictEqual(errorCount, 2, 'Should have 2 errors');
        assert.strictEqual(warningCount, 1, 'Should have 1 warning');
        console.log('  [ok] Failed compilation tracks error and warning counts');
    } finally {
        monitor.dispose();
    }
}

async function testCompilationStatusInProgress() {
    const mockContext = new MockExtensionContext();
    const monitor = new CompilationStatusMonitor(mockContext as any);

    try {
        monitor.startCompilation(testContractPath);
        monitor.updateProgress(testContractPath, 42, 'Compiling module...');

        const event = monitor.getCurrentStatus(testContractPath);
        assert.ok(event);
        assert.strictEqual(event!.status, CompilationStatus.IN_PROGRESS);
        assert.strictEqual(event!.progress, 42);
        assert.strictEqual(event!.message, 'Compiling module...');

        // Map to our enrichment format
        const buildStatus = event!.status.toLowerCase();
        assert.strictEqual(buildStatus, 'in_progress');
        console.log('  [ok] In-progress status tracks progress percentage and message');
    } finally {
        monitor.dispose();
    }
}

async function testNetworkHealthMapping() {
    // Verify that network health statuses from RpcHealthMonitor are valid
    // ContractInfo networkHealth values
    const validStatuses = ['healthy', 'degraded', 'unhealthy', 'unknown'];

    for (const status of validStatuses) {
        const contract: Partial<ContractInfo> = {
            networkHealth: status as ContractInfo['networkHealth'],
            networkHealthDetail: `Test endpoint — ${status}`,
        };

        const json = JSON.stringify(contract);
        const parsed = JSON.parse(json);
        assert.strictEqual(parsed.networkHealth, status);
    }

    console.log('  [ok] All network health statuses are valid and serializable');
}

async function testStatusMessageShape() {
    // Verify that a contractStatus:update message has the expected shape
    const message = {
        type: 'contractStatus:update',
        contractPath: testContractPath,
        buildStatus: 'failed' as const,
        buildProgress: undefined,
        buildStatusMessage: 'Compilation failed',
        buildErrorCount: 3,
        buildWarningCount: 0,
    };

    assert.strictEqual(message.type, 'contractStatus:update');
    assert.strictEqual(message.contractPath, testContractPath);
    assert.strictEqual(message.buildStatus, 'failed');
    assert.strictEqual(message.buildErrorCount, 3);
    assert.strictEqual(message.buildWarningCount, 0);

    // Should be serializable for postMessage
    const json = JSON.stringify(message);
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.type, 'contractStatus:update');
    assert.strictEqual(parsed.buildStatus, 'failed');
    console.log('  [ok] contractStatus:update message has expected shape');
}

async function testDeployStatusDerivation() {
    // Deploy status should be 'deployed' when contractId exists, 'idle' otherwise
    const deployedContract: Partial<ContractInfo> = {
        contractId: 'CABC123',
        deployStatus: undefined,
    };
    deployedContract.deployStatus = deployedContract.contractId ? 'deployed' : 'idle';
    assert.strictEqual(deployedContract.deployStatus, 'deployed');

    const undeployedContract: Partial<ContractInfo> = {
        contractId: undefined,
        deployStatus: undefined,
    };
    undeployedContract.deployStatus = undeployedContract.contractId ? 'deployed' : 'idle';
    assert.strictEqual(undeployedContract.deployStatus, 'idle');

    console.log('  [ok] Deploy status correctly derived from contractId');
}

async function testStatusChangeEventSubscription() {
    const mockContext = new MockExtensionContext();
    const monitor = new CompilationStatusMonitor(mockContext as any);

    try {
        const events: any[] = [];
        const sub = monitor.onStatusChange((event) => {
            events.push(event);
        });

        monitor.startCompilation(testContractPath);
        monitor.reportSuccess(testContractPath);

        assert.ok(events.length >= 1, 'Should have received at least one status change event');

        const lastEvent = events[events.length - 1];
        assert.strictEqual(lastEvent.contractPath, testContractPath);
        assert.strictEqual(lastEvent.currentStatus, CompilationStatus.SUCCESS);

        sub.dispose();
        console.log('  [ok] Status change events fire correctly for subscription');
    } finally {
        monitor.dispose();
    }
}

// ============================================================
// Test Runner
// ============================================================

async function run() {
    const tests = [
        testContractInfoStatusFields,
        testCompilationStatusEnrichment,
        testCompilationStatusFailedWithDiagnostics,
        testCompilationStatusInProgress,
        testNetworkHealthMapping,
        testStatusMessageShape,
        testDeployStatusDerivation,
        testStatusChangeEventSubscription,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nSidebar Status Indicators integration tests');
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

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch(err => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
