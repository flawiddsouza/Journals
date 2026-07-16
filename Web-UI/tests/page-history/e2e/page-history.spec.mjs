import { expect, test } from '@playwright/test'

async function openHistory(page, query = '') {
    await page.goto(`/tests/page-history/harness.html${query}`)
    await page
        .getByRole('link', { name: 'History', exact: true })
        .first()
        .click()
    await expect(
        page.getByRole('heading', { name: 'Page History' }),
    ).toBeVisible()
}

test('keeps the full FlatPage layout around the changed block', async ({
    page,
}) => {
    await openHistory(page)
    await page.getByRole('button', { name: 'View' }).nth(0).click()

    const preview = page.locator('.flat-page-history-preview')
    const context = preview.locator(
        '.page-container > .flat-page-history-context-block',
    )
    await expect(context).toHaveCount(10)
    await expect(context).toHaveText([
        /^Context before 1 W+$/,
        'Context before 2',
        'Context before 3',
        'Context before 4',
        'Context before 5',
        'Context after 1',
        'Context after 2',
        'Context after 3',
        'Context after 4',
        'Context after 5',
    ])
    await expect(context.nth(0)).toHaveCSS('opacity', '0.55')
    await expect(preview.locator('[hidden]')).toHaveCount(0)
    await expect(preview.locator('.flat-page-history-context-gap')).toHaveCount(
        0,
    )
    await expect(preview.locator('.flat-page-history-removed-text')).toHaveText(
        'middle',
    )
    await expect(preview.locator('.flat-page-history-added-text')).toHaveText(
        'newest',
    )
    expect(await page.evaluate(() => window.pageHistoryRequests)).toEqual(
        expect.arrayContaining([
            '/page-history/content/3',
            '/page-history/content/2',
        ]),
    )
})

test('renders the decorated snapshot through FlatPage v1', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await openHistory(page)
    await page.getByRole('button', { name: 'View' }).nth(0).click()

    const preview = page.locator('.flat-page-history-preview')
    const pageContainer = preview.locator('.page-container.view-only')
    await expect(preview).not.toHaveAttribute('style')
    await expect(pageContainer).toHaveCount(1)
    await expect(pageContainer).toHaveCSS('font-size', '17px')
    await expect(pageContainer).toHaveCSS('font-family', 'monospace')
    await expect(
        pageContainer.locator(
            ':scope > section.snapshot-layout > p > .flat-page-history-added-text',
        ),
    ).toHaveText('newest')
    await expect
        .poll(() =>
            page
                .locator('.page-history-content')
                .evaluate((element) => element.scrollTop),
        )
        .toBeGreaterThan(0)
    await expect
        .poll(() =>
            page
                .locator('.page-history-content')
                .evaluate(
                    (element) => element.scrollWidth - element.clientWidth,
                ),
        )
        .toBeLessThanOrEqual(1)
})

test('renders all oldest-row HTML as new', async ({ page }) => {
    await openHistory(page)
    await page.getByRole('button', { name: 'View' }).nth(2).click()

    const preview = page.locator('.flat-page-history-preview')
    await expect(preview.locator('p')).toHaveCount(11)
    await expect(preview.locator('.flat-page-history-added-text')).toHaveCount(
        11,
    )
    await expect(
        preview.locator('.flat-page-history-added-block').first(),
    ).toHaveCSS('padding-left', '0px')
})

test('ignores a late response from an earlier selection', async ({ page }) => {
    await openHistory(page)
    await page.evaluate(() => {
        window.pageHistoryContentDelays[3] = 200
    })
    await page.getByRole('button', { name: 'View' }).nth(0).click()
    await page.getByRole('button', { name: 'View' }).nth(1).click()

    const preview = page.locator('.flat-page-history-preview')
    await expect(preview.locator('.flat-page-history-added-text')).toHaveText(
        'middle',
    )
    await expect(preview.locator('.flat-page-history-removed-text')).toHaveText(
        'oldest',
    )
    await page.waitForTimeout(250)
    await expect(preview).not.toContainText('newest')
})

test('FlatPage v2 highlights changes against the older snapshot', async ({
    page,
}) => {
    await openHistory(page, '?type=FlatPageV2')
    await page.getByRole('button', { name: 'View' }).nth(0).click()

    const preview = page.locator('.flat-page-history-preview')
    await expect(preview.locator('.flat-page-history-added-text')).toHaveText(
        'newest',
    )
    await expect(preview.locator('.flat-page-history-removed-text')).toHaveText(
        'middle',
    )
    expect(await page.evaluate(() => window.pageHistoryRequests)).toEqual(
        expect.arrayContaining([
            '/page-history/content/3',
            '/page-history/content/2',
        ]),
    )
})

test('FlatPage v2 renders its oldest snapshot as new', async ({ page }) => {
    await openHistory(page, '?type=FlatPageV2')
    await page.getByRole('button', { name: 'View' }).nth(2).click()

    const preview = page.locator('.flat-page-history-preview')
    await expect(preview.locator('.flat-page-history-added-text')).toHaveText(
        'Snapshot oldest',
    )
    const requests = await page.evaluate(() => window.pageHistoryRequests)
    expect(requests).toContain('/page-history/content/1')
    expect(requests).not.toContain('/page-history/content/0')
})

test('FlatPage v2 ignores a late response from an earlier selection', async ({
    page,
}) => {
    await openHistory(page, '?type=FlatPageV2')
    await page.evaluate(() => {
        window.pageHistoryContentDelays[3] = 200
    })
    await page.getByRole('button', { name: 'View' }).nth(0).click()
    await page.getByRole('button', { name: 'View' }).nth(1).click()

    const preview = page.locator('.flat-page-history-preview')
    await expect(preview.locator('.flat-page-history-added-text')).toHaveText(
        'middle',
    )
    await expect(preview.locator('.flat-page-history-removed-text')).toHaveText(
        'oldest',
    )
    await page.waitForTimeout(250)
    await expect(preview).not.toContainText('newest')
})
