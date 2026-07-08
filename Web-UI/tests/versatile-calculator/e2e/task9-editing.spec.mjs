import { test, expect } from '@playwright/test';
const appUrl = '/versatile-calc-test.html';
const textOf = (locator) => locator.evaluate((el) => el.textContent);

// Task 9: in-place editing — Enter split, Backspace merge, arrows, paste.

test('Enter in the middle of a line splits it into two rows', async ({ page }) => {
  await page.goto(appUrl);
  const rows = page.locator('.row');
  const before = await rows.count();
  const first = rows.nth(0).locator('.line'); // "Dev sprint 2h"
  await first.click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight'); // caret after "Dev"
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(before + 1);
  expect(await textOf(rows.nth(0).locator('.line'))).toBe('Dev');
  expect(await textOf(rows.nth(1).locator('.line'))).toBe(' sprint 2h');
});

test('Enter at end of the last line appends a new empty row with the caret in it', async ({ page }) => {
  await page.goto(appUrl);
  const rows = page.locator('.row');
  const before = await rows.count();
  await rows.last().locator('.line').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(before + 1);
  expect(await textOf(rows.last().locator('.line'))).toBe('');
  const activeIdx = await page.evaluate(() => document.activeElement?.parentElement?.dataset?.idx);
  expect(activeIdx).toBe(String(before)); // new last row index
});

test('Backspace at the start of a row merges it into the previous row', async ({ page }) => {
  await page.goto(appUrl);
  const rows = page.locator('.row');
  const before = await rows.count();
  const firstText = await textOf(rows.nth(0).locator('.line'));
  const secondText = await textOf(rows.nth(1).locator('.line'));
  const second = rows.nth(1).locator('.line');
  await second.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await expect(rows).toHaveCount(before - 1);
  expect(await textOf(rows.nth(0).locator('.line'))).toBe(firstText + secondText);
});

test('ArrowDown moves the caret focus to the next row', async ({ page }) => {
  await page.goto(appUrl);
  await page.locator('.row').nth(0).locator('.line').click();
  await page.keyboard.press('ArrowDown');
  const idx = await page.evaluate(() => document.activeElement?.parentElement?.dataset?.idx);
  expect(idx).toBe('1');
});

test('pasting multiple lines expands into multiple rows and totals update', async ({ page }) => {
  await page.goto(appUrl);
  const rows = page.locator('.row');
  const before = await rows.count();
  const target = rows.nth(0).locator('.line');
  await target.click();
  await page.keyboard.press('End');
  await target.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData('text', 'coffee $4\nrun 2h\nreps 10');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  // one existing row absorbs head+first pasted line, two more rows appended
  await expect(rows).toHaveCount(before + 2);
  await expect(page.locator('.section .totals .tot.money b')).toHaveText('$4.00');
  await expect(page.locator('.section .totals .tot.number b')).toHaveText('10');
});
