import { expect, test } from '@playwright/test'
import { baseURL } from '../../../config.js'

// Answers the page's API calls and keeps what it saves.
async function openPage(page, content) {
    const saves = []
    await page.route(`${baseURL}/**`, async (route) => {
        const request = route.request()
        if (request.method() === 'PUT') {
            saves.push(request.postDataJSON().pageContent)
            return route.fulfill({ json: { success: true, revision: `r${saves.length + 1}` } })
        }
        return route.fulfill({ json: { content, revision: 'r1' } })
    })
    await page.goto('/tests/flat-page/harness.html')
    const editor = page.locator('.page-container[contenteditable]')
    await expect(editor).toContainText('Before')
    return { editor, saves }
}

// The app's own dialog (helpers/dialogs.js), answered by one of its buttons.
async function answerDialog(page, buttonName) {
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: buttonName, exact: true }).click()
    await expect(dialog).toBeHidden()
}

async function paste(editor, data) {
    await editor.evaluate((element, pasted) => {
        const clipboardData = new DataTransfer()
        for (const [type, value] of Object.entries(pasted)) clipboardData.setData(type, value)
        element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
    }, data)
}

test('pasting text with links asks first, and Convert makes them links at the caret and saves', async ({ page }) => {
    const { editor, saves } = await openPage(page, '<div>Before:</div>')
    await paste(editor, { 'text/plain': 'see https://example.com now' })
    await answerDialog(page, 'Convert')
    await expect(editor.locator('a[href="https://example.com"]')).toHaveText('https://example.com')
    await expect(editor).toHaveText('Before:see https://example.com now')
    await expect.poll(() => saves.at(-1)).toContain('<a href="https://example.com"')
    // The caret is back in the page, after what was pasted.
    await page.keyboard.type(' after')
    await expect(editor).toHaveText('Before:see https://example.com now after')
})

test('choosing Paste as is pastes the plain text once, at the caret', async ({ page }) => {
    const { editor, saves } = await openPage(page, '<div>Before:</div>')
    await paste(editor, { 'text/plain': 'see https://example.com now' })
    await answerDialog(page, 'Paste as is')
    await expect(editor.locator('a')).toHaveCount(0)
    await expect(editor).toHaveText('Before:see https://example.com now')
    await expect.poll(() => saves.at(-1)).toContain('see https://example.com now')
})

test('choosing Paste as is keeps the formatting a copied fragment came with', async ({ page }) => {
    const { editor } = await openPage(page, '<div>Before:</div>')
    await paste(editor, {
        'text/plain': 'bold https://example.com',
        'text/html': '<html><body><!--StartFragment--><b>bold</b> https://example.com<!--EndFragment--></body></html>',
    })
    await answerDialog(page, 'Paste as is')
    await expect(editor.locator('b')).toHaveText('bold')
    await expect(editor).toHaveText('Before:bold https://example.com')
})

test('Ctrl+K asks for a link and wraps the selected text', async ({ page }) => {
    const { editor, saves } = await openPage(page, '<div>Before the docs</div>')
    await page.keyboard.press('Shift+Control+ArrowLeft')
    await page.keyboard.press('Control+k')
    await page.getByRole('alertdialog').getByRole('textbox').fill('https://example.com/docs')
    await answerDialog(page, 'OK')
    await expect(editor.locator('a[href="https://example.com/docs"]')).toHaveText('docs')
    await expect.poll(() => saves.at(-1)).toContain('href="https://example.com/docs"')
})
