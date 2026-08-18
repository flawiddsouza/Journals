import { describe, expect, it, vi } from 'vitest'
import {
    addExcalidrawFileNames,
    createExcalidrawLibraryAdapter,
    getExcalidrawUploadFilename,
    getReferencedExcalidrawFileIds,
    parseExcalidrawPageContent,
} from './excalidrawPage.js'

describe('Excalidraw page storage', () => {
    it('loads and saves the account library through its API', async () => {
        const libraryData = { libraryItems: [{ id: 'library-item' }] }
        const fetchClient = {
            get: vi.fn().mockResolvedValue(libraryData),
            put: vi.fn().mockResolvedValue({ success: true }),
        }
        const adapter = createExcalidrawLibraryAdapter(fetchClient)

        await expect(adapter.load()).resolves.toBe(libraryData)
        await expect(adapter.save(libraryData)).resolves.toBeUndefined()
        expect(fetchClient.get).toHaveBeenCalledWith(
            '/user-settings/excalidraw.library',
        )
        expect(fetchClient.put).toHaveBeenCalledWith(
            '/user-settings/excalidraw.library',
            { settingValue: libraryData },
        )
    })

    it('rejects malformed stored and outgoing libraries', async () => {
        const fetchClient = {
            get: vi.fn().mockResolvedValue({ unexpected: true }),
            put: vi.fn(),
        }
        const adapter = createExcalidrawLibraryAdapter(fetchClient)

        await expect(adapter.load()).resolves.toEqual({ libraryItems: [] })
        await expect(adapter.save({ unexpected: true })).rejects.toThrow(
            'Invalid Excalidraw library',
        )
        expect(fetchClient.put).not.toHaveBeenCalled()
    })

    it('starts with an empty scene', () => {
        expect(parseExcalidrawPageContent(null)).toEqual({
            scene: { elements: [], appState: {} },
            fileNames: {},
        })
    })

    it('separates Journals filenames from Excalidraw initial data', () => {
        const content = JSON.stringify({
            type: 'excalidraw',
            elements: [{ id: 'shape' }],
            files: { ignored: { dataURL: 'data:image/png;base64,large' } },
            journalsFiles: { file1: 'stored.png' },
        })

        expect(parseExcalidrawPageContent(content)).toEqual({
            scene: {
                type: 'excalidraw',
                elements: [{ id: 'shape' }],
            },
            fileNames: { file1: 'stored.png' },
        })
    })

    it('stores filenames only for live image elements', () => {
        const elements = [
            { type: 'image', fileId: 'used', isDeleted: false },
            { type: 'image', fileId: 'used', isDeleted: false },
            { type: 'image', fileId: 'deleted', isDeleted: true },
            { type: 'rectangle', fileId: 'not-an-image', isDeleted: false },
        ]

        expect(getReferencedExcalidrawFileIds(elements)).toEqual(['used'])

        const result = JSON.parse(
            addExcalidrawFileNames(
                JSON.stringify({ type: 'excalidraw', elements }),
                elements,
                {
                    used: 'used.png',
                    deleted: 'deleted.png',
                    missing: 'missing.png',
                },
            ),
        )

        expect(result.journalsFiles).toEqual({ used: 'used.png' })
        expect(JSON.stringify(result)).not.toContain('data:image')
    })

    it('keeps the viewport fields removed by Excalidraw serialization', () => {
        const result = JSON.parse(
            addExcalidrawFileNames(
                JSON.stringify({
                    type: 'excalidraw',
                    elements: [],
                    appState: { viewBackgroundColor: '#ffffff' },
                }),
                [],
                {},
                {
                    scrollX: 123,
                    scrollY: -45,
                    zoom: { value: 1.5 },
                },
            ),
        )

        expect(result.appState).toEqual({
            viewBackgroundColor: '#ffffff',
            scrollX: 123,
            scrollY: -45,
            zoom: { value: 1.5 },
        })
    })

    it('uses a safe extension for uploaded images', () => {
        expect(getExcalidrawUploadFilename('abc', 'image/png')).toBe(
            'excalidraw-abc.png',
        )
        expect(
            getExcalidrawUploadFilename('abc', 'application/octet-stream'),
        ).toBe('excalidraw-abc.bin')
    })
})
