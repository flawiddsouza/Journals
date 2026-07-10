import { test, expect } from '@playwright/test';

// Journals splits page types into two families:
//
//   * content pages (FlatPage, Table, ...) sit inside the app's chrome -- an
//     editable title bar, and padding between the sidebar and the content.
//   * embedded apps (Spreadsheet, DrawIO, MiniApp, Kanban) run edge to edge:
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
