import { test, expect } from '@playwright/test';
const appUrl = '/tests/versatile-calculator/harness.html';

test('Add section creates a new empty section with the caret in it', async ({ page }) => {
  await page.goto(appUrl);
  const sections = page.locator('.vcalc-section');
  await expect(sections).toHaveCount(1);
  await page.locator('.vcalc-add-section').click();
  await expect(sections).toHaveCount(2);
  await expect(sections.nth(1).locator('.vcalc-row')).toHaveCount(1);
  await expect(sections.nth(1).locator('.vcalc-totals .vcalc-tot.vcalc-count')).toContainText('0 lines counted');
  const activeSec = await page.evaluate(() => document.activeElement?.closest('.vcalc-section')?.dataset?.sec);
  expect(activeSec).toBe('1');
});

test('sections hold independent notes with independent totals', async ({ page }) => {
  await page.goto(appUrl);
  await page.locator('.vcalc-add-section').click();
  const s2 = page.locator('.vcalc-section').nth(1);
  await s2.locator('.vcalc-row').first().locator('.vcalc-line').click();
  await page.keyboard.type('milk $3');
  // section 1 is untouched; section 2 totals money only, no time bucket
  await expect(page.locator('.vcalc-section').nth(0).locator('.vcalc-totals .vcalc-tot.vcalc-time b')).toHaveText('5h');
  await expect(s2.locator('.vcalc-totals .vcalc-tot.vcalc-money b')).toHaveText('$3.00');
  await expect(s2.locator('.vcalc-totals .vcalc-tot.vcalc-time')).toHaveCount(0);
});

test('an empty section deletes immediately, no confirm popover', async ({ page }) => {
  await page.goto(appUrl);
  await page.locator('.vcalc-add-section').click();
  await page.locator('.vcalc-add-section').click();
  const sections = page.locator('.vcalc-section');
  await expect(sections).toHaveCount(3);
  await sections.nth(1).locator('.vcalc-remove').click(); // section 1 is a fresh, empty one
  await expect(sections).toHaveCount(2);
  await expect(page.locator('.vcalc-confirm')).toBeHidden();
});

test('deleting a section with content shows a confirm popover; Delete removes it', async ({ page }) => {
  await page.goto(appUrl);
  const sections = page.locator('.vcalc-section');
  await expect(sections).toHaveCount(1);
  await sections.first().locator('.vcalc-remove').click(); // seed section has content
  const pop = page.locator('.vcalc-confirm');
  await expect(pop).toBeVisible();
  await pop.locator('.vcalc-confirm-del').click();
  // last section removed -> replaced by one fresh empty section
  await expect(sections).toHaveCount(1);
  await expect(sections.first().locator('.vcalc-row')).toHaveCount(1);
  await expect(sections.first().locator('.vcalc-totals .vcalc-tot.vcalc-count')).toContainText('0 lines counted');
  await expect(pop).toBeHidden();
});

test('Cancel in the popover keeps the section intact', async ({ page }) => {
  await page.goto(appUrl);
  await page.locator('.vcalc-add-section').click();               // 2 sections; try to delete the seed (section 0)
  const sections = page.locator('.vcalc-section');
  await expect(sections).toHaveCount(2);
  await sections.nth(0).locator('.vcalc-remove').click();
  const pop = page.locator('.vcalc-confirm');
  await expect(pop).toBeVisible();
  await pop.locator('.vcalc-confirm-cancel').click();
  await expect(pop).toBeHidden();
  await expect(sections).toHaveCount(2);                     // cancelled -> nothing removed
  await expect(sections.nth(0).locator('.vcalc-totals .vcalc-tot.vcalc-time b')).toHaveText('5h');
});

test('clicking outside the popover dismisses it without deleting', async ({ page }) => {
  await page.goto(appUrl);
  const sections = page.locator('.vcalc-section');
  await sections.first().locator('.vcalc-remove').click();
  const pop = page.locator('.vcalc-confirm');
  await expect(pop).toBeVisible();
  await page.locator('h1').click();                          // click elsewhere
  await expect(pop).toBeHidden();
  await expect(sections).toHaveCount(1);
  await expect(sections.first().locator('.vcalc-totals .vcalc-tot.vcalc-time b')).toHaveText('5h');
});

test('multiple sections persist across a reload', async ({ page }) => {
  await page.goto(appUrl);
  await page.locator('.vcalc-add-section').click();
  const s2 = page.locator('.vcalc-section').nth(1);
  await s2.locator('.vcalc-row').first().locator('.vcalc-line').click();
  await page.keyboard.type('rent $900');
  await page.reload();
  await expect(page.locator('.vcalc-section')).toHaveCount(2);
  await expect(page.locator('.vcalc-section').nth(1).locator('.vcalc-totals .vcalc-tot.vcalc-money b')).toHaveText('$900.00');
});

test('migrates a legacy single-note into one section', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    localStorage.removeItem('versatile-calc-sections');
    localStorage.setItem('versatile-calc', 'old note 3h\nmore 2h');
  });
  await page.reload();
  await expect(page.locator('.vcalc-section')).toHaveCount(1);
  await expect(page.locator('.vcalc-section .vcalc-totals .vcalc-tot.vcalc-time b')).toHaveText('5h');
});
