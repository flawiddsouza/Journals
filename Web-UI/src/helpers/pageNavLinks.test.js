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

    it('offers only the configuration action for the current table mode', () => {
        const configureTable = () => {}
        const exitConfigureTable = () => {}
        for (const tableConfigureMode of [false, true]) {
            const links = generatePageLinks(
                { id: 1, type: 'Table', view_only: false },
                {
                    tableConfigureMode,
                    tableStatsView: false,
                    handlers: {
                        ...handlers(),
                        configureTable,
                        exitConfigureTable,
                    },
                },
            )
            const link = links.find(
                (link) =>
                    link.href ===
                    (tableConfigureMode
                        ? '#exit-configure-table'
                        : '#configure-table'),
            )
            expect(link?.onClick).toBe(
                tableConfigureMode ? exitConfigureTable : configureTable,
            )
            expect(
                links.filter((link) =>
                    ['#configure-table', '#exit-configure-table'].includes(
                        link.href,
                    ),
                ),
            ).toHaveLength(1)
            expect(links.some((link) => link.href === '#stats')).toBe(
                !tableConfigureMode,
            )
        }
    })

    it('does not offer table configuration in read-only or stats views', () => {
        for (const [view_only, tableStatsView] of [
            [true, false],
            [false, true],
        ]) {
            const links = generatePageLinks(
                { id: 1, type: 'Table', view_only },
                {
                    tableStatsView,
                    tableConfigureMode: false,
                    handlers: handlers(),
                },
            )
            expect(links.some((link) => link.href === '#configure-table')).toBe(
                false,
            )
        }
    })

    it('offers Pull only for the open table once it has a pull script', () => {
        const pullTable = () => {}
        const pullLinks = (page, tablePullPageId) =>
            generatePageLinks(page, {
                tableStatsView: false,
                tableConfigureMode: false,
                tablePullPageId,
                handlers: { ...handlers(), pullTable },
            }).filter((link) => link.href === '#pull')

        const table = { id: 1, type: 'Table', view_only: false }
        expect(pullLinks(table, 1)).toEqual([{ href: '#pull', text: 'Pull', onClick: pullTable }])
        expect(pullLinks(table, null)).toEqual([])
        expect(pullLinks(table, 2)).toEqual([])
        expect(pullLinks({ ...table, view_only: true }, 1)).toEqual([])
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
