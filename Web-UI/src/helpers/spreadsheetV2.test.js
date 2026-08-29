import { describe, expect, it } from 'vitest'
import {
    focusSpreadsheetV2CellEditor,
    focusSpreadsheetV2Workbook,
    installUniverScrollRepaint,
    parseSpreadsheetV2ActiveSheetId,
    parseSpreadsheetV2Content,
    parseSpreadsheetV2ViewStateBySheetId,
    SPREADSHEET_V2_SCHEMA_VERSION,
    stringifySpreadsheetV2Content,
} from './spreadsheetV2.js'

describe('Spreadsheet v2 content', () => {
    it('redraws the caret range after focusing a populated cell editor', () => {
        const calls = []
        const cellEditorRanges = [{ startOffset: 5, endOffset: 5 }]
        const focused = focusSpreadsheetV2CellEditor({
            cellEditorActivatedContextKey: 'editor-activated',
            cellEditorUnitId: 'cell-editor',
            univerContextService: {
                getContextValue: (key) => key === 'editor-activated',
            },
            univerEditorService: {
                getEditor: (unitId) => {
                    calls.push(['getEditor', unitId])
                    return {
                        getSelectionRanges: () => cellEditorRanges,
                        setSelectionRanges: (ranges) =>
                            calls.push(['setSelectionRanges', ranges]),
                    }
                },
            },
            univerInstanceService: {
                setCurrentUnitForType: (unitId) =>
                    calls.push(['setCurrentUnitForType', unitId]),
                focusUnit: (unitId) => calls.push(['focusUnit', unitId]),
            },
        })

        expect(focused).toBe(true)
        expect(calls).toEqual([
            ['setCurrentUnitForType', 'cell-editor'],
            ['focusUnit', 'cell-editor'],
            ['getEditor', 'cell-editor'],
            ['setSelectionRanges', cellEditorRanges],
        ])
    })

    it('returns keyboard focus to the workbook after cell editing ends', () => {
        const calls = []
        const focused = focusSpreadsheetV2Workbook({
            workbookUnitId: 'workbook-1',
            univerInstanceService: {
                setCurrentUnitForType: (unitId) =>
                    calls.push(['setCurrentUnitForType', unitId]),
                focusUnit: (unitId) => calls.push(['focusUnit', unitId]),
            },
        })

        expect(focused).toBe(true)
        expect(calls).toEqual([
            ['setCurrentUnitForType', 'workbook-1'],
            ['focusUnit', 'workbook-1'],
        ])
    })

    it('repaints after large scrollbar and wheel movement', async () => {
        let scrollHandler
        let frameId = 0
        let dirtyCount = 0
        let renderCount = 0
        let disposedCount = 0
        const frameCallbacks = new Map()
        const viewport = {
            width: 1000,
            height: 600,
            onScrollByBar$: {
                subscribeEvent: (handler) => {
                    scrollHandler = handler
                    return { unsubscribe: () => disposedCount++ }
                },
            },
        }
        const makeDirtyForScrolling = () => {}
        const scene = {
            getMainViewport: () => viewport,
            makeDirty: () => dirtyCount++,
            makeDirtyForScrolling,
            requestRender: async () => renderCount++,
        }
        const renderManager = {
            getRenderUnitById: (workbookId) =>
                workbookId === 'workbook-1' ? { scene } : null,
        }
        const listener = installUniverScrollRepaint(
            renderManager,
            'workbook-1',
            (callback) => {
                const frameIdResolved = ++frameId
                frameCallbacks.set(frameIdResolved, callback)
                return frameIdResolved
            },
            (frameIdResolved) => frameCallbacks.delete(frameIdResolved),
        )

        scrollHandler({ isBarDragging: true })
        expect(dirtyCount).toBe(0)

        scrollHandler({ isBarDragEnd: true })
        expect(dirtyCount).toBe(0)
        frameCallbacks.get(1)()
        await Promise.resolve()
        expect(dirtyCount).toBe(1)
        expect(renderCount).toBe(1)

        scene.makeDirtyForScrolling()
        expect(dirtyCount).toBe(2)

        listener.dispose()
        expect(disposedCount).toBe(1)
        expect(scene.makeDirtyForScrolling).toBe(makeDirtyForScrolling)
        expect(
            installUniverScrollRepaint(
                renderManager,
                'missing-workbook',
            ),
        ).toBeNull()
    })

    it('treats empty page content as a new workbook', () => {
        expect(parseSpreadsheetV2Content('')).toBeNull()
        expect(parseSpreadsheetV2Content(null)).toBeNull()
    })

    it('round-trips a versioned Univer workbook snapshot', () => {
        const workbook = {
            id: 'workbook-1',
            name: 'Spreadsheet',
            sheetOrder: ['sheet-1'],
            sheets: { 'sheet-1': { id: 'sheet-1', name: 'Sheet 1' } },
        }

        const content = stringifySpreadsheetV2Content(workbook)

        expect(JSON.parse(content).schemaVersion).toBe(
            SPREADSHEET_V2_SCHEMA_VERSION,
        )
        expect(parseSpreadsheetV2Content(content)).toEqual(workbook)
    })

    it('round-trips the active sheet id', () => {
        const workbook = {
            sheetOrder: ['sheet-1', 'sheet-2'],
            sheets: {},
        }
        const content = stringifySpreadsheetV2Content(workbook, 'sheet-2')

        expect(parseSpreadsheetV2ActiveSheetId(content)).toBe('sheet-2')
    })

    it('allows existing workbooks without an active sheet id', () => {
        const content = stringifySpreadsheetV2Content({})

        expect(parseSpreadsheetV2ActiveSheetId(content)).toBeNull()
    })

    it('round-trips per-sheet scroll and selection state', () => {
        const viewStateBySheetId = {
            'sheet-2': {
                scroll: {
                    offsetX: 4,
                    offsetY: 8,
                    sheetViewStartColumn: 5,
                    sheetViewStartRow: 75,
                },
                selection: {
                    startRow: 96,
                    endRow: 96,
                    startColumn: 17,
                    endColumn: 17,
                },
            },
        }
        const content = stringifySpreadsheetV2Content(
            {},
            'sheet-2',
            viewStateBySheetId,
        )

        expect(parseSpreadsheetV2ViewStateBySheetId(content)).toEqual(
            viewStateBySheetId,
        )
    })

    it('allows existing workbooks without per-sheet view state', () => {
        const content = stringifySpreadsheetV2Content({})

        expect(parseSpreadsheetV2ViewStateBySheetId(content)).toEqual({})
    })

    it('does not silently load the legacy spreadsheet format', () => {
        const legacyContent = JSON.stringify([{ name: 'Sheet 1', rows: {} }])

        expect(() => parseSpreadsheetV2Content(legacyContent)).toThrow(
            'does not contain a Spreadsheet v2 workbook',
        )
    })

    it('rejects unknown future schema versions', () => {
        const content = JSON.stringify({
            schemaVersion: SPREADSHEET_V2_SCHEMA_VERSION + 1,
            workbook: {},
        })

        expect(() => parseSpreadsheetV2Content(content)).toThrow(
            'does not contain a Spreadsheet v2 workbook',
        )
    })
})
