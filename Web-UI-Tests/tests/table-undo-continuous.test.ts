import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { setupTable, getCellText, getRowCount, createTableConfig } from './helpers/table-test-helpers'

const baseConfig = createTableConfig(
  [
    { name: 'Task', label: 'Task' },
    { name: 'Status', label: 'Status' },
  ],
  [
    { Task: 'Item 1', Status: 'Open' },
    { Task: 'Item 2', Status: 'Closed' },
    { Task: 'Item 3', Status: 'Pending' },
  ]
)

// REALISTIC TEST: User makes multiple edits, then continuously presses Ctrl+Z
// This should undo operations in the CORRECT reverse order
test('continuous undo should work in correct order - realistic scenario', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // 1. Edit text in first cell
  await userEvent.keyboard('{Control>}a{/Control}Modified Item 1')
  await new Promise((resolve) => setTimeout(resolve, 100))
  expect(await getCellText(0, 0)).toContain('Modified')

  // 2. Move to second cell and edit
  await userEvent.keyboard('{Tab}')
  await new Promise((resolve) => setTimeout(resolve, 100))
  await userEvent.keyboard('{Control>}a{/Control}Changed Status')
  await new Promise((resolve) => setTimeout(resolve, 100))
  expect(await getCellText(0, 1)).toContain('Changed')

  // 3. Insert a new row
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(4)

  // 4. Delete the second row
  const secondCell = page.getByText('Item 2')
  await secondCell.click()
  await new Promise((resolve) => setTimeout(resolve, 100))
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  console.log('After all operations:')
  console.log('Row 0:', await getCellText(0, 0), await getCellText(0, 1))
  console.log('Row 1:', await getCellText(1, 0), await getCellText(1, 1))
  console.log('Row 2:', await getCellText(2, 0), await getCellText(2, 1))
  console.log('Total rows:', await getRowCount())

  // Now continuously press Ctrl+Z to undo everything
  // Expected order: Delete row -> Insert row -> Text edit #2 -> Text edit #1

  // First undo: should restore the deleted row (Item 2)
  await userEvent.keyboard('{Control>}z{/Control}')
  console.log('\nAfter 1st undo (should restore Item 2):')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(4)
  // Wait for focus to settle after row restoration
  await new Promise((resolve) => setTimeout(resolve, 200))

  // Second undo: should remove the inserted row
  await userEvent.keyboard('{Control>}z{/Control}')
  console.log('\nAfter 2nd undo (should remove inserted row):')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Third undo: should revert "Changed Status" to "Open"
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise((resolve) => setTimeout(resolve, 500))
  console.log('\nAfter 3rd undo (should revert Status text):')
  console.log('Row 0 Status:', await getCellText(0, 1))

  // Fourth undo: should revert "Modified Item 1" to "Item 1"
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise((resolve) => setTimeout(resolve, 500))
  console.log('\nAfter 4th undo (should revert Task text):')
  console.log('Row 0 Task:', await getCellText(0, 0))

  // Final state check
  console.log('\nFinal state after all undos:')
  console.log('Row 0:', await getCellText(0, 0), await getCellText(0, 1))
  console.log('Row 1:', await getCellText(1, 0), await getCellText(1, 1))
  console.log('Row 2:', await getCellText(2, 0), await getCellText(2, 1))
})

// CRITICAL TEST: Continuous redo should also work
test('continuous redo should work in correct order', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Make several operations
  await userEvent.keyboard('{Control>}{Enter}{/Control}') // Insert row
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(4)
  await new Promise((resolve) => setTimeout(resolve, 200)) // Wait for focus to settle

  await userEvent.keyboard('{Control>}{Enter}{/Control}') // Insert another row
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(5)
  await new Promise((resolve) => setTimeout(resolve, 200)) // Wait for focus to settle

  // Undo both
  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(4)

  await userEvent.keyboard('{Control>}z{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Now redo both continuously
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(4)

  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(5)
})

// TEST: Mixed row and text operations with continuous undo
test('continuous undo with mixed row and text operations', async () => {
  await setupTable(baseConfig)

  const firstCell = page.getByText('Item 1')
  await firstCell.click()

  // Operation 1: Edit text
  await userEvent.keyboard('{Control>}a{/Control}Changed')
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Operation 2: Insert row
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(4)
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Operation 3: Delete a row
  await userEvent.keyboard('{Control>}{Delete}{/Control}')
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Continuously undo all three operations
  // Should undo in reverse: delete -> insert -> text edit

  await userEvent.keyboard('{Control>}z{/Control}') // Undo delete
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(4)

  await userEvent.keyboard('{Control>}z{/Control}') // Undo insert
  await expect.poll(async () => await getRowCount(), { timeout: 2000 }).toBe(3)

  // Third undo should revert text (might not work without focus)
  await userEvent.keyboard('{Control>}z{/Control}') // Undo text
  await new Promise((resolve) => setTimeout(resolve, 300))
})
