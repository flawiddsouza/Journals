import { test, expect } from '@playwright/test';
const appUrl = '/tests/versatile-calculator/harness.html';

test('page loads with the app title', async ({ page }) => {
  await page.goto(appUrl);
  await expect(page.locator('h1')).toHaveText('Versatile Calculator');
  await expect(page.locator('.vcalc-sections')).toBeVisible();
  await expect(page.locator('.vcalc-section .vcalc-totals')).toBeVisible();
  await expect(page.locator('.vcalc-add-section')).toBeVisible();
});
