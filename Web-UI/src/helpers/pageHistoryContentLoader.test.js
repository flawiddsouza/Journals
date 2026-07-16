import { describe, expect, it, vi } from 'vitest'
import { createPageHistoryContentLoader } from './pageHistoryContentLoader.js'

const pageHistory = [{ id: 3 }, { id: 2 }, { id: 1 }]

describe('createPageHistoryContentLoader', () => {
    it('loads the selected row and the row directly below it', async () => {
        const fetchContent = vi.fn(async (id) => ({ content: `content-${id}` }))
        const loader = createPageHistoryContentLoader(fetchContent)

        await expect(
            loader.load(pageHistory, pageHistory[1], true),
        ).resolves.toEqual({
            pageContent: 'content-2',
            pageContentOlder: 'content-1',
        })
        expect(fetchContent.mock.calls.map(([id]) => id)).toEqual([2, 1])
    })

    it('uses empty older content for the last row', async () => {
        const fetchContent = vi.fn(async (id) => ({ content: `content-${id}` }))
        const loader = createPageHistoryContentLoader(fetchContent)

        await expect(
            loader.load(pageHistory, pageHistory[2], true),
        ).resolves.toEqual({
            pageContent: 'content-1',
            pageContentOlder: '',
        })
        expect(fetchContent).toHaveBeenCalledTimes(1)
    })

    it('does not fetch the row below when comparison is disabled', async () => {
        const fetchContent = vi.fn(async (id) => ({ content: `content-${id}` }))
        const loader = createPageHistoryContentLoader(fetchContent)

        await loader.load(pageHistory, pageHistory[0], false)
        expect(fetchContent.mock.calls.map(([id]) => id)).toEqual([3])
    })

    it('discards a response after a newer selection starts', async () => {
        let resolveFirst
        const fetchContent = vi.fn((id) => {
            if (id === 3) {
                return new Promise((resolve) => {
                    resolveFirst = () => resolve({ content: 'content-3' })
                })
            }
            return Promise.resolve({ content: `content-${id}` })
        })
        const loader = createPageHistoryContentLoader(fetchContent)
        const first = loader.load(pageHistory, pageHistory[0], true)
        const second = loader.load(pageHistory, pageHistory[1], true)

        await expect(second).resolves.toEqual({
            pageContent: 'content-2',
            pageContentOlder: 'content-1',
        })
        resolveFirst()
        await expect(first).resolves.toBeNull()
    })

    it('discards an active response when cancelled', async () => {
        let resolveContent
        const fetchContent = vi.fn(
            () =>
                new Promise((resolve) => {
                    resolveContent = resolve
                }),
        )
        const loader = createPageHistoryContentLoader(fetchContent)
        const active = loader.load(pageHistory, pageHistory[2], true)

        loader.cancel()
        resolveContent({ content: 'content-1' })
        await expect(active).resolves.toBeNull()
    })

    it('discards an error from an older request', async () => {
        let rejectFirst
        const fetchContent = vi.fn((id) => {
            if (id === 3) {
                return new Promise((resolve, reject) => {
                    rejectFirst = reject
                })
            }
            return Promise.resolve({ content: `content-${id}` })
        })
        const loader = createPageHistoryContentLoader(fetchContent)
        const first = loader.load(pageHistory, pageHistory[0], true)

        await loader.load(pageHistory, pageHistory[1], true)
        rejectFirst(new Error('old request failed'))
        await expect(first).resolves.toBeNull()
    })
})
