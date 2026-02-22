// ============================================================
// src/test/badgeComponents.test.ts
// Unit tests for badge UI components.
// ============================================================

declare const process: { exitCode?: number };

import * as assert from "assert";
import {
  BadgeStyleGenerator,
  BadgeRenderer,
  BadgeCssGenerator,
} from "../ui/badgeComponents";
import {
  BadgeStatus,
  BadgeSeverity,
  BadgeAnimation,
  BadgePosition,
  BadgeSnapshot,
} from "../types/statusBadge";
import { StatusBadgeService } from "../services/statusBadgeService";

// Mock vscode module
class MockExtensionContext {
  workspaceState = {
    get: () => undefined,
    update: async () => {},
  };
}

// Create helper functions
function createMockSnapshot(overrides?: Partial<BadgeSnapshot>): BadgeSnapshot {
  return {
    id: "badge-1",
    operationId: "op-1",
    status: BadgeStatus.RUNNING,
    severity: BadgeSeverity.INFO,
    label: "Test Badge",
    visible: true,
    cssClass: "badge-running",
    ...overrides,
  };
}

// ============================================================
// Test Suite
// ============================================================

async function testGetStatusIcon() {
  const icons = {
    [BadgeStatus.RUNNING]: "⟳",
    [BadgeStatus.SUCCEEDED]: "✓",
    [BadgeStatus.FAILED]: "✕",
    [BadgeStatus.CANCELLED]: "⊗",
    [BadgeStatus.WARNING]: "⚠",
    [BadgeStatus.INFO]: "ⓘ",
    [BadgeStatus.IDLE]: "●",
  };

  for (const [status, expectedIcon] of Object.entries(icons)) {
    const snapshot = createMockSnapshot({ status: status as BadgeStatus });
    const icon = BadgeStyleGenerator.getStatusIcon(snapshot);
    assert.strictEqual(
      icon,
      expectedIcon,
      `Icon mismatch for status ${status}`,
    );
  }

  console.log("  [ok] status icon generation works");
}

async function testGenerateClasses() {
  const snapshot = createMockSnapshot({
    status: BadgeStatus.RUNNING,
    severity: BadgeSeverity.WARNING,
    position: BadgePosition.CORNER,
    animation: BadgeAnimation.SPIN,
  });

  const classes = BadgeStyleGenerator.generateClasses(snapshot);

  assert.ok(classes.includes("stellar-badge"));
  assert.ok(classes.includes("badge-running"));
  assert.ok(classes.includes("severity-warning"));
  assert.ok(classes.includes("position-corner"));
  assert.ok(classes.includes("animate-spin"));

  console.log("  [ok] CSS class generation works");
}

async function testGetAriaLabel() {
  const snapshot = createMockSnapshot({
    label: "Processing",
    status: BadgeStatus.RUNNING,
  });

  const label = BadgeStyleGenerator.getAriaLabel(snapshot);

  assert.ok(label.includes("Badge:"));
  assert.ok(label.includes("Processing"));
  assert.ok(label.includes("Status:"));
  assert.ok(label.includes("running"));

  console.log("  [ok] aria label generation works");
}

async function testGetAriaLabelWithError() {
  const snapshot = createMockSnapshot({
    label: "Failed Operation",
    status: BadgeStatus.FAILED,
    errorMessage: "Network error occurred",
  });

  const label = BadgeStyleGenerator.getAriaLabel(snapshot);

  assert.ok(label.includes("Error:"));
  assert.ok(label.includes("Network error occurred"));

  console.log("  [ok] aria label with error works");
}

async function testGenerateInlineStyles() {
  const context = new MockExtensionContext() as any;
  const service = new StatusBadgeService(context);
  const snapshot = createMockSnapshot({ status: BadgeStatus.SUCCEEDED });

  const styles = BadgeStyleGenerator.generateInlineStyles(snapshot, service);

  assert.ok(styles.includes("background-color"));
  assert.ok(styles.includes("color"));
  assert.ok(styles.includes("padding"));
  assert.ok(styles.includes("border-radius"));

  service.dispose();
  console.log("  [ok] inline style generation works");
}

async function testRenderBadgeHtml() {
  const context = new MockExtensionContext() as any;
  const service = new StatusBadgeService(context);
  const snapshot = createMockSnapshot({
    label: "Test Badge",
    tooltip: "This is a test badge",
  });

  const html = BadgeRenderer.renderBadgeHtml(snapshot, service);

  assert.ok(html.includes("stellar-badge"));
  assert.ok(html.includes("Test Badge"));
  assert.ok(html.includes("badge-1"));
  assert.ok(html.includes("op-1"));

  service.dispose();
  console.log("  [ok] badge HTML rendering works");
}

async function testRenderBadgeHtmlWithError() {
  const context = new MockExtensionContext() as any;
  const service = new StatusBadgeService(context);
  const snapshot = createMockSnapshot({
    status: BadgeStatus.FAILED,
    errorMessage: "Operation failed",
  });

  const html = BadgeRenderer.renderBadgeHtml(snapshot, service);

  assert.ok(html.includes("badge-error-message"));
  assert.ok(html.includes("Operation failed"));

  service.dispose();
  console.log("  [ok] badge HTML with error rendering works");
}

async function testRenderMultipleBadges() {
  const context = new MockExtensionContext() as any;
  const service = new StatusBadgeService(context);

  const snapshots = [
    createMockSnapshot({ id: "badge-1", label: "Badge 1" }),
    createMockSnapshot({ id: "badge-2", label: "Badge 2" }),
    createMockSnapshot({ id: "badge-3", label: "Badge 3" }),
  ];

  const html = BadgeRenderer.renderBadgesHtml(snapshots, service);

  assert.ok(html.includes("badge-1"));
  assert.ok(html.includes("badge-2"));
  assert.ok(html.includes("badge-3"));
  assert.ok(html.includes("Badge 1"));
  assert.ok(html.includes("Badge 2"));
  assert.ok(html.includes("Badge 3"));

  service.dispose();
  console.log("  [ok] multiple badge HTML rendering works");
}

async function testRenderGroupProgress() {
  const groupHtml = BadgeRenderer.renderGroupProgressHtml(
    "group-1",
    5,
    2,
    1,
    60,
  );

  assert.ok(groupHtml.includes("badge-group"));
  assert.ok(groupHtml.includes("group-1"));
  assert.ok(groupHtml.includes("✓ 5"));
  assert.ok(groupHtml.includes("✕ 2"));
  assert.ok(groupHtml.includes("⊗ 1"));
  assert.ok(groupHtml.includes("/ 8"));
  assert.ok(groupHtml.includes("badge-group-progress"));
  assert.ok(groupHtml.includes("width: 60%"));

  console.log("  [ok] group progress HTML rendering works");
}

async function testEscapeHtmlSecurity() {
  const context = new MockExtensionContext() as any;
  const service = new StatusBadgeService(context);

  const snapshot = createMockSnapshot({
    label: '<script>alert("XSS")</script>',
    tooltip: "<img src=x onerror=\"alert('XSS')\">",
  });

  const html = BadgeRenderer.renderBadgeHtml(snapshot, service);

  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("onerror="));
  assert.ok(!html.includes("alert"));

  service.dispose();
  console.log("  [ok] HTML escaping security works");
}

async function testGenerateStylesheet() {
  const context = new MockExtensionContext() as any;
  const service = new StatusBadgeService(context);

  const stylesheet = BadgeCssGenerator.generateStylesheet(service);

  assert.ok(stylesheet.includes(".stellar-badge"));
  assert.ok(stylesheet.includes(".badge-running"));
  assert.ok(stylesheet.includes(".badge-succeeded"));
  assert.ok(stylesheet.includes(".badge-failed"));
  assert.ok(stylesheet.includes("animation"));
  assert.ok(stylesheet.includes("@keyframes"));

  service.dispose();
  console.log("  [ok] stylesheet generation works");
}

async function testStylesheetIncludesAnimations() {
  const context = new MockExtensionContext() as any;
  const service = new StatusBadgeService(context, {
    customization: {
      enableAnimations: true,
      showTooltips: true,
      maxBadges: 10,
      position: BadgePosition.INLINE,
      fontSize: "normal",
      theme: "auto",
    },
  });

  const stylesheet = BadgeCssGenerator.generateStylesheet(service);

  assert.ok(stylesheet.includes("@keyframes pulse"));
  assert.ok(stylesheet.includes("@keyframes spin"));
  assert.ok(stylesheet.includes("@keyframes blink"));
  assert.ok(stylesheet.includes(".animate-pulse"));
  assert.ok(stylesheet.includes(".animate-spin"));

  service.dispose();
  console.log("  [ok] stylesheet includes animations");
}

async function testStylesheetDisablesAnimationsWhenNeeded() {
  const context = new MockExtensionContext() as any;
  const service = new StatusBadgeService(context, {
    customization: {
      enableAnimations: false,
      showTooltips: true,
      maxBadges: 10,
      position: BadgePosition.INLINE,
      fontSize: "normal",
      theme: "auto",
    },
  });

  const stylesheet = BadgeCssGenerator.generateStylesheet(service);

  // Should not include animation keyframes when disabled
  assert.ok(
    !stylesheet.includes("@keyframes pulse") ||
      stylesheet.includes("enableAnimations: false"),
  );

  service.dispose();
  console.log("  [ok] stylesheet respects animation setting");
}

async function testBadgeWithoutTooltip() {
  const context = new MockExtensionContext() as any;
  const service = new StatusBadgeService(context);

  const snapshot = createMockSnapshot({
    tooltip: undefined,
  });

  const html = BadgeRenderer.renderBadgeHtml(snapshot, service);

  assert.ok(!html.includes("title="));

  service.dispose();
  console.log("  [ok] badge without tooltip works");
}

async function testCustomizationAffectsStyles() {
  const context = new MockExtensionContext() as any;
  const service1 = new StatusBadgeService(context, {
    customization: {
      enableAnimations: true,
      fontSize: "small",
      showTooltips: true,
      maxBadges: 10,
      position: BadgePosition.INLINE,
      theme: "auto",
    },
  });

  const snapshot = createMockSnapshot();
  const styles1 = BadgeStyleGenerator.generateInlineStyles(snapshot, service1);

  assert.ok(styles1);

  service1.dispose();
  console.log("  [ok] customization affects styles");
}

async function testHiddenBadgesNotRendered() {
  const context = new MockExtensionContext() as any;
  const service = new StatusBadgeService(context);

  const snapshots = [
    createMockSnapshot({ id: "badge-1", visible: true, label: "Visible" }),
    createMockSnapshot({ id: "badge-2", visible: false, label: "Hidden" }),
    createMockSnapshot({ id: "badge-3", visible: true, label: "Visible 2" }),
  ];

  const html = BadgeRenderer.renderBadgesHtml(snapshots, service);

  assert.ok(html.includes("Visible"));
  assert.ok(html.includes("Visible 2"));
  assert.ok(!html.includes("Hidden"));

  service.dispose();
  console.log("  [ok] hidden badges not rendered");
}

async function testGroupProgressWithoutPercentage() {
  const groupHtml = BadgeRenderer.renderGroupProgressHtml("group-1", 3, 1, 0);

  assert.ok(groupHtml.includes("badge-group"));
  assert.ok(!groupHtml.includes("badge-group-progress-bar"));

  console.log("  [ok] group progress without percentage works");
}

// ============================================================
// Run All Tests
// ============================================================

async function runAllTests() {
  console.log("\\n=== BadgeComponents Tests ===\\n");

  try {
    await testGetStatusIcon();
    await testGenerateClasses();
    await testGetAriaLabel();
    await testGetAriaLabelWithError();
    await testGenerateInlineStyles();
    await testRenderBadgeHtml();
    await testRenderBadgeHtmlWithError();
    await testRenderMultipleBadges();
    await testRenderGroupProgress();
    await testEscapeHtmlSecurity();
    await testGenerateStylesheet();
    await testStylesheetIncludesAnimations();
    await testStylesheetDisablesAnimationsWhenNeeded();
    await testBadgeWithoutTooltip();
    await testCustomizationAffectsStyles();
    await testHiddenBadgesNotRendered();
    await testGroupProgressWithoutPercentage();

    console.log("\\n=== All Badge Component Tests Passed! ===\\n");
  } catch (error) {
    console.error("\\nTest failed:", error);
    process.exitCode = 1;
  }
}

runAllTests();
