import { beforeEach, describe, expect, it, vi } from 'vitest'
import fetchPlus from './fetchPlus.js'
import {
    fetchTablePageContent,
    saveTablePageContent,
} from './tablePagePersistence.js'

vi.mock('./fetchPlus.js', () => ({ default: { get: vi.fn(), put: vi.fn() } }))

function deferred() {
    let resolve, reject
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })
    return { promise, resolve, reject }
}

beforeEach(() => {
    vi.resetAllMocks()
    fetchPlus.get.mockResolvedValue({ content: 'saved' })
    fetchPlus.put.mockResolvedValue({})
})

describe('table page persistence', () => {
    it('sends a later snapshot only after the earlier save completes', async () => {
        const first = deferred()
        fetchPlus.put.mockReturnValueOnce(first.promise)
        const saveFirst = saveTablePageContent(42, 'typed')
        const saveSecond = saveTablePageContent(42, 'undone')
        expect(fetchPlus.put).toHaveBeenCalledTimes(1)
        first.resolve({})
        await Promise.all([saveFirst, saveSecond])
        expect(fetchPlus.put.mock.calls).toEqual([
            ['/pages/42', { pageContent: 'typed' }],
            ['/pages/42', { pageContent: 'undone' }],
        ])
    })

    it('keeps unrelated pages independent while one save is pending', async () => {
        const first = deferred()
        fetchPlus.put.mockReturnValueOnce(first.promise)
        const saveFirst = saveTablePageContent(42, 'held')
        await saveTablePageContent(43, 'independent')
        await fetchTablePageContent(43)
        expect(fetchPlus.get).toHaveBeenCalledWith('/pages/content/43')
        expect(fetchPlus.put).toHaveBeenCalledTimes(2)
        first.resolve({})
        await saveFirst
    })

    it('reopening a page waits for its latest queued snapshot', async () => {
        const first = deferred(),
            second = deferred()
        fetchPlus.put
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise)
        const saveFirst = saveTablePageContent(42, 'first')
        const saveSecond = saveTablePageContent(42, 'second')
        const load = fetchTablePageContent(42)
        expect(fetchPlus.get).not.toHaveBeenCalled()
        first.resolve({})
        await saveFirst
        expect(fetchPlus.get).not.toHaveBeenCalled()
        second.resolve({})
        await Promise.all([saveSecond, load])
        expect(fetchPlus.get).toHaveBeenCalledWith('/pages/content/42')
    })

    it('a failed save does not block a newer full snapshot', async () => {
        const first = deferred()
        fetchPlus.put.mockReturnValueOnce(first.promise)
        const saveFirst = saveTablePageContent(42, 'first')
        const failed = expect(saveFirst).rejects.toThrow('offline')
        const saveSecond = saveTablePageContent(42, 'newer')
        first.reject(new Error('offline'))
        await failed
        await saveSecond
        await fetchTablePageContent(42)
        expect(fetchPlus.put.mock.calls.at(-1)).toEqual([
            '/pages/42',
            { pageContent: 'newer' },
        ])
        expect(fetchPlus.get).toHaveBeenCalledTimes(1)
    })

    it('a waiting load rejects a failed save instead of reading stale server data', async () => {
        const pending = deferred()
        fetchPlus.put.mockReturnValueOnce(pending.promise)
        const save = saveTablePageContent(42, 'latest')
        const load = fetchTablePageContent(42)
        const saveFailed = expect(save).rejects.toThrow('offline')
        const loadFailed = expect(load).rejects.toThrow('offline')
        pending.reject(new Error('offline'))
        await Promise.all([saveFailed, loadFailed])
        expect(fetchPlus.get).not.toHaveBeenCalled()
        // Once that request has settled, a fresh load is possible.
        await fetchTablePageContent(42)
        expect(fetchPlus.get).toHaveBeenCalledTimes(1)
    })
})
