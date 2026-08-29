import { describe, expect, it } from 'vitest'
import { getPageHelp, pageHelpTypes } from './pageHelp.js'

const supportedPageTypes = [
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

describe('page help', () => {
    it('has specific help for every supported page type', () => {
        expect(pageHelpTypes).toEqual(supportedPageTypes)

        for (const type of supportedPageTypes) {
            const help = getPageHelp({ type })

            expect(help.description).not.toBe(
                'Use this guide to discover the tools available for the current page.',
            )
            expect(help.groups.length).toBeGreaterThan(0)
            expect(
                help.groups.flatMap((group) => group.items).length,
            ).toBeGreaterThan(2)
        }
    })

    it('documents Flat Page v2 hidden creation and table shortcuts', () => {
        const help = getPageHelp({ type: 'FlatPageV2' })
        const items = help.groups.flatMap((group) => group.items)

        expect(items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ shortcut: '[] then Space' }),
                expect.objectContaining({ shortcut: '/table then Enter' }),
                expect.objectContaining({ shortcut: 'Ctrl+Shift+Enter' }),
            ]),
        )
    })

    it('explains backlinks on every page type', () => {
        for (const type of ['FlatPageV2', 'Table', 'SpreadsheetV2']) {
            const help = getPageHelp({ type })
            const backlinks = help.groups
                .flatMap((group) => group.items)
                .find((item) => item.name === 'Backlinks')

            expect(backlinks.description).toContain('pages that reference')
            expect(backlinks.description).toContain('this page references')
        }
    })

    it('omits unavailable styles and export tools', () => {
        for (const type of [
            'SpreadsheetV2',
            'DrawIO',
            'Excalidraw',
            'Kanban',
            'MiniApp',
        ]) {
            const items = getPageHelp({ type }).groups.flatMap(
                (group) => group.items,
            )

            expect(items.some((item) => item.name === 'Styles')).toBe(false)
            expect(items.some((item) => item.name === 'Export')).toBe(false)
        }
    })
})
