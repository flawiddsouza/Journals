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

    const laterTask = page.getByText('Later task', { exact: true })
    await laterTask.evaluate((element) => {
        const editor = element.closest('[contenteditable="true"]')
        const selection = window.getSelection()
        const range = document.createRange()

        editor.focus()
        range.selectNodeContents(element)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
    })
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
