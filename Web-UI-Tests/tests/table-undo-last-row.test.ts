import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { setupTable, getCellText, getRowCount, createBasicTableConfig } from './helpers/table-test-helpers'

/**
 * Test undo/redo behavior when deleting the last remaining row
 *
 * Special case: When deleting the last row, the table should keep 1 empty row
 * instead of deleting it completely. Undo should restore the data.
 */

test('Delete last row clears it, undo restores data', async () => {
  const singleRowConfig = {
    ...createBasicTableConfig(),
    items: [
      { Task: 'Only Item', Status: 'Open' },
    ],
  }
  await setupTable(singleRowConfig)

  const onlyCell = page.getByText('Only Item')
  await onlyCell.click()

  // Verify we have 1 row with data
  expect(await getRowCount()).toBe(1)
  expect(await getCellText(0, 0)).toBe('Only Item')
  expect(await getCellText(0, 1)).toBe('Open')

  // Delete the last row (should clear it, not delete it)
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))

  // Should still have 1 row, but empty
  expect(await getRowCount()).toBe(1)
  expect(await getCellText(0, 0)).toBe('')
  expect(await getCellText(0, 1)).toBe('')

  // Undo should restore the data
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))

  // Should have 1 row with restored data
  expect(await getRowCount()).toBe(1)
  expect(await getCellText(0, 0)).toBe('Only Item')
  expect(await getCellText(0, 1)).toBe('Open')

  // Redo should clear it again
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))

  // Should have 1 empty row again
  expect(await getRowCount()).toBe(1)
  expect(await getCellText(0, 0)).toBe('')
  expect(await getCellText(0, 1)).toBe('')
})

test('Delete last row after deleting others, undo/redo works', async () => {
  await setupTable(createBasicTableConfig())

  // Click first row
  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Verify we start with 2 rows
  expect(await getRowCount()).toBe(2)

  // Delete first row
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(1)
  expect(await getCellText(0, 0)).toBe('Item 2')

  // Now delete the last remaining row (should clear it)
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))

  // Should still have 1 row, but empty
  expect(await getRowCount()).toBe(1)
  expect(await getCellText(0, 0)).toBe('')

  // Undo should restore Item 2
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))

  expect(await getRowCount()).toBe(1)
  expect(await getCellText(0, 0)).toBe('Item 2')

  // Undo again should restore Item 1
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)
  expect(await getCellText(0, 0)).toBe('Item 1')
  expect(await getCellText(1, 0)).toBe('Item 2')

  // Redo should delete Item 1
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(1)
  expect(await getCellText(0, 0)).toBe('Item 2')

  // Redo again should clear Item 2
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(await getRowCount()).toBe(1)
  expect(await getCellText(0, 0)).toBe('')
})
