import { test, expect } from '@playwright/test';

const appUrl = '/tests/versatile-calculator/harness.html';

// The component calls parseLine/computeTotals without a locale, so they read the browser
// environment. These specs drive the real locale and time zone to prove that wiring, which
// the parser's unit tests (which pass a locale explicitly) cannot reach.
//
// Every describe pins BOTH signals. An en-US browser in Asia/Kolkata gets lakh grouping,
// so a spec that set only the locale would flip depending on the machine running it.

const typeNumbers = async (page, a, b) => {
  await page.goto(appUrl);
  const rows = page.locator('.vcalc-row');
  await rows.nth(0).locator('.vcalc-line').selectText();
  await page.keyboard.type(a);
  await rows.nth(1).locator('.vcalc-line').selectText();
  await page.keyboard.type(b);
};

const badge = (page, i) => page.locator('.vcalc-row').nth(i).locator('.vcalc-badge');
const numbersTotal = (page) => page.locator('.vcalc-totals .vcalc-tot.vcalc-number b').first();

// Language carries the region, so the time zone is deliberately non-Indian here.
test.describe('an Indian locale', () => {
  test.use({ locale: 'en-IN', timezoneId: 'America/New_York' });

  test('groups badges and totals by lakh', async ({ page }) => {
    await typeNumbers(page, '241421', '421412');
    await expect(badge(page, 0)).toHaveText('2,41,421');
    await expect(badge(page, 1)).toHaveText('4,21,412');
    await expect(numbersTotal(page)).toHaveText('6,62,833');
  });

  test('groups money by lakh, keeping the currency symbol', async ({ page }) => {
    await typeNumbers(page, 'rent ₹241421', 'deposit ₹100000');
    await expect(badge(page, 0)).toHaveText('₹2,41,421.00');
    await expect(badge(page, 1)).toHaveText('₹1,00,000.00');
  });
});

test.describe('a non-Indian locale', () => {
  test.use({ locale: 'en-US', timezoneId: 'America/New_York' });

  test('groups badges and totals by thousand', async ({ page }) => {
    await typeNumbers(page, '241421', '421412');
    await expect(badge(page, 0)).toHaveText('241,421');
    await expect(badge(page, 1)).toHaveText('421,412');
    await expect(numbersTotal(page)).toHaveText('662,833');
  });
});

test.describe('round-tripping a grouped badge', () => {
  test.use({ locale: 'en-IN', timezoneId: 'Asia/Kolkata' });

  // A user who copies a badge back into a line must not see the value collapse.
  test('a grouped number typed into a line parses back to itself', async ({ page }) => {
    await typeNumbers(page, '2,41,421', '4,21,412');
    await expect(badge(page, 0)).toHaveText('2,41,421');
    await expect(numbersTotal(page)).toHaveText('6,62,833');
  });
});

// The reported bug: an en-US browser in India showed 241,421 rather than 2,41,421.
// navigator.language is 'en-US' and carries no region at all, so the time zone is the only
// signal that places the reader.
test.describe('an en-US browser on an Indian clock', () => {
  test.use({ locale: 'en-US', timezoneId: 'Asia/Kolkata' });

  test('still groups by lakh', async ({ page }) => {
    await typeNumbers(page, '241421', '421412');
    await expect(badge(page, 0)).toHaveText('2,41,421');
    await expect(numbersTotal(page)).toHaveText('6,62,833');
  });
});

// Chromium reports the legacy identifier for the same zone.
test.describe('the legacy Asia/Calcutta identifier', () => {
  test.use({ locale: 'en-GB', timezoneId: 'Asia/Calcutta' });

  test('is recognised too', async ({ page }) => {
    await typeNumbers(page, '241421', '421412');
    await expect(badge(page, 0)).toHaveText('2,41,421');
  });
});
