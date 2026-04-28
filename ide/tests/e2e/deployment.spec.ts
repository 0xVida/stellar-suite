import { expect, test } from "@playwright/test";

test.describe("Deployment stepper flow", () => {
  test("covers all four deployment steps and success", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=flow");

    await expect(page.getByTestId("deployment-stepper")).toBeVisible();
    await expect(page.getByTestId("deploy-step-simulating")).toHaveAttribute("data-status", "active");
    await expect(page.getByTestId("deploy-step-signing")).toHaveAttribute("data-status", "active");
    await expect(page.getByTestId("deploy-step-uploading")).toHaveAttribute("data-status", "active");
    await expect(page.getByTestId("deploy-step-instantiating")).toHaveAttribute("data-status", "active");
    await expect(page.getByTestId("deploy-success")).toBeVisible();
    await expect(page.getByText("Contract deployed successfully!")).toBeVisible();
  });

  test("verifies error state and retry action", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=error");

    await expect(page.getByTestId("deploy-error")).toBeVisible();
    await expect(page.getByText(/Mock instantiate failure/i)).toBeVisible();

    await page.getByTestId("deploy-retry-instantiate").click();
    await expect(page.getByTestId("deploy-step-instantiating")).toHaveAttribute("data-status", "active");
  });

  test("shows timeout warning during long-running deployment", async ({ page }) => {
    await page.goto("/qa/deployment-stepper?mode=timeout");
    await expect(page.getByTestId("deployment-stepper")).toBeVisible();

    await page.waitForTimeout(20_500);
    await expect(page.getByTestId("deploy-timeout-warning")).toBeVisible();
  });
});
