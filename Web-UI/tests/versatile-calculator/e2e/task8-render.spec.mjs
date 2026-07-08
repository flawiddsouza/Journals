import { test, expect } from '@playwright/test';
const appUrl = '/versatile-calc-test.html';

// Task 8: render editable rows with inline badges + live totals.
// The controller seeds the four canonical lines (which sum to 5h).

test('renders one row per seed line with correct value badges', async ({ page }) => {
  await page.goto(appUrl);
  const rows = page.locator('.row');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0).locator('.badge')).toHaveText('2h');
  await expect(rows.nth(1).locator('.badge')).toHaveText('1h 30m');
  await expect(rows.nth(2).locator('.badge')).toHaveText('30m');
  await expect(rows.nth(3).locator('.badge')).toHaveText('1h');
  // all seed rows are time-typed
  await expect(rows.nth(0).locator('.badge.time')).toBeVisible();
});

test('totals show Time 5h and a 4-line count, no other types', async ({ page }) => {
  await page.goto(appUrl);
  await expect(page.locator('.section .totals .tot.time b')).toHaveText('5h');
  await expect(page.locator('.section .totals .tot.count')).toContainText('4 lines counted');
  await expect(page.locator('.section .totals .tot.money')).toHaveCount(0);
  await expect(page.locator('.section .totals .tot.number')).toHaveCount(0);
});

test('editing a line updates its badge and the total live', async ({ page }) => {
  await page.goto(appUrl);
  const firstLine = page.locator('.row').nth(0).locator('.line');
  await firstLine.selectText();
  await page.keyboard.type('Dev sprint 3h');
  await expect(page.locator('.row').nth(0).locator('.badge')).toHaveText('3h');
  await expect(page.locator('.section .totals .tot.time b')).toHaveText('6h');
});
