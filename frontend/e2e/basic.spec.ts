import { test, expect } from '@playwright/test';

test.describe('Stellar Suite E2E', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Stellar Suite/);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('navigation works', async ({ page }) => {
    await page.goto('/');
    const featuresLink = page.getByRole('link', { name: 'Features' });
    await expect(featuresLink).toBeVisible();
    await featuresLink.click();
    await expect(page).toHaveURL(/#features/);
  });

  test('newsletter form submission', async ({ page }) => {
    await page.goto('/');
    const emailInput = page.getByPlaceholder('you@example.com');
    await expect(emailInput).toBeVisible();
    
    await emailInput.fill('e2e-test@example.com');
    
    const submitButton = page.getByRole('button', { name: 'Subscribe' });
    await submitButton.click();

    await expect(page.getByText('Subscribing...')).toBeVisible();
    await expect(page.getByText('Thank you for subscribing!')).toBeVisible({ timeout: 10000 });
  });

  test('feature comparison page renders', async ({ page }) => {
    await page.goto('/features-comparison');
    await expect(page.locator('h1').first()).toBeVisible();
  });
});
