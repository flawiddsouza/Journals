import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { setupTable, getCellText, createBasicTableConfig } from './helpers/table-test-helpers'

/**
 * Reproduces the bug from the user's log:
 * - Type "a" in first cell
 * - Move to second cell and type "b"
 * - Press Ctrl+Z (undo) without blurring second cell
 * - The undo should handle pending "b" edit first, then undo "a"
 * - But it causes "b" to duplicate to "bb", "bbb", etc. on repeated undo/redo
 */

test('Bug: typing in cell without blur, then undo causes duplication', async () => {
  const singleRowConfig = {
    ...createBasicTableConfig(),
    items: [
      { Task: '', Status: '' },
    ],
  }
  await setupTable(singleRowConfig)

  // Type "a" in first cell (Task)
  const firstCell = document.querySelector('tbody tr:first-child td:nth-child(1) div[contenteditable]') as HTMLElement
  firstCell.click()
  firstCell.focus()
  await new Promise(resolve => setTimeout(resolve, 100))
  await userEvent.keyboard('a')
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('After typing a:', await getCellText(0, 0), await getCellText(0, 1))
  expect(await getCellText(0, 0)).toBe('a')
  expect(await getCellText(0, 1)).toBe('')

  // Move to second cell (Status) and type "b"
  const secondCell = document.querySelector('tbody tr:first-child td:nth-child(2) div[contenteditable]') as HTMLElement
  secondCell.click()
  secondCell.focus()
  await new Promise(resolve => setTimeout(resolve, 100))
  await userEvent.keyboard('b')
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('After typing b:', await getCellText(0, 0), await getCellText(0, 1))
  expect(await getCellText(0, 0)).toBe('a')
  expect(await getCellText(0, 1)).toBe('b')

  // WITHOUT blurring (still in second cell with "b"), press Ctrl+Z to undo
  // According to the user's log, this records the pending "b" then undos it
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))

  console.log('After 1st undo:', await getCellText(0, 0), await getCellText(0, 1))
  expect(await getCellText(0, 0)).toBe('a') // Should still be 'a'
  expect(await getCellText(0, 1)).toBe('') // Should be empty (undo of pending 'b')

  // Undo again - should undo the "a"
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))

  console.log('After 2nd undo:', await getCellText(0, 0), await getCellText(0, 1))
  expect(await getCellText(0, 0)).toBe('') // Should be empty
  expect(await getCellText(0, 1)).toBe('') // Should still be empty

  // Redo - should restore "a"
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))

  console.log('After 1st redo:', await getCellText(0, 0), await getCellText(0, 1))
  expect(await getCellText(0, 0)).toBe('a') // Should be 'a'
  expect(await getCellText(0, 1)).toBe('') // Should still be empty

  // Redo again - should restore "b"
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))

  console.log('After 2nd redo:', await getCellText(0, 0), await getCellText(0, 1))
  expect(await getCellText(0, 0)).toBe('a') // Should still be 'a'
  expect(await getCellText(0, 1)).toBe('b') // Should be 'b' - NOT 'bb'

  // Do another undo/redo cycle to check for duplication
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After 3rd undo:', await getCellText(0, 0), await getCellText(0, 1))
  expect(await getCellText(0, 1)).toBe('') // Should be empty

  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After 4th undo:', await getCellText(0, 0), await getCellText(0, 1))
  expect(await getCellText(0, 0)).toBe('') // Should be empty

  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After 3rd redo:', await getCellText(0, 0), await getCellText(0, 1))
  expect(await getCellText(0, 0)).toBe('a') // Should be 'a'

  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))
  console.log('After 4th redo:', await getCellText(0, 0), await getCellText(0, 1))
  expect(await getCellText(0, 1)).toBe('b') // Should be 'b' - NOT 'bbb'

  // Final verification - no duplication
  expect(await getCellText(0, 0)).toBe('a')
  expect(await getCellText(0, 1)).toBe('b')
})
