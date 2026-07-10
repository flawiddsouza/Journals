import { test, expect } from '@playwright/test';

const appUrl = '/tests/versatile-calculator/harness.html';

// The harness loads the app's global.css, so these specs catch cascade and
// positioning bugs that only appear once the component is embedded in Journals.
// Journals defines a global `.badge` pill (font-size: 10px; padding; radius) for
// admin role tags; the component's own classes are `vcalc-` prefixed so nothing
// from the global sheet can reach them.

test('no global rule leaks into the value badge', async ({ page }) => {
  await page.goto(appUrl);
  const s = await page.locator('.vcalc-row').first().evaluate((row) => {
    const cs = (el) => getComputedStyle(el);
    const badge = row.querySelector('.vcalc-badge');
    return {
      lineSize: cs(row.querySelector('.vcalc-line')).fontSize,
      badgeSize: cs(badge).fontSize,
      badgePaddingLeft: cs(badge).paddingLeft,
      badgeRadius: cs(badge).borderTopLeftRadius,
    };
  });
  expect(s.badgeSize).toBe(s.lineSize); // must not inherit global .badge { font-size: 10px }
  expect(s.badgePaddingLeft).toBe('0px');
  expect(s.badgeRadius).toBe('0px');
});

test('an empty line renders no badge', async ({ page }) => {
  await page.goto(appUrl);
  await page.locator('.vcalc-add-section').click(); // fresh section => a single empty row
  const badge = page.locator('.vcalc-section').nth(1).locator('.vcalc-row').first().locator('.vcalc-badge');
  await expect(badge).toBeHidden();
});

test('the Delete button reads as destructive: white on red, at rest and on hover', async ({ page }) => {
  await page.goto(appUrl);
  await page.locator('.vcalc-section').first().locator('.vcalc-remove').click();
  const del = page.locator('.vcalc-confirm-del');
  const read = () =>
    del.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, bg: cs.backgroundColor };
    });

  // the generic `.vcalc-confirm button` base rule must not out-specify the modifier
  const rest = await read();
  expect(rest.color).toBe('rgb(255, 255, 255)');
  expect(rest.bg).toBe('rgb(220, 38, 38)');

  await del.hover();
  const hover = await read();
  expect(hover.color).toBe('rgb(255, 255, 255)'); // text must stay legible on the darker red
  expect(hover.bg).toBe('rgb(185, 28, 28)');
});

test('confirm popover anchors just below the remove button and stays inside the component', async ({ page }) => {
  await page.goto(appUrl);
  const btn = page.locator('.vcalc-section').first().locator('.vcalc-remove');
  await btn.click();
  const pop = page.locator('.vcalc-confirm');
  await expect(pop).toBeVisible();

  const b = await btn.boundingBox();
  const p = await pop.boundingBox();
  const host = await page.locator('.vcalc').boundingBox();

  // right edge aligned with the × button
  expect(Math.abs(p.x + p.width - (b.x + b.width))).toBeLessThan(2);

  // sits just under the ×, not hundreds of pixels away
  const gap = p.y - (b.y + b.height);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(12);

  // never spills past the component (that overflow is what produced a horizontal scrollbar)
  expect(p.x + p.width).toBeLessThanOrEqual(host.x + host.width + 1);
});
