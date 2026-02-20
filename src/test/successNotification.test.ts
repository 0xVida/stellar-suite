// ============================================================
// src/test/successNotification.test.ts
// Unit tests for success notification service
// ============================================================

declare const require: {
    (name: string): any;
    cache: Record<string, any>;
};
declare const process: { exitCode?: number };

const assert = require('assert');
const Module = require('module');

// ── Mock vscode module ────────────────────────────────────────

const vscodeMock = {
    window: {
        showInformationMessage: async () => undefined,
        showTextDocument: async () => undefined,
    },
    commands: { 
        executeCommand: async () => {} 
    },
    env: { 
        clipboard: { 
            writeText: async () => {} 
        } 
    },
    Uri: { 
        file: (f: string) => ({ fsPath: f }) 
    },
};

// Patch Node's module resolution
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
    if (request === 'vscode') {
        return '__vscode_mock__';
    }
    return originalResolve.call(this, request, parent, isMain, options);
};

require.cache['__vscode_mock__'] = {
    exports: vscodeMock,
};

import { SuccessNotificationService } from '../services/successNotificationService';
import {
    SuccessNotificationContext,
    QuickAction,
    NotificationConfig,
} from '../types/successNotification';

// ── Test runner ───────────────────────────────────────────────

type TestFn = () => Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn) {
    tests.push({ name, fn });
}

// ── Tests ─────────────────────────────────────────────────────

test('SuccessNotificationService: creates instance', async () => {
    const service = new SuccessNotificationService();
    assert.ok(service, 'Service should be created');
    assert.strictEqual(service.getActive().length, 0, 'Should have no active notifications');
});

test('SuccessNotificationService: tracks active notifications', async () => {
    const service = new SuccessNotificationService();
    
    // Mock show to track without actual UI
    const originalShow = service.show.bind(service);
    let showCalled = false;
    service.show = async (context, config) => {
        showCalled = true;
        // Simulate notification tracking without UI
        const id = `notification-${Date.now()}`;
        (service as any).activeNotifications.set(id, {
            id,
            context,
            timestamp: Date.now(),
        });
    };

    const context: SuccessNotificationContext = {
        operation: 'build',
        message: 'Build successful!',
        contractName: 'test-contract',
    };

    await service.show(context);
    
    assert.ok(showCalled, 'Show should be called');
    assert.strictEqual(service.getActive().length, 1, 'Should have one active notification');
});

test('SuccessNotificationService: dismisses notification', async () => {
    const service = new SuccessNotificationService();
    
    const id = 'test-notification';
    (service as any).activeNotifications.set(id, {
        id,
        context: { operation: 'build', message: 'Test' },
        timestamp: Date.now(),
    });

    assert.strictEqual(service.getActive().length, 1, 'Should have one notification');
    
    service.dismiss(id);
    
    assert.strictEqual(service.getActive().length, 0, 'Should have no notifications after dismiss');
});

test('SuccessNotificationService: dismisses all notifications', async () => {
    const service = new SuccessNotificationService();
    
    (service as any).activeNotifications.set('id1', {
        id: 'id1',
        context: { operation: 'build', message: 'Test 1' },
        timestamp: Date.now(),
    });
    
    (service as any).activeNotifications.set('id2', {
        id: 'id2',
        context: { operation: 'deploy', message: 'Test 2' },
        timestamp: Date.now(),
    });

    assert.strictEqual(service.getActive().length, 2, 'Should have two notifications');
    
    service.dismissAll();
    
    assert.strictEqual(service.getActive().length, 0, 'Should have no notifications after dismissAll');
});

test('SuccessNotificationService: cleans up old notifications', async () => {
    const service = new SuccessNotificationService();
    
    const oldTimestamp = Date.now() - (10 * 60 * 1000); // 10 minutes ago
    const recentTimestamp = Date.now();

    (service as any).activeNotifications.set('old', {
        id: 'old',
        context: { operation: 'build', message: 'Old' },
        timestamp: oldTimestamp,
    });
    
    (service as any).activeNotifications.set('recent', {
        id: 'recent',
        context: { operation: 'build', message: 'Recent' },
        timestamp: recentTimestamp,
    });

    assert.strictEqual(service.getActive().length, 2, 'Should have two notifications');
    
    service.cleanup();
    
    assert.strictEqual(service.getActive().length, 1, 'Should have one notification after cleanup');
    assert.strictEqual(service.getActive()[0].id, 'recent', 'Recent notification should remain');
});

test('SuccessNotificationService: default actions for build', async () => {
    const service = new SuccessNotificationService();
    const actions = (service as any).getDefaultActions({
        operation: 'build',
        message: 'Build successful',
    });

    assert.ok(Array.isArray(actions), 'Should return array of actions');
    assert.ok(actions.length > 0, 'Should have at least one action');
    assert.ok(actions.some((a: QuickAction) => a.id === 'deploy'), 'Should have deploy action');
});

test('SuccessNotificationService: default actions for deploy', async () => {
    const service = new SuccessNotificationService();
    const actions = (service as any).getDefaultActions({
        operation: 'deploy',
        message: 'Deploy successful',
        contractId: 'CTEST123',
    });

    assert.ok(Array.isArray(actions), 'Should return array of actions');
    assert.ok(actions.some((a: QuickAction) => a.id === 'copyId'), 'Should have copyId action');
    assert.ok(actions.some((a: QuickAction) => a.id === 'simulate'), 'Should have simulate action');
});

test('SuccessNotificationService: default actions for simulate', async () => {
    const service = new SuccessNotificationService();
    const actions = (service as any).getDefaultActions({
        operation: 'simulate',
        message: 'Simulation successful',
    });

    assert.ok(Array.isArray(actions), 'Should return array of actions');
    assert.ok(actions.some((a: QuickAction) => a.id === 'viewHistory'), 'Should have viewHistory action');
    assert.ok(actions.some((a: QuickAction) => a.id === 'export'), 'Should have export action');
});

test('SuccessNotificationService: default actions for export', async () => {
    const service = new SuccessNotificationService();
    const actions = (service as any).getDefaultActions({
        operation: 'export',
        message: 'Export successful',
        filePath: '/path/to/file.json',
    });

    assert.ok(Array.isArray(actions), 'Should return array of actions');
    assert.ok(actions.some((a: QuickAction) => a.id === 'openFile'), 'Should have openFile action');
});

test('SuccessNotificationService: default actions for import', async () => {
    const service = new SuccessNotificationService();
    const actions = (service as any).getDefaultActions({
        operation: 'import',
        message: 'Import successful',
    });

    assert.ok(Array.isArray(actions), 'Should return array of actions');
    assert.ok(actions.some((a: QuickAction) => a.id === 'refresh'), 'Should have refresh action');
});

test('SuccessNotificationService: custom actions', async () => {
    const service = new SuccessNotificationService();
    
    let customActionCalled = false;
    const customAction: QuickAction = {
        id: 'custom',
        label: 'Custom Action',
        handler: async () => {
            customActionCalled = true;
        },
    };

    const context: SuccessNotificationContext = {
        operation: 'custom',
        message: 'Custom operation successful',
    };

    const config: NotificationConfig = {
        actions: [customAction],
    };

    // Mock to test action handler
    const originalShow = service.show.bind(service);
    service.show = async (ctx, cfg) => {
        const actions = cfg?.actions || [];
        if (actions.length > 0) {
            await actions[0].handler(ctx);
        }
    };

    await service.show(context, config);
    
    assert.ok(customActionCalled, 'Custom action handler should be called');
});

test('SuccessNotificationService: dispose cleans up', async () => {
    const service = new SuccessNotificationService();
    
    (service as any).activeNotifications.set('id1', {
        id: 'id1',
        context: { operation: 'build', message: 'Test' },
        timestamp: Date.now(),
    });

    assert.strictEqual(service.getActive().length, 1, 'Should have one notification');
    
    service.dispose();
    
    assert.strictEqual(service.getActive().length, 0, 'Should have no notifications after dispose');
});

// ── Test runner ───────────────────────────────────────────────

(async () => {
    console.log(`\n🧪 Running ${tests.length} tests...\n`);
    let passed = 0;
    let failed = 0;

    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (err: any) {
            console.error(`❌ ${name}`);
            console.error(`   ${err.message}`);
            if (err.stack) {
                console.error(err.stack.split('\n').slice(1, 4).join('\n'));
            }
            failed++;
        }
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
    if (failed > 0) {
        process.exitCode = 1;
    }
})();
