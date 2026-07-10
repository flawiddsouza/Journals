import { test, expect } from '@playwright/test';
const appUrl = '/versatile-calc-test.html';

// Task 10: localStorage persistence + seed on a fresh start.
// Each Playwright test gets an isolated browser context (empty storage).

test('edits persist across a reload and are written to localStorage', async ({ page }) => {
  await page.goto(appUrl);
  // append a money line
  await page.locator('.vcalc-row').last().locator('.vcalc-line').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Lunch $12.50');
  await expect(page.locator('.vcalc-section .vcalc-totals .vcalc-tot.vcalc-money b')).toHaveText('$12.50');

  const stored = await page.evaluate(() => localStorage.getItem('versatile-calc-sections'));
  expect(stored).toContain('Lunch $12.50');

  await page.reload();
  await expect(page.locator('.vcalc-section .vcalc-totals .vcalc-tot.vcalc-money b')).toHaveText('$12.50');
  await expect(page.locator('.vcalc-row')).toContainText(['Lunch $12.50']);
});

test('a fresh start (no stored note) seeds the canonical example totalling 5h', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => localStorage.removeItem('versatile-calc-sections'));
  await page.reload();
  await expect(page.locator('.vcalc-row')).toHaveCount(4);
  await expect(page.locator('.vcalc-section .vcalc-totals .vcalc-tot.vcalc-time b')).toHaveText('5h');
});
