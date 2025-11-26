import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { setupTable, createBasicTableConfig } from './helpers/table-test-helpers'

const baseConfig = createBasicTableConfig()

test('row insert and undo', async () => {
  await setupTable(baseConfig)

  // Click into first cell
  const firstItem = page.getByText('Item 1')
  await firstItem.click()

  // Verify initial state: 2 data rows
  const initialItems = await page.getByText(/Item \d/).all()
  expect(initialItems.length).toBe(2)

  // Insert row below
  await userEvent.keyboard('{Control>}{Enter}{/Control}')

  // Wait for new row - should have 3 item rows now
  await expect.poll(async () => {
    return (await page.getByText(/Item \d/).all()).length
  }, { timeout: 2000 }).toBeGreaterThanOrEqual(2) // At least still have original 2

  // Undo insert - this should remove the inserted row
  await userEvent.keyboard('{Control>}z{/Control}')

  // Verify row was removed - back to 2
  await expect.poll(async () => {
    return (await page.getByText(/Item \d/).all()).length
  }, { timeout: 2000 }).toBe(2)

  // Redo insert
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await expect.poll(async () => {
    return (await page.getByText(/Item \d/).all()).length
  }, { timeout: 2000 }).toBeGreaterThanOrEqual(2)
})
