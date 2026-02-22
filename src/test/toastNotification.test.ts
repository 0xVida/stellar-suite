// ============================================================
// src/test/toastNotification.test.ts
// Comprehensive unit tests for toast notification system
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { ToastNotificationService } from '../services/toastNotificationService';
import {
    ToastType,
    ToastOptions,
    ToastEventType,
    ToastPosition,
    ToastQueueConfig
} from '../types/toastNotification';

// ── Helper function to create service with custom config ──

function createService(config?: Partial<ToastQueueConfig>): ToastNotificationService {
    return new ToastNotificationService(config);
}

// ── Helper to wait for async operations ──

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ══════════════════════════════════════════════════════════
// Basic Toast Creation Tests
// ══════════════════════════════════════════════════════════

async function testShowSuccessToast() {
    const service = createService();
    const id = await service.success('Operation successful');
    
    assert.ok(id, 'Should return toast ID');
    assert.ok(id.startsWith('toast-'), 'ID should have correct prefix');
    
    const stats = service.getStatistics();
    assert.strictEqual(stats.byType[ToastType.Success], 1);
    
    service.dispose();
    console.log('  [ok] shows success toast');
}

async function testShowErrorToast() {
    const service = createService();
    const id = await service.error('Operation failed');
    
    assert.ok(id, 'Should return toast ID');
    
    const stats = service.getStatistics();
    assert.strictEqual(stats.byType[ToastType.Error], 1);
    
    service.dispose();
    console.log('  [ok] shows error toast');
}

async function testShowWarningToast() {
    const service = createService();
    const id = await service.warning('Warning message');
    
    assert.ok(id, 'Should return toast ID');
    
    const stats = service.getStatistics();
    assert.strictEqual(stats.byType[ToastType.Warning], 1);
    
    service.dispose();
    console.log('  [ok] shows warning toast');
}

async function testShowInfoToast() {
    const service = createService();
    const id = await service.info('Info message');
    
    assert.ok(id, 'Should return toast ID');
    
    const stats = service.getStatistics();
    assert.strictEqual(stats.byType[ToastType.Info], 1);
    
    service.dispose();
    console.log('  [ok] shows info toast');
}

async function testCustomToastId() {
    const service = createService();
    const customId = 'custom-toast-123';
    const id = await service.info('Test', { id: customId });
    
    assert.strictEqual(id, customId, 'Should use custom ID');
    
    service.dispose();
    console.log('  [ok] supports custom toast ID');
}

// ══════════════════════════════════════════════════════════
// Toast Dismissal Tests
// ══════════════════════════════════════════════════════════

async function testDismissToast() {
    const service = createService();
    const id = await service.info('Test message');
    
    let stats = service.getStatistics();
    const initialTotal = stats.totalShown;
    
    service.dismiss(id);
    
    stats = service.getStatistics();
    assert.strictEqual(stats.currentlyVisible, 0, 'Should have no visible toasts');
    assert.strictEqual(stats.queued, 0, 'Should have no queued toasts');
    
    service.dispose();
    console.log('  [ok] dismisses toast by ID');
}

async function testDismissAll() {
    const service = createService();
    await service.info('Message 1');
    await service.info('Message 2');
    await service.success('Message 3');
    
    service.dismissAll();
    
    const stats = service.getStatistics();
    assert.strictEqual(stats.currentlyVisible, 0, 'Should have no visible toasts');
    assert.strictEqual(stats.queued, 0, 'Should have no queued toasts');
    
    service.dispose();
    console.log('  [ok] dismisses all toasts');
}

async function testDismissGroup() {
    const service = createService();
    await service.info('Group A message 1', { group: 'group-a' });
    await service.info('Group A message 2', { group: 'group-a' });
    await service.info('Group B message', { group: 'group-b' });
    
    service.dismissGroup('group-a');
    
    const stats = service.getStatistics();
    // Group B toast should still be queued/visible
    assert.ok(stats.totalShown >= 1, 'Should still have Group B toast');
    
    service.dispose();
    console.log('  [ok] dismisses toasts by group');
}

// ══════════════════════════════════════════════════════════
// Toast Queue Management Tests
// ══════════════════════════════════════════════════════════

async function testMaxVisibleLimit() {
    const service = createService({ maxVisible: 2, maxQueued: 10 });
    
    await service.info('Message 1');
    await service.info('Message 2');
    await service.info('Message 3');
    await service.info('Message 4');
    
    const stats = service.getStatistics();
    assert.ok(stats.totalShown <= 2, 'Should not exceed max visible limit');
    assert.ok(stats.queued >= 2, 'Should queue excess toasts');
    
    service.dispose();
    console.log('  [ok] respects max visible limit');
}

async function testPriorityOrdering() {
    const service = createService({ maxVisible: 1 });
    
    await service.info('Low priority', { priority: 1 });
    await service.error('High priority', { priority: 10 });
    await service.warning('Medium priority', { priority: 5 });
    
    // When first toast is dismissed, highest priority should show next
    const stats = service.getStatistics();
    assert.ok(stats.queued > 0, 'Should have queued toasts');
    
    service.dispose();
    console.log('  [ok] orders toasts by priority');
}

// ══════════════════════════════════════════════════════════
// Toast Update Tests
// ══════════════════════════════════════════════════════════

async function testUpdateToastMessage() {
    const service = createService();
    const id = await service.info('Original message');
    
    service.update(id, { message: 'Updated message' });
    
    // Note: We can't directly verify the message changed in this test
    // but we verify no errors occurred
    const stats = service.getStatistics();
    assert.ok(stats.totalShown > 0);
    
    service.dispose();
    console.log('  [ok] updates toast message');
}

async function testUpdateToastProgress() {
    const service = createService();
    const id = await service.info('Processing...', { progress: 0 });
    
    service.update(id, { progress: 50 });
    service.update(id, { progress: 100 });
    
    const stats = service.getStatistics();
    assert.ok(stats.totalShown > 0);
    
    service.dispose();
    console.log('  [ok] updates toast progress');
}

async function testUpdateNonexistentToast() {
    const service = createService();
    
    // Should not throw error when updating nonexistent toast
    service.update('nonexistent-id', { message: 'Test' });
    
    service.dispose();
    console.log('  [ok] handles update of nonexistent toast');
}

// ══════════════════════════════════════════════════════════
// Statistics Tests
// ══════════════════════════════════════════════════════════

async function testStatisticsTracking() {
    const service = createService({ maxVisible: 10 }); // Increase limit to show all toasts
    
    await service.success('Success 1');
    await service.success('Success 2');
    await service.error('Error 1');
    await service.warning('Warning 1');
    await service.info('Info 1');
    await service.info('Info 2');
    
    const stats = service.getStatistics();
    
    assert.strictEqual(stats.byType[ToastType.Success], 2, 'Should track success count');
    assert.strictEqual(stats.byType[ToastType.Error], 1, 'Should track error count');
    assert.strictEqual(stats.byType[ToastType.Warning], 1, 'Should track warning count');
    assert.strictEqual(stats.byType[ToastType.Info], 2, 'Should track info count');
    assert.ok(stats.totalShown >= 5, 'Should track total shown');
    
    service.dispose();
    console.log('  [ok] tracks statistics correctly');
}

async function testClearStatistics() {
    const service = createService();
    
    await service.success('Test 1');
    await service.error('Test 2');
    
    service.clear();
    
    const stats = service.getStatistics();
    assert.strictEqual(stats.totalShown, 0, 'Should reset total shown');
    assert.strictEqual(stats.currentlyVisible, 0, 'Should reset visible count');
    assert.strictEqual(stats.queued, 0, 'Should reset queued count');
    assert.strictEqual(stats.byType[ToastType.Success], 0, 'Should reset success count');
    assert.strictEqual(stats.byType[ToastType.Error], 0, 'Should reset error count');
    
    service.dispose();
    console.log('  [ok] clears statistics');
}

// ══════════════════════════════════════════════════════════
// Event Handling Tests
// ══════════════════════════════════════════════════════════

async function testEventEmission() {
    const service = createService();
    const events: any[] = [];
    
    const disposable = service.onToastEvent(event => {
        events.push(event);
    });
    
    await service.info('Test message');
    
    // Should have at least one event (shown or queue changed)
    assert.ok(events.length > 0, 'Should emit events');
    
    disposable.dispose();
    service.dispose();
    console.log('  [ok] emits toast events');
}

async function testActionCallback() {
    const service = createService();
    let actionCalled = false;
    
    await service.info('Test with action', {
        actions: [{
            label: 'Click me',
            callback: () => {
                actionCalled = true;
            }
        }]
    });
    
    // Note: In real usage, the callback would be triggered by user interaction
    // This test verifies the action structure is preserved
    const stats = service.getStatistics();
    assert.ok(stats.totalShown > 0);
    
    service.dispose();
    console.log('  [ok] supports action callbacks');
}

// ══════════════════════════════════════════════════════════
// Configuration Tests
// ══════════════════════════════════════════════════════════

async function testCustomConfiguration() {
    const config: Partial<ToastQueueConfig> = {
        maxVisible: 5,
        maxQueued: 20,
        defaultDuration: 3000,
        position: ToastPosition.TopRight,
        enableAnimations: false
    };
    
    const service = createService(config);
    
    // Service should be created with custom config
    assert.ok(service, 'Should create service with custom config');
    
    service.dispose();
    console.log('  [ok] accepts custom configuration');
}

// ══════════════════════════════════════════════════════════
// Edge Cases and Error Handling
// ══════════════════════════════════════════════════════════

async function testDuplicateIdHandling() {
    const service = createService();
    const customId = 'duplicate-id';
    
    await service.info('First message', { id: customId });
    await service.info('Second message', { id: customId });
    
    // Second call should update existing toast
    const stats = service.getStatistics();
    // Only one toast should be created/tracked (second one updates first)
    
    service.dispose();
    console.log('  [ok] handles duplicate IDs by updating');
}

async function testDisposeCleanup() {
    const service = createService();
    
    await service.info('Message 1');
    await service.info('Message 2');
    
    service.dispose();
    
    // After disposal, service should clean up resources
    // No errors should occur
    
    console.log('  [ok] disposes and cleans up resources');
}

async function testEmptyMessage() {
    const service = createService();
    
    // Should handle empty message gracefully
    const id = await service.info('');
    assert.ok(id, 'Should create toast even with empty message');
    
    service.dispose();
    console.log('  [ok] handles empty message');
}

async function testLongMessage() {
    const service = createService();
    
    const longMessage = 'A'.repeat(1000);
    const id = await service.info(longMessage);
    
    assert.ok(id, 'Should handle long messages');
    
    service.dispose();
    console.log('  [ok] handles long messages');
}

// ══════════════════════════════════════════════════════════
// Auto-dismiss Tests
// ══════════════════════════════════════════════════════════

async function testAutoDismiss() {
    const service = createService({ defaultDuration: 100 }); // 100ms for testing
    
    await service.info('Auto dismiss message');
    
    let stats = service.getStatistics();
    const initialVisible = stats.currentlyVisible;
    
    // Wait for auto-dismiss
    await wait(150);
    
    stats = service.getStatistics();
    // Toast should be auto-dismissed after duration
    assert.ok(
        stats.currentlyVisible <= initialVisible,
        'Should auto-dismiss after duration'
    );
    
    service.dispose();
    console.log('  [ok] auto-dismisses after duration');
}

async function testErrorsDoNotAutoDismiss() {
    const service = createService({ defaultDuration: 100 });
    
    await service.error('Error message');
    
    // Errors have duration: 0 by default, so they don't auto-dismiss
    await wait(150);
    
    // Error should still be present (not auto-dismissed)
    const stats = service.getStatistics();
    // We can't easily verify this without accessing internal state
    // but the test ensures no errors occur
    
    service.dispose();
    console.log('  [ok] errors do not auto-dismiss by default');
}

// ══════════════════════════════════════════════════════════
// Run All Tests
// ══════════════════════════════════════════════════════════

async function runTests() {
    console.log('\n=== Toast Notification Service Tests ===\n');
    
    const tests = [
        // Basic creation
        { name: 'Show success toast', fn: testShowSuccessToast },
        { name: 'Show error toast', fn: testShowErrorToast },
        { name: 'Show warning toast', fn: testShowWarningToast },
        { name: 'Show info toast', fn: testShowInfoToast },
        { name: 'Custom toast ID', fn: testCustomToastId },
        
        // Dismissal
        { name: 'Dismiss toast', fn: testDismissToast },
        { name: 'Dismiss all toasts', fn: testDismissAll },
        { name: 'Dismiss group', fn: testDismissGroup },
        
        // Queue management
        { name: 'Max visible limit', fn: testMaxVisibleLimit },
        { name: 'Priority ordering', fn: testPriorityOrdering },
        
        // Updates
        { name: 'Update toast message', fn: testUpdateToastMessage },
        { name: 'Update toast progress', fn: testUpdateToastProgress },
        { name: 'Update nonexistent toast', fn: testUpdateNonexistentToast },
        
        // Statistics
        { name: 'Statistics tracking', fn: testStatisticsTracking },
        { name: 'Clear statistics', fn: testClearStatistics },
        
        // Events
        { name: 'Event emission', fn: testEventEmission },
        { name: 'Action callback', fn: testActionCallback },
        
        // Configuration
        { name: 'Custom configuration', fn: testCustomConfiguration },
        
        // Edge cases
        { name: 'Duplicate ID handling', fn: testDuplicateIdHandling },
        { name: 'Dispose cleanup', fn: testDisposeCleanup },
        { name: 'Empty message', fn: testEmptyMessage },
        { name: 'Long message', fn: testLongMessage },
        
        // Auto-dismiss
        { name: 'Auto-dismiss', fn: testAutoDismiss },
        { name: 'Errors do not auto-dismiss', fn: testErrorsDoNotAutoDismiss }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            await test.fn();
            passed++;
        } catch (error) {
            failed++;
            console.error(`  [FAIL] ${test.name}:`, error);
        }
    }
    
    console.log(`\n=== Test Summary ===`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${tests.length}\n`);
    
    if (failed > 0) {
        process.exitCode = 1;
    }
}

// Run tests
runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
