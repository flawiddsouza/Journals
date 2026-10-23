import { describe, expect, it, vi } from 'vitest'
import { createTableHistoryDiffLoader, TABLE_HISTORY_TIMEOUT_MS } from './tableHistoryDiffLoader.js'

const table = { columns: [{ name: 'Value', type: 'Computed', expression: 'return 1' }], items: [{}] }
const worker = () => ({ postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null })

describe('table history comparison loading', () => {
    it('cancels an earlier comparison and ignores its late response', async () => {
        const first = worker()
        const second = worker()
        const loader = createTableHistoryDiffLoader(vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second))
        const pendingFirst = loader.load(table, table)
        const pendingSecond = loader.load(table, table)
        expect(await pendingFirst).toBeNull()
        expect(first.terminate).toHaveBeenCalledOnce()
        first.onmessage({ data: { diff: 'stale' } })
        second.onmessage({ data: { diff: 'current' } })
        expect(await pendingSecond).toEqual({ diff: 'current' })
        expect(second.terminate).toHaveBeenCalledOnce()
    })

    it('stops a worker that never finishes instead of claiming the versions match', async () => {
        vi.useFakeTimers()
        try {
            const current = worker()
            const loader = createTableHistoryDiffLoader(() => current)
            const pending = loader.load(table, table)
            vi.advanceTimersByTime(TABLE_HISTORY_TIMEOUT_MS)
            expect(await pending).toEqual({ error: 'The calculations took too long to compare.' })
            expect(current.terminate).toHaveBeenCalledOnce()
        } finally { vi.useRealTimers() }
    })

    it('finishes cancellation and reports worker failures', async () => {
        const current = worker()
        const loader = createTableHistoryDiffLoader(() => current)
        const pending = loader.load(table, table)
        current.onerror()
        expect(await pending).toHaveProperty('error')
        const cancelled = loader.load(table, table)
        loader.cancel()
        expect(await cancelled).toBeNull()
    })

    it('does not start a worker for stored cells without formulas', async () => {
        const factory = vi.fn()
        const loader = createTableHistoryDiffLoader(factory)
        const plain = { columns: [{ name: 'Note' }], items: [{ Note: 'same' }] }
        expect((await loader.load(plain, plain)).diff.rows).toEqual([])
        expect(factory).not.toHaveBeenCalled()
    })
})
