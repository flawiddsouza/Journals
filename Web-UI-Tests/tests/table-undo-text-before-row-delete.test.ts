import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { setupTable, getCellText, getRowCount, createBasicTableConfig } from './helpers/table-test-helpers'

const baseConfig = createBasicTableConfig()

// Test the specific issue: clear text, then delete row, then undo twice
test('clear text from cell, delete row, undo should restore row with cleared text, second undo should restore original text', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Verify initial state
  expect(await getCellText(0, 0)).toBe('Item 1')
  expect(await getRowCount()).toBe(2)

  // Step 1: Clear text from the cell
  await userEvent.keyboard('{Control>}a{/Control}')
  await userEvent.keyboard('{Backspace}')
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Verify text is cleared
  const textAfterClear = await getCellText(0, 0)
  expect(textAfterClear).toBe('')

  // Step 2: Delete the row
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(1)

  // Verify row is deleted
  expect(await getCellText(0, 0)).toBe('Item 2')

  // Step 3: First undo - should bring back the row (with empty text)
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Verify row is restored with cleared text
  expect(await getCellText(0, 0)).toBe('')
  expect(await getCellText(1, 0)).toBe('Item 2')

  // Step 4: Second undo - should restore the original text "Item 1"
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise((resolve) => setTimeout(resolve, 200))

  // The text is restored to original! This works because browser native undo
  // is maintained through the restoration process.
  const finalText = await getCellText(0, 0)
  expect(finalText).toBe('Item 1')
})

// Additional test: verify browser native undo works before row deletion
test('browser native undo works before row deletion', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Edit text
  await userEvent.keyboard('{Control>}a{/Control}Modified')
  await new Promise((resolve) => setTimeout(resolve, 100))
  expect(await getCellText(0, 0)).toBe('Modified')

  // Undo the text edit (without deleting row)
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise((resolve) => setTimeout(resolve, 200))

  const textAfterUndo = await getCellText(0, 0)
  // This should work with browser native undo
  expect(textAfterUndo).toBe('Item 1')
})

// Test that demonstrates the expected behavior with text edits before row deletion
// Our custom undo/redo system properly records text edits even when they occur
// before row operations, allowing full undo capability across all operations.
test('edit text, delete row, undo row - text history preserved', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Verify initial state
  expect(await getCellText(0, 0)).toBe('Item 1')

  // Edit text
  await userEvent.keyboard('{Control>}a{/Control}Modified')
  await new Promise((resolve) => setTimeout(resolve, 100))
  expect(await getCellText(0, 0)).toBe('Modified')

  // Delete the row
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(1)

  // First undo - restore row
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Row should be back with "Modified" text (the state when it was deleted)
  expect(await getCellText(0, 0)).toBe('Modified')

  // Second undo - should restore the original text because our undo system
  // properly records text edits before row operations
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise((resolve) => setTimeout(resolve, 200))

  const finalText = await getCellText(0, 0)
  // Text should be restored to "Item 1" by our undo system
  expect(finalText).toBe('Item 1')
})

// Test for the specific bug: editing different cells in different rows
// and ensuring undo happens in the correct order
test('edit multiple cells in different rows and columns, undo in correct order', async () => {
  // Setup with 3 rows
  const threeRowConfig = {
    columns: [
      { name: 'Col1', label: 'Col1', type: '', wrap: 'Yes', align: 'Left' },
      { name: 'Col2', label: 'Col2', type: '', wrap: 'Yes', align: 'Left' },
      { name: 'Col3', label: 'Col3', type: '', wrap: 'Yes', align: 'Left' },
    ],
    items: [
      { Col1: '', Col2: '', Col3: '' },
      { Col1: '', Col2: '', Col3: '' },
      { Col1: '', Col2: '', Col3: '' },
    ] as any,
    totals: {},
    widths: {},
    rowStyle: '',
    startupScript: '',
    customFunctions: '',
    note: '',
  }
  await setupTable(threeRowConfig as any)

    // Row 1, Cell 1 -> enter "a"
  const cell_0_0 = document.querySelectorAll('tbody tr')[0].querySelectorAll('td div[contenteditable]')[0] as HTMLElement
  cell_0_0.focus()
  await new Promise((resolve) => setTimeout(resolve, 50))
  // Use userEvent.keyboard to properly simulate typing (creates browser undo entries)
  await userEvent.keyboard('a')
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(await getCellText(0, 0)).toBe('a')

  // Row 2, Cell 2 -> enter "b"  (this will trigger blur on cell_0_0)
  const cell_1_1 = document.querySelectorAll('tbody tr')[1].querySelectorAll('td div[contenteditable]')[1] as HTMLElement
  cell_1_1.focus()
  await new Promise((resolve) => setTimeout(resolve, 50))
  // Use userEvent.keyboard to properly simulate typing (creates browser undo entries)
  await userEvent.keyboard('b')
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(await getCellText(1, 1)).toBe('b')

  // Row 3, Cell 3 -> enter "c"  (this will trigger blur on cell_1_1)
  const cell_2_2 = document.querySelectorAll('tbody tr')[2].querySelectorAll('td div[contenteditable]')[2] as HTMLElement
  cell_2_2.focus()
  await new Promise((resolve) => setTimeout(resolve, 50))
  // Use userEvent.keyboard to properly simulate typing (creates browser undo entries)
  await userEvent.keyboard('c')
  await new Promise((resolve) => setTimeout(resolve, 50))

  // Verify all three cells have been edited
  expect(await getCellText(0, 0)).toBe('a')
  expect(await getCellText(1, 1)).toBe('b')
  expect(await getCellText(2, 2)).toBe('c')

  // Now undo while STILL FOCUSED in cell_2_2 (this is the real user scenario!)
  // User typed "c" and is still in the cell, then presses Ctrl+Z
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise((resolve) => setTimeout(resolve, 200))

  // CRITICAL: Only c should be undone, a and b should remain
  expect(await getCellText(0, 0)).toBe('a') // a should still be there
  expect(await getCellText(1, 1)).toBe('b') // b should still be there
  expect(await getCellText(2, 2)).toBe('') // c should be gone

  // Undo again - should undo "b"
  cell_1_1.focus()
  await new Promise((resolve) => setTimeout(resolve, 50))
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise((resolve) => setTimeout(resolve, 200))
  expect(await getCellText(2, 2)).toBe('')
  expect(await getCellText(1, 1)).toBe('') // b should be gone
  expect(await getCellText(0, 0)).toBe('a') // a should still be there

  // Undo again - should undo "a"
  cell_0_0.focus()
  await new Promise((resolve) => setTimeout(resolve, 50))
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise((resolve) => setTimeout(resolve, 200))
  expect(await getCellText(2, 2)).toBe('')
  expect(await getCellText(1, 1)).toBe('')
  expect(await getCellText(0, 0)).toBe('') // a should be gone
})
