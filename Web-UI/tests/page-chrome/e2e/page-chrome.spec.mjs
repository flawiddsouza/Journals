import { test, expect } from '@playwright/test';

// Journals splits page types into two families:
//
//   * content pages (FlatPage, Table, ...) sit inside the app's chrome -- an
//     editable title bar, and padding between the sidebar and the content.
//   * embedded apps (Spreadsheet, SpreadsheetV2, DrawIO, Excalidraw, MiniApp, Kanban) run edge to edge:
//     Page.svelte and Frame.svelte each keep a hardcoded list of them and zero
//     out the surrounding padding/margins.
//
// A page type must appear in *both* lists or *neither*, and the list must agree
// with the hide_title default in AddPageModal.svelte / API routes.cr. Adding
// VersatileCalculator to only some of them is exactly what produced a title bar
// whose top and left spacing did not match the other content pages.
//
// These specs mount the real Page.svelte (see ../harness.js) and read computed
// styles, so the whole cascade -- Frame.svelte's global rules included -- is
// under test.

// This harness imports Frame.svelte, and so the app's entire module graph. Vite's first
// transform of it is much slower than the calculator harness's, and one run has flaked
// against the default 30s test timeout. Subsequent tests hit a warm dev server.
test.describe.configure({ timeout: 60_000 });

const chrome = async (page, type, hideTitle = false) => {
  await page.goto(`/tests/page-chrome/harness.html?type=${type}&hideTitle=${hideTitle ? 1 : 0}`);
  const main = page.locator('main.journal-page');
  await main.waitFor();
  return main.evaluate((el) => {
    const cs = (node) => getComputedStyle(node);
    const titleBar = el.querySelector('.page-title-wrapper');
    const entries = el.querySelector('.journal-page-entries');
    return {
      titleRendered: titleBar !== null,
      titlePadding: titleBar ? cs(titleBar).padding : null,
      entriesMarginTop: cs(entries).marginTop,
      entriesMarginRight: cs(entries).marginRight,
      pagePaddingTop: cs(el).paddingTop,
      pagePaddingLeft: cs(el).paddingLeft,
      // 'auto 1fr' resolves to two tracks, '1fr' to one
      gridTracks: cs(el).gridTemplateRows.split(' ').length,
    };
  });
};

test('VersatileCalculator wears the same chrome as the other content page types', async ({ page }) => {
  const calculator = await chrome(page, 'VersatileCalculator');
  const flatPage = await chrome(page, 'FlatPage');
  const table = await chrome(page, 'Table');

  expect(calculator).toEqual(flatPage);
  expect(calculator).toEqual(table);

  // Spelled out, so a change to the shared defaults is visible in the diff.
  expect(calculator).toEqual({
    titleRendered: true,
    titlePadding: '0px',
    entriesMarginTop: '11.2px', // 0.7em
    entriesMarginRight: '16px', // 1em
    pagePaddingTop: '22.4px', // 1.4em, from Frame.svelte
    pagePaddingLeft: '32px', // 2em, from Frame.svelte
    gridTracks: 2,
  });
});

// Guards the specs above: if the stylesheets were not reaching the harness at all,
// every page type would trivially agree on a chrome of all-zeroes.
test('embedded page types opt out of that chrome', async ({ page }) => {
  const kanban = await chrome(page, 'Kanban');
  const excalidraw = await chrome(page, 'Excalidraw');
  const spreadsheetV2 = await chrome(page, 'SpreadsheetV2');
  expect(excalidraw).toEqual(kanban);
  expect(spreadsheetV2).toEqual(kanban);
  expect(kanban).toEqual({
    titleRendered: true,
    titlePadding: '8px', // 0.5rem
    entriesMarginTop: '0px',
    entriesMarginRight: '0px',
    pagePaddingTop: '0px',
    pagePaddingLeft: '0px',
    gridTracks: 2,
  });
});

test('Spreadsheet v2 mounts the Univer workbook interface', async ({ page }) => {
  await page.goto('/tests/page-chrome/harness.html?type=SpreadsheetV2&hideTitle=1');

  await expect(page.getByRole('tab', { name: 'Sheet1' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Start' })).toBeVisible();
  await expect(page.locator('.spreadsheet-v2-error')).toHaveCount(0);
});

test('Excalidraw mounts inside its page canvas', async ({ page }) => {
  await page.goto('/tests/page-chrome/harness.html?type=Excalidraw&hideTitle=1');
  await expect(page.locator('.excalidraw-page .excalidraw')).toBeVisible();
  await expect(page.locator('.excalidraw-error')).toHaveCount(0);
});

test('Excalidraw library browser opens a popup and returns to the current tab', async ({ page }) => {
  await page.addInitScript(() => {
    window.libraryPopupCalls = [];
    window.libraryPopupCloseCalls = 0;
    window.open = (...args) => {
      window.libraryPopupCalls.push(args);
      return {
        focus() {},
        close() {
          window.libraryPopupCloseCalls += 1;
        },
      };
    };
  });
  await page.goto('/tests/page-chrome/harness.html?type=Excalidraw&hideTitle=1');
  await page.getByTitle('Library').click();

  const libraryLink = page.getByRole('link', { name: 'Browse libraries' });
  await expect(libraryLink).toBeVisible();
  await expect(libraryLink).toHaveAttribute('target', '_excalidraw_libraries');

  const libraryUrl = new URL(await libraryLink.getAttribute('href'));
  expect(libraryUrl.searchParams.get('target')).toBe(
    await page.evaluate(() => window.name),
  );
  expect(libraryUrl.searchParams.get('referrer')).toBe(page.url());
  expect(await libraryLink.evaluate((link) => getComputedStyle(link).color)).toBe(
    'rgb(255, 255, 255)',
  );

  await libraryLink.click();
  const [[popupUrlValue, popupTarget, popupFeatures]] = await page.evaluate(
    () => window.libraryPopupCalls,
  );
  const popupUrl = new URL(popupUrlValue);
  const returnUrl = new URL(popupUrl.searchParams.get('referrer'));
  expect(popupUrl.searchParams.get('target')).toBe('_self');
  expect(returnUrl.pathname).toBe('/excalidraw-library-return.html');
  expect(returnUrl.searchParams.get('channel')).toMatch(
    /^journals-excalidraw-library-/,
  );
  expect(popupTarget).toBe('_excalidraw_libraries');
  expect(popupFeatures).toBe(
    'popup=yes,width=1100,height=780,resizable=yes,scrollbars=yes',
  );

  await libraryLink.click();
  await expect.poll(() =>
    page.evaluate(() => window.libraryPopupCloseCalls),
  ).toBe(1);
});

test('Excalidraw imports a library returned by the popup and closes it', async ({
  page,
  context,
}) => {
  const libraryUrl = 'https://libraries.excalidraw.com/journals-test.excalidrawlib';
  await context.route(libraryUrl, async (route) => {
    await route.fulfill({
      contentType: 'application/vnd.excalidrawlib+json',
      body: JSON.stringify({
        type: 'excalidrawlib',
        version: 1,
        source: libraryUrl,
        library: [
          [
            {
              id: 'journals-test-rectangle',
              type: 'rectangle',
              x: 0,
              y: 0,
              width: 100,
              height: 80,
              angle: 0,
              strokeColor: '#1e1e1e',
              backgroundColor: 'transparent',
              fillStyle: 'solid',
              strokeWidth: 2,
              strokeStyle: 'solid',
              roughness: 1,
              opacity: 100,
              groupIds: [],
              frameId: null,
              index: 'a0',
              roundness: null,
              seed: 1,
              version: 1,
              versionNonce: 1,
              isDeleted: false,
              boundElements: null,
              updated: 1,
              link: null,
              locked: false,
            },
          ],
        ],
      }),
    });
  });
  await context.route(/^https:\/\/libraries\.excalidraw\.com\/\?/, async (route) => {
    const popupUrl = new URL(route.request().url());
    const returnUrl = new URL(popupUrl.searchParams.get('referrer'));
    returnUrl.hash = new URLSearchParams({
      addLibrary: libraryUrl,
      token: popupUrl.searchParams.get('token'),
    }).toString();
    await route.fulfill({
      contentType: 'text/html',
      body: `<script>window.location.replace(${JSON.stringify(returnUrl.href)})</script>`,
    });
  });

  await page.goto(
    '/tests/page-chrome/harness.html?type=Excalidraw&hideTitle=1&storage=1',
  );
  await page.getByTitle('Library').click();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Browse libraries' }).click();
  const popup = await popupPromise;

  await expect(page.locator('.library-unit__active')).toHaveCount(1);
  await expect(page).not.toHaveURL(/addLibrary/);
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect.poll(async () => {
    const storage = await page.evaluate(() => window.getExcalidrawStorage());
    return storage.libraryData?.libraryItems?.length;
  }).toBe(1);

  await page.reload();
  await page.getByTitle('Library').click();
  await expect(page.locator('.library-unit__active')).toHaveCount(1);
});

test('Excalidraw stores an uploaded image by filename and reloads it', async ({ page }) => {
  await page.goto('/tests/page-chrome/harness.html?type=Excalidraw&hideTitle=1&storage=1');
  await expect(page.locator('.excalidraw-page .excalidraw')).toBeVisible();

  await page.locator('.excalidraw__canvas.interactive').evaluate((canvas) => {
    const base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const bytes = Uint8Array.from(atob(base64), (character) =>
      character.charCodeAt(0),
    );
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(
      new File([bytes], 'pixel.png', { type: 'image/png' }),
    );
    const bounds = canvas.getBoundingClientRect();
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      dataTransfer,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    };
    canvas.dispatchEvent(new DragEvent('dragenter', eventOptions));
    canvas.dispatchEvent(new DragEvent('dragover', eventOptions));
    canvas.dispatchEvent(new DragEvent('drop', eventOptions));
  });

  await page.waitForFunction(() => window.getExcalidrawStorage().pageContent);
  const storage = await page.evaluate(() => window.getExcalidrawStorage());
  const pageContent = JSON.parse(storage.pageContent);
  expect(storage.uploadCount).toBe(1);
  expect(Object.values(pageContent.journalsFiles)).toEqual(['stored-image.png']);
  expect(storage.pageContent).not.toContain('data:image');

  await page.reload();
  await expect(page.locator('.excalidraw-page .excalidraw')).toBeVisible();
  await page.waitForFunction(() => window.getExcalidrawStorage().imageLoadCount === 1);
  await expect(page.locator('.excalidraw-error')).toHaveCount(0);
  expect(await page.evaluate(() => window.getExcalidrawStorage().uploadCount)).toBe(1);
});

test('Excalidraw restores its pan and zoom after reload', async ({ page }) => {
  await page.goto('/tests/page-chrome/harness.html?type=Excalidraw&hideTitle=1&storage=1');
  await expect(page.locator('.excalidraw-page .excalidraw')).toBeVisible();

  const canvas = page.locator('.excalidraw__canvas.interactive');
  await canvas.hover();
  await page.mouse.wheel(140, 90);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();

  await page.waitForFunction(() => {
    const content = window.getExcalidrawStorage().pageContent;
    if (!content) return false;
    const appState = JSON.parse(content).appState;
    return (
      appState?.zoom?.value > 1 &&
      (Math.abs(appState.scrollX) > 0 || Math.abs(appState.scrollY) > 0)
    );
  });
  const viewport = await page.evaluate(() => {
    const { scrollX, scrollY, zoom } = JSON.parse(
      window.getExcalidrawStorage().pageContent,
    ).appState;
    return { scrollX, scrollY, zoom };
  });

  await page.reload();
  await expect(page.locator('.excalidraw-page .excalidraw')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText(
    `${Math.round(viewport.zoom.value * 100)}%`,
  );
  expect(Math.abs(viewport.scrollX) + Math.abs(viewport.scrollY)).toBeGreaterThan(0);
});

test('hiding the title drops the bar and its spacing, identically to a FlatPage', async ({ page }) => {
  const calculator = await chrome(page, 'VersatileCalculator', true);
  const flatPage = await chrome(page, 'FlatPage', true);

  expect(calculator).toEqual(flatPage);
  expect(calculator).toEqual({
    titleRendered: false,
    titlePadding: null,
    entriesMarginTop: '0px', // inline override in Page.svelte
    entriesMarginRight: '16px', // the right margin survives; only the top is zeroed
    pagePaddingTop: '22.4px',
    pagePaddingLeft: '32px',
    gridTracks: 1,
  });
});

test('showing the title again restores it, so the context-menu toggle round-trips', async ({ page }) => {
  const hidden = await chrome(page, 'VersatileCalculator', true);
  const shown = await chrome(page, 'VersatileCalculator', false);

  expect(hidden.titleRendered).toBe(false);
  expect(shown.titleRendered).toBe(true);
  expect(shown.entriesMarginTop).toBe('11.2px');
  expect(shown.gridTracks).toBe(2);
});
