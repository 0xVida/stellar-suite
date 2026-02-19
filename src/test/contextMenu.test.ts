// ============================================================
// src/test/contextMenu.test.ts
// Unit tests for the context menu service and context detection.
//
// Run with:  npm test
// Requires:  @types/node (already in devDependencies)
// Uses Node's built-in assert — no extra test framework needed.
// ============================================================

import * as assert from 'assert';
import {
    resolveContextMenuActions,
    registerCustomContextAction,
    ContractContextMenuService,
} from '../services/contextMenuService';
import { ContextMenuRequest } from '../types/contextMenu';

// ── Minimal mock for vscode.ExtensionContext ──────────────────

interface MockWorkspaceState {
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown): Promise<void>;
}

interface MockExtensionContext {
    workspaceState: MockWorkspaceState;
}

function makeContext(stateData: Record<string, unknown> = {}): MockExtensionContext {
    const store: Record<string, unknown> = { ...stateData };
    return {
        workspaceState: {
            get: <T,>(key: string, fallback: T): T =>
                (store[key] as T) ?? fallback,
            update: async (key: string, value: unknown) => {
                store[key] = value;
            },
        },
    };
}

function makeOutputChannel(): any {
    return {
        appendLine: (_: string) => { /* suppress in tests */ },
    };
}

// ── Helpers ───────────────────────────────────────────────────

function makeRequest(overrides: Partial<ContextMenuRequest> = {}): ContextMenuRequest {
    return {
        contractName: 'hello-world',
        contractPath: '/workspace/contracts/hello-world/Cargo.toml',
        contractId:   undefined,
        isBuilt:      false,
        x:            100,
        y:            200,
        ...overrides,
    };
}

// ============================================================
// Suite 1 — resolveContextMenuActions (context detection)
// ============================================================

async function testResolveActions_alwaysIncoresBaseActions() {
    const req = makeRequest();
    const actions = resolveContextMenuActions(req);

    const ids = actions.map(a => a.id);
    assert.ok(ids.includes('build'),     'build action always present');
    assert.ok(ids.includes('rename'),    'rename action always present');
    assert.ok(ids.includes('duplicate'), 'duplicate action always present');
    assert.ok(ids.includes('delete'),    'delete action always present');
    console.log('  ✓ resolveActions: always includes base actions');
}

async function testResolveActions_deployDisabledWhenNotBuilt() {
    const req = makeRequest({ isBuilt: false, contractId: undefined });
    const actions = resolveContextMenuActions(req);

    const deploy = actions.find(a => a.id === 'deploy');
    assert.ok(deploy, 'deploy action exists');
    assert.strictEqual(deploy!.enabled, false, 'deploy disabled when not built');
    console.log('  ✓ resolveActions: deploy disabled when not built');
}

async function testResolveActions_deployEnabledWhenBuilt() {
    const req = makeRequest({ isBuilt: true });
    const actions = resolveContextMenuActions(req);

    const deploy = actions.find(a => a.id === 'deploy');
    assert.ok(deploy, 'deploy action exists');
    assert.strictEqual(deploy!.enabled, true, 'deploy enabled when built');
    console.log('  ✓ resolveActions: deploy enabled when built');
}

async function testResolveActions_simulateDisabledWithoutContractId() {
    const req = makeRequest({ contractId: undefined });
    const actions = resolveContextMenuActions(req);

    const sim = actions.find(a => a.id === 'simulate');
    assert.ok(sim, 'simulate action exists');
    assert.strictEqual(sim!.enabled, false, 'simulate disabled without contractId');
    console.log('  ✓ resolveActions: simulate disabled without contractId');
}

async function testResolveActions_simulateEnabledWithContractId() {
    const req = makeRequest({ contractId: 'CABC123' });
    const actions = resolveContextMenuActions(req);

    const sim = actions.find(a => a.id === 'simulate');
    assert.ok(sim, 'simulate action exists');
    assert.strictEqual(sim!.enabled, true, 'simulate enabled with contractId');
    console.log('  ✓ resolveActions: simulate enabled with contractId');
}

async function testResolveActions_copyContractIdDisabledWithoutId() {
    const req = makeRequest({ contractId: undefined });
    const actions = resolveContextMenuActions(req);

    const copy = actions.find(a => a.id === 'copyContractId');
    assert.ok(copy, 'copyContractId action exists');
    assert.strictEqual(copy!.enabled, false, 'copyContractId disabled without id');
    console.log('  ✓ resolveActions: copyContractId disabled without contractId');
}

async function testResolveActions_deleteIsDestructive() {
    const req = makeRequest();
    const actions = resolveContextMenuActions(req);

    const del = actions.find(a => a.id === 'delete');
    assert.ok(del, 'delete action exists');
    assert.strictEqual(del!.destructive, true, 'delete is marked destructive');
    console.log('  ✓ resolveActions: delete is destructive');
}

// ============================================================
// Suite 2 — Custom action registry
// ============================================================

async function testCustomAction_registered() {
    const disposable = registerCustomContextAction({
        action: {
            id:      'myCustom',
            label:   'My Custom Action',
            enabled: true,
        },
        handler: async () => ({ type: 'success', message: 'done' }),
    });

    const req     = makeRequest();
    const actions = resolveContextMenuActions(req);
    const found   = actions.find(a => a.id === 'myCustom');
    assert.ok(found, 'custom action appears in resolved list');

    disposable.dispose();
    console.log('  ✓ customAction: appears after registration');
}

async function testCustomAction_removedAfterDispose() {
    const disposable = registerCustomContextAction({
        action: { id: 'tempAction', label: 'Temp', enabled: true },
        handler: async () => ({ type: 'info', message: 'ok' }),
    });
    disposable.dispose();

    const req     = makeRequest();
    const actions = resolveContextMenuActions(req);
    const found   = actions.find(a => a.id === 'tempAction');
    assert.strictEqual(found, undefined, 'custom action removed after dispose');
    console.log('  ✓ customAction: removed after dispose');
}

async function testCustomAction_insertBefore() {
    const disposable = registerCustomContextAction({
        action:       { id: 'inserted', label: 'Inserted', enabled: true },
        insertBefore: 'delete',
    handler:          async () => ({ type: 'success', message: '' }),
    });

    const req     = makeRequest();
    const actions = resolveContextMenuActions(req);
    const insertedIdx = actions.findIndex(a => a.id === 'inserted');
    const deleteIdx   = actions.findIndex(a => a.id === 'delete');

    assert.ok(insertedIdx !== -1, 'inserted action exists');
    assert.ok(insertedIdx < deleteIdx, 'inserted action appears before delete');

    disposable.dispose();
    console.log('  ✓ customAction: insertBefore positions correctly');
}

// ============================================================
// Suite 3 — ContractContextMenuService.handleAction
// ============================================================

async function testHandleAction_unknownAction() {
    const svc = new ContractContextMenuService(
        makeContext() as any,
        makeOutputChannel()
    );
    const result = await svc.handleAction({
        actionId:     'nonExistentAction',
        contractName: 'hello-world',
        contractPath: '/workspace/Cargo.toml',
    });
    assert.strictEqual(result.type, 'error', 'unknown action returns error');
    assert.ok(result.message.includes('Unknown action'), 'error message mentions action');
    console.log('  ✓ handleAction: unknown action returns error');
}

async function testHandleAction_copyContractId_noId() {
    const svc = new ContractContextMenuService(
        makeContext() as any,
        makeOutputChannel()
    );
    const result = await svc.handleAction({
        actionId:     'copyContractId',
        contractName: 'hello-world',
        contractPath: '/workspace/Cargo.toml',
        contractId:   undefined,
    });
    assert.strictEqual(result.type, 'error', 'copyContractId without id returns error');
    console.log('  ✓ handleAction: copyContractId returns error without contractId');
}

async function testHandleAction_rename_cancelledByUser() {
    // Mock vscode.window.showInputBox to return undefined (user pressed Escape)
    const originalVscode = require('vscode');
    const original = originalVscode.window.showInputBox;
    originalVscode.window.showInputBox = async () => undefined;

    const svc = new ContractContextMenuService(makeContext() as any, makeOutputChannel());
    const result = await svc.handleAction({
        actionId:     'rename',
        contractName: 'hello-world',
        contractPath: '/workspace/Cargo.toml',
    });

    originalVscode.window.showInputBox = original;
    assert.strictEqual(result.type, 'info', 'cancelled rename returns info');
    assert.ok(result.message.toLowerCase().includes('cancel'), 'message indicates cancel');
    console.log('  ✓ handleAction: rename cancelled returns info');
}

async function testHandleAction_rename_success() {
    const originalVscode = require('vscode');
    const original = originalVscode.window.showInputBox;
    originalVscode.window.showInputBox = async () => 'new-name';

    const ctx = makeContext();
    const svc = new ContractContextMenuService(ctx as any, makeOutputChannel());
    const result = await svc.handleAction({
        actionId:     'rename',
        contractName: 'hello-world',
        contractPath: '/workspace/Cargo.toml',
    });

    originalVscode.window.showInputBox = original;
    assert.strictEqual(result.type, 'success', 'rename returns success');
    assert.strictEqual(result.refresh, true, 'rename triggers refresh');
    assert.ok(result.message.includes('new-name'), 'message includes new name');
    console.log('  ✓ handleAction: rename succeeds and triggers refresh');
}

async function testHandleAction_delete_cancelled() {
    const originalVscode = require('vscode');
    const original = originalVscode.window.showWarningMessage;
    originalVscode.window.showWarningMessage = async () => 'Cancel';

    const svc = new ContractContextMenuService(makeContext() as any, makeOutputChannel());
    const result = await svc.handleAction({
        actionId:     'delete',
        contractName: 'hello-world',
        contractPath: '/workspace/Cargo.toml',
    });

    originalVscode.window.showWarningMessage = original;
    assert.strictEqual(result.type, 'info', 'cancelled delete returns info');
    console.log('  ✓ handleAction: delete cancelled returns info');
}

async function testHandleAction_delete_confirmed() {
    const originalVscode = require('vscode');
    const original = originalVscode.window.showWarningMessage;
    originalVscode.window.showWarningMessage = async () => 'Remove';

    const ctx = makeContext();
    const svc = new ContractContextMenuService(ctx as any, makeOutputChannel());
    const result = await svc.handleAction({
        actionId:     'delete',
        contractName: 'hello-world',
        contractPath: '/workspace/contracts/hello-world/Cargo.toml',
    });

    originalVscode.window.showWarningMessage = original;
    assert.strictEqual(result.type, 'success', 'confirmed delete returns success');
    assert.strictEqual(result.refresh, true, 'delete triggers refresh');

    // Verify path was added to hiddenContracts
    const hidden = ctx.workspaceState.get<string[]>('stellarSuite.hiddenContracts', []);
    assert.ok(
        hidden.includes('/workspace/contracts/hello-world/Cargo.toml'),
        'path added to hiddenContracts'
    );
    console.log('  ✓ handleAction: delete confirmed persists to hiddenContracts');
}

async function testHandleAction_pin_toggle() {
    const ctx = makeContext();
    const svc = new ContractContextMenuService(ctx as any, makeOutputChannel());
    const contractPath = '/workspace/contracts/hello-world/Cargo.toml';

    // Pin
    const r1 = await svc.handleAction({ actionId: 'pinContract', contractName: 'hello-world', contractPath });
    assert.strictEqual(r1.type, 'success');
    assert.ok(r1.message.includes('pinned'));
    let pinned = ctx.workspaceState.get<string[]>('stellarSuite.pinnedContracts', []);
    assert.ok(pinned.includes(contractPath), 'contract added to pinnedContracts');

    // Unpin
    const r2 = await svc.handleAction({ actionId: 'pinContract', contractName: 'hello-world', contractPath });
    assert.strictEqual(r2.type, 'success');
    assert.ok(r2.message.includes('unpinned'));
    pinned = ctx.workspaceState.get<string[]>('stellarSuite.pinnedContracts', []);
    assert.strictEqual(pinned.includes(contractPath), false, 'contract removed from pinnedContracts');

    console.log('  ✓ handleAction: pin toggles correctly');
}

async function testHandleAction_setNetwork() {
    const originalVscode = require('vscode');
    const original = originalVscode.window.showQuickPick;
    originalVscode.window.showQuickPick = async () => 'mainnet';

    const ctx = makeContext();
    const svc = new ContractContextMenuService(ctx as any, makeOutputChannel());
    const contractPath = '/workspace/Cargo.toml';

    const result = await svc.handleAction({ actionId: 'setNetwork', contractName: 'hello-world', contractPath });
    originalVscode.window.showQuickPick = original;

    assert.strictEqual(result.type, 'success');
    const overrides = ctx.workspaceState.get<Record<string, string>>(
        'stellarSuite.contractNetworkOverrides', {}
    );
    assert.strictEqual(overrides[contractPath], 'mainnet', 'network override saved');
    console.log('  ✓ handleAction: setNetwork saves override');
}

async function testHandleAction_customAction() {
    let handlerCalled = false;
    const disposable = registerCustomContextAction({
        action:  { id: 'testCustom', label: 'Test', enabled: true },
        handler: async () => {
            handlerCalled = true;
            return { type: 'success', message: 'custom ran' };
        },
    });

    const svc = new ContractContextMenuService(makeContext() as any, makeOutputChannel());
    const result = await svc.handleAction({
        actionId:     'testCustom',
        contractName: 'hello-world',
        contractPath: '/workspace/Cargo.toml',
    });

    disposable.dispose();
    assert.strictEqual(handlerCalled, true, 'custom handler was called');
    assert.strictEqual(result.type, 'success');
    assert.strictEqual(result.message, 'custom ran');
    console.log('  ✓ handleAction: custom action handler invoked');
}

// ============================================================
// Runner
// ============================================================

async function run() {
    const suites: Array<[string, Array<() => Promise<void>>]> = [
        ['resolveContextMenuActions (context detection)', [
            testResolveActions_alwaysIncoresBaseActions,
            testResolveActions_deployDisabledWhenNotBuilt,
            testResolveActions_deployEnabledWhenBuilt,
            testResolveActions_simulateDisabledWithoutContractId,
            testResolveActions_simulateEnabledWithContractId,
            testResolveActions_copyContractIdDisabledWithoutId,
            testResolveActions_deleteIsDestructive,
        ]],
        ['Custom action registry', [
            testCustomAction_registered,
            testCustomAction_removedAfterDispose,
            testCustomAction_insertBefore,
        ]],
        ['ContractContextMenuService.handleAction', [
            testHandleAction_unknownAction,
            testHandleAction_copyContractId_noId,
            testHandleAction_rename_cancelledByUser,
            testHandleAction_rename_success,
            testHandleAction_delete_cancelled,
            testHandleAction_delete_confirmed,
            testHandleAction_pin_toggle,
            testHandleAction_setNetwork,
            testHandleAction_customAction,
        ]],
    ];

    let passed = 0;
    let failed = 0;

    for (const [suiteName, tests] of suites) {
        console.log(`\n● ${suiteName}`);
        for (const test of tests) {
            try {
                await test();
                passed++;
            } catch (err) {
                failed++;
                console.error(`  ✕ ${test.name}`);
                console.error(`    ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(50));

    if (failed > 0) { process.exitCode = 1; }
}

run().catch(err => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});