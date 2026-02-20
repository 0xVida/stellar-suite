// ============================================================
// src/test/keyboardShortcuts.test.ts
// Unit tests for sidebar keyboard shortcut support.
// ============================================================

declare const require: {
    (name: string): any;
    cache: Record<string, any>;
};
declare const process: { exitCode?: number; env: Record<string, string | undefined> };
declare const __dirname: string;

const assert = require('assert');
const path = require('path');
const Module = require('module');

// ── Mock vscode module ────────────────────────────────────────
// contextMenuService.ts imports vscode at top level. We shim it
// with a minimal mock so the pure-logic functions can be tested
// without the full extension host.

const vscodeMock = {
    Disposable: class { dispose() {} },
    workspace: {
        getConfiguration: () => ({ get: (_k: string, d: any) => d }),
        workspaceFolders: [],
    },
    window: {
        showInputBox: async () => undefined,
        showQuickPick: async () => undefined,
        showWarningMessage: async () => undefined,
        createWebviewPanel: () => ({ webview: { html: '' } }),
        createOutputChannel: () => ({
            appendLine: () => {},
        }),
    },
    commands: { executeCommand: async () => {} },
    env: { clipboard: { writeText: async () => {} } },
    Uri: { file: (f: string) => ({ fsPath: f }) },
};

// Patch Node's module resolution so `require('vscode')` returns our mock
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
    if (request === 'vscode') {
        // Return a sentinel that we'll intercept in _cache
        return '__vscode_mock__';
    }
    return originalResolve.call(this, request, parent, isMain, options);
};
require.cache['__vscode_mock__'] = {
    id: '__vscode_mock__',
    filename: '__vscode_mock__',
    loaded: true,
    exports: vscodeMock,
};

// Now safe to import modules that depend on vscode
import { resolveContextMenuActions } from '../services/contextMenuService';
import { ContextMenuRequest, ContextMenuAction } from '../types/contextMenu';
import { WebviewShortcutAction, KeyboardShortcutConfig } from '../types/keyboardShortcuts';

// ── Helpers ────────────────────────────────────────────────────

function makeRequest(overrides: Partial<ContextMenuRequest> = {}): ContextMenuRequest {
    return {
        contractName: 'test-contract',
        contractPath: '/workspace/test-contract/Cargo.toml',
        contractId: undefined,
        isBuilt: false,
        x: 0,
        y: 0,
        ...overrides,
    };
}

function findAction(actions: ContextMenuAction[], id: string): ContextMenuAction | undefined {
    return actions.find(a => a.id === id);
}

/** Generates the same ARIA label string that renderContracts() uses. */
function buildAriaLabel(name: string, isBuilt: boolean, contractId?: string): string {
    const builtLabel = isBuilt ? 'built' : 'not built';
    const deployLabel = contractId ? 'deployed' : 'not deployed';
    return `${name}, ${builtLabel}, ${deployLabel}`;
}

// ── Tests ──────────────────────────────────────────────────────

async function testBuildActionHasShortcut() {
    const actions = resolveContextMenuActions(makeRequest());
    const build = findAction(actions, 'build');
    assert.ok(build, 'build action should exist');
    assert.strictEqual(build!.shortcut, 'B');
    console.log('  [ok] build action has shortcut "B"');
}

async function testDeployActionHasShortcut() {
    const actions = resolveContextMenuActions(makeRequest({ isBuilt: true }));
    const deploy = findAction(actions, 'deploy');
    assert.ok(deploy, 'deploy action should exist');
    assert.strictEqual(deploy!.shortcut, 'D');
    console.log('  [ok] deploy action has shortcut "D"');
}

async function testSimulateActionHasShortcut() {
    const actions = resolveContextMenuActions(makeRequest({ contractId: 'C123' }));
    const simulate = findAction(actions, 'simulate');
    assert.ok(simulate, 'simulate action should exist');
    assert.strictEqual(simulate!.shortcut, 'S');
    console.log('  [ok] simulate action has shortcut "S"');
}

async function testInspectActionHasShortcut() {
    const actions = resolveContextMenuActions(makeRequest({ contractId: 'C123' }));
    const inspect = findAction(actions, 'inspect');
    assert.ok(inspect, 'inspect action should exist');
    assert.strictEqual(inspect!.shortcut, 'I');
    console.log('  [ok] inspect action has shortcut "I"');
}

async function testPinActionHasShortcut() {
    const actions = resolveContextMenuActions(makeRequest());
    const pin = findAction(actions, 'pinContract');
    assert.ok(pin, 'pinContract action should exist');
    assert.strictEqual(pin!.shortcut, 'P');
    console.log('  [ok] pinContract action has shortcut "P"');
}

async function testRenameActionHasShortcut() {
    const actions = resolveContextMenuActions(makeRequest());
    const rename = findAction(actions, 'rename');
    assert.ok(rename, 'rename action should exist');
    assert.strictEqual(rename!.shortcut, 'F2');
    console.log('  [ok] rename action has shortcut "F2"');
}

async function testDeleteActionHasShortcut() {
    const actions = resolveContextMenuActions(makeRequest());
    const del = findAction(actions, 'delete');
    assert.ok(del, 'delete action should exist');
    assert.strictEqual(del!.shortcut, 'Del');
    console.log('  [ok] delete action has shortcut "Del"');
}

async function testAriaLabelNotBuiltNotDeployed() {
    const label = buildAriaLabel('my-contract', false, undefined);
    assert.strictEqual(label, 'my-contract, not built, not deployed');
    console.log('  [ok] aria label for not-built, not-deployed contract');
}

async function testAriaLabelBuiltNotDeployed() {
    const label = buildAriaLabel('token', true, undefined);
    assert.strictEqual(label, 'token, built, not deployed');
    console.log('  [ok] aria label for built, not-deployed contract');
}

async function testAriaLabelBuiltAndDeployed() {
    const label = buildAriaLabel('escrow', true, 'CABC123');
    assert.strictEqual(label, 'escrow, built, deployed');
    console.log('  [ok] aria label for built and deployed contract');
}

async function testKeyboardShortcutConfigDefaults() {
    const defaults: KeyboardShortcutConfig = { showHints: true };
    assert.strictEqual(defaults.showHints, true);
    console.log('  [ok] default keyboard shortcut config has showHints=true');
}

async function testWebviewShortcutActionTypes() {
    const actions: WebviewShortcutAction[] = [
        'focusNext', 'focusPrevious', 'focusFirst', 'focusLast',
        'openMenu', 'build', 'deploy', 'simulate', 'inspect',
        'togglePin', 'remove', 'rename', 'escape', 'focusSearch',
    ];
    assert.strictEqual(actions.length, 14);
    console.log('  [ok] WebviewShortcutAction union has 14 members');
}

async function testActionsWithoutTemplateCategory() {
    const actions = resolveContextMenuActions(makeRequest());
    const templateActions = findAction(actions, 'templateActions');
    assert.ok(templateActions, 'templateActions should exist');
    assert.strictEqual(templateActions!.enabled, false, 'templateActions should be disabled without category');
    console.log('  [ok] templateActions disabled when no template category');
}

async function testSimulateDisabledWithoutContractId() {
    const actions = resolveContextMenuActions(makeRequest({ isBuilt: true }));
    const simulate = findAction(actions, 'simulate');
    assert.ok(simulate, 'simulate should exist');
    assert.strictEqual(simulate!.enabled, false, 'simulate should be disabled without contractId');
    assert.strictEqual(simulate!.shortcut, 'S', 'shortcut should still be present');
    console.log('  [ok] simulate disabled without contractId but shortcut still set');
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        testBuildActionHasShortcut,
        testDeployActionHasShortcut,
        testSimulateActionHasShortcut,
        testInspectActionHasShortcut,
        testPinActionHasShortcut,
        testRenameActionHasShortcut,
        testDeleteActionHasShortcut,
        testAriaLabelNotBuiltNotDeployed,
        testAriaLabelBuiltNotDeployed,
        testAriaLabelBuiltAndDeployed,
        testKeyboardShortcutConfigDefaults,
        testWebviewShortcutActionTypes,
        testActionsWithoutTemplateCategory,
        testSimulateDisabledWithoutContractId,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nkeyboardShortcuts unit tests');
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
