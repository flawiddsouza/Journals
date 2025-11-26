import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { setupTable, getCellText, getRowCount, createTableConfig } from './helpers/table-test-helpers'

const baseConfig = createTableConfig(
  [
    { name: 'Task', label: 'Task' },
    { name: 'Status', label: 'Status' },
    { name: 'Count', label: 'Count', type: 'Number' },
  ],
  [
    { Task: 'Item 1', Status: 'Open', Count: '1' },
    { Task: 'Item 2', Status: 'Closed', Count: '2' },
  ]
)

// Test Ctrl+Y redo shortcut (Windows)
test('Ctrl+Y redo shortcut works', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Insert row
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Undo
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Redo with Ctrl+Y (Windows shortcut)
  await userEvent.keyboard('{Control>}y{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)
})

// Test mixed operations: text edit followed by row operation
test('mixed operations - text then row insert', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Edit text
  await userEvent.keyboard('{Control>}a{/Control}Changed')
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Insert row
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Undo should undo row insert, not text edit
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Row count is back to 2, text edit should still be there
  const cellText = await getCellText(0, 0)
  expect(cellText).toContain('Changed')
})

// Test mixed operations: row then text edit
test('mixed operations - row insert then text edit', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  const initialCount = await getRowCount()

  // Insert row
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount + 1)
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Edit text in first cell
  await firstCell.click()
  await userEvent.keyboard('{Control>}a{/Control}Modified')
  await new Promise((resolve) => setTimeout(resolve, 100))

  // First undo should undo text (browser native)
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Second undo should undo row insert
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount)
})

// Test rapid operations
test('rapid consecutive row operations', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  const initialCount = await getRowCount()

  // Rapidly insert 5 rows
  for (let i = 0; i < 5; i++) {
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount + 5)

  // Undo all rapidly
  for (let i = 0; i < 5; i++) {
    await userEvent.keyboard('{Control>}z{/Control}')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount)
})

// Test delete using Ctrl+Delete (in addition to Ctrl+Backspace)
test('row deletion with Ctrl+Delete', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  expect(await getRowCount()).toBe(2)

  // Delete row using Ctrl+Delete
  await userEvent.keyboard('{Control>}{Delete}{/Control}')

  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(1)
  expect(await getCellText(0, 0)).toBe('Item 2')

  // Undo
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)
  expect(await getCellText(0, 0)).toBe('Item 1')
})

// Test undo/redo with multiple columns
test('operations preserve all column data', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Verify all columns
  expect(await getCellText(0, 0)).toBe('Item 1')
  expect(await getCellText(0, 1)).toBe('Open')
  expect(await getCellText(0, 2)).toBe('1')

  // Delete row
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(1)

  // Undo
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Verify all columns restored
  expect(await getCellText(0, 0)).toBe('Item 1')
  expect(await getCellText(0, 1)).toBe('Open')
  expect(await getCellText(0, 2)).toBe('1')
})

// Test inserting row in middle
test('insert row in middle position', async () => {
  // Start with 3 rows
  const threeRowConfig = {
    ...baseConfig,
    items: [
      { Task: 'Item 1', Status: 'Open', Count: '1' },
      { Task: 'Item 2', Status: 'Closed', Count: '2' },
      { Task: 'Item 3', Status: 'Open', Count: '3' },
    ],
  }
  await setupTable(threeRowConfig)

  // Click on middle row
  const middleCell = page.getByText('Item 2')
  await middleCell.click()

  expect(await getRowCount()).toBe(3)

  // Insert below middle row
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(4)

  // Undo
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Verify data still intact
  expect(await getCellText(0, 0)).toBe('Item 1')
  expect(await getCellText(1, 0)).toBe('Item 2')
  expect(await getCellText(2, 0)).toBe('Item 3')
})

// Test alternating insert and delete
test('alternating insert and delete operations', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  const initialCount = await getRowCount()

  // Insert
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount + 1)
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Delete
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount)
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Insert again
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount + 1)
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Undo insert
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount)

  // Undo delete
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount + 1)

  // Undo insert
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(initialCount)
})

// Test focus is maintained correctly after undo
test('focus management after undo operations', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Insert row
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Undo
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Check if focus is within the table - either on a contenteditable or the table itself
  await new Promise((resolve) => setTimeout(resolve, 200))
  const activeElement = document.activeElement
  const isContentEditable = activeElement?.getAttribute('contenteditable') === 'true'
  const isTable = activeElement?.classList.contains('editable-table')
  const isFocusInTable = activeElement?.closest('.editable-table') !== null

  // Focus should be somewhere in or on the table
  expect(isContentEditable || isTable || isFocusInTable).toBe(true)
})

// Test undo after deleting middle row
test('delete middle row and undo', async () => {
  const threeRowConfig = {
    ...baseConfig,
    items: [
      { Task: 'Item 1', Status: 'Open', Count: '1' },
      { Task: 'Item 2', Status: 'Closed', Count: '2' },
      { Task: 'Item 3', Status: 'Open', Count: '3' },
    ],
  }
  await setupTable(threeRowConfig)

  // Click middle row
  const middleCell = page.getByText('Item 2')
  await middleCell.click()

  expect(await getRowCount()).toBe(3)

  // Delete middle row
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(2)

  // Verify Item 2 is gone, Item 3 moved up
  expect(await getCellText(0, 0)).toBe('Item 1')
  expect(await getCellText(1, 0)).toBe('Item 3')

  // Undo
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Verify Item 2 is back in middle
  expect(await getCellText(0, 0)).toBe('Item 1')
  expect(await getCellText(1, 0)).toBe('Item 2')
  expect(await getCellText(2, 0)).toBe('Item 3')
})
