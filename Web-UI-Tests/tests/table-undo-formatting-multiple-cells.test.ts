import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { setupTable, getCellHTML, getCellText, createBasicTableConfig } from './helpers/table-test-helpers'

/**
 * Bug: Type text in two cells, bold text in each, then undo/redo
 * Expected: Formatting should be restored when redoing
 * Actual: Formatting doesn't come back
 */
test('bold text in multiple cells and undo/redo preserves formatting', async () => {
  const config = {
    ...createBasicTableConfig(),
    items: [
      { Task: '', Status: '' },
      { Task: '', Status: '' }
    ]
  }
  await setupTable(config)

  // Step 1: Type "abc" in cell 1 (row 0, col 0)
  const cell1 = document.querySelector('tbody tr:first-child td:nth-child(1) div[contenteditable]') as HTMLElement
  cell1.click()
  cell1.focus()
  await new Promise(resolve => setTimeout(resolve, 100))
  await userEvent.keyboard('abc')
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('After typing abc in cell 1:', await getCellText(0, 0))
  expect(await getCellText(0, 0)).toBe('abc')

  // Step 2: Tab to cell 2 and type "def"
  await userEvent.keyboard('{Tab}')
  await new Promise(resolve => setTimeout(resolve, 100))

  await userEvent.keyboard('def')
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('After typing def in cell 2:', await getCellText(0, 1))
  expect(await getCellText(0, 1)).toBe('def')

  // Step 3: Go back to cell 1 and bold "b"
  cell1.click()
  cell1.focus()
  await new Promise(resolve => setTimeout(resolve, 100))

  // Select "b" (character at position 1)
  const range = document.createRange()
  const textNode = cell1.firstChild
  if (textNode) {
    range.setStart(textNode, 1)
    range.setEnd(textNode, 2)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  await new Promise(resolve => setTimeout(resolve, 50))

  // Bold the selection
  await userEvent.keyboard('{Control>}b{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('After bolding b in cell 1, innerHTML:', await getCellHTML(0, 0))
  console.log('After bolding b in cell 1, textContent:', await getCellText(0, 0))
  expect(await getCellText(0, 0)).toBe('abc')
  const cell1HTML = await getCellHTML(0, 0)
  const hasCell1Formatting = /<b>|<strong>/.test(cell1HTML || '')
  console.log('Has formatting in cell 1 after bold:', hasCell1Formatting)
  expect(hasCell1Formatting).toBe(true)

  // Step 4: Tab to cell 2 and bold "e"
  await userEvent.keyboard('{Tab}')
  await new Promise(resolve => setTimeout(resolve, 100))

  const cell2 = document.querySelector('tbody tr:first-child td:nth-child(2) div[contenteditable]') as HTMLElement

  // Select "e" (character at position 1)
  const range2 = document.createRange()
  const textNode2 = cell2.firstChild
  if (textNode2) {
    range2.setStart(textNode2, 1)
    range2.setEnd(textNode2, 2)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range2)
  }
  await new Promise(resolve => setTimeout(resolve, 50))

  // Bold the selection
  await userEvent.keyboard('{Control>}b{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('After bolding e in cell 2, innerHTML:', await getCellHTML(0, 1))
  console.log('After bolding e in cell 2, textContent:', await getCellText(0, 1))
  expect(await getCellText(0, 1)).toBe('def')
  const cell2HTML = await getCellHTML(0, 1)
  const hasCell2Formatting = /<b>|<strong>/.test(cell2HTML || '')
  console.log('Has formatting in cell 2 after bold:', hasCell2Formatting)
  expect(hasCell2Formatting).toBe(true)

  // Step 5: Undo twice to remove both bold operations
  console.log('\n--- Undoing formatting ---')

  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After 1st undo, cell 2 innerHTML:', await getCellHTML(0, 1))

  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After 2nd undo, cell 1 innerHTML:', await getCellHTML(0, 0))

  // Verify formatting is removed
  const cell1AfterUndo = await getCellHTML(0, 0)
  const cell2AfterUndo = await getCellHTML(0, 1)
  const hasCell1FormattingAfterUndo = /<b>|<strong>/.test(cell1AfterUndo || '')
  const hasCell2FormattingAfterUndo = /<b>|<strong>/.test(cell2AfterUndo || '')
  console.log('Cell 1 has formatting after undo:', hasCell1FormattingAfterUndo)
  console.log('Cell 2 has formatting after undo:', hasCell2FormattingAfterUndo)

  // Step 6: Redo to restore formatting
  console.log('\n--- Redoing formatting ---')

  await userEvent.keyboard('{Control>}y{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After 1st redo, cell 1 innerHTML:', await getCellHTML(0, 0))

  await userEvent.keyboard('{Control>}y{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After 2nd redo, cell 2 innerHTML:', await getCellHTML(0, 1))

  // Step 7: Verify formatting is restored
  const cell1AfterRedo = await getCellHTML(0, 0)
  const cell2AfterRedo = await getCellHTML(0, 1)
  const hasCell1FormattingAfterRedo = /<b>|<strong>/.test(cell1AfterRedo || '')
  const hasCell2FormattingAfterRedo = /<b>|<strong>/.test(cell2AfterRedo || '')

  console.log('Cell 1 has formatting after redo:', hasCell1FormattingAfterRedo)
  console.log('Cell 2 has formatting after redo:', hasCell2FormattingAfterRedo)

  console.log('\nFinal state:')
  console.log('Cell 1 text:', await getCellText(0, 0))
  console.log('Cell 1 HTML:', cell1AfterRedo)
  console.log('Cell 2 text:', await getCellText(0, 1))
  console.log('Cell 2 HTML:', cell2AfterRedo)

  // CRITICAL: Formatting should be restored
  expect(await getCellText(0, 0)).toBe('abc')
  expect(await getCellText(0, 1)).toBe('def')
  expect(hasCell1FormattingAfterRedo).toBe(true)
  expect(hasCell2FormattingAfterRedo).toBe(true)
})
