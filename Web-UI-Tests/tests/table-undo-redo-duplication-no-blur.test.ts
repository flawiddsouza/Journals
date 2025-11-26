import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { setupTable, getCellText, createBasicTableConfig } from './helpers/table-test-helpers'

/**
 * Test for bug where repeatedly undoing and redoing text edits
 * causes text duplication - this test tries to reproduce by NOT blurring
 * between undo/redo operations
 */

test('repeated undo/redo without blur does not duplicate text', async () => {
  // Start with one row, two columns
  const singleRowConfig = {
    ...createBasicTableConfig(),
    items: [
      { Task: '', Status: '' },
    ],
  }
  await setupTable(singleRowConfig)

  // Enter 'a' in first cell
  const firstCell = document.querySelector('tbody tr:first-child td:nth-child(1) div[contenteditable]') as HTMLElement
  firstCell.click()
  firstCell.focus()
  await new Promise(resolve => setTimeout(resolve, 100))
  await userEvent.keyboard('a')
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('After entering a:', await getCellText(0, 0))
  expect(await getCellText(0, 0)).toBe('a')

  // Move to second cell and enter 'b' (blur will trigger text history for first cell)
  const secondCell = document.querySelector('tbody tr:first-child td:nth-child(2) div[contenteditable]') as HTMLElement
  secondCell.click()
  secondCell.focus()
  await new Promise(resolve => setTimeout(resolve, 200))
  await userEvent.keyboard('b')
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('After entering b:', await getCellText(0, 1))
  expect(await getCellText(0, 1)).toBe('b')

  // DON'T blur - keep focus in second cell and start undo/redo
  console.log('\n--- Starting undo/redo WITHOUT final blur ---')

  // Undo - should clear 'b'
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))
  console.log('After 1st undo (clear b):', await getCellText(0, 1))
  expect(await getCellText(0, 1)).toBe('')

  // Undo again - should clear 'a'
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))
  console.log('After 2nd undo (clear a):', await getCellText(0, 0))
  expect(await getCellText(0, 0)).toBe('')

  // Redo - should restore 'a'
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))
  console.log('After 1st redo (restore a):', await getCellText(0, 0))
  expect(await getCellText(0, 0)).toBe('a')

  // Redo again - should restore 'b'
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
  await new Promise(resolve => setTimeout(resolve, 100))
  console.log('After 2nd redo (restore b):', await getCellText(0, 1))
  expect(await getCellText(0, 1)).toBe('b')

  // Now do multiple undo/redo cycles WITHOUT blurring
  for (let i = 0; i < 5; i++) {
    console.log(`\n--- Cycle ${i + 1} (no blur) ---`)

    // Undo twice
    await userEvent.keyboard('{Control>}z{/Control}')
    await new Promise(resolve => setTimeout(resolve, 100))
    console.log(`Cycle ${i + 1} - After undo 1 (clear b):`, await getCellText(0, 1))
    expect(await getCellText(0, 1)).toBe('')

    await userEvent.keyboard('{Control>}z{/Control}')
    await new Promise(resolve => setTimeout(resolve, 100))
    console.log(`Cycle ${i + 1} - After undo 2 (clear a):`, await getCellText(0, 0))
    expect(await getCellText(0, 0)).toBe('')

    // Redo twice
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    await new Promise(resolve => setTimeout(resolve, 100))
    console.log(`Cycle ${i + 1} - After redo 1 (restore a):`, await getCellText(0, 0))
    expect(await getCellText(0, 0)).toBe('a')

    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    await new Promise(resolve => setTimeout(resolve, 100))
    console.log(`Cycle ${i + 1} - After redo 2 (restore b):`, await getCellText(0, 1))
    expect(await getCellText(0, 1)).toBe('b')
  }

  // Final verification
  console.log('\n--- Final State ---')
  console.log('Final cell 0:', await getCellText(0, 0))
  console.log('Final cell 1:', await getCellText(0, 1))
  expect(await getCellText(0, 0)).toBe('a')
  expect(await getCellText(0, 1)).toBe('b')
})
