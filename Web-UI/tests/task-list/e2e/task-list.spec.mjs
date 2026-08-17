import { expect, test } from '@playwright/test'

test('history content replaces the initial empty preview', async ({ page }) => {
    await page.goto('/tests/task-list/harness.html?mode=override')

    await expect(page.locator('.task-list-item')).toHaveCount(1)

    await page.evaluate(() => {
        window.taskListHarness.setContent({
            type: 'doc',
            content: [
                {
                    type: 'taskList',
                    content: [
                        {
                            type: 'taskItem',
                            attrs: { checked: true },
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [
                                        { type: 'text', text: 'Saved task' },
                                    ],
                                },
                            ],
                        },
                        {
                            type: 'taskItem',
                            attrs: { checked: false },
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [
                                        { type: 'text', text: 'Pending task' },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        })
    })

    await expect(page.locator('.task-list-item')).toHaveCount(2)
    await expect(page.locator('.task-list-count')).toHaveText('1 of 2 complete')
    await expect(page.getByText('Saved task', { exact: true })).toBeVisible()
    await expect(page.getByText('Pending task', { exact: true })).toBeVisible()
})

test('failed loading does not expose an editable empty list', async ({
    page,
}) => {
    await page.goto('/tests/task-list/harness.html?mode=error')

    await expect(page.getByRole('alert')).toHaveText(
        'Task list failed to load. Refresh the page to try again.',
    )
    await expect(page.locator('.task-list-editor')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add task' })).toHaveCount(0)
})

test('Enter keeps newly created empty tasks in view', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 420 })
    await page.goto('/tests/page-chrome/harness.html?type=TaskList')

    const editor = page.locator('.task-list-editor .ProseMirror')
    const editorScroller = page.locator('.task-list-editor')
    await editor.click()

    for (let index = 0; index < 30; index += 1) {
        await editor.press('Enter')
    }

    await expect(page.locator('.task-list-item')).toHaveCount(31)
    await expect
        .poll(() => editorScroller.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0)

    const caretIsVisible = await page.evaluate(() => {
        const selection = window.getSelection()
        const caret = selection.getRangeAt(0).getBoundingClientRect()
        return caret.top >= 0 && caret.bottom <= window.innerHeight
    })
    expect(caretIsVisible).toBe(true)
})

test('checkboxes and task spacing scale with the page font size', async ({
    page,
}) => {
    await page.goto('/tests/page-chrome/harness.html?type=TaskList&fontSize=14')

    const checkbox = page.locator('.task-list-item > label input')
    const task = page.locator('.task-list-item')
    const checkboxSizeDefault = await checkbox.boundingBox()
    const taskSizeDefault = await task.boundingBox()

    await page.goto('/tests/page-chrome/harness.html?type=TaskList&fontSize=28')

    const checkboxSizeLarge = await checkbox.boundingBox()
    const taskSizeLarge = await task.boundingBox()

    expect(checkboxSizeLarge.width / checkboxSizeDefault.width).toBeCloseTo(
        2,
        1,
    )
    expect(checkboxSizeLarge.height / checkboxSizeDefault.height).toBeCloseTo(
        2,
        1,
    )
    expect(taskSizeLarge.height).toBeGreaterThan(taskSizeDefault.height * 1.8)
})

test('nesting guides align with their parent checkbox centers', async ({
    page,
}) => {
    for (const fontSize of [14, 28]) {
        await page.goto(
            `/tests/page-chrome/harness.html?type=TaskList&fontSize=${fontSize}`,
        )

        const editor = page.locator('.task-list-editor .ProseMirror')
        await editor.click()
        await editor.type('Parent task')
        await editor.press('Enter')
        await editor.press('Tab')

        const guideAlignment = await page.evaluate(() => {
            const parentCheckbox = document.querySelector(
                '.task-list-item > label input',
            )
            const nestedList = document.querySelector(
                '.task-list-items .task-list-items',
            )
            const checkboxBounds = parentCheckbox.getBoundingClientRect()
            const nestedListBounds = nestedList.getBoundingClientRect()
            const guideStyles = getComputedStyle(nestedList, '::before')

            return {
                checkboxCenter: checkboxBounds.left + checkboxBounds.width / 2,
                guideCenter:
                    nestedListBounds.left +
                    Number.parseFloat(guideStyles.left) +
                    Number.parseFloat(guideStyles.width) / 2,
            }
        })

        expect(
            Math.abs(
                guideAlignment.guideCenter - guideAlignment.checkboxCenter,
            ),
        ).toBeLessThan(1)
    }
})

test('Backspace deletes an empty nested task', async ({ page }) => {
    await page.goto('/tests/page-chrome/harness.html?type=TaskList')

    const editor = page.locator('.task-list-editor .ProseMirror')
    const tasks = page.locator('.task-list-item')
    const tasksNested = page.locator('.task-list-item .task-list-item')
    await editor.click()
    await editor.type('Parent task')
    await editor.press('Enter')
    await editor.press('Tab')

    await expect(tasks).toHaveCount(2)
    await expect(tasksNested).toHaveCount(1)

    await editor.press('Backspace')

    await expect(tasks).toHaveCount(1)
    await expect(tasksNested).toHaveCount(0)
    await expect(editor).toBeFocused()
})

test('Shift+Tab still outdents an empty nested task', async ({ page }) => {
    await page.goto('/tests/page-chrome/harness.html?type=TaskList')

    const editor = page.locator('.task-list-editor .ProseMirror')
    const tasks = page.locator('.task-list-item')
    const tasksNested = page.locator('.task-list-item .task-list-item')
    await editor.click()
    await editor.type('Parent task')
    await editor.press('Enter')
    await editor.press('Tab')

    await editor.press('Shift+Tab')

    await expect(tasks).toHaveCount(2)
    await expect(tasksNested).toHaveCount(0)
    await expect(editor).toBeFocused()
})

test('Backspace deletes an empty task without moving following tasks', async ({
    page,
}) => {
    await page.goto('/tests/page-chrome/harness.html?type=TaskList')

    const editor = page.locator('.task-list-editor .ProseMirror')
    await editor.click()
    await editor.evaluate((element) => {
        const clipboardData = new DataTransfer()
        clipboardData.setData(
            'text/plain',
            'Root\n  Middle\n    Before\n    \n    After',
        )
        element.dispatchEvent(
            new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData,
            }),
        )
    })

    const tasks = page.locator('.task-list-item')
    const emptyTaskText = page
        .locator('.task-list-item p')
        .filter({ hasText: /^$/ })
    await expect(tasks).toHaveCount(5)
    await expect(emptyTaskText).toHaveCount(1)
    await emptyTaskText.evaluate((paragraph) => {
        const range = document.createRange()
        range.setStart(paragraph, 0)
        range.collapse(true)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        document.dispatchEvent(new Event('selectionchange'))
    })

    await page.keyboard.press('Backspace')
    await expect(tasks).toHaveCount(4)
    await expect(emptyTaskText).toHaveCount(0)
    await expect(page.getByText('Root', { exact: true })).toBeVisible()
    await expect(page.getByText('Middle', { exact: true })).toBeVisible()
    await expect(page.getByText('Before', { exact: true })).toBeVisible()
    await expect(page.getByText('After', { exact: true })).toBeVisible()
    await expect(page.locator('.task-list-item input')).toHaveCount(4)
    await expect(
        page.locator(
            '.ProseMirror > .task-list-items > .task-list-item > div > p',
        ),
    ).toHaveText(['Root'])
    await expect(page.locator('.task-list-items .task-list-items')).toHaveCount(
        2,
    )
})

test('Backspace at the start of a non-empty task does not merge tasks', async ({
    page,
}) => {
    await page.goto('/tests/page-chrome/harness.html?type=TaskList')

    const editor = page.locator('.task-list-editor .ProseMirror')
    await editor.click()
    await editor.type('First task')
    await editor.press('Enter')
    await editor.type('Second task')
    await editor.press('Home')
    await editor.press('Backspace')

    await expect(page.locator('.task-list-item')).toHaveCount(2)
    await expect(page.locator('.task-list-item > div > p')).toHaveText([
        'First task',
        'Second task',
    ])
})

test('Backspace at the start of a continuation line removes the line break', async ({
    page,
}) => {
    await page.goto('/tests/page-chrome/harness.html?type=TaskList')

    const editor = page.locator('.task-list-editor .ProseMirror')
    await editor.click()
    await editor.type('First line')
    await editor.press('Shift+Enter')
    await editor.type('Second line')
    await editor.press('Home')
    await editor.press('Backspace')

    await expect(page.locator('.task-list-item')).toHaveCount(1)
    await expect(page.locator('.task-list-item > div > p')).toHaveText(
        'First lineSecond line',
    )
    await expect(page.locator('.task-list-item br')).toHaveCount(0)
})

test('Backspace at the start of a second paragraph merges it with the first', async ({
    page,
}) => {
    await page.goto('/tests/page-chrome/harness.html?type=TaskList')

    const editor = page.locator('.task-list-editor .ProseMirror')
    await editor.click()
    await editor.evaluate((element) => {
        const clipboardData = new DataTransfer()
        clipboardData.setData('text/plain', 'First line Second line')
        clipboardData.setData(
            'text/html',
            '<p>First line</p><p>Second line</p>',
        )
        element.dispatchEvent(
            new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData,
            }),
        )
    })

    const paragraphs = page.locator('.task-list-item > div > p')
    await expect(paragraphs).toHaveCount(2)
    await paragraphs.nth(1).evaluate((paragraph) => {
        const range = document.createRange()
        range.setStart(paragraph, 0)
        range.collapse(true)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        document.dispatchEvent(new Event('selectionchange'))
    })
    await page.keyboard.press('Backspace')

    await expect(paragraphs).toHaveCount(1)
    await expect(paragraphs).toHaveText('First lineSecond line')
})

test('Enter before a second paragraph makes it the next task text', async ({
    page,
}) => {
    await page.goto('/tests/page-chrome/harness.html?type=TaskList')

    const editor = page.locator('.task-list-editor .ProseMirror')
    await editor.click()
    await editor.evaluate((element) => {
        const clipboardData = new DataTransfer()
        clipboardData.setData('text/plain', 'First line Second line')
        clipboardData.setData(
            'text/html',
            '<p>First line</p><p>Second line</p>',
        )
        element.dispatchEvent(
            new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData,
            }),
        )
    })

    const paragraphs = page.locator('.task-list-item > div > p')
    await expect(paragraphs).toHaveCount(2)
    await editor.press('Enter')
    await editor.type('Child task')
    await editor.press('Tab')

    await expect(page.locator('.task-list-item')).toHaveCount(2)
    await expect(paragraphs).toHaveCount(3)
    await paragraphs.nth(0).evaluate((paragraph) => {
        const range = document.createRange()
        range.selectNodeContents(paragraph)
        range.collapse(false)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        document.dispatchEvent(new Event('selectionchange'))
    })
    await page.keyboard.press('Enter')

    await expect(page.locator('.task-list-item')).toHaveCount(3)
    await expect(paragraphs).toHaveCount(3)
    await expect(paragraphs).toHaveText([
        'First line',
        'Second line',
        'Child task',
    ])
    await expect(page.locator('.task-list-item .task-list-item')).toHaveCount(1)
})

test('Backspace and Delete remove a selected task branch', async ({ page }) => {
    for (const deleteKey of ['Backspace', 'Delete']) {
        await page.goto('/tests/page-chrome/harness.html?type=TaskList')

        const editor = page.locator('.task-list-editor .ProseMirror')
        await editor.click()
        await editor.type('Parent task')
        await editor.press('Enter')
        await editor.type('Child task')
        await editor.press('Tab')
        await editor.press('Escape')
        await editor.press(deleteKey)

        await expect(page.locator('.task-list-item')).toHaveCount(1)
        await expect(
            page.getByText('Parent task', { exact: true }),
        ).toBeVisible()
        await expect(page.getByText('Child task', { exact: true })).toHaveCount(
            0,
        )
    }

    await page.goto('/tests/page-chrome/harness.html?type=TaskList')
    const editor = page.locator('.task-list-editor .ProseMirror')
    await editor.click()
    await editor.type('Only task')
    await editor.press('Escape')
    await editor.press('Delete')

    await expect(page.locator('.task-list-item')).toHaveCount(1)
    await expect(page.locator('.task-list-item > div > p')).toBeEmpty()
})

test('Backspace promotes children of an empty sole top-level task', async ({
    page,
}) => {
    await page.goto('/tests/page-chrome/harness.html?type=TaskList')

    const editor = page.locator('.task-list-editor .ProseMirror')
    await editor.click()
    await editor.press('Enter')
    await editor.type('Child task')
    await editor.press('Tab')

    const emptyTaskText = page
        .locator('.task-list-item > div > p')
        .filter({ hasText: /^$/ })
    await emptyTaskText.evaluate((paragraph) => {
        const range = document.createRange()
        range.setStart(paragraph, 0)
        range.collapse(true)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        document.dispatchEvent(new Event('selectionchange'))
    })
    await page.keyboard.press('Backspace')

    await expect(page.locator('.task-list-item')).toHaveCount(1)
    await expect(page.locator('.task-list-items .task-list-items')).toHaveCount(
        0,
    )
    await expect(page.getByText('Child task', { exact: true })).toBeVisible()
})

test('Enter creates tasks and Shift+Enter creates a line break', async ({
    page,
}) => {
    await page.goto('/tests/page-chrome/harness.html?type=TaskList')

    const editor = page.locator('.task-list-editor .ProseMirror')
    const tasks = page.locator('.task-list-item')
    await editor.click()
    await editor.type('First task')
    await editor.press('Enter')
    await editor.type('Second task')

    await expect(tasks).toHaveCount(2)

    await editor.press('Shift+Enter')
    await editor.type('Second line')

    await expect(tasks).toHaveCount(2)
    await expect(
        page.locator('.task-list-item', { hasText: 'Second taskSecond line' }),
    ).toHaveCount(1)
    await expect(page.locator('.task-list-item br')).toHaveCount(1)

    await editor.press('Enter')
    await editor.type('Third task')

    await expect(tasks).toHaveCount(3)

    await editor.press('Enter')
    await editor.press('Enter')

    await expect(tasks).toHaveCount(5)
    await expect(editor).toBeFocused()
})

test('Escape selects a task branch and the shortcut duplicates it', async ({
    page,
}) => {
    await page.goto('/tests/page-chrome/harness.html?type=TaskList')

    const editor = page.locator('.task-list-editor .ProseMirror')
    await editor.click()
    await editor.type('Parent task')
    await editor.press('Enter')
    await editor.type('Child task')
    await editor.press('Tab')
    await page.evaluate(() => {
        const paragraph = document.querySelector('.task-list-item > div > p')
        const range = document.createRange()
        range.setStart(paragraph.firstChild, 1)
        range.collapse(true)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        document.dispatchEvent(new Event('selectionchange'))
    })
    await page.keyboard.press('Escape')

    await expect(
        page.locator('.task-list-item.ProseMirror-selectednode'),
    ).toHaveCount(1)

    await page.keyboard.press('Control+Shift+d')

    await expect(page.locator('.task-list-item')).toHaveCount(4)
    await expect(page.locator('.task-list-items .task-list-items')).toHaveCount(
        2,
    )
    await expect(
        page
            .locator('.task-list-item > div > p')
            .filter({ hasText: /^Parent task$/ }),
    ).toHaveCount(2)
    await expect(
        page
            .locator('.task-list-item > div > p')
            .filter({ hasText: /^Child task$/ }),
    ).toHaveCount(2)
})

test('outline selection can complete a task or create its next sibling', async ({
    page,
}) => {
    await page.goto('/tests/page-chrome/harness.html?type=TaskList')

    const editor = page.locator('.task-list-editor .ProseMirror')
    await editor.click()
    await editor.type('Selected task')
    await editor.press('Escape')
    await editor.press(' ')

    await expect(page.locator('.task-list-count')).toHaveText('1 of 1 complete')
    await expect(page.locator('.task-list-item input')).toBeChecked()

    await editor.press('Enter')

    await expect(page.locator('.task-list-item')).toHaveCount(2)
    await expect(
        page.locator('.task-list-item.ProseMirror-selectednode'),
    ).toHaveCount(0)
    await expect(editor).toBeFocused()
})

test('Duplicate copies every sibling task covered by a text selection', async ({
    page,
}) => {
    await page.goto('/tests/page-chrome/harness.html?type=TaskList')

    const editor = page.locator('.task-list-editor .ProseMirror')
    await editor.click()
    await editor.type('First task')
    await editor.press('Enter')
    await editor.type('Second task')
    await editor.press('Enter')
    await editor.type('Third task')

    await page.evaluate(() => {
        const paragraphs = document.querySelectorAll('.task-list-item p')
        const range = document.createRange()
        range.setStart(paragraphs[0].firstChild, 0)
        range.setEnd(
            paragraphs[1].firstChild,
            paragraphs[1].firstChild.textContent.length,
        )
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        document.dispatchEvent(new Event('selectionchange'))
    })

    await page.getByRole('button', { name: 'Duplicate' }).click()

    await expect(page.locator('.task-list-item')).toHaveCount(5)
    await expect(
        page
            .locator('.task-list-item > div > p')
            .filter({ hasText: /^First task$/ }),
    ).toHaveCount(2)
    await expect(
        page
            .locator('.task-list-item > div > p')
            .filter({ hasText: /^Second task$/ }),
    ).toHaveCount(2)
    await expect(
        page
            .locator('.task-list-item > div > p')
            .filter({ hasText: /^Third task$/ }),
    ).toHaveCount(1)
})

test('several tasks can be pasted and duplicated together', async ({
    context,
    page,
}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/tests/page-chrome/harness.html?type=TaskList')

    const editor = page.locator('.task-list-editor .ProseMirror')
    await editor.click()
    await page.keyboard.type('Existing task')

    await editor.evaluate((element) => {
        const clipboardData = new DataTransfer()
        clipboardData.setData(
            'text/plain',
            '- [ ] First pasted task\n- [x] Second pasted task\n  - Nested task',
        )
        element.dispatchEvent(
            new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData,
            }),
        )
    })

    const tasks = page.locator('.task-list-item')
    await expect(tasks).toHaveCount(4)
    await expect(tasks.nth(1)).toContainText('First pasted task')
    await expect(tasks.nth(2)).toContainText('Second pasted task')
    await expect(tasks.nth(3)).toContainText('Nested task')
    await expect(page.locator('.task-list-item .task-list-item')).toHaveCount(1)
    await expect(page.locator('.task-list-items .task-list-items')).toHaveCount(
        1,
    )
    await expect(page.locator('.task-list-count')).toHaveText('1 of 4 complete')

    const nestedTask = page.locator('.task-list-item .task-list-item > div > p')
    await nestedTask.click()
    await editor.press('Tab')
    await expect(editor).toBeFocused()

    await editor.press('Control+a')
    await editor.press('Control+c')
    await page.getByRole('button', { name: 'Add task' }).click()
    await editor.press('Control+v')

    await expect(tasks).toHaveCount(9)
    await expect(
        page
            .locator('.task-list-item > div > p')
            .filter({ hasText: /^First pasted task$/ }),
    ).toHaveCount(2)
    await expect(page.locator('.task-list-count')).toHaveText('2 of 9 complete')
})
