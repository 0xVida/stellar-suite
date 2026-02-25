import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('homepage visual test', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('homepage.png', {
      maxDiffPixelRatio: 0.05,
      fullPage: true,
      mask: [page.getByRole('img', { name: 'Stellar Suite' })]
    });
  });

  test('features comparison visual test', async ({ page }) => {
    await page.goto('/features-comparison');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('features-comparison.png', {
      maxDiffPixelRatio: 0.05,
      fullPage: true
    });
  });
});
