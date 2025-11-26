import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { setupTable, getCellText, getRowCount, createBasicTableConfig } from './helpers/table-test-helpers'

/**
 * Bug: Enter text, add rows with Ctrl+Enter and enter more text, then undo all and redo all
 * Expected: Everything should be restored correctly
 * Actual: Rows appear but without data, first cell keeps "a"
 */
test('undo/redo with text entry and row insertion preserves all data', async () => {
  // Start with empty table (1 row)
  const config = {
    ...createBasicTableConfig(),
    items: [
      { Task: '', Status: '' }
    ]
  }
  await setupTable(config)

  // Step 1: Enter "a" in first row, first cell
  const firstCell = document.querySelector('tbody tr:first-child td:nth-child(1) div[contenteditable]') as HTMLElement
  firstCell.click()
  firstCell.focus()
  await new Promise(resolve => setTimeout(resolve, 100))
  await userEvent.keyboard('a')
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('After entering a:', await getCellText(0, 0))
  expect(await getCellText(0, 0)).toBe('a')
  expect(await getRowCount()).toBe(1)

  // Step 2: Add another row using Ctrl+Enter and enter "b"
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  expect(await getRowCount()).toBe(2)

  // Should be in second row, first cell
  await userEvent.keyboard('b')
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('After entering b:', await getCellText(1, 0))
  expect(await getCellText(0, 0)).toBe('a')
  expect(await getCellText(1, 0)).toBe('b')

  // Step 3: Add another row using Ctrl+Enter and enter "c"
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  expect(await getRowCount()).toBe(3)

  await userEvent.keyboard('c')
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('After entering c:', await getCellText(2, 0))
  expect(await getCellText(0, 0)).toBe('a')
  expect(await getCellText(1, 0)).toBe('b')
  expect(await getCellText(2, 0)).toBe('c')

  // Dump operation log to see what was recorded
  console.log('\n--- Operation Log ---')
  console.log((window as any).dumpOperationLog())

  // Also check the undo history
  console.log('\n--- Undo History Timeline ---')
  const undoManager = (window as any).undoRedoManager
  console.log('History length:', undoManager?.historyTimeline.length)
  console.log('History entries:', JSON.stringify(undoManager?.historyTimeline, null, 2))

  // Step 4: Undo all operations
  console.log('\n--- Undoing all operations ---')

  // Undo c
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After undo 1 (should remove c text):', await getCellText(2, 0))
  console.log('After undo 1 - History length:', (window as any).undoRedoManager.historyTimeline.length)

  // Undo row insert (3rd row)
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After undo 2 (should remove 3rd row), rowCount:', await getRowCount())
  expect(await getRowCount()).toBe(2)

  // Undo b
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After undo 3 (should remove b text):', await getCellText(1, 0))

  // Undo row insert (2nd row)
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After undo 4 (should remove 2nd row), rowCount:', await getRowCount())
  expect(await getRowCount()).toBe(1)

  // Undo a
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After undo 5 (should remove a text):', await getCellText(0, 0))
  expect(await getCellText(0, 0)).toBe('')

  // Step 5: Redo all operations
  console.log('\n--- Redoing all operations ---')

  // Redo a
  await userEvent.keyboard('{Control>}y{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After redo 1 (should restore a):', await getCellText(0, 0))
  expect(await getCellText(0, 0)).toBe('a')

  // Redo row insert (2nd row)
  await userEvent.keyboard('{Control>}y{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After redo 2 (should restore 2nd row), rowCount:', await getRowCount())
  expect(await getRowCount()).toBe(2)

  // Redo b
  await userEvent.keyboard('{Control>}y{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After redo 3 (should restore b):', await getCellText(1, 0))
  expect(await getCellText(1, 0)).toBe('b')

  // Redo row insert (3rd row)
  await userEvent.keyboard('{Control>}y{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After redo 4 (should restore 3rd row), rowCount:', await getRowCount())
  expect(await getRowCount()).toBe(3)

  // Redo c
  await userEvent.keyboard('{Control>}y{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After redo 5 (should restore c):', await getCellText(2, 0))
  expect(await getCellText(2, 0)).toBe('c')

  // Final verification
  console.log('\n--- Final state ---')
  console.log('Row 0:', await getCellText(0, 0))
  console.log('Row 1:', await getCellText(1, 0))
  console.log('Row 2:', await getCellText(2, 0))

  expect(await getCellText(0, 0)).toBe('a')
  expect(await getCellText(1, 0)).toBe('b')
  expect(await getCellText(2, 0)).toBe('c')
  expect(await getRowCount()).toBe(3)
})
