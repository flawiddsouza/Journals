import { expect, test } from '@playwright/test'

async function openTable(page, fixture = {}) {
    await page.addInitScript((value) => {
        window.tableFixture = value
    }, fixture)
    await page.goto('/tests/table/harness.html')
    const cells = page.locator('tbody [contenteditable]')
    await expect(cells.first()).toBeVisible()
    return cells
}

async function savedValues(page, values) {
    await expect
        .poll(() =>
            page.evaluate(() =>
                window.tableSaves.at(-1)?.content.items.map((row) => row.value),
            ),
        )
        .toEqual(values)
}

async function caret(cell) {
    return cell.evaluate((node) => {
        const selection = document.getSelection()
        return {
            focused: document.activeElement === node,
            anchor: selection.anchorOffset,
            focus: selection.focusOffset,
            text: selection.toString(),
        }
    })
}

test('groups typing, restores the caret, redoes, and discards redo after a new edit', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.nth(1).press('End')
    await page.keyboard.type('hello')
    await page.keyboard.press('Control+z')
    await expect(cells).toHaveText(['A', 'B', 'C'])
    expect(await caret(cells.nth(1))).toMatchObject({
        focused: true,
        anchor: 1,
        focus: 1,
    })
    await page.keyboard.press('Control+Shift+z')
    await expect(cells.nth(1)).toHaveText('Bhello')
    expect(await caret(cells.nth(1))).toMatchObject({ anchor: 6, focus: 6 })
    await page.keyboard.press('Control+z')
    await page.keyboard.type('other')
    await page.keyboard.press('Control+y')
    await expect(cells).toHaveText(['A', 'Bother', 'C'])
    await savedValues(page, ['A', 'Bother', 'C'])
})

for (const autocomplete of ['Yes', 'No']) {
    for (const cleared of [false, true]) {
        test(`cat bat uses word undo and restores the caret, autocomplete=${autocomplete}, cleared=${cleared}`, async ({ page }) => {
            const cells = await openTable(page, {
                columns: [{ name: 'value', label: 'Value', type: '', autocomplete }],
                items: [{ value: cleared ? 'old' : '' }],
            })
            await cells.first().press('End')
            if (cleared) {
                await page.keyboard.press('Control+a')
                await page.keyboard.press('Backspace')
            }
            await page.keyboard.type('cat bat')
            await page.keyboard.press('Control+z')
            await expect(cells.first()).toHaveText('cat')
            expect(await caret(cells.first())).toMatchObject({ anchor: 3, focus: 3 })
            await page.keyboard.press('Control+z')
            await expect(cells.first()).toHaveText('')
            expect(await caret(cells.first())).toMatchObject({ anchor: 0, focus: 0 })
            await page.keyboard.press('Control+y')
            await expect(cells.first()).toHaveText('cat')
            expect(await caret(cells.first())).toMatchObject({ anchor: 3, focus: 3 })
            await page.keyboard.press('Control+y')
            await expect(cells.first()).toHaveText('cat bat')
            expect(await caret(cells.first())).toMatchObject({ anchor: 7, focus: 7 })
            await savedValues(page, ['cat bat'])
        })
    }
}

test('a pause does not split a word', async ({ page }) => {
    const cells = await openTable(page, {
        columns: [{ name: 'value', label: 'Value', type: '' }],
    })
    await cells.last().press('End')
    await page.keyboard.type('hel')
    // Deliberately exceeds the removed one-second grouping heuristic.
    await page.waitForTimeout(1200)
    await page.keyboard.type('lo')
    await page.keyboard.press('Control+z')
    await expect(cells.last()).toHaveText('C')
    await page.keyboard.press('Control+y')
    await expect(cells.last()).toHaveText('Chello')
})

test('typing a replacement restores the original selection in one undo', async ({ page }) => {
    const cells = await openTable(page)
    await cells.last().press('Control+a')
    await page.keyboard.type('new')
    await page.keyboard.press('Control+z')
    await expect(cells.last()).toHaveText('C')
    expect(await caret(cells.last())).toMatchObject({ text: 'C' })
    await page.keyboard.press('Control+y')
    await expect(cells.last()).toHaveText('new')
})

test('typing after backspace has a separate undo step', async ({ page }) => {
    const cells = await openTable(page, { items: [{ value: 'abc' }] })
    await cells.first().press('End')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('xy')
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveText('ab')
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveText('abc')
    await page.keyboard.press('Control+y')
    await page.keyboard.press('Control+y')
    await expect(cells.first()).toHaveText('abxy')
})

test('multiple spaces form a separate step and moving the caret starts a new edit', async ({ page }) => {
    const cells = await openTable(page, { items: [{ value: '' }] })
    await cells.first().press('End')
    await page.keyboard.type('ab  cd')
    await page.keyboard.press('Control+z')
    expect(await cells.first().textContent()).toMatch(/^ab[\s\u00a0]{2}$/)
    expect(await caret(cells.first())).toMatchObject({ anchor: 4 })
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveText('ab')
    expect(await caret(cells.first())).toMatchObject({ anchor: 2 })
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.type('X')
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveText('ab')
    expect(await caret(cells.first())).toMatchObject({ anchor: 1, focus: 1 })
    await page.keyboard.press('Control+y')
    await expect(cells.first()).toHaveText('aXb')
    expect(await caret(cells.first())).toMatchObject({ anchor: 2, focus: 2 })
})

test('typing undoes before an older deletion, then both redo in order', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.nth(1).press('Control+Delete')
    await expect(cells).toHaveText(['A', 'C'])
    await cells.first().press('End')
    await page.keyboard.type('new')
    await page.keyboard.press('Control+z')
    await expect(cells).toHaveText(['A', 'C'])
    await page.keyboard.press('Control+z')
    await expect(cells).toHaveText(['A', 'B', 'C'])
    await page.keyboard.press('Control+y')
    await page.keyboard.press('Control+y')
    await expect(cells).toHaveText(['Anew', 'C'])
    await savedValues(page, ['Anew', 'C'])
})

test('redo does not restore a deleted row unless that deletion was undone', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.nth(1).press('Control+Delete')
    await page.keyboard.press('Control+Shift+z')
    await expect(cells).toHaveText(['A', 'C'])
})

test('deleting the final row is one reversible action and leaves a usable cell', async ({
    page,
}) => {
    const cells = await openTable(page, { items: [{ value: 'only row' }] })
    await cells.first().press('Control+Delete')
    await expect(cells).toHaveText([''])
    await page.keyboard.press('Control+z')
    await expect(cells).toHaveText(['only row'])
    await page.keyboard.press('Control+z')
    await expect(cells).toHaveText(['only row'])
    await page.keyboard.press('Control+y')
    await expect(cells).toHaveText([''])
    await page.keyboard.type('replacement')
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    await expect(cells).toHaveText(['only row'])
    await savedValues(page, ['only row'])
})

test('restoring a deleted row preserves an existing empty row', async ({
    page,
}) => {
    const cells = await openTable(page, {
        items: [{ value: 'A' }, { value: '' }],
    })
    await cells.first().press('Control+Delete')
    await page.keyboard.press('Control+z')
    await expect(cells).toHaveText(['A', ''])
})

test('inserting above preserves cell identity and reverses before earlier text edits', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.nth(1).press('End')
    await page.keyboard.type('new')
    await cells.nth(1).press('Control+Shift+Enter')
    await expect(cells).toHaveText(['A', '', 'Bnew', 'C'])
    await page.keyboard.press('Control+z')
    await expect(cells).toHaveText(['A', 'Bnew', 'C'])
    await page.keyboard.press('Control+z')
    await expect(cells).toHaveText(['A', 'B', 'C'])
    await page.keyboard.press('Control+y')
    await page.keyboard.press('Control+y')
    await expect(cells).toHaveText(['A', '', 'Bnew', 'C'])
})

test('delete then insert elsewhere restores the original row order', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.nth(1).press('Control+Delete')
    await cells.first().press('Control+Shift+Enter')
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    await expect(cells).toHaveText(['A', 'B', 'C'])
})

test('cell changes, caret movement, and backspacing split typing groups', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.first().press('End')
    await page.keyboard.type('ab')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.type('X')
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveText('Aab')
    expect(await caret(cells.first())).toMatchObject({ anchor: 2 })
    await cells.nth(1).press('End')
    await page.keyboard.type('cd')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Control+z')
    await expect(cells.nth(1)).toHaveText('Bcd')
    await page.keyboard.press('Control+z')
    await expect(cells.nth(1)).toHaveText('B')
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveText('A')
    expect(await caret(cells.first())).toMatchObject({ focused: true })
})

test('replacing a backward selection restores its direction and text on undo', async ({
    page,
}) => {
    const cells = await openTable(page, { items: [{ value: 'abcdef' }] })
    await cells.first().focus()
    await cells
        .first()
        .evaluate((node) =>
            document
                .getSelection()
                .setBaseAndExtent(node.firstChild, 5, node.firstChild, 2),
        )
    await page.keyboard.type('X')
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveText('abcdef')
    expect(await caret(cells.first())).toMatchObject({
        anchor: 5,
        focus: 2,
        text: 'cde',
    })
    await page.keyboard.press('Control+y')
    await expect(cells.first()).toHaveText('abXf')
    expect(await caret(cells.first())).toMatchObject({ anchor: 3, focus: 3 })
})

test('paste is a separate step from typing before and after it', async ({
    page,
    context,
}) => {
    const cells = await openTable(page)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.evaluate(() => navigator.clipboard.writeText('pasted'))
    await cells.first().press('End')
    await page.keyboard.type('typed')
    await page.keyboard.press('Control+v')
    await page.keyboard.type('after')
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveText('Atypedpasted')
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveText('Atyped')
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveText('A')
})

test('rich text formatting and HTML survive undo and redo', async ({
    page,
}) => {
    const cells = await openTable(page, { items: [{ value: 'hello world' }] })
    await cells.first().focus()
    await cells
        .first()
        .evaluate((node) =>
            document
                .getSelection()
                .setBaseAndExtent(node.firstChild, 6, node.firstChild, 11),
        )
    await page.keyboard.press('Control+b')
    await expect(cells.first().locator('b, strong')).toHaveText('world')
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveJSProperty('innerHTML', 'hello world')
    expect(await caret(cells.first())).toMatchObject({ text: 'world' })
    await page.keyboard.press('Control+y')
    await expect(cells.first().locator('b, strong')).toHaveText('world')
})

test('autocomplete is reversible and preserves literal angle brackets', async ({
    page,
}) => {
    const cells = await openTable(page, {
        items: [{ value: 'alpha &lt;beta&gt;' }, { value: '' }],
    })
    await cells.nth(1).focus()
    await page.keyboard.type('alp')
    await page.locator('.suggestions li').first().click()
    await expect(cells.nth(1)).toHaveText('alpha <beta>')
    await page.keyboard.press('Control+z')
    await expect(cells.nth(1)).toHaveText('alp')
    expect(await caret(cells.nth(1))).toMatchObject({ anchor: 3, focus: 3 })
    await page.keyboard.press('Control+y')
    await expect(cells.nth(1)).toHaveText('alpha <beta>')
    await savedValues(page, ['alpha &lt;beta&gt;', 'alpha &lt;beta&gt;'])
})

test('browser history input events use table history and cannot revive stale native edits', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.first().press('End')
    await page.keyboard.type('new')
    const historyEvent = (type) =>
        cells.first().evaluate(
            (node, inputType) =>
                node.dispatchEvent(
                    new InputEvent('beforeinput', {
                        inputType,
                        bubbles: true,
                        cancelable: true,
                    }),
                ),
            type,
        )
    expect(await historyEvent('historyUndo')).toBe(false)
    await expect(cells.first()).toHaveText('A')
    expect(await historyEvent('historyRedo')).toBe(false)
    await expect(cells.first()).toHaveText('Anew')
    await historyEvent('historyUndo')
    await historyEvent('historyUndo')
    await expect(cells.first()).toHaveText('A')
})

test('IME composition records the committed text as one undo step', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.first().press('End')
    const session = await page.context().newCDPSession(page)
    await session.send('Input.imeSetComposition', {
        text: 'に',
        selectionStart: 1,
        selectionEnd: 1,
    })
    await session.send('Input.imeSetComposition', {
        text: '日本',
        selectionStart: 2,
        selectionEnd: 2,
    })
    await session.send('Input.insertText', { text: '日本' })
    await expect(cells.first()).toHaveText('A日本')
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveText('A')
    await page.keyboard.press('Control+y')
    await expect(cells.first()).toHaveText('A日本')
})

test('page navigation clears history and pending saves retain their original page', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.first().press('End')
    await page.keyboard.type('old page')
    await page.evaluate(() => window.tableHarness.setProps({ pageId: 43 }))
    await expect(cells).toHaveText(['A', 'B', 'C'])
    await cells.first().press('Control+z')
    await expect(cells).toHaveText(['A', 'B', 'C'])
    await expect
        .poll(() => page.evaluate(() => window.tableSaves))
        .toEqual([
            expect.objectContaining({
                pathname: '/pages/42',
                content: expect.objectContaining({
                    items: [
                        { value: 'Aold page' },
                        { value: 'B' },
                        { value: 'C' },
                    ],
                }),
            }),
        ])
})

test('undo returns to the edited row on a different pagination page', async ({
    page,
}) => {
    const cells = await openTable(page, {
        items: Array.from({ length: 251 }, (_, index) => ({
            value: String(index),
        })),
    })
    await expect(cells).toHaveText(['250'])
    await cells.first().press('End')
    await page.keyboard.type('new')
    await page.locator('.pager button').first().click()
    await expect(cells).toHaveCount(250)
    await cells.first().press('Control+z')
    await expect(cells).toHaveText(['250'])
    expect(await caret(cells.first())).toMatchObject({
        focused: true,
        anchor: 3,
    })
})

test('editing a filtered row keeps undo reachable and preserves the filter', async ({
    page,
}) => {
    const cells = await openTable(page, {
        items: [{ value: 'hidden' }, { value: 'alpha' }, { value: 'alphabet' }],
    })
    await page.locator('.filter-btn').click()
    await page.getByRole('checkbox', { name: 'alpha', exact: true }).check()
    await page.locator('.col-label').click()
    await expect(cells).toHaveText(['alpha'])
    await cells.first().press('End')
    await page.keyboard.press('Backspace')
    // The edited row no longer matches the filter. Undo must still work.
    await expect(page.locator('.editable-table')).toBeFocused()
    await page.keyboard.press('Control+z')
    await expect(cells).toHaveText(['alpha'])
    await expect(page.locator('.filter-btn--active')).toHaveCount(1)
    await savedValues(page, ['hidden', 'alpha', 'alphabet'])
})

test('column renames clear old row history and new edits undo under the new name', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.nth(1).press('Control+Delete')
    await page.evaluate(() => window.tableHarness.configure())
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.locator('.config-table input').first().fill('renamed')
    await page.getByRole('button', { name: 'Update', exact: true }).click()
    await page.evaluate(() => window.tableHarness.exitConfiguration())
    await cells.first().press('Control+z')
    await expect(cells).toHaveText(['A', 'C'])
    await cells.first().press('End')
    await page.keyboard.type('new')
    await page.keyboard.press('Control+z')
    await expect(cells).toHaveText(['A', 'C'])
    await expect
        .poll(() =>
            page.evaluate(() => window.tableSaves.at(-1)?.content.items),
        )
        .toEqual([{ renamed: 'A' }, { renamed: 'C' }])
})

test('the note keeps native undo and opening configuration alone preserves table history', async ({
    page,
}) => {
    const cells = await openTable(page, { note: 'note' })
    await cells.first().press('End')
    await page.keyboard.type('new')
    await page.evaluate(() => window.tableHarness.configure())
    const note = page.locator('.config-area-font-size > [contenteditable]')
    await note.press('End')
    await page.keyboard.type('text')
    await page.keyboard.press('Control+z')
    await expect(note).toHaveText('note')
    await page.evaluate(() => window.tableHarness.exitConfiguration())
    await cells.first().press('Control+z')
    await expect(cells).toHaveText(['A', 'B', 'C'])
})

test('read-only previews cannot replay history or save preview content', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.first().press('End')
    await page.keyboard.type('new')
    await savedValues(page, ['Anew', 'B', 'C'])
    await page.evaluate(() => {
        window.tableSaves = []
        window.tableHarness.setProps({
            viewOnly: true,
            pageContentOverride: JSON.stringify({
                columns: [{ name: 'value', label: 'Value' }],
                items: [{ value: 'preview' }],
                totals: {},
                widths: {},
            }),
        })
    })
    await expect(cells).toHaveCount(0)
    await page.locator('.editable-table').press('Control+z')
    await expect(page.locator('tbody td').first()).toHaveText('preview')
    await page.waitForTimeout(600)
    expect(await page.evaluate(() => window.tableSaves)).toEqual([])
})

test('rapid page switches save both pages under their own IDs', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.first().press('End')
    await page.keyboard.type('first')
    await page.evaluate(() => window.tableHarness.setProps({ pageId: 43 }))
    await expect(cells).toHaveText(['A', 'B', 'C'])
    await cells.first().press('End')
    await page.keyboard.type('second')
    await expect
        .poll(() =>
            page.evaluate(() =>
                window.tableSaves.map((save) => [
                    save.pathname,
                    save.content.items[0].value,
                ]),
            ),
        )
        .toEqual([
            ['/pages/42', 'Afirst'],
            ['/pages/43', 'Asecond'],
        ])
})

test('computed cells and totals recalculate after undo and redo', async ({
    page,
}) => {
    const cells = await openTable(page, {
        columns: [
            { name: 'value', label: 'Value', type: '' },
            {
                name: 'double',
                label: 'Double',
                type: 'Computed',
                expression: 'return Number(item.value) * 2',
            },
        ],
        items: [{ value: '2' }],
        totals: {
            value: 'return items.reduce((sum, row) => sum + Number(row.value), 0)',
        },
    })
    await cells.first().press('End')
    await page.keyboard.type('0')
    await expect(page.locator('tbody td').nth(1)).toHaveText('40')
    await page.keyboard.press('Control+z')
    await expect(page.locator('tbody td').nth(1)).toHaveText('4')
    await expect(page.locator('.editable-table > tr th').first()).toHaveText(
        '2',
    )
    await page.keyboard.press('Control+y')
    await expect(page.locator('tbody td').nth(1)).toHaveText('40')
    await expect(page.locator('.editable-table > tr th').first()).toHaveText(
        '20',
    )
})

test('plain-text cells keep multiline paste and cut reversible', async ({
    page,
    context,
}) => {
    const cells = await openTable(page, {
        columns: [
            { name: 'value', label: 'Value', type: 'Input (Plain Text)' },
        ],
    })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.evaluate(() => navigator.clipboard.writeText('one\ntwo'))
    await cells.first().press('End')
    await page.keyboard.press('Control+v')
    const pasted = await cells.first().innerHTML()
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveText('A')
    await page.keyboard.press('Control+y')
    await expect(cells.first()).toHaveJSProperty('innerHTML', pasted)
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+x')
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveJSProperty('innerHTML', pasted)
})

test('native undo commands cannot apply their DOM change outside table history', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.first().press('End')
    await page.keyboard.type('new')
    await page.evaluate(() => document.execCommand('undo'))
    await expect(cells.first()).toHaveText('A')
    await cells.first().press('Meta+Shift+z')
    await expect(cells.first()).toHaveText('Anew')
    await cells.first().press('Meta+z')
    await expect(cells.first()).toHaveText('A')
    await savedValues(page, ['A', 'B', 'C'])
})

test('image-only cells are preserved when focus leaves and their insertion is reversible', async ({
    page,
}) => {
    const cells = await openTable(page, {
        items: [{ value: '' }, { value: 'B' }],
    })
    await cells.first().focus()
    await page.evaluate(() =>
        document.execCommand(
            'insertHTML',
            false,
            '<img alt="test image" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">',
        ),
    )
    await cells.nth(1).focus()
    await expect(cells.first().locator('img')).toHaveCount(1)
    await page.keyboard.press('Control+z')
    await expect(cells.first()).toHaveJSProperty('innerHTML', '')
    await page.keyboard.press('Control+y')
    await expect(cells.first().locator('img')).toHaveCount(1)
})

test('undo restores pagination after deleting the only row on the last page', async ({
    page,
}) => {
    const cells = await openTable(page, {
        items: Array.from({ length: 251 }, (_, index) => ({
            value: String(index),
        })),
    })
    await expect(cells).toHaveText(['250'])
    await cells.first().press('Control+Delete')
    await expect(cells).toHaveCount(250)
    await page.keyboard.press('Control+z')
    await expect(cells).toHaveText(['250'])
    await expect(page.locator('.pager')).toContainText('Page 2 / 2')
    await page.keyboard.press('Control+y')
    await expect(cells).toHaveCount(250)
})

test('non-cancelable native history input cannot save its stale DOM mutation', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.first().press('End')
    await page.keyboard.type('new')
    await cells.first().evaluate((node) => {
        node.dispatchEvent(
            new InputEvent('beforeinput', {
                inputType: 'historyUndo',
                bubbles: true,
            }),
        )
        node.innerHTML = 'stale native value'
        node.dispatchEvent(
            new InputEvent('input', {
                inputType: 'historyUndo',
                bubbles: true,
            }),
        )
    })
    await expect(cells).toHaveText(['A', 'B', 'C'])
    await savedValues(page, ['A', 'B', 'C'])
})

test('changing a column label preserves compatible undo history', async ({
    page,
}) => {
    const cells = await openTable(page)
    await cells.first().press('End')
    await page.keyboard.type('new')
    await page.evaluate(() => window.tableHarness.configure())
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.locator('.config-table input').nth(1).fill('New label')
    await page.getByRole('button', { name: 'Update', exact: true }).click()
    await page.evaluate(() => window.tableHarness.exitConfiguration())
    await cells.first().press('Control+z')
    await expect(cells).toHaveText(['A', 'B', 'C'])
    await expect(page.locator('.col-label')).toHaveText('New label')
})

test('undo reveals a cell outside the horizontal viewport', async ({
    page,
}) => {
    const cells = await openTable(page, {
        columns: [
            { name: 'value', label: 'Value' },
            { name: 'other', label: 'Other' },
        ],
        items: [{ value: 'A', other: 'B' }],
        widths: { value: '140px', other: '140px' },
    })
    await page.locator('#app').evaluate((node) => {
        node.style.width = '180px'
        node.style.overflow = 'auto'
    })
    await cells.nth(1).press('End')
    await page.keyboard.type('new')
    await cells.first().focus()
    await page.locator('#app').evaluate((node) => {
        node.scrollLeft = 0
    })
    await page.keyboard.press('Control+z')
    await expect(cells.nth(1)).toHaveText('B')
    await expect
        .poll(() =>
            page.locator('#app').evaluate((node) => node.scrollLeft),
        )
        .toBeGreaterThan(0)
})

test('closing a table invalidates a pending load', async ({ page }) => {
    await openTable(page)
    await page.evaluate(() => {
        const fetchOriginal = window.fetch
        window.tablePageFixtures = {
            43: {
                columns: [{ name: 'value', label: 'Value' }],
                items: [{ value: 'late' }],
                totals: {},
                widths: {},
                startupScript: 'window.lateStartupRan = true',
            },
        }
        window.fetch = async (...args) => {
            const response = await fetchOriginal(...args)
            if (String(args[0]).endsWith('/pages/content/43')) {
                await new Promise((resolve) => {
                    window.releaseTableLoad = resolve
                })
            }
            return response
        }
        window.tableHarness.setProps({ pageId: 43 })
    })
    await expect
        .poll(() => page.evaluate(() => typeof window.releaseTableLoad))
        .toBe('function')
    await page.evaluate(async () => {
        window.tableHarness.destroy()
        window.releaseTableLoad()
        await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(await page.evaluate(() => window.lateStartupRan)).toBeUndefined()
})

test('a slow earlier save cannot overwrite a later undo', async ({ page }) => {
    const cells = await openTable(page)
    await page.evaluate(() => {
        const fetchOriginal = window.fetch
        window.fetch = async (...args) => {
            if (
                args[1]?.method === 'PUT' &&
                JSON.parse(JSON.parse(args[1].body).pageContent).items[0]
                    .value === 'Anew'
            ) {
                await new Promise((resolve) => {
                    window.releaseTableSave = resolve
                })
            }
            return fetchOriginal(...args)
        }
    })
    await cells.first().press('End')
    await page.keyboard.type('new')
    await expect
        .poll(() => page.evaluate(() => typeof window.releaseTableSave))
        .toBe('function')
    await page.keyboard.press('Control+z')
    // Let the undo's debounce expire while the earlier request is still held.
    await page.waitForTimeout(650)
    await page.evaluate(() => window.releaseTableSave())
    await expect
        .poll(() => page.evaluate(() => window.tableSaves.length))
        .toBe(2)
    await savedValues(page, ['A', 'B', 'C'])
})
