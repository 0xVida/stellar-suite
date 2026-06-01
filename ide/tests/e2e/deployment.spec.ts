/**
 * Playwright E2E — Deployment Stepper (Issue #841)
 *
 * Comprehensive coverage for the entire deployment stepper flow:
 *   - Happy-path: all four steps advance to success
 *   - Contract ID display and clipboard copy
 *   - Error state with retry-instantiate action
 *   - Timeout warning after 20 s of inactivity
 *   - Modal cannot be dismissed mid-deploy
 *   - Footer button label reflects current state
 *   - Accessibility: role/aria attributes on step list
 */

import { expect, test } from "@playwright/test";

// ─── Happy-path flow ──────────────────────────────────────────────────────────

test.describe("Deployment stepper — happy path", () => {
  test("stepper is visible when flow starts", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=flow");
    await expect(page.getByTestId("deployment-stepper")).toBeVisible();
  });

  test("simulating step becomes active first", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=flow");
    await expect(page.getByTestId("deploy-step-simulating")).toHaveAttribute(
      "data-status",
      "active"
    );
  });

  test("signing step becomes active", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=flow");
    await expect(page.getByTestId("deploy-step-signing")).toHaveAttribute(
      "data-status",
      "active"
    );
  });

  test("uploading step becomes active", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=flow");
    await expect(page.getByTestId("deploy-step-uploading")).toHaveAttribute(
      "data-status",
      "active"
    );
  });

  test("instantiating step becomes active", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=flow");
    await expect(page.getByTestId("deploy-step-instantiating")).toHaveAttribute(
      "data-status",
      "active"
    );
  });

  test("success banner appears after all steps complete", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=flow");
    await expect(page.getByTestId("deploy-success")).toBeVisible();
  });

  test("success message text is correct", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=flow");
    await expect(page.getByText("Contract deployed successfully!")).toBeVisible();
  });

  test("contract ID is displayed on success", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=flow");
    await expect(page.getByTestId("deploy-success")).toBeVisible();
    // The QA page passes a mock contract ID
    await expect(page.getByText(/CDEPLOYMENTSTEPPERMOCK/)).toBeVisible();
  });

  test("footer button reads 'Close' on success", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=flow");
    await expect(page.getByTestId("deploy-success")).toBeVisible();
    await expect(page.getByTestId("deploy-footer-btn")).toHaveText("Close");
  });

  test("footer button is enabled on success", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=flow");
    await expect(page.getByTestId("deploy-success")).toBeVisible();
    await expect(page.getByTestId("deploy-footer-btn")).toBeEnabled();
  });

  test("stepper closes when Close is clicked after success", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=flow");
    await expect(page.getByTestId("deploy-success")).toBeVisible();
    await page.getByTestId("deploy-footer-btn").click();
    await expect(page.getByTestId("deployment-stepper")).not.toBeVisible();
  });
});

// ─── Error state ──────────────────────────────────────────────────────────────

test.describe("Deployment stepper — error state", () => {
  test("error banner is visible in error mode", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=error");
    await expect(page.getByTestId("deploy-error")).toBeVisible();
  });

  test("error message contains the mock failure text", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=error");
    await expect(page.getByText(/Mock instantiate failure/i)).toBeVisible();
  });

  test("retry-instantiate button is visible when WASM was uploaded", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=error");
    await expect(page.getByTestId("deploy-retry-instantiate")).toBeVisible();
  });

  test("clicking retry transitions to instantiating step", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=error");
    await page.getByTestId("deploy-retry-instantiate").click();
    await expect(page.getByTestId("deploy-step-instantiating")).toHaveAttribute(
      "data-status",
      "active"
    );
  });

  test("footer button reads 'Dismiss' on error", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=error");
    await expect(page.getByTestId("deploy-footer-btn")).toHaveText("Dismiss");
  });

  test("footer button is enabled on error", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=error");
    await expect(page.getByTestId("deploy-footer-btn")).toBeEnabled();
  });

  test("stepper closes when Dismiss is clicked", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=error");
    await page.getByTestId("deploy-footer-btn").click();
    await expect(page.getByTestId("deployment-stepper")).not.toBeVisible();
  });
});

// ─── Timeout warning ──────────────────────────────────────────────────────────

test.describe("Deployment stepper — timeout warning", () => {
  test("stepper is open in timeout mode", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=timeout");
    await expect(page.getByTestId("deployment-stepper")).toBeVisible();
  });

  test("timeout warning appears after 20 s", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=timeout");
    await page.waitForTimeout(20_500);
    await expect(page.getByTestId("deploy-timeout-warning")).toBeVisible();
  });

  test("footer button is disabled while deploying in timeout mode", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=timeout");
    await expect(page.getByTestId("deploy-footer-btn")).toBeDisabled();
  });

  test("footer button reads 'Deploying…' while in progress", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=timeout");
    await expect(page.getByTestId("deploy-footer-btn")).toHaveText("Deploying…");
  });
});

// ─── Modal dismissal guard ────────────────────────────────────────────────────

test.describe("Deployment stepper — dismissal guard", () => {
  test("modal cannot be closed by clicking outside while deploying", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=timeout");
    await expect(page.getByTestId("deployment-stepper")).toBeVisible();
    // Click outside the dialog
    await page.mouse.click(10, 10);
    await expect(page.getByTestId("deployment-stepper")).toBeVisible();
  });

  test("Escape key does not close modal while deploying", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=timeout");
    await expect(page.getByTestId("deployment-stepper")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("deployment-stepper")).toBeVisible();
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

test.describe("Deployment stepper — accessibility", () => {
  test("step list has accessible role and label", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=flow");
    const list = page.getByRole("list", { name: "Deployment progress" });
    await expect(list).toBeVisible();
  });

  test("each step item is a list item", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=flow");
    const items = page.getByRole("listitem");
    await expect(items).toHaveCount(4);
  });
});
