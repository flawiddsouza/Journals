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

const IMAGE_SOURCE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="teal"/></svg>')}`
const IMAGE_PAGE = `<div>Before</div><div><img style="max-width: 100%" loading="lazy" src="${IMAGE_SOURCE}"></div><div>After</div>`

// Along the image's slant: it is twice as wide as it is tall.
async function dragHandle(page, distance) {
    const box = await page.getByRole('button', { name: 'Resize image' }).boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + distance, box.y + box.height / 2 + distance / 2, { steps: 4 })
    await page.mouse.up()
}

test('an image shows no resize controls until it is clicked, and they close on a press elsewhere and on Escape', async ({ page }) => {
    const { editor } = await openPage(page, IMAGE_PAGE)
    const handle = page.getByRole('button', { name: 'Resize image' })
    await expect(handle).toHaveCount(0)

    await editor.locator('img').click()
    await expect(handle).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(handle).toHaveCount(0)

    await editor.locator('img').click()
    await expect(handle).toBeVisible()
    await editor.getByText('After').click()
    await expect(handle).toHaveCount(0)
})

test('dragging the handle resizes the image, keeps its shape and lines, saves, and Ctrl+Z takes it back', async ({ page }) => {
    const { editor, saves } = await openPage(page, IMAGE_PAGE)
    const image = editor.locator('img')
    await image.click()
    await dragHandle(page, 100)

    await expect(image).toHaveAttribute('width', '300')
    expect(await image.evaluate((img) => img.getBoundingClientRect().height)).toBe(150)
    await expect.poll(() => saves.at(-1)).toContain('width="300"')
    expect(saves.at(-1)).toContain('<div>Before</div><div><img')
    expect(saves.at(-1)).toContain('width="300"></div><div>After</div>')
    // The controls moved to the image now on the page.
    await expect(page.getByRole('button', { name: 'Reset size' })).toBeVisible()

    await page.keyboard.press('Control+z')
    await expect(image).not.toHaveAttribute('width')
    await expect.poll(() => saves.at(-1)).not.toContain('width=')
})

test('the resize controls stay out of the page content, with them open and after a save', async ({ page }) => {
    const { editor, saves } = await openPage(page, IMAGE_PAGE)
    await editor.locator('img').click()
    await dragHandle(page, 100)
    await expect(page.getByRole('button', { name: 'Reset size' })).toBeVisible()

    await expect(editor.locator('button, .image-resizer')).toHaveCount(0)
    await expect.poll(() => saves.at(-1)).toContain('width="300"')
    expect(saves.at(-1)).not.toContain('image-resizer')
    expect(saves.at(-1)).not.toContain('<button')

    // Still true for a save that happens while they are open.
    await editor.getByText('After').click()
    await page.keyboard.type('!')
    await editor.locator('img').click()
    await expect(page.getByRole('button', { name: 'Reset size' })).toBeVisible()
    await editor.evaluate((element) => element.dispatchEvent(new Event('input', { bubbles: true })))
    await page.waitForTimeout(600)
    expect(saves.at(-1)).not.toContain('image-resizer')
    expect(saves.at(-1)).not.toContain('<button')
})

test('Reset size and a double-click on the handle give an image back its own size', async ({ page }) => {
    const { editor, saves } = await openPage(page, IMAGE_PAGE.replace('"></div>', '" width="300"></div>'))
    const image = editor.locator('img')
    await image.click()
    await page.getByRole('button', { name: 'Reset size' }).click()
    await expect(image).not.toHaveAttribute('width')
    await expect.poll(() => saves.at(-1)).not.toContain('width=')
    await expect(page.getByRole('button', { name: 'Reset size' })).toHaveCount(0)

    await dragHandle(page, 50)
    await expect(image).toHaveAttribute('width', '250')
    await page.getByRole('button', { name: 'Resize image' }).dblclick()
    await expect(image).not.toHaveAttribute('width')
})

test('an image cannot be dragged wider than the page, and Escape during a drag changes nothing', async ({ page }) => {
    const { editor, saves } = await openPage(page, IMAGE_PAGE)
    const image = editor.locator('img')
    await image.click()
    await dragHandle(page, 5000)
    const pageWidth = await editor.evaluate((element) => element.clientWidth)
    await expect(image).toHaveAttribute('width', String(pageWidth))
    await expect.poll(() => saves.length).toBe(1)

    const box = await page.getByRole('button', { name: 'Resize image' }).boundingBox()
    await page.mouse.move(box.x + 2, box.y + 2)
    await page.mouse.down()
    await page.mouse.move(box.x - 100, box.y + 2, { steps: 3 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(image).toHaveAttribute('width', String(pageWidth))
    await page.waitForTimeout(600)
    expect(saves.length).toBe(1)
})

test('a save during a drag keeps the width the image had, and the image follows the drag without changing', async ({ page }) => {
    const { editor, saves } = await openPage(page, IMAGE_PAGE)
    const image = editor.locator('img')
    await image.click()

    const box = await page.getByRole('button', { name: 'Resize image' }).boundingBox()
    await page.mouse.move(box.x + 2, box.y + 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 102, box.y + 52, { steps: 3 })
    await expect.poll(() => image.evaluate((img) => img.getBoundingClientRect().width)).toBe(300)
    expect(await image.evaluate((img) => img.getBoundingClientRect().height)).toBe(150)

    // What an upload finishing elsewhere on the page does.
    await editor.evaluate((element) => element.dispatchEvent(new Event('input', { bubbles: true })))
    await expect.poll(() => saves.length).toBe(1)
    expect(saves[0]).not.toContain('width=')

    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect.poll(() => image.evaluate((img) => img.getBoundingClientRect().width)).toBe(200)
    await expect(image).not.toHaveAttribute('width')
})

test('the handle stays under the pointer along the image slant, and a drag straight down resizes too', async ({ page }) => {
    const { editor } = await openPage(page, IMAGE_PAGE)
    const image = editor.locator('img')
    await image.click()

    const handle = page.getByRole('button', { name: 'Resize image' })
    const start = await handle.boundingBox()
    const x = start.x + start.width / 2
    const y = start.y + start.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 100, y + 50, { steps: 4 })
    await expect.poll(async () => {
        const box = await handle.boundingBox()
        return Math.hypot(box.x + box.width / 2 - (x + 100), box.y + box.height / 2 - (y + 50))
    }).toBeLessThan(2)

    // The nearest the corner of a 2:1 image can get to a point straight below it.
    await page.mouse.move(x, y + 100, { steps: 4 })
    await expect.poll(() => image.evaluate((img) => img.getBoundingClientRect().width)).toBe(240)
    await page.mouse.up()
    await expect(image).toHaveAttribute('width', '240')
})

test('a drag that changes nothing on screen keeps the saved width', async ({ page }) => {
    // Wider than the page, so max-width holds it and it cannot grow.
    const { editor, saves } = await openPage(page, IMAGE_PAGE.replace('"></div>', '" width="5000"></div>'))
    const image = editor.locator('img')
    await image.click()
    await dragHandle(page, 50)
    await page.waitForTimeout(600)
    await expect(image).toHaveAttribute('width', '5000')
    expect(saves.length).toBe(0)
})

test('a broken image offers no resize controls', async ({ page }) => {
    const { editor } = await openPage(page, '<div>Before</div><div><img style="max-width: 100%" src="data:image/png;base64,broken"></div>')
    const image = editor.locator('img')
    await expect.poll(() => image.evaluate((img) => img.complete)).toBe(true)
    await image.click()
    await expect(page.getByRole('button', { name: 'Resize image' })).toHaveCount(0)
})
