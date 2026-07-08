import { test, expect } from '@playwright/test';
const appUrl = '/versatile-calc-test.html';

test('page loads with the app title', async ({ page }) => {
  await page.goto(appUrl);
  await expect(page.locator('h1')).toHaveText('Versatile Calculator');
  await expect(page.locator('#sections')).toBeVisible();
  await expect(page.locator('.section .totals')).toBeVisible();
  await expect(page.locator('#add-section')).toBeVisible();
});
