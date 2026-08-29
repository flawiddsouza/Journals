import { expect, test } from '@playwright/test'

async function createBulletItems(page) {
    const editor = page.locator('.page-container .ProseMirror')
    await editor.click()
    await editor.type('- Parent')
    await editor.press('Enter')
    await editor.type('Child')
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
