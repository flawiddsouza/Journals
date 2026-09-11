import { expect, test } from '@playwright/test'

const fixture = {
    columns: [
        { name: 'month', label: 'Month', wrap: 'No' },
        { name: 'company', label: 'Company', wrap: 'No' },
        { name: 'notes', label: 'Notes' },
        { name: 'amount', label: 'Amount', wrap: 'No' },
    ],
    items: Array.from({ length: 80 }, (_, index) => ({
        month: `Month ${index + 1}`,
        company: 'Example Studios',
        notes: 'A longer note with several words that should wrap at a readable column width. '.repeat(
            3,
        ),
        amount: '1000',
    })),
    widths: { month: '120px', company: '120px' },
    rowStyle: "return 'background: azure'",
}

async function openTable(
    page,
    content = fixture,
    pageProps = {},
    pageActions = false,
) {
    await page.addInitScript(
        ({ content, pageProps }) => {
            window.tableFixture = content
            window.tablePageProps = pageProps
        },
        { content, pageProps },
    )
    await page.goto(
        `/tests/table/harness.html?fullPage${pageActions ? '&pageActions' : ''}`,
    )
    await expect(page.locator('.editable-table tbody tr')).toHaveCount(
        content.items.length > 250
            ? content.items.length % 250 || 250
            : content.items.length,
    )
    await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0)
}

for (const width of [360, 412, 768]) {
    test.describe(`touch table at ${width}px`, () => {
        test.use({
            viewport: { width, height: 820 },
            isMobile: true,
            hasTouch: true,
        })

        test('opens and exits configuration from page actions', async ({
            page,
        }) => {
            await openTable(page, fixture, {}, true)
            const actions = page.getByRole('button', {
                name: 'Page actions',
                exact: true,
            })
            await actions.tap()
            const configure = page.getByRole('button', {
                name: 'Configure Table',
                exact: true,
            })
            await expect(configure).toBeInViewport()
            await configure.tap()
            await expect(page.locator('.config-table')).toBeVisible()
            await expect(page.locator('.mobile-pagenav .menu')).toHaveCount(0)
            const column = page.locator('.config-table tbody tr').first()
            await column
                .getByRole('button', { name: 'Edit', exact: true })
                .tap()
            await column.locator('input').nth(1).fill('Pay month')
            await column
                .getByRole('button', { name: 'Update', exact: true })
                .tap()
            await expect
                .poll(() =>
                    page.evaluate(
                        () =>
                            window.tableSaves.at(-1)?.content.columns[0].label,
                    ),
                )
                .toBe('Pay month')
            await actions.tap()
            await expect(
                page.getByRole('button', { name: 'Stats', exact: true }),
            ).toHaveCount(0)
            await page
                .getByRole('button', {
                    name: 'Exit Configuration',
                    exact: true,
                })
                .tap()
            await expect(page.locator('.config-table')).toHaveCount(0)
            await expect(page.locator('.editable-table')).toBeVisible()
            await expect(
                page.locator('.editable-table thead th').first(),
            ).toHaveText('Pay month')
            await actions.tap()
            await expect(configure).toBeInViewport()
        })

        test('does not offer configuration for a read-only table', async ({
            page,
        }) => {
            await openTable(page, fixture, { view_only: true }, true)
            await page
                .getByRole('button', { name: 'Page actions', exact: true })
                .tap()
            await expect(
                page.getByRole('button', { name: 'Help', exact: true }),
            ).toBeVisible()
            await expect(
                page.getByRole('button', {
                    name: 'Configure Table',
                    exact: true,
                }),
            ).toHaveCount(0)
            await expect(
                page.getByRole('button', {
                    name: 'Exit Configuration',
                    exact: true,
                }),
            ).toHaveCount(0)
        })

        test('keeps headers visible, columns readable, and actions beside the data', async ({
            page,
        }) => {
            await openTable(page)
            const entries = page.locator('.journal-page-entries')
            await expect
                .poll(() => entries.evaluate((node) => node.scrollTop))
                .toBeGreaterThan(0)
            expect(await entries.evaluate((node) => node.scrollLeft)).toBe(0)
            expect(
                await page.evaluate(
                    () => document.activeElement.isContentEditable,
                ),
            ).toBe(false)

            const header = await page
                .locator('thead')
                .first()
                .locator('th')
                .first()
                .boundingBox()
            const bounds = await entries.boundingBox()
            expect(Math.abs(header.y - bounds.y)).toBeLessThan(2)
            const row = page.locator('tbody tr').last()
            expect((await row.boundingBox()).height).toBeLessThan(220)
            const actions = row.locator('.table-actions')
            const lastCell = row.locator('td').nth(3)
            const actionsBounds = await actions.boundingBox()
            const cellBounds = await lastCell.boundingBox()
            expect(actionsBounds.x).toBeGreaterThanOrEqual(
                cellBounds.x + cellBounds.width - 1,
            )

            await entries.evaluate((node) => {
                node.scrollLeft = node.scrollWidth
            })
            await expect(
                row.getByRole('button', { name: 'Insert row below' }),
            ).toBeInViewport()
            await row.getByRole('button', { name: 'Insert row below' }).tap()
            await expect(page.locator('tbody tr')).toHaveCount(81)
            const newCell = page
                .locator('tbody tr')
                .last()
                .locator('[contenteditable]')
                .first()
            await newCell.fill('New month')
            await expect
                .poll(() =>
                    page.evaluate(
                        () =>
                            window.tableSaves.at(-1)?.content.items.at(-1)
                                .month,
                    ),
                )
                .toBe('New month')
        })
    })
}

test.describe('mobile page state', () => {
    test.use({
        viewport: { width: 412, height: 820 },
        isMobile: true,
        hasTouch: true,
    })

    test('an offscreen comment does not stretch short cells into a screen-high blank row', async ({
        page,
    }) => {
        const columns = [
            ...Array.from({ length: 12 }, (_, index) => ({
                name: `value${index}`,
                label: `Value ${index}`,
                wrap: 'No',
            })),
            { name: 'comment', label: 'Comment' },
        ]
        const item = Object.fromEntries(
            columns.map((column) => [column.name, 'Example value']),
        )
        item.comment = 'A detailed comment with several words. '.repeat(12)
        await openTable(page, {
            ...fixture,
            columns,
            widths: {},
            items: [item, { ...item, comment: '' }],
        })
        const row = page.locator('tbody tr').first()
        expect((await row.boundingBox()).height).toBeLessThan(250)
        expect(
            (await row.locator('td').nth(12).boundingBox()).width,
        ).toBeGreaterThan(300)
        await page.screenshot({ path: 'test-results/table-mobile.png' })
    })

    test('keeps configured widths for wrapped columns', async ({ page }) => {
        await openTable(page, {
            ...fixture,
            items: fixture.items.slice(0, 2),
            widths: { ...fixture.widths, notes: '180px' },
        })
        expect(
            (
                await page
                    .locator('tbody tr')
                    .first()
                    .locator('td')
                    .nth(2)
                    .boundingBox()
            ).width,
        ).toBeCloseTo(180, 0)
    })

    test('restores vertical position after configuration and paging', async ({
        page,
    }) => {
        await openTable(page, {
            ...fixture,
            items: Array.from({ length: 520 }, (_, index) => ({
                ...fixture.items[0],
                month: `Month ${index}`,
            })),
        })
        const entries = page.locator('.journal-page-entries')
        await entries.evaluate((node) => {
            node.scrollTop = 300
        })
        await page.evaluate(() => window.tableHarness.configure())
        await expect(page.locator('.config-table')).toBeVisible()
        await page.evaluate(() => window.tableHarness.exitConfiguration())
        await expect
            .poll(() => entries.evaluate((node) => node.scrollTop))
            .toBe(300)
        await page.locator('.pager button').first().click()
        await expect(page.locator('.pager')).toContainText('Page 1 / 3')
        await page.locator('.pager button').last().click()
        await expect(page.locator('.pager')).toContainText('Page 3 / 3')
        await expect
            .poll(() => entries.evaluate((node) => node.scrollTop))
            .toBe(300)
    })

    test('read-only tables and hidden titles keep all columns reachable', async ({
        page,
    }) => {
        await openTable(
            page,
            { ...fixture, items: fixture.items.slice(0, 3) },
            { view_only: true, hide_title: true },
        )
        await expect(page.locator('.journal-page-title')).toHaveCount(0)
        await expect(page.locator('tbody [contenteditable]')).toHaveCount(0)
        await expect(page.locator('.table-actions')).toHaveCount(0)
        const entries = page.locator('.journal-page-entries')
        await entries.evaluate((node) => {
            node.scrollLeft = node.scrollWidth
        })
        await expect(
            page.locator('tbody tr').first().locator('td').last(),
        ).toBeInViewport()
    })

    test('read-only tables open at the start without moving focus', async ({
        page,
    }) => {
        await openTable(page, fixture, { view_only: true })
        expect(
            await page
                .locator('.journal-page-entries')
                .evaluate((node) => node.scrollTop),
        ).toBe(0)
        await expect(page.locator('tbody tr').first()).toBeInViewport()
        expect(
            await page.evaluate(() => document.activeElement.isContentEditable),
        ).toBe(false)
    })

    test('a last row taller than the screen opens at its beginning', async ({
        page,
    }) => {
        await openTable(page, {
            ...fixture,
            items: [
                ...fixture.items.slice(0, 3),
                { ...fixture.items[0], notes: 'A line<br>'.repeat(80) },
            ],
        })
        const header = await page.locator('thead th').first().boundingBox()
        const cell = await page
            .locator('tbody tr')
            .last()
            .locator('td div')
            .first()
            .boundingBox()
        expect(cell.y).toBeGreaterThanOrEqual(header.y + header.height - 1)
        expect(cell.y).toBeLessThan(header.y + header.height + 2)
    })

    test('pagination stays reachable while viewing the rightmost columns', async ({
        page,
    }) => {
        await openTable(page, {
            ...fixture,
            items: Array.from({ length: 500 }, (_, index) => ({
                ...fixture.items[0],
                month: `Month ${index}`,
            })),
        })
        const entries = page.locator('.journal-page-entries')
        await entries.evaluate((node) => {
            node.scrollLeft = node.scrollWidth
        })
        await expect(page.locator('.pager button').first()).toBeInViewport()
        await page.locator('.pager button').first().tap()
        await expect(page.locator('.pager')).toContainText('Page 1 / 2')
    })

    test('clearing a filter remains reachable on a wide table', async ({
        page,
    }) => {
        await openTable(page, {
            ...fixture,
            columns: fixture.columns.map((column) => ({
                ...column,
                filterable: 'Yes',
            })),
            items: fixture.items.slice(0, 2),
        })
        await page
            .getByRole('button', { name: 'Filter Month', exact: true })
            .tap()
        await page
            .getByRole('checkbox', { name: 'Month 1', exact: true })
            .check()
        await page.locator('.journal-page-title').tap()
        await expect(page.locator('.filter-clear')).toBeInViewport()
        await page.locator('.filter-clear').tap()
        await expect(page.locator('tbody tr')).toHaveCount(2)
    })

    test('history previews do not jump to the bottom on touch devices', async ({
        page,
    }) => {
        await page.addInitScript((value) => {
            window.tableFixture = value
        }, fixture)
        await page.goto('/tests/table/harness.html')
        await expect(
            page.locator('tbody [contenteditable]').first(),
        ).toBeVisible()
        await page.locator('#app').evaluate((node) => {
            node.style.height = '200px'
            node.style.overflow = 'auto'
            node.scrollTop = 0
        })
        await page.evaluate(
            (value) =>
                window.tableHarness.setProps({
                    pageContentOverride: JSON.stringify({
                        ...value,
                        totals: {},
                    }),
                }),
            fixture,
        )
        await expect(page.locator('tbody [contenteditable]')).toHaveCount(0)
        expect(
            await page.locator('#app').evaluate((node) => node.scrollTop),
        ).toBe(0)
    })
})
