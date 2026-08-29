import { expect, test } from '@playwright/test'
import path from 'node:path'

const pageTypes = [
    'FlatPage',
    'FlatPageV2',
    'RichText',
    'Table',
    'Spreadsheet',
    'SpreadsheetV2',
    'DrawIO',
    'Excalidraw',
    'PageGroup',
    'Favorites',
    'Kanban',
    'MiniApp',
    'VersatileCalculator',
    'TaskList',
]

for (const type of pageTypes) {
    test(`${type} has specific, reachable help`, async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 })
        await page.goto(`/tests/page-help/harness.html?type=${type}`)
        await page.getByRole('link', { name: 'Help', exact: true }).click()

        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByRole('heading', { level: 2 })).toContainText(
            'Help',
        )
        const helpItemCount = await dialog.locator('.page-help-item').count()
        expect(helpItemCount).toBeGreaterThan(2)

        if (process.env.PAGE_HELP_SCREENSHOT_DIR) {
            const fileName = type
                .replace(/([a-z])([A-Z])/g, '$1-$2')
                .toLowerCase()

            await page.screenshot({
                path: path.join(
                    process.env.PAGE_HELP_SCREENSHOT_DIR,
                    `${fileName}.png`,
                ),
                fullPage: true,
            })
        }
    })
}
