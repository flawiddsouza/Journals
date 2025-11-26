import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { setupTable, createBasicTableConfig } from './helpers/table-test-helpers'

const baseConfig = createBasicTableConfig()

test('bold text and undo/redo preserves formatting', async () => {
    await setupTable(baseConfig)

    // Get first cell (Task column)
    const firstCell = document.querySelector('tbody tr:first-child td:nth-child(1) div[contenteditable]') as HTMLElement

    // Focus and clear existing content
    firstCell.focus()
    await userEvent.keyboard('{Control>}a{/Control}')
    await userEvent.keyboard('abc')

    // Get cell content helper function
    function getCellContent() {
        return {
            text: firstCell.textContent || '',
            html: firstCell.innerHTML || ''
        }
    }

    const afterTyping = getCellContent()
    console.log('After typing abc:', afterTyping.text)

    // Blur to save the "abc" text change first, so formatting is a separate operation
    await userEvent.keyboard('{Tab}')
    await new Promise(resolve => setTimeout(resolve, 200))

    // Focus back into the cell
    firstCell.focus()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Select the 'b' character
    await userEvent.keyboard('{Home}') // Go to start
    await userEvent.keyboard('{ArrowRight}') // Move to after 'a'
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}') // Select 'b'

    // Bold the 'b' using Ctrl+B
    await userEvent.keyboard('{Control>}b{/Control}')
    await new Promise(resolve => setTimeout(resolve, 100))

    const afterBold = getCellContent()
    console.log('After bolding b, innerHTML:', afterBold.html)
    console.log('After bolding b, textContent:', afterBold.text)

    // Verify the cell has 'abc' text content
    expect(afterBold.text).toBe('abc')

    // Verify the cell has formatting (contains <b> or <strong> tag)
    const hasFormatting = afterBold.html.includes('<b>') || afterBold.html.includes('<strong>')
    console.log('Has formatting after bold:', hasFormatting)
    expect(hasFormatting).toBe(true)

    // Click outside to trigger blur (save the formatting change)
    await userEvent.keyboard('{Tab}')
    await new Promise(resolve => setTimeout(resolve, 200))

    console.log('\n--- First undo/redo cycle ---')

    // First undo (custom undo should remove bold formatting)
    await userEvent.keyboard('{Control>}z{/Control}')
    await new Promise(resolve => setTimeout(resolve, 200))

    const afterUndo1 = getCellContent()
    console.log('After 1st undo, innerHTML:', afterUndo1.html)
    console.log('After 1st undo, textContent:', afterUndo1.text)

    // Text should still be 'abc'
    expect(afterUndo1.text).toBe('abc')

    // Formatting should be removed
    const hasFormattingAfterUndo1 = afterUndo1.html.includes('<b>') || afterUndo1.html.includes('<strong>')
    expect(hasFormattingAfterUndo1).toBe(false)

    // First redo (custom redo should restore bold formatting)
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    await new Promise(resolve => setTimeout(resolve, 200))

    const afterRedo1 = getCellContent()
    console.log('After 1st redo, innerHTML:', afterRedo1.html)
    console.log('After 1st redo, textContent:', afterRedo1.text)

    // Text should still be 'abc'
    expect(afterRedo1.text).toBe('abc')

    // Formatting should be back
    const hasFormattingAfterRedo1 = afterRedo1.html.includes('<b>') || afterRedo1.html.includes('<strong>')
    console.log('Has formatting after 1st redo:', hasFormattingAfterRedo1)
    expect(hasFormattingAfterRedo1).toBe(true)

    console.log('\n--- Second undo/redo cycle ---')

    // Second undo (should remove bold formatting again)
    await userEvent.keyboard('{Control>}z{/Control}')
    await new Promise(resolve => setTimeout(resolve, 200))

    const afterUndo2 = getCellContent()
    console.log('After 2nd undo, innerHTML:', afterUndo2.html)
    console.log('After 2nd undo, textContent:', afterUndo2.text)

    // Text should still be 'abc'
    expect(afterUndo2.text).toBe('abc')

    // Formatting should be removed
    const hasFormattingAfterUndo2 = afterUndo2.html.includes('<b>') || afterUndo2.html.includes('<strong>')
    expect(hasFormattingAfterUndo2).toBe(false)

    // Second redo (should restore bold formatting again)
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    await new Promise(resolve => setTimeout(resolve, 200))

    const afterRedo2 = getCellContent()
    console.log('After 2nd redo, innerHTML:', afterRedo2.html)
    console.log('After 2nd redo, textContent:', afterRedo2.text)

    // Text should still be 'abc'
    expect(afterRedo2.text).toBe('abc')

    // Formatting should be back again
    const hasFormattingAfterRedo2 = afterRedo2.html.includes('<b>') || afterRedo2.html.includes('<strong>')
    console.log('Has formatting after 2nd redo:', hasFormattingAfterRedo2)
    expect(hasFormattingAfterRedo2).toBe(true)

    console.log('\n--- Third undo/redo cycle ---')

    // Third undo (should remove bold formatting again)
    await userEvent.keyboard('{Control>}z{/Control}')
    await new Promise(resolve => setTimeout(resolve, 200))

    const afterUndo3 = getCellContent()
    console.log('After 3rd undo, innerHTML:', afterUndo3.html)
    console.log('After 3rd undo, textContent:', afterUndo3.text)

    // Text should still be 'abc'
    expect(afterUndo3.text).toBe('abc')

    // Formatting should be removed
    const hasFormattingAfterUndo3 = afterUndo3.html.includes('<b>') || afterUndo3.html.includes('<strong>')
    expect(hasFormattingAfterUndo3).toBe(false)

    // Third redo (should restore bold formatting again)
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    await new Promise(resolve => setTimeout(resolve, 200))

    const afterRedo3 = getCellContent()
    console.log('After 3rd redo, innerHTML:', afterRedo3.html)
    console.log('After 3rd redo, textContent:', afterRedo3.text)

    // Text should still be 'abc'
    console.log('Final text content:', afterRedo3.text)
    expect(afterRedo3.text).toBe('abc')

    // Formatting should be back again
    const hasFormattingAfterRedo3 = afterRedo3.html.includes('<b>') || afterRedo3.html.includes('<strong>')
    console.log('Has formatting after 3rd redo:', hasFormattingAfterRedo3)
    expect(hasFormattingAfterRedo3).toBe(true)
})
