// ============================================================
// src/test/statusBadgeService.test.ts
// Unit tests for the StatusBadgeService.
// ============================================================

declare const process: { exitCode?: number };

import * as assert from "assert";
import { StatusBadgeService } from "../services/statusBadgeService";
import {
  BadgeStatus,
  BadgeSeverity,
  BadgeAnimation,
  BadgePosition,
  Badge,
} from "../types/statusBadge";

// Mock vscode module
class MockExtensionContext {
  workspaceState = {
    get: () => undefined,
    update: async () => {},
  };
}

class TestStatusBadgeService extends StatusBadgeService {
  // Allow direct access to private methods for testing
  public testGenerateCssClass(badge: Badge): string {
    return (this as any).generateCssClass(badge);
  }
}

// ============================================================
// Test Suite
// ============================================================

async function testBadgeCreation() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const badge = service.createBadge("op1", "Test Badge", {
    severity: BadgeSeverity.INFO,
    animation: BadgeAnimation.PULSE,
  });

  assert.strictEqual(badge.operationId, "op1");
  assert.strictEqual(badge.label, "Test Badge");
  assert.strictEqual(badge.severity, BadgeSeverity.INFO);
  assert.strictEqual(badge.animation, BadgeAnimation.PULSE);
  assert.strictEqual(badge.status, BadgeStatus.IDLE);
  assert.strictEqual(badge.visible, true);

  service.dispose();
  console.log("  [ok] badge creation works");
}

async function testBadgeUpdate() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const badge = service.createBadge("op1", "Test Badge");
  const badgeId = badge.id;

  const updated = service.updateBadge(badgeId, {
    status: BadgeStatus.RUNNING,
    label: "Updated Badge",
  });

  assert.strictEqual(updated?.status, BadgeStatus.RUNNING);
  assert.strictEqual(updated?.label, "Updated Badge");

  service.dispose();
  console.log("  [ok] badge update works");
}

async function testMarkRunning() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const badge = service.createBadge("op1", "Test Badge");
  const marked = service.markRunning(badge.id, "Processing...");

  assert.strictEqual(marked?.status, BadgeStatus.RUNNING);
  assert.strictEqual(marked?.label, "Processing...");
  assert.strictEqual(marked?.animation, BadgeAnimation.SPIN);

  service.dispose();
  console.log("  [ok] mark running works");
}

async function testMarkSucceeded() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const badge = service.createBadge("op1", "Test Badge");
  const marked = service.markSucceeded(badge.id, "Done");

  assert.strictEqual(marked?.status, BadgeStatus.SUCCEEDED);
  assert.strictEqual(marked?.severity, BadgeSeverity.SUCCESS);
  assert.strictEqual(marked?.label, "Done");

  service.dispose();
  console.log("  [ok] mark succeeded works");
}

async function testMarkFailed() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const badge = service.createBadge("op1", "Test Badge");
  const errorMsg = "Operation failed";
  const marked = service.markFailed(badge.id, errorMsg, "Error");

  assert.strictEqual(marked?.status, BadgeStatus.FAILED);
  assert.strictEqual(marked?.severity, BadgeSeverity.ERROR);
  assert.strictEqual(marked?.errorMessage, errorMsg);

  service.dispose();
  console.log("  [ok] mark failed works");
}

async function testMarkCancelled() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const badge = service.createBadge("op1", "Test Badge");
  const marked = service.markCancelled(badge.id, "Cancelled");

  assert.strictEqual(marked?.status, BadgeStatus.CANCELLED);
  assert.strictEqual(marked?.severity, BadgeSeverity.WARNING);

  service.dispose();
  console.log("  [ok] mark cancelled works");
}

async function testMarkWarning() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const badge = service.createBadge("op1", "Test Badge");
  const marked = service.markWarning(badge.id, "Be careful", "Warning");

  assert.strictEqual(marked?.status, BadgeStatus.WARNING);
  assert.strictEqual(marked?.severity, BadgeSeverity.WARNING);
  assert.strictEqual(marked?.tooltip, "Be careful");

  service.dispose();
  console.log("  [ok] mark warning works");
}

async function testGetBadgeSnapshot() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const badge = service.createBadge("op1", "Test Badge");
  const snapshot = service.getBadgeSnapshot(badge.id);

  assert.strictEqual(snapshot?.id, badge.id);
  assert.strictEqual(snapshot?.operationId, "op1");
  assert.strictEqual(snapshot?.label, "Test Badge");
  assert.ok(snapshot?.cssClass);

  service.dispose();
  console.log("  [ok] get badge snapshot works");
}

async function testGetAllBadges() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  service.createBadge("op1", "Badge 1");
  service.createBadge("op2", "Badge 2");
  service.createBadge("op3", "Badge 3");

  const allBadges = service.getAllBadges();

  assert.strictEqual(allBadges.length, 3);

  service.dispose();
  console.log("  [ok] get all badges works");
}

async function testGetBadgesForOperation() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  service.createBadge("op1", "Badge 1");
  service.createBadge("op1", "Badge 2");
  service.createBadge("op2", "Badge 3");

  const op1Badges = service.getBadgesForOperation("op1");
  const op2Badges = service.getBadgesForOperation("op2");

  assert.strictEqual(op1Badges.length, 2);
  assert.strictEqual(op2Badges.length, 1);

  service.dispose();
  console.log("  [ok] get badges for operation works");
}

async function testRemoveBadge() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const badge = service.createBadge("op1", "Test Badge");
  const badgeId = badge.id;

  assert.strictEqual(service.getAllBadges().length, 1);

  service.removeBadge(badgeId);

  assert.strictEqual(service.getAllBadges().length, 0);

  service.dispose();
  console.log("  [ok] remove badge works");
}

async function testRemoveBadgesForOperation() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  service.createBadge("op1", "Badge 1");
  service.createBadge("op1", "Badge 2");
  service.createBadge("op2", "Badge 3");

  assert.strictEqual(service.getAllBadges().length, 3);

  service.removeBadgesForOperation("op1");

  const remaining = service.getAllBadges();
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].operationId, "op2");

  service.dispose();
  console.log("  [ok] remove badges for operation works");
}

async function testBadgeGroup() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const group = service.createBadgeGroup("group1");
  assert.strictEqual(group.groupId, "group1");
  assert.strictEqual(group.status, BadgeStatus.IDLE);

  const badge1 = service.createBadge("op1", "Badge 1");
  const badge2 = service.createBadge("op2", "Badge 2");

  service.addBadgeToGroup("group1", badge1);
  service.addBadgeToGroup("group1", badge2);

  service.updateGroupStatus("group1", BadgeStatus.RUNNING, 50);

  const updatedGroup = service.getBadgeGroup("group1");
  assert.strictEqual(updatedGroup?.status, BadgeStatus.RUNNING);
  assert.strictEqual(updatedGroup?.progressPercentage, 50);

  service.dispose();
  console.log("  [ok] badge group works");
}

async function testBadgeGroupRemoval() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const group = service.createBadgeGroup("group1");
  const badge1 = service.createBadge("op1", "Badge 1");

  service.addBadgeToGroup("group1", badge1);

  assert.strictEqual(service.getAllBadges().length, 1);

  service.removeBadgeGroup("group1");

  assert.strictEqual(service.getAllBadges().length, 0);
  assert.strictEqual(service.getBadgeGroup("group1"), undefined);

  service.dispose();
  console.log("  [ok] badge group removal works");
}

async function testMaxConcurrentBadges() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context, {
    maxConcurrentBadges: 3,
  });

  service.createBadge("op1", "Badge 1");
  service.createBadge("op2", "Badge 2");
  service.createBadge("op3", "Badge 3");
  service.createBadge("op4", "Badge 4"); // Should remove the oldest

  const badges = service.getAllBadges();
  assert.strictEqual(badges.length, 3);

  service.dispose();
  console.log("  [ok] max concurrent badges limit works");
}

async function testCustomization() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const customization = service.getCustomization();
  assert.strictEqual(customization.enableAnimations, true);
  assert.strictEqual(customization.showTooltips, true);

  service.updateCustomization({
    enableAnimations: false,
    maxBadges: 20,
  });

  const updated = service.getCustomization();
  assert.strictEqual(updated.enableAnimations, false);
  assert.strictEqual(updated.maxBadges, 20);

  service.dispose();
  console.log("  [ok] customization works");
}

async function testTheme() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const theme = service.getTheme();
  assert.ok(theme.colors.running);
  assert.ok(theme.colors.succeeded);

  service.updateTheme({
    colors: {
      ...theme.colors,
      running: "#FF0000",
    },
  });

  const updated = service.getTheme();
  assert.strictEqual(updated.colors.running, "#FF0000");

  service.dispose();
  console.log("  [ok] theme works");
}

async function testStatistics() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const badge1 = service.createBadge("op1", "Badge 1");
  const badge2 = service.createBadge("op2", "Badge 2");
  const badge3 = service.createBadge("op3", "Badge 3");

  service.markRunning(badge1.id);
  service.markSucceeded(badge2.id);
  service.markFailed(badge3.id, "Error");

  const stats = service.getStatistics();

  assert.strictEqual(stats.totalBadges, 3);
  assert.strictEqual(stats.byStatus[BadgeStatus.RUNNING], 1);
  assert.strictEqual(stats.byStatus[BadgeStatus.SUCCEEDED], 1);
  assert.strictEqual(stats.byStatus[BadgeStatus.FAILED], 1);

  service.dispose();
  console.log("  [ok] statistics works");
}

async function testEventEmitters() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  let badgeCreatedFired = false;
  let badgeUpdatedFired = false;
  let badgeRemovedFired = false;

  service.onBadgeCreated(() => {
    badgeCreatedFired = true;
  });

  service.onBadgeUpdated(() => {
    badgeUpdatedFired = true;
  });

  service.onBadgeRemoved(() => {
    badgeRemovedFired = true;
  });

  const badge = service.createBadge("op1", "Test Badge");
  assert.strictEqual(badgeCreatedFired, true);

  service.updateBadge(badge.id, { status: BadgeStatus.RUNNING });
  assert.strictEqual(badgeUpdatedFired, true);

  service.removeBadge(badge.id);
  assert.strictEqual(badgeRemovedFired, true);

  service.dispose();
  console.log("  [ok] event emitters work");
}

async function testErrorEvent() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  let errorEventFired = false;
  let errorMessage: string | undefined;

  service.onBadgeError((error) => {
    errorEventFired = true;
    errorMessage = error.errorMessage;
  });

  const badge = service.createBadge("op1", "Test Badge");
  service.markFailed(badge.id, "Something went wrong");

  assert.strictEqual(errorEventFired, true);
  assert.strictEqual(errorMessage, "Something went wrong");

  service.dispose();
  console.log("  [ok] error event works");
}

async function testMetadata() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const badge = service.createBadge("op1", "Test Badge", {
    metadata: {
      contractId: "CAB3D...ABC",
      functionName: "transfer",
      network: "testnet",
    },
  });

  assert.strictEqual(badge.metadata?.contractId, "CAB3D...ABC");
  assert.strictEqual(badge.metadata?.functionName, "transfer");
  assert.strictEqual(badge.metadata?.network, "testnet");

  service.dispose();
  console.log("  [ok] metadata works");
}

async function testClearAll() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  service.createBadge("op1", "Badge 1");
  service.createBadge("op2", "Badge 2");
  service.createBadge("op3", "Badge 3");

  assert.strictEqual(service.getAllBadges().length, 3);

  service.clearAll();

  assert.strictEqual(service.getAllBadges().length, 0);

  service.dispose();
  console.log("  [ok] clear all works");
}

async function testCssClassGeneration() {
  const context = new MockExtensionContext() as any;
  const service = new TestStatusBadgeService(context);

  const badge = service.createBadge("op1", "Test Badge", {
    animation: BadgeAnimation.PULSE,
    position: BadgePosition.INLINE,
  });

  service.markRunning(badge.id);

  const cssClass = service.testGenerateCssClass(badge);

  assert.ok(cssClass.includes("badge-running"));
  assert.ok(cssClass.includes("position-inline"));
  assert.ok(cssClass.includes("animation-pulse"));

  service.dispose();
  console.log("  [ok] CSS class generation works");
}

// ============================================================
// Run All Tests
// ============================================================

async function runAllTests() {
  console.log("\\n=== StatusBadgeService Tests ===\\n");

  try {
    await testBadgeCreation();
    await testBadgeUpdate();
    await testMarkRunning();
    await testMarkSucceeded();
    await testMarkFailed();
    await testMarkCancelled();
    await testMarkWarning();
    await testGetBadgeSnapshot();
    await testGetAllBadges();
    await testGetBadgesForOperation();
    await testRemoveBadge();
    await testRemoveBadgesForOperation();
    await testBadgeGroup();
    await testBadgeGroupRemoval();
    await testMaxConcurrentBadges();
    await testCustomization();
    await testTheme();
    await testStatistics();
    await testEventEmitters();
    await testErrorEvent();
    await testMetadata();
    await testClearAll();
    await testCssClassGeneration();

    console.log("\\n=== All Tests Passed! ===\\n");
  } catch (error) {
    console.error("\\nTest failed:", error);
    process.exitCode = 1;
  }
}

runAllTests();
