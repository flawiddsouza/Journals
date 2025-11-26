import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { setupTable, getCellText, getRowCount, createBasicTableConfig } from './helpers/table-test-helpers'

const baseConfig = createBasicTableConfig()

test('row insert below and undo/redo', async () => {
  await setupTable(baseConfig)

  // Click into first cell
  const firstItem = page.getByText('Item 1')
  await firstItem.click()

  // Verify initial state: 2 data rows
  expect(await getRowCount()).toBe(2)

  // Insert row below
  await userEvent.keyboard('{Control>}{Enter}{/Control}')

  // Wait for new row
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Undo insert
  await userEvent.keyboard('{Control>}z{/Control}')

  // Verify row was removed
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Redo insert
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)
})

test('row insert above and undo/redo', async () => {
  await setupTable(baseConfig)

  // Click into second cell
  const secondItem = page.getByText('Item 2')
  await secondItem.click()

  expect(await getRowCount()).toBe(2)

  // Insert row above (Ctrl+Shift+Enter)
  await userEvent.keyboard('{Control>}{Shift>}{Enter}{/Enter}{/Shift}{/Control}')

  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Undo insert
  await userEvent.keyboard('{Control>}z{/Control}')

  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Redo insert
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)
})

test('row deletion and undo/redo', async () => {
  await setupTable(baseConfig)

  // Click into first cell
  const firstItem = page.getByText('Item 1')
  await firstItem.click()

  expect(await getRowCount()).toBe(2)
  expect(await getCellText(0, 0)).toBe('Item 1')

  // Delete row (Ctrl+Backspace)
  await userEvent.keyboard('{Control>}{Delete}{/Control}')

  // Wait for row deletion
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(1)
  expect(await getCellText(0, 0)).toBe('Item 2')

  // Undo deletion
  await userEvent.keyboard('{Control>}z{/Control}')

  // Verify row was restored
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)
  expect(await getCellText(0, 0)).toBe('Item 1')
  expect(await getCellText(1, 0)).toBe('Item 2')

  // Redo deletion
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(1)
  expect(await getCellText(0, 0)).toBe('Item 2')
})

test('text editing and undo/redo', async () => {
  await setupTable(baseConfig)

  // Click into first cell
  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Clear existing text and type new text
  await userEvent.keyboard('{Control>}a{/Control}')
  await userEvent.keyboard('Modified Text')

  // Wait for text to update
  await expect.poll(async () => await getCellText(0, 0), { timeout: 2000 }).toContain('Modified')

  // Undo text change
  await userEvent.keyboard('{Control>}z{/Control}')

  // Text should be reverted (browser native undo for text)
  // This tests that text undo is tracked separately from row operations
  await new Promise((resolve) => setTimeout(resolve, 200))

  // After undo, text should be back (note: browser undo behavior)
  const currentText = await getCellText(0, 0)
  expect(currentText).not.toBe('Modified Text')
})

test('multiple operations sequence', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Operation 1: Insert row
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Wait for operation to fully complete before next operation
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Operation 2: Delete a row
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Undo operation 2 (delete)
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Undo operation 1 (insert)
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Redo operation 1 (insert)
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Redo operation 2 (delete)
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)
})

test('undo on empty history does nothing', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  const initialCount = await getRowCount()
  expect(initialCount).toBe(2)

  // Try to undo when history is empty
  await userEvent.keyboard('{Control>}z{/Control}')

  await new Promise((resolve) => setTimeout(resolve, 200))

  // Should still have same number of rows
  expect(await getRowCount()).toBe(2)
})

test('redo on empty redo stack does nothing', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  expect(await getRowCount()).toBe(2)

  // Try to redo when redo stack is empty
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')

  await new Promise((resolve) => setTimeout(resolve, 200))

  // Should still have same number of rows
  expect(await getRowCount()).toBe(2)
})

test('new operation clears redo stack', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Insert row
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Undo insert
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Now perform a new operation (this should clear redo stack)
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Try to redo - should not do anything since redo stack was cleared
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await new Promise((resolve) => setTimeout(resolve, 200))

  // Should still have 3 rows (redo had nothing to redo)
  expect(await getRowCount()).toBe(3)
})

test('delete last row and undo restores it', async () => {
  // Start with only one row
  const singleRowConfig = {
    ...baseConfig,
    items: [{ Task: 'Only Item', Status: 'Open' }],
  }
  await setupTable(singleRowConfig)

  const onlyCell = page.getByText('Only Item')
  await onlyCell.click()

  expect(await getRowCount()).toBe(1)

  // Delete the only row (should clear it, not remove it - keeps 1 blank row)
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))

  // Should still have 1 row, but empty
  expect(await getRowCount()).toBe(1)
  expect(await getCellText(0, 0)).toBe('')

  // Undo deletion (should restore data)
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))

  expect(await getRowCount()).toBe(1)
  expect(await getCellText(0, 0)).toBe('Only Item')
})

test('multiple text edits in sequence', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Make first edit
  await userEvent.keyboard('{Control>}a{/Control}Edit 1')
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Make second edit
  await userEvent.keyboard('{Control>}a{/Control}Edit 2')
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Make third edit
  await userEvent.keyboard('{Control>}a{/Control}Edit 3')
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Undo should work (browser native text undo)
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise((resolve) => setTimeout(resolve, 100))

  const afterUndo = await getCellText(0, 0)
  // After undo, text should not be 'Edit 3' anymore
  expect(afterUndo).not.toBe('Edit 3')
})

test('insert multiple rows and undo all', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  const initialCount = await getRowCount()

  // Insert 3 rows with delays between operations
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount + 1)
  await new Promise((resolve) => setTimeout(resolve, 100))

  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount + 2)
  await new Promise((resolve) => setTimeout(resolve, 100))

  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount + 3)
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Undo all 3 inserts
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount + 2)

  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount + 1)

  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount)
})

test('row operations preserve data correctly', async () => {
  await setupTable(baseConfig)

  // Click on Item 2
  const secondItem = page.getByText('Item 2')
  await secondItem.click()

  // Verify initial data
  expect(await getCellText(1, 0)).toBe('Item 2')
  expect(await getCellText(1, 1)).toBe('Closed')

  // Delete Item 2
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(1)

  // Undo delete
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Verify data was restored correctly
  expect(await getCellText(1, 0)).toBe('Item 2')
  expect(await getCellText(1, 1)).toBe('Closed')
})
