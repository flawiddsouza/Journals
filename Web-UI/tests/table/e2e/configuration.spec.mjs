import { expect, test } from '@playwright/test'
import { baseURL } from '../../../config.js'

const content = {
    columns: [
        { name: 'value', label: 'Value', type: '' },
        {
            name: 'long_column_name_'.repeat(5),
            label: 'A long column label that should wrap on a phone',
            type: 'Computed',
            expression: "return 'computed'",
        },
    ],
    items: [{ value: 'A' }, { value: 'B' }],
    totals: {},
    widths: {},
    rowStyle: '',
    startupScript: '',
    customFunctions: '// ' + 'long_code_'.repeat(60),
    note: '<p>' + 'long_note_'.repeat(30) + '</p>',
}

const button = (page, name) => page.getByRole('button', { name, exact: true })
const textbox = (page, name) => page.getByRole('textbox', { name, exact: true })

// The app's own dialog (helpers/dialogs.js), answered by one of its buttons.
async function answerDialog(page, buttonName, message = null) {
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    if (message) await expect(dialog).toContainText(message)
    await dialog.getByRole('button', { name: buttonName, exact: true }).tap()
    await expect(dialog).toBeHidden()
}

async function openConfiguration(page, pageContent = content) {
    const saves = []
    await page.addInitScript(() => {
        localStorage.setItem('token', 'standalone-table-test')
        window.clipboardText = ''
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: async (text) => {
                    window.clipboardText = text
                },
                readText: async () => window.clipboardText,
            },
        })
    })
    await page.route(`${baseURL}/**`, async (route) => {
        const request = route.request()
        const pathname = new URL(request.url()).pathname
        let response = {}
        if (pathname === '/pages/info/42') {
            response = {
                id: 42,
                name: 'Standalone table test',
                type: 'Table',
                created_at: '2026-09-12 12:00:00',
                locked: false,
                view_only: false,
                parent_view_only: false,
                hide_title: false,
            }
        } else if (pathname === '/pages/content/42') {
            response = { content: JSON.stringify(pageContent) }
        }
        if (request.method() === 'PUT') {
            saves.push(JSON.parse(request.postDataJSON().pageContent))
        }
        await route.fulfill({ json: response })
    })
    // Exercise the real standalone entry point and Frame2.
    await page.goto('/page/42')
    await expect(page.locator('.editable-table tbody tr')).toHaveCount(
        pageContent.items.length,
    )
    if (page.viewportSize().width <= 1000) {
        await button(page, 'Page actions').tap()
        await button(page, 'Configure Table').tap()
    } else {
        await page
            .getByRole('link', { name: 'Configure Table', exact: true })
            .click()
    }
    await expect(page.locator('.config-table')).toBeVisible()
    return saves
}

async function expectNoPageOverflow(page) {
    await expect
        .poll(() =>
            page
                .locator('.journal-page-entries')
                .evaluate((node) => node.scrollWidth - node.clientWidth),
        )
        .toBeLessThanOrEqual(1)
    expect(
        await page.evaluate(
            () =>
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
        ),
    ).toBeLessThanOrEqual(1)
}

for (const width of [320, 360, 412, 768]) {
    test.describe(`standalone configuration at ${width}px`, () => {
        test.use({
            viewport: { width, height: 820 },
            isMobile: true,
            hasTouch: true,
        })

        test('fits toolbar, cards, editors, and edit/add forms without sideways scrolling', async ({
            page,
        }) => {
            const saves = await openConfiguration(page)
            await expectNoPageOverflow(page)
            const copy = await button(page, 'Copy Configuration').boundingBox()
            const paste = await button(
                page,
                'Paste Configuration',
            ).boundingBox()
            const table = await page.locator('.config-table').boundingBox()
            expect(copy.height).toBeGreaterThanOrEqual(44)
            expect(paste.height).toBeGreaterThanOrEqual(44)
            expect(
                copy.x + copy.width <= paste.x + 1 ||
                    copy.y + copy.height <= paste.y + 1,
            ).toBe(true)
            expect(table.y).toBeGreaterThanOrEqual(
                Math.max(copy.y + copy.height, paste.y + paste.height),
            )

            await page.locator('.config-area-note summary').tap()
            await expectNoPageOverflow(page)

            const row = page.locator('.config-table tbody tr').first()
            await button(row, 'Edit').tap()
            await expect(textbox(row, 'Name')).toHaveValue('value')
            await textbox(row, 'Label').fill('Renamed value')
            await row
                .getByRole('combobox', { name: 'Align', exact: true })
                .selectOption('Center')
            await expectNoPageOverflow(page)
            await button(row, 'Update').tap()
            await expect
                .poll(() => saves.at(-1)?.columns[0].label)
                .toBe('Renamed value')
            expect(saves.at(-1).columns[0].align).toBe('Center')

            await button(page, 'Add Column').tap()
            const added = page.locator('.config-table tbody tr').last()
            await textbox(added, 'Name').fill('extra')
            await textbox(added, 'Label').fill('Extra column')
            await added
                .getByRole('combobox', { name: 'Type', exact: true })
                .selectOption('Input (Plain Text)')
            await expectNoPageOverflow(page)
            await button(added, 'Add').tap()
            await expect
                .poll(() => saves.at(-1)?.columns.at(-1)?.name)
                .toBe('extra')
            await expectNoPageOverflow(page)
            await button(page, 'Page actions').tap()
            await button(page, 'Exit Configuration').tap()
            await expect(
                page.locator('.editable-table thead th').first(),
            ).toHaveText('Renamed value')
        })
    })
}

test.describe('standalone configuration actions', () => {
    test.use({
        viewport: { width: 360, height: 820 },
        isMobile: true,
        hasTouch: true,
    })

    test('opens configuration at the top and restores a long table on exit', async ({
        page,
    }) => {
        const columns = Array.from({ length: 12 }, (_, index) => ({
            name: `column${index}`,
            label: `Column ${index}`,
            type: '',
        }))
        await openConfiguration(page, {
            ...content,
            columns,
            items: Array.from({ length: 100 }, (_, index) =>
                Object.fromEntries(
                    columns.map(({ name }) => [name, `Row ${index}`]),
                ),
            ),
        })
        await button(page, 'Page actions').tap()
        await button(page, 'Exit Configuration').tap()
        const entries = page.locator('.journal-page-entries')
        await entries.evaluate((node) => {
            node.scrollTop = node.scrollHeight
        })
        const savedScrollTop = await entries.evaluate((node) => node.scrollTop)
        expect(savedScrollTop).toBeGreaterThan(1000)

        await button(page, 'Page actions').tap()
        await button(page, 'Configure Table').tap()
        await expect(button(page, 'Copy Configuration')).toBeInViewport()
        await expect(
            page.locator('.config-table tbody tr').first(),
        ).toBeInViewport()
        await button(page, 'Copy Configuration').tap()
        await answerDialog(page, 'OK', 'Configuration copied to clipboard')
        await expect
            .poll(() =>
                page.evaluate(
                    () => JSON.parse(window.clipboardText).columns.length,
                ),
            )
            .toBe(12)

        await button(page, 'Page actions').tap()
        await button(page, 'Exit Configuration').tap()
        await expect
            .poll(() => entries.evaluate((node) => node.scrollTop))
            .toBeCloseTo(savedScrollTop, 0)
        await expect(page.locator('.editable-table tbody tr')).toHaveCount(100)
    })

    test('copy/paste, cancel, reorder, and confirmed delete work in cards', async ({
        page,
    }) => {
        const saves = await openConfiguration(page)
        await button(page, 'Copy Configuration').tap()
        await answerDialog(page, 'OK', 'Configuration copied to clipboard')
        await expect
            .poll(() =>
                page.evaluate(
                    () => JSON.parse(window.clipboardText).columns.length,
                ),
            )
            .toBe(2)
        await page.evaluate(() => {
            const copied = JSON.parse(window.clipboardText)
            copied.columns[0].label = 'Pasted value'
            window.clipboardText = JSON.stringify(copied)
        })
        await button(page, 'Paste Configuration').tap()
        await answerDialog(page, 'Cancel')
        const row = page.locator('.config-table tbody tr').first()
        await expect(row.locator('[data-label="Label"]')).toHaveText('Value')
        await button(page, 'Paste Configuration').tap()
        await answerDialog(page, 'Paste')
        await expect(row.locator('[data-label="Label"]')).toHaveText(
            'Pasted value',
        )
        await button(row, 'Edit').tap()
        await textbox(row, 'Label').fill('Discard this')
        await button(row, 'Cancel').tap()
        await expect(row.locator('[data-label="Label"]')).toHaveText(
            'Pasted value',
        )
        await button(row, 'Move Down').tap()
        await expect.poll(() => saves.at(-1)?.columns[1].name).toBe('value')
        const last = page.locator('.config-table tbody tr').last()
        await button(last, 'Move Up').tap()
        await expect.poll(() => saves.at(-1)?.columns[0].name).toBe('value')
        await button(last, 'Delete').tap()
        await answerDialog(page, 'Cancel')
        await expect(page.locator('.config-table tbody tr')).toHaveCount(2)
        await button(last, 'Delete').tap()
        await answerDialog(page, 'Delete')
        await expect(page.locator('.config-table tbody tr')).toHaveCount(1)
        await expectNoPageOverflow(page)
    })
})

test('desktop keeps the column grid and separates the toolbar from the rows', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openConfiguration(page)
    expect(
        await page
            .locator('.config-table')
            .evaluate((node) => getComputedStyle(node).display),
    ).toBe('table')
    const copy = await button(page, 'Copy Configuration').boundingBox()
    const paste = await button(page, 'Paste Configuration').boundingBox()
    const addColumn = await button(page, 'Add Column').boundingBox()
    expect(copy.height).toBeCloseTo(addColumn.height, 0)
    expect(paste.height).toBeCloseTo(addColumn.height, 0)
    const table = await page.locator('.config-table').boundingBox()
    expect(table.y).toBeGreaterThanOrEqual(copy.y + copy.height)
    await page
        .getByRole('link', { name: 'Exit Configuration', exact: true })
        .click()
    await expect(page.locator('.editable-table')).toBeVisible()
})
