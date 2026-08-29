import { describe, expect, it } from 'vitest'
import { generatePageLinks } from './pageNavLinks.js'

describe('page navigation links', () => {
    function handlers(openHelp = () => {}) {
        return {
            openHistory: () => {},
            openUploads: () => {},
            toggleBacklinks: () => {},
            openStyles: () => {},
            openHelp,
            configureMiniApp: () => {},
            exitConfigureMiniApp: () => {},
        }
    }

    it('includes contextual help for every active page', () => {
        const openHelp = () => {}
        const links = generatePageLinks(
            { id: 1, type: 'SpreadsheetV2' },
            {
                miniAppConfigMode: false,
                tableStatsView: false,
                tableStatsEditMode: false,
                tableConfigureMode: false,
                handlers: handlers(openHelp),
            },
        )

        expect(links).toContainEqual({
            href: '#page-help',
            text: 'Help',
            onClick: openHelp,
        })
    })

    it('only shows Help for container page types', () => {
        for (const type of ['PageGroup', 'Favorites']) {
            const links = generatePageLinks(
                { id: 1, type },
                {
                    miniAppConfigMode: false,
                    tableStatsView: false,
                    tableStatsEditMode: false,
                    tableConfigureMode: false,
                    handlers: handlers(),
                },
            )

            expect(links.map((link) => link.text)).toEqual(['Help'])
        }
    })

    it('hides unsupported style and export actions', () => {
        const links = generatePageLinks(
            { id: 1, type: 'MiniApp', view_only: false },
            {
                miniAppConfigMode: false,
                tableStatsView: false,
                tableStatsEditMode: false,
                tableConfigureMode: false,
                handlers: handlers(),
            },
        )
        const texts = links.map((link) => link.text)

        expect(texts).toContain('Configure Mini App')
        expect(texts).not.toContain('Styles')
        expect(texts).not.toContain('Export')
    })
})
