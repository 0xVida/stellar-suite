import { expect, test } from "@playwright/test";

test.describe("Visual regression suite", () => {
  test("captures core IDE layout baseline", async ({ page }) => {
    await page.goto("/qa/layout");

    await expect(page.getByTestId("qa-layout-shell")).toBeVisible();
    await expect(page.getByTestId("qa-layout-shell")).toHaveScreenshot("ide-layout-home.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("captures sidebar and panel toggled states", async ({ page }) => {
    await page.goto("/qa/layout");

    await page.getByTestId("qa-toggle-panel").click();
    await expect(page.getByTestId("qa-layout-shell")).toHaveScreenshot("ide-layout-panel-collapsed.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });

    await page.getByTestId("qa-toggle-sidebar").click();
    await expect(page.getByTestId("qa-layout-shell")).toHaveScreenshot("ide-layout-sidebar-collapsed.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("captures deployment stepper key visual states", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=timeout");
    await expect(page.getByTestId("deployment-stepper")).toHaveScreenshot("deploy-stepper-simulating.png", {
      maxDiffPixelRatio: 0.02,
    });

    await page.goto("/qa/deployment-stepper?mode=uploading");
    await expect(page.getByTestId("deployment-stepper")).toHaveScreenshot("deploy-stepper-uploading.png", {
      maxDiffPixelRatio: 0.02,
    });

    await page.goto("/qa/deployment-stepper?mode=error");
    await expect(page.getByTestId("deployment-stepper")).toHaveScreenshot("deploy-stepper-error.png", {
      maxDiffPixelRatio: 0.02,
    });
  });
});
