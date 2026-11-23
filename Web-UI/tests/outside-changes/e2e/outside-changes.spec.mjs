import { test, expect } from '@playwright/test'

// A page saved somewhere else (another device, another tab, an agent over MCP)
// is loaded again in place, unless the person is in the middle of changing it.
// The harness mounts the real Page.svelte against a fake API that refuses a save
// made from an old copy, as the real one does.
//
// The tab coming back into view is an event from outside the page, so the
// specs fire `visibilitychange` from script. Everything the person does is
// real input.

test.describe.configure({ timeout: 60_000 })

const editor = (page) => page.locator('.ProseMirror')
const linesWith = (count, changed) =>
  Array.from({ length: count }, (_, index) => (index + 1 === changed ? `Line ${index + 1} changed elsewhere` : `Line ${index + 1}`))
const comeBack = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
const saveElsewhere = (page, lines) => page.evaluate((lines) => window.saveElsewhere(window.flatPageV2Content(lines)), lines)
// The page waits this long after the last input before loading again.
const QUIET_MS = 1_000

test('a page saved elsewhere is loaded again when the tab comes back, at the same scroll place', async ({ page }) => {
  await page.goto('/tests/outside-changes/harness.html?paragraphs=150')
  await expect(editor(page)).toContainText('Line 150')
  // The element around the editor that holds the scrollbar.
  const scrollerClass = await page.evaluate(() => {
    for (let element = document.querySelector('.ProseMirror'); element; element = element.parentElement) {
      if (element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(element).overflowY)) {
        element.setAttribute('data-scroller', '')
        return element.className
      }
    }
  })
  expect(scrollerClass).toContain('page-container')
  const scrollerSelector = '[data-scroller]'
  const scroller = page.locator(scrollerSelector)
  await scroller.hover()
  await page.mouse.wheel(0, 1500)
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(1000)
  const scrolledTo = await scroller.evaluate((el) => el.scrollTop)

  await saveElsewhere(page, linesWith(150, 60))
  await page.waitForTimeout(QUIET_MS + 100)
  // Records every frame drawn while the page loads again in which the content
  // shows anywhere but where the person left it.
  await page.evaluate((target) => {
    window.misplacedFrames = []
    const sample = () => {
      const entries = document.querySelector('.journal-page-entries')
      const scroller = document.querySelector('.page-container')
      if (getComputedStyle(entries).visibility !== 'hidden' && (!scroller || scroller.scrollTop !== target)) {
        window.misplacedFrames.push(scroller ? scroller.scrollTop : null)
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }, scrolledTo)
  await comeBack(page)

  await expect(editor(page)).toContainText('Line 60 changed elsewhere', { timeout: 2_000 })
  await page.waitForTimeout(300)
  expect(await page.locator('.page-container').evaluate((el) => el.scrollTop)).toBe(scrolledTo)
  await expect(page.locator('.journal-page-entries')).toBeVisible()
  expect(await page.evaluate(() => window.misplacedFrames)).toEqual([])
  const server = await page.evaluate(() => window.server)
  expect(server.saves).toEqual([])
  expect(server.refused).toBe(0)
})

test('an open page picks up a change made elsewhere on its own', async ({ page }) => {
  await page.goto('/tests/outside-changes/harness.html')
  await expect(editor(page)).toContainText('Line 3')
  await saveElsewhere(page, linesWith(3, 2))
  // It asks every 10 seconds.
  await expect(editor(page)).toContainText('Line 2 changed elsewhere', { timeout: 15_000 })
})

test('a page being typed in is not loaded again under the person, and their save is refused with the notice', async ({ page }) => {
  await page.goto('/tests/outside-changes/harness.html')
  await expect(editor(page)).toContainText('Line 3')
  await editor(page).locator(':scope > *').last().click()
  await page.keyboard.press('End')

  await saveElsewhere(page, linesWith(3, 1))
  await comeBack(page)
  for (const character of 'typed') {
    await page.keyboard.type(character)
    await page.waitForTimeout(150)
  }

  await expect(page.getByText('This page was changed somewhere else after you opened it', { exact: false })).toBeVisible()
  // Nothing was taken from under them: what they typed is still there to copy.
  await expect(editor(page)).toContainText('Line 3typed')
  const server = await page.evaluate(() => window.server)
  expect(server.refused).toBeGreaterThan(0)
  expect(server.saves).toEqual([])
  expect(server.contentLoads).toBe(1)
})

test('a page that saves its own change is not loaded again', async ({ page }) => {
  await page.goto('/tests/outside-changes/harness.html')
  await expect(editor(page)).toContainText('Line 3')
  await editor(page).locator(':scope > *').last().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' mine')
  await expect.poll(() => page.evaluate(() => window.server.saves.length)).toBeGreaterThan(0)

  await page.waitForTimeout(QUIET_MS + 100)
  await comeBack(page)
  await expect.poll(() => page.evaluate(() => window.server.revisionChecks)).toBeGreaterThan(0)
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.server.contentLoads)).toBe(1)
  // Still the same editor, with the caret where it was.
  await page.keyboard.type('!')
  await expect(editor(page)).toContainText('Line 3 mine!')
})
