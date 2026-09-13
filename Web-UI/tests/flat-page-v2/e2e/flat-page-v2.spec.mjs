import { expect, test } from '@playwright/test'

async function createBulletItems(page) {
    const editor = page.locator('.page-container .ProseMirror')
    await editor.click()
    await editor.type('- Parent')
    await editor.press('Enter')
    await editor.type('Child')
    return editor
}

async function createChecklistItem(page, text = 'First task') {
    const editor = page.locator('.page-container .ProseMirror')
    await editor.click()
    await editor.type(text)
    await editor.press('Control+Enter')
    return editor
}

async function placeCaretIn(page, text) {
    const target = page.getByText(text, { exact: true })
    await target.evaluate((element) => {
        const editor = element.closest('[contenteditable="true"]')
        const selection = window.getSelection()
        const range = document.createRange()

        editor.focus()
        range.selectNodeContents(element)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
    })
}

async function createEmbeddedTable(page) {
    const editor = page.locator('.page-container .ProseMirror')
    await editor.click()
    await editor.type('/table')
    await editor.press('Enter')
    return editor
}

test('Tab nests bullet items and Shift+Tab outdents them', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html')
    const editor = await createBulletItems(page)

    await editor.press('Tab')

    const nestedItems = page.locator('.ProseMirror ul ul > li')
    await expect(nestedItems).toHaveCount(1)
    await expect(nestedItems).toHaveText('Child')

    await editor.press('Shift+Tab')

    await expect(nestedItems).toHaveCount(0)
    await expect(page.locator('.ProseMirror > ul > li')).toHaveCount(2)
})

test('Tab still inserts four spaces outside a list', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html')
    const editor = page.locator('.page-container .ProseMirror')
    await editor.click()

    await editor.press('Tab')
    await editor.type('Indented paragraph')

    await expect
        .poll(() => editor.locator('div').first().textContent())
        .toBe('    Indented paragraph')
})

test('nested bullets are saved in the page document', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html')
    const editor = await createBulletItems(page)
    await editor.press('Tab')

    await expect
        .poll(() =>
            page.evaluate(() => window.flatPageV2Harness.getPageContentSaved()),
        )
        .not.toBeNull()

    const documentSaved = JSON.parse(
        await page.evaluate(() =>
            window.flatPageV2Harness.getPageContentSaved(),
        ),
    )
    const parentItem = documentSaved.content[0].content[0]

    expect(parentItem.content[1].type).toBe('bulletList')
    expect(parentItem.content[1].content[0].content[0].content[0].text).toBe(
        'Child',
    )
})

test('view-only pages render nested bullets', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html?viewOnly=1')

    await expect(
        page.locator('.page-container.view-only ul ul > li'),
    ).toHaveText('Child')
})

test('Ctrl+Enter creates and toggles a checklist item', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html')
    const editor = await createChecklistItem(page)
    const taskItem = page.locator('.ProseMirror .task-list-item')
    const checkbox = taskItem.locator('input[type="checkbox"]')

    await expect(taskItem).toHaveText('First task')
    await expect(checkbox).not.toBeChecked()

    await editor.press('Control+Enter')
    await expect(checkbox).toBeChecked()

    await editor.press('Control+Enter')
    await expect(checkbox).not.toBeChecked()
})

test('typing empty brackets starts a checklist item', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html')
    const editor = page.locator('.page-container .ProseMirror')
    await editor.click()

    await editor.type('[] First task')

    await expect(page.locator('.ProseMirror .task-list-item')).toHaveText(
        'First task',
    )
})

test('checklist items continue and nest with Enter and Tab', async ({
    page,
}) => {
    await page.goto('/tests/flat-page-v2/harness.html')
    const editor = await createChecklistItem(page, 'Parent task')

    await editor.press('Enter')
    await editor.type('Child task')
    await editor.press('Tab')

    const nestedItems = page.locator(
        '.ProseMirror .task-list-items .task-list-items > .task-list-item',
    )
    await expect(nestedItems).toHaveText('Child task')

    await editor.press('Shift+Tab')
    await expect(nestedItems).toHaveCount(0)
    await expect(
        page.locator('.ProseMirror > .task-list-items > li'),
    ).toHaveCount(2)
})

test('Tab nests across adjacent checklist blocks', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html?content=split-checklist')

    await placeCaretIn(page, 'Later task')
    await page.keyboard.press('Tab')

    const nestedItem = page.locator(
        '.ProseMirror > .task-list-items .task-list-items > .task-list-item',
    )
    await expect(nestedItem).toHaveText('Later task')
    await expect(page.locator('.ProseMirror > .task-list-items')).toHaveCount(1)
})

test('clicking a checkbox saves its checked state', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html')
    await createChecklistItem(page)

    await page.locator('.task-list-item input[type="checkbox"]').click()

    await expect
        .poll(async () => {
            const pageContentSaved = await page.evaluate(() =>
                window.flatPageV2Harness.getPageContentSaved(),
            )
            return pageContentSaved
                ? JSON.parse(pageContentSaved).content[0].content[0].attrs
                      .checked
                : null
        })
        .toBe(true)
})

test('Enter on an empty checklist item returns to a paragraph', async ({
    page,
}) => {
    await page.goto('/tests/flat-page-v2/harness.html')
    const editor = await createChecklistItem(page)

    await editor.press('Enter')
    await editor.press('Enter')
    await editor.type('Normal text')

    await expect(
        page.locator('.ProseMirror > .task-list-items > li'),
    ).toHaveCount(1)
    await expect(page.locator('.ProseMirror > div').last()).toHaveText(
        'Normal text',
    )
})

test('view-only checklist items keep their state and cannot be toggled', async ({
    page,
}) => {
    await page.goto(
        '/tests/flat-page-v2/harness.html?viewOnly=1&content=checklist',
    )
    const checkbox = page.locator(
        '.page-container.view-only .task-list-item input[type="checkbox"]',
    )

    await expect(
        page.getByText('Completed task', { exact: true }),
    ).toBeVisible()
    await expect(checkbox).toBeChecked()
    await expect(checkbox).toBeDisabled()
})

test('/table creates a three-column table and saves it', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html')
    await createEmbeddedTable(page)

    await expect(page.locator('.ProseMirror table')).toHaveCount(1)
    await expect(page.locator('.ProseMirror table tr')).toHaveCount(3)
    await expect(page.locator('.ProseMirror table th')).toHaveCount(3)

    await expect
        .poll(async () => {
            const pageContentSaved = await page.evaluate(() =>
                window.flatPageV2Harness.getPageContentSaved(),
            )
            return pageContentSaved
                ? JSON.parse(pageContentSaved).content[0].type
                : null
        })
        .toBe('table')
})

test('Tab from the final table cell adds a row', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html')
    await createEmbeddedTable(page)

    for (let cellIndex = 1; cellIndex < 10; cellIndex += 1) {
        await page.keyboard.press('Tab')
    }

    await expect(page.locator('.ProseMirror table tr')).toHaveCount(4)
})

test('table controls add columns and remove rows', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html')
    await createEmbeddedTable(page)

    const tableMenu = page.locator('.flat-table-menu')
    await expect(tableMenu).toBeVisible()
    await expect(
        tableMenu.getByRole('button', { name: 'Add column after' }),
    ).toHaveCount(0)

    await tableMenu.getByRole('button', { name: 'Table options' }).click()

    await tableMenu.getByRole('button', { name: 'Add column before' }).click()
    await expect(page.locator('.ProseMirror table th')).toHaveCount(4)

    await tableMenu.getByRole('button', { name: 'Add column after' }).click()
    await expect(page.locator('.ProseMirror table th')).toHaveCount(5)

    await tableMenu.getByRole('button', { name: 'Add row before' }).click()
    await expect(page.locator('.ProseMirror table tr')).toHaveCount(4)

    await tableMenu.getByRole('button', { name: 'Add row after' }).click()
    await expect(page.locator('.ProseMirror table tr')).toHaveCount(5)

    await tableMenu.getByRole('button', { name: 'Delete row' }).click()
    await expect(page.locator('.ProseMirror table tr')).toHaveCount(4)
})

test('Ctrl+Enter and Ctrl+Shift+Enter add and focus rows below and above', async ({
    page,
}) => {
    await page.goto('/tests/flat-page-v2/harness.html')
    const editor = await createEmbeddedTable(page)

    await editor.press('Control+Enter')
    await editor.type('Below row')

    await expect(page.locator('.ProseMirror table tr')).toHaveCount(4)
    await expect(
        page.locator('.ProseMirror table tr').nth(1).locator('th, td').first(),
    ).toHaveText('Below row')

    await editor.press('Control+Shift+Enter')
    await editor.type('Above row')

    await expect(page.locator('.ProseMirror table tr')).toHaveCount(5)
    await expect(
        page.locator('.ProseMirror table tr').nth(1).locator('th, td').first(),
    ).toHaveText('Above row')
    await expect(
        page.locator('.ProseMirror table tr').nth(2).locator('th, td').first(),
    ).toHaveText('Below row')
})

test('view-only pages render embedded tables', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html?viewOnly=1&content=table')

    const table = page.locator('.page-container.view-only table')
    await expect(table.locator('th')).toHaveText(['Name', 'Status'])
    await expect(table.locator('td')).toHaveText(['First item', 'Open'])
})

// Automatic table layout shares collapsed borders between columns, so
// rendered widths sit within a pixel of the saved width.
async function getWidth(locator) {
    return locator.evaluate((element) =>
        parseFloat(getComputedStyle(element).width),
    )
}

async function getSavedTable(page) {
    const pageContentSaved = await page.evaluate(() =>
        window.flatPageV2Harness.getPageContentSaved(),
    )
    return pageContentSaved ? JSON.parse(pageContentSaved).content[0] : null
}

test('Ctrl+; replaces the cell with the contents of the cell above', async ({
    page,
}) => {
    await page.goto('/tests/flat-page-v2/harness.html?content=table')
    await placeCaretIn(page, 'Open')

    await page.keyboard.press('Control+;')

    const cells = page.locator('.ProseMirror table tr').nth(1).locator('td')
    await expect(cells).toHaveText(['First item', 'Status'])

    await page.keyboard.type(' copy')
    await expect(cells.nth(1)).toHaveText('Status copy')

    await expect
        .poll(async () => {
            const table = await getSavedTable(page)
            return table?.content[1].content[1].content[0].content[0].text
        })
        .toBe('Status copy')
})

test('Ctrl+; does nothing in the first row', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html?content=table')
    await placeCaretIn(page, 'Status')

    await page.keyboard.press('Control+;')

    await expect(page.locator('.ProseMirror table th')).toHaveText([
        'Name',
        'Status',
    ])
})

test('Ctrl+A selects the cell text, then the whole table, then the page', async ({
    page,
}) => {
    await page.goto('/tests/flat-page-v2/harness.html?content=table')
    await placeCaretIn(page, 'First item')
    const selectedCells = page.locator('.ProseMirror .selectedCell')

    await page.keyboard.press('Control+a')
    await expect
        .poll(() => page.evaluate(() => window.getSelection().toString()))
        .toBe('First item')
    await expect(selectedCells).toHaveCount(0)

    await page.keyboard.press('Control+a')
    await expect(selectedCells).toHaveCount(4)

    await page.keyboard.press('Control+a')
    await expect(selectedCells).toHaveCount(0)
    await expect
        .poll(() => page.evaluate(() => window.getSelection().toString()))
        .toContain('Status')
})

test('Ctrl+A in an empty cell selects the whole table first', async ({
    page,
}) => {
    await page.goto('/tests/flat-page-v2/harness.html')
    await createEmbeddedTable(page)

    await page.keyboard.press('Control+a')
    await expect(page.locator('.ProseMirror .selectedCell')).toHaveCount(9)
})

test('triple-click selects the cell text rather than the cell', async ({
    page,
}) => {
    await page.goto('/tests/flat-page-v2/harness.html?content=table')

    await page.getByText('First item', { exact: true }).click({ clickCount: 3 })

    await expect
        .poll(() => page.evaluate(() => window.getSelection().toString()))
        .toBe('First item')
    await expect(page.locator('.ProseMirror .selectedCell')).toHaveCount(0)

    await page.keyboard.type('Replaced')
    await expect(page.locator('.ProseMirror table td').first()).toHaveText(
        'Replaced',
    )
})

test('selected cells look different from the header row', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html?content=table')

    const firstCell = page.getByText('First item', { exact: true })
    const secondCell = page.getByText('Open', { exact: true })
    const firstBox = await firstCell.boundingBox()
    const secondBox = await secondCell.boundingBox()

    await page.mouse.move(firstBox.x + 4, firstBox.y + 4)
    await page.mouse.down()
    await page.mouse.move(secondBox.x + 4, secondBox.y + 4, { steps: 4 })
    await page.mouse.up()

    const selectedCells = page.locator('.ProseMirror .selectedCell')
    await expect(selectedCells).toHaveCount(2)

    // The tint is a layer drawn over the cell, in the text-selection colour.
    const overlay = await page.evaluate(() =>
        getComputedStyle(
            document.querySelector('.ProseMirror .selectedCell'),
            '::after',
        ).backgroundColor,
    )
    expect(overlay).not.toBe('rgba(0, 0, 0, 0)')
    expect(overlay).not.toBe('transparent')
})

test('hovering the last column border shows no horizontal scrollbar', async ({
    page,
}) => {
    await page.goto('/tests/flat-page-v2/harness.html')
    await createEmbeddedTable(page)

    // A fresh table fills the page width, so anything sticking out of its
    // last column overflows the wrapper.
    const lastHeader = page.locator('.ProseMirror table th').last()
    const headerBox = await lastHeader.boundingBox()
    await page.mouse.move(
        headerBox.x + headerBox.width - 2,
        headerBox.y + headerBox.height / 2,
    )

    await expect(page.locator('.ProseMirror .column-resize-handle')).toHaveCount(
        3,
    )
    expect(
        await page.evaluate(() => {
            const wrapper = document.querySelector('.ProseMirror .tableWrapper')
            return wrapper.scrollWidth - wrapper.clientWidth
        }),
    ).toBe(0)
})

test('dragging a cell border resizes the column and saves its width', async ({
    page,
}) => {
    await page.goto('/tests/flat-page-v2/harness.html?content=table')

    const header = page.locator('.ProseMirror table th').first()
    const headerBox = await header.boundingBox()
    const borderX = headerBox.x + headerBox.width - 2
    const borderY = headerBox.y + headerBox.height / 2

    await page.mouse.move(borderX, borderY)
    await page.mouse.down()
    await page.mouse.move(borderX + 60, borderY, { steps: 6 })
    await page.mouse.up()

    await expect
        .poll(async () => (await header.boundingBox()).width)
        .toBeGreaterThan(headerBox.width + 40)

    await expect
        .poll(async () => {
            const table = await getSavedTable(page)
            return table?.content[0].content[0].attrs.colwidth?.[0]
        })
        .toBeGreaterThan(220)
})

test('saved column widths render in edit and view-only modes', async ({
    page,
}) => {
    await page.goto('/tests/flat-page-v2/harness.html?content=table')
    await expect
        .poll(() => getWidth(page.locator('.ProseMirror table col').first()))
        .toBeCloseTo(180, -1)

    await page.goto('/tests/flat-page-v2/harness.html?viewOnly=1&content=table')
    const viewOnlyTable = page.locator('.page-container.view-only table')
    await expect
        .poll(() => getWidth(viewOnlyTable.locator('col').first()))
        .toBeCloseTo(180, -1)
    await expect(
        page.locator('.page-container.view-only .tableWrapper'),
    ).toHaveCSS('overflow-x', 'auto')
})

test('double-clicking a cell border returns that column to auto width', async ({
    page,
}) => {
    await page.goto('/tests/flat-page-v2/harness.html?content=table')

    const header = page.locator('.ProseMirror table th').first()
    await expect.poll(() => getWidth(header)).toBeCloseTo(180, -1)
    const headerBox = await header.boundingBox()

    await page.mouse.dblclick(
        headerBox.x + headerBox.width - 2,
        headerBox.y + headerBox.height / 2,
    )

    const columns = page.locator('.ProseMirror table col')
    await expect.poll(() => getWidth(columns.first())).toBeGreaterThan(200)
    await expect.poll(() => getWidth(columns.nth(1))).toBeCloseTo(120, -1)

    await expect
        .poll(async () => {
            const table = await getSavedTable(page)
            return table?.content[0].content.map((cell) => cell.attrs.colwidth)
        })
        .toEqual([null, [120]])
})

test('Auto width in the table controls resets only the current column', async ({
    page,
}) => {
    await page.goto('/tests/flat-page-v2/harness.html?content=table')
    await placeCaretIn(page, 'First item')

    const tableMenu = page.locator('.flat-table-menu')
    await tableMenu.getByRole('button', { name: 'Table options' }).click()
    await tableMenu.getByRole('button', { name: 'Auto column width' }).click()

    await expect
        .poll(async () => {
            const table = await getSavedTable(page)
            return table?.content.flatMap((row) =>
                row.content.map((cell) => cell.attrs.colwidth),
            )
        })
        .toEqual([null, [120], null, [120]])
})

test('alignment buttons align the current column and save it', async ({
    page,
}) => {
    await page.goto('/tests/flat-page-v2/harness.html?content=table')
    await placeCaretIn(page, 'First item')

    const tableMenu = page.locator('.flat-table-menu')
    await tableMenu.getByRole('button', { name: 'Table options' }).click()

    const rightButton = tableMenu.getByRole('button', {
        name: 'Align column right',
    })
    await expect(rightButton).toHaveAttribute('aria-pressed', 'false')
    await rightButton.click()

    await expect(rightButton).toHaveAttribute('aria-pressed', 'true')
    const firstColumnCells = page.locator(
        '.ProseMirror table tr > :first-child',
    )
    await expect(firstColumnCells).toHaveCount(2)
    for (const cell of await firstColumnCells.all()) {
        await expect(cell).toHaveCSS('text-align', 'right')
    }
    await expect(page.locator('.ProseMirror table th').nth(1)).toHaveCSS(
        'text-align',
        'right',
    )

    await tableMenu.getByRole('button', { name: 'Align column center' }).click()
    await expect(firstColumnCells.first()).toHaveCSS('text-align', 'center')

    await expect
        .poll(async () => {
            const table = await getSavedTable(page)
            return table?.content.map((row) => row.content[0].attrs.align)
        })
        .toEqual(['center', 'center'])
})

test('No wrap keeps the current column on one line and scrolls the table', async ({
    page,
}) => {
    await page.setViewportSize({ width: 500, height: 600 })
    await page.goto('/tests/flat-page-v2/harness.html?content=table')
    await placeCaretIn(page, 'First item')

    const tableMenu = page.locator('.flat-table-menu')
    await tableMenu.getByRole('button', { name: 'Table options' }).click()
    const noWrapButton = tableMenu.getByRole('button', {
        name: 'Column no wrap',
    })
    await expect(noWrapButton).toHaveAttribute('aria-pressed', 'false')
    await noWrapButton.click()
    await expect(noWrapButton).toHaveAttribute('aria-pressed', 'true')

    const cell = page.locator('.ProseMirror table td').first()
    const singleLineHeight = (await cell.boundingBox()).height
    await page.keyboard.type(
        ' with a lot more words that would normally wrap onto several lines',
    )

    await expect(cell).toHaveCSS('white-space', 'nowrap')
    expect((await cell.boundingBox()).height).toBe(singleLineHeight)
    await expect
        .poll(() =>
            page.evaluate(() => {
                const wrapper = document.querySelector('.ProseMirror .tableWrapper')
                return wrapper.scrollWidth > wrapper.clientWidth
            }),
        )
        .toBe(true)

    await noWrapButton.click()
    await expect(noWrapButton).toHaveAttribute('aria-pressed', 'false')
    await expect(cell).not.toHaveCSS('white-space', 'nowrap')

    await expect
        .poll(async () => {
            const table = await getSavedTable(page)
            return table?.content.map((row) => row.content[0].attrs.nowrap)
        })
        .toEqual([false, false])
})

test('view-only pages keep column alignment and no wrap', async ({ page }) => {
    await page.goto('/tests/flat-page-v2/harness.html?viewOnly=1&content=table')

    const statusHeader = page.locator('.page-container.view-only th').nth(1)
    await expect(statusHeader).toHaveCSS('text-align', 'right')
    await expect(statusHeader).toHaveCSS('white-space', 'nowrap')
    await expect(page.locator('.page-container.view-only th').first()).toHaveCSS(
        'text-align',
        'left',
    )
})
