import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { setupTable, getCellText, getRowCount, createBasicTableConfig } from './helpers/table-test-helpers'

/**
 * CRITICAL: These tests verify that the original table behavior
 * has NOT been changed by the undo/redo implementation.
 *
 * All these behaviors MUST work exactly as before.
 */

const baseConfig = createBasicTableConfig()

test('Original: Ctrl+Enter inserts row below', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  expect(await getRowCount()).toBe(2)

  // Insert row below current row
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // New row should be empty
  expect(await getCellText(1, 0)).toBe('')
  expect(await getCellText(1, 1)).toBe('')

  // Original rows should be unchanged
  expect(await getCellText(0, 0)).toBe('Item 1')
  expect(await getCellText(2, 0)).toBe('Item 2')
})

test('Original: Ctrl+Shift+Enter inserts row above', async () => {
  await setupTable(baseConfig)

  const secondCell = page.getByText('Item 2')
  await secondCell.click()

  expect(await getRowCount()).toBe(2)

  // Insert row above current row
  await userEvent.keyboard('{Control>}{Shift>}{Enter}{/Enter}{/Shift}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // New row should be at index 1 (above Item 2)
  expect(await getCellText(1, 0)).toBe('')
  expect(await getCellText(1, 1)).toBe('')

  // Original rows should be unchanged but shifted
  expect(await getCellText(0, 0)).toBe('Item 1')
  expect(await getCellText(2, 0)).toBe('Item 2')
})

test('Original: Ctrl+Delete deletes row', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  expect(await getRowCount()).toBe(2)

  // Delete current row
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(1)

  // Only Item 2 should remain
  expect(await getCellText(0, 0)).toBe('Item 2')
})

test('Original: Basic text editing works', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Select all and type new text
  await userEvent.keyboard('{Control>}a{/Control}')
  await userEvent.keyboard('Modified Text')
  await new Promise(resolve => setTimeout(resolve, 100))

  // Text should be changed
  expect(await getCellText(0, 0)).toContain('Modified')
})

test('Original: Arrow down navigation', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Position cursor at end of text using Ctrl+End or by selecting all and collapsing to end
  await userEvent.keyboard('{Control>}{End}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 50))

  // Press arrow down - should move to next row since cursor is at end
  await userEvent.keyboard('{ArrowDown}')
  await new Promise(resolve => setTimeout(resolve, 100))

  // Focus should move to second row
  const activeElement = document.activeElement
  const parentRow = activeElement?.closest('tr')
  const rowIndex = parentRow ? Array.from(parentRow.parentElement!.children).indexOf(parentRow) : -1
  expect(rowIndex).toBe(1) // Second row (0-indexed)
})

test('Original: Arrow up navigation', async () => {
  await setupTable(baseConfig)

  const secondCell = page.getByText('Item 2')
  await secondCell.click()

  // Position cursor at start of text using Ctrl+Home or by selecting all and collapsing to start
  await userEvent.keyboard('{Control>}{Home}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 50))

  // Press arrow up - should move to previous row since cursor is at start
  await userEvent.keyboard('{ArrowUp}')
  await new Promise(resolve => setTimeout(resolve, 100))

  // Focus should move to first row
  const activeElement = document.activeElement
  const parentRow = activeElement?.closest('tr')
  const rowIndex = parentRow ? Array.from(parentRow.parentElement!.children).indexOf(parentRow) : -1
  expect(rowIndex).toBe(0) // First row (0-indexed)
})

test('Original: Tab navigation moves to next cell', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Press Tab
  await userEvent.keyboard('{Tab}')
  await new Promise(resolve => setTimeout(resolve, 100))

  // Focus should move to second column (Status column)
  const activeElement = document.activeElement
  const parentCell = activeElement?.closest('td')
  const cellIndex = parentCell ? Array.from(parentCell.parentElement!.children).indexOf(parentCell) : -1
  expect(cellIndex).toBe(1) // Second column (0-indexed)
})

test('Original: Ctrl+Semicolon copies cell above', async () => {
  await setupTable(baseConfig)

  // Click on second row, first column
  const secondCell = page.getByText('Item 2')
  await secondCell.click()

  // Clear the cell first
  await userEvent.keyboard('{Control>}a{/Control}{Backspace}')
  await new Promise(resolve => setTimeout(resolve, 100))

  expect(await getCellText(1, 0)).toBe('')

  // Press Ctrl+; to copy from above
  await userEvent.keyboard('{Control>};{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))

  // Cell should now contain "Item 1" (copied from above)
  expect(await getCellText(1, 0)).toContain('Item 1')
})

test('Original: Focus moves to correct cell after row insert', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Insert row below
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)
  await new Promise(resolve => setTimeout(resolve, 200))

  // Focus should be on the new row (row 1), first column
  const activeElement = document.activeElement
  const parentRow = activeElement?.closest('tr')
  const rowIndex = parentRow ? Array.from(parentRow.parentElement!.children).indexOf(parentRow) : -1
  expect(rowIndex).toBe(1) // New row is at index 1
})

test('Original: Focus moves to correct cell after row delete', async () => {
  await setupTable(baseConfig)

  const secondCell = page.getByText('Item 2')
  await secondCell.click()

  // Delete current row
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(1)
  await new Promise(resolve => setTimeout(resolve, 200))

  // Focus should move to previous row (row 0) since we deleted row 1
  const activeElement = document.activeElement
  const parentRow = activeElement?.closest('tr')
  const rowIndex = parentRow ? Array.from(parentRow.parentElement!.children).indexOf(parentRow) : -1
  expect(rowIndex).toBe(0) // Should focus row 0 (Item 1)
})

test('Original: Multiple row inserts work correctly', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Insert 3 rows
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(4)

  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(5)

  // Original rows should still be there
  expect(await getCellText(0, 0)).toBe('Item 1')
  expect(await getCellText(4, 0)).toBe('Item 2')
})

test('Original: Multiple row deletes work correctly', async () => {
  // Start with 4 rows
  const fourRowConfig = {
    ...baseConfig,
    items: [
      { Task: 'Item 1', Status: 'Open' },
      { Task: 'Item 2', Status: 'Closed' },
      { Task: 'Item 3', Status: 'Pending' },
      { Task: 'Item 4', Status: 'Done' },
    ],
  }
  await setupTable(fourRowConfig)

  expect(await getRowCount()).toBe(4)

  // Click first row and delete it
  let firstCell = page.getByText('Item 1')
  await firstCell.click()
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Delete another row
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Should have Item 3 and Item 4 left
  expect(await getCellText(0, 0)).toBe('Item 3')
  expect(await getCellText(1, 0)).toBe('Item 4')
})

test('Original: Cell editing maintains data integrity', async () => {
  await setupTable(baseConfig)

  // Edit first cell
  const firstCell = page.getByText('Item 1')
  await firstCell.click()
  await userEvent.keyboard('{Control>}a{/Control}New Item 1')
  await new Promise(resolve => setTimeout(resolve, 100))

  // Move to second column
  await userEvent.keyboard('{Tab}')
  await new Promise(resolve => setTimeout(resolve, 100))
  await userEvent.keyboard('{Control>}a{/Control}New Status')
  await new Promise(resolve => setTimeout(resolve, 100))

  // Check data was saved
  expect(await getCellText(0, 0)).toContain('New Item 1')
  expect(await getCellText(0, 1)).toContain('New Status')

  // Second row should be unchanged
  expect(await getCellText(1, 0)).toBe('Item 2')
  expect(await getCellText(1, 1)).toBe('Closed')
})

test('Original: Empty cell behavior', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Clear the cell
  await userEvent.keyboard('{Control>}a{/Control}{Backspace}')
  await new Promise(resolve => setTimeout(resolve, 100))

  // Cell should be empty
  expect(await getCellText(0, 0)).toBe('')

  // Type new text
  await userEvent.keyboard('New Text')
  await new Promise(resolve => setTimeout(resolve, 100))

  // Cell should have new text
  expect(await getCellText(0, 0)).toBe('New Text')
})

test('Original: Insert row at specific position preserves data', async () => {
  // Start with 3 rows
  const threeRowConfig = {
    ...baseConfig,
    items: [
      { Task: 'Item 1', Status: 'Open' },
      { Task: 'Item 2', Status: 'Closed' },
      { Task: 'Item 3', Status: 'Pending' },
    ],
  }
  await setupTable(threeRowConfig)

  // Click on middle row (Item 2)
  const middleCell = page.getByText('Item 2')
  await middleCell.click()

  // Insert row below
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(4)

  // Check data integrity
  expect(await getCellText(0, 0)).toBe('Item 1')
  expect(await getCellText(1, 0)).toBe('Item 2')
  expect(await getCellText(2, 0)).toBe('') // New row
  expect(await getCellText(3, 0)).toBe('Item 3')
})

test('Original: Delete row at specific position preserves data', async () => {
  // Start with 3 rows
  const threeRowConfig = {
    ...baseConfig,
    items: [
      { Task: 'Item 1', Status: 'Open' },
      { Task: 'Item 2', Status: 'Closed' },
      { Task: 'Item 3', Status: 'Pending' },
    ],
  }
  await setupTable(threeRowConfig)

  // Click on middle row (Item 2)
  const middleCell = page.getByText('Item 2')
  await middleCell.click()

  // Delete row
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Check data integrity
  expect(await getCellText(0, 0)).toBe('Item 1')
  expect(await getCellText(1, 0)).toBe('Item 3')
})

test('Original: Deleting last row keeps blank row', async () => {
  // Start with only one row
  const singleRowConfig = {
    ...baseConfig,
    items: [
      { Task: 'Only Item', Status: 'Open' },
    ],
  }
  await setupTable(singleRowConfig)

  const onlyCell = page.getByText('Only Item')
  await onlyCell.click()

  expect(await getRowCount()).toBe(1)

  // Delete the only row
  await userEvent.keyboard('{Control>}{Delete}{/Control}')

  // Should still have 1 row, but it should be empty
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(1)
  expect(await getCellText(0, 0)).toBe('')
  expect(await getCellText(0, 1)).toBe('')
})
