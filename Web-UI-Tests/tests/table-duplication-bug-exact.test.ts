import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { setupTable, getCellText, createBasicTableConfig } from './helpers/table-test-helpers'

/**
 * This test EXACTLY reproduces the user's log showing the duplication bug.
 *
 * User's log shows:
 * 1. text-edit: Cat column "" -> "a"
 * 2. undo-text: Bat column (???) value: ""  <- BUG: Should be Cat column!
 * 3. undo-text: Cat column value: ""
 * 4. redo-text: Cat column value: "a"
 * 5. redo-text: Bat column value: "b"  <- BUG: We never typed "b"!
 *
 * After reload: aaa, bbb
 */
test('EXACT reproduction of duplication bug from user log', async () => {
  // Use EXACT column names from user's log: Cat and Bat
  const config = createBasicTableConfig()
  config.columns = [
    { name: 'Cat', type: 'text', label: 'Cat', wrap: 'wrap', align: 'left' },
    { name: 'Bat', type: 'text', label: 'Bat', wrap: 'wrap', align: 'left' }
  ]
  config.items = [
    { Cat: '', Bat: '' }
  ]
  await setupTable(config)

  // Step 1: Type "a" in Cat column (first cell)
  const firstCell = document.querySelector('tbody tr:first-child td:first-child div[contenteditable]') as HTMLElement
  firstCell.click()
  firstCell.focus()
  await new Promise(resolve => setTimeout(resolve, 100))
  await userEvent.keyboard('a')
  await new Promise(resolve => setTimeout(resolve, 200))

  console.log('After typing "a" in Cat:', await getCellText(0, 0), await getCellText(0, 1))
  console.log('Operation log after typing:', JSON.stringify((window as any).dumpOperationLog(), null, 2))
  expect(await getCellText(0, 0)).toBe('a')
  expect(await getCellText(0, 1)).toBe('')

  // Step 2: Press Ctrl+Z WITHOUT moving to another cell
  // This should record the pending "a" edit first, then undo it
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))

  console.log('After 1st Ctrl+Z (user log shows undo-text on Bat):', await getCellText(0, 0), await getCellText(0, 1))

  // According to user's log, Bat gets undo-text with value ""
  // But we never edited Bat! This is the bug.

  // Step 3: Press Ctrl+Z again
  // User's log shows this undoes Cat column to ""
  await userEvent.keyboard('{Control>}z{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))

  console.log('After 2nd Ctrl+Z (user log shows undo-text on Cat):', await getCellText(0, 0), await getCellText(0, 1))
  expect(await getCellText(0, 0)).toBe('')
  expect(await getCellText(0, 1)).toBe('')

  // Step 4: Press Ctrl+Y to redo
  // User's log shows this redos Cat to "a"
  await userEvent.keyboard('{Control>}y{/Control}')
  await new Promise(resolve => setTimeout(resolve, 200))

  console.log('After 1st Ctrl+Y (user log shows redo-text Cat="a"):', await getCellText(0, 0), await getCellText(0, 1))

  // Wait a bit longer to see if duplication happens after a delay
  await new Promise(resolve => setTimeout(resolve, 300))

  // Check DOM value
  const catValue = await getCellText(0, 0)
  console.log('Cat value after first redo (after 300ms wait):', catValue)

  if (catValue !== 'a') {
    console.error(`BUG REPRODUCED! Expected "a" but got "${catValue}"`)

    // Dump the operation log to see what happened
    const operationLog = (window as any).dumpOperationLog()
    console.log('Operation log:', JSON.stringify(operationLog, null, 2))
  } else {
    console.log('✓ BUG FIXED! Value is correct: "a"')
  }

  expect(catValue).toBe('a')
})
