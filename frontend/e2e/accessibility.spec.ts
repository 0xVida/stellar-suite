import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('homepage should not have any automatically detectable accessibility issues', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .exclude('iframe') 
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('features comparison page accessibility', async ({ page }) => {
    await page.goto('/features-comparison');
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
