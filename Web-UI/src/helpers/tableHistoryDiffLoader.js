import { diffTableContent } from './tableHistoryDiff.js'
import { tableHistoryHasCalculations } from './tableHistorySnapshot.js'

// The same execution budget as MCP history. Historical formulas can be slow
// or never finish, so they run off the UI thread and can be cancelled.
export const TABLE_HISTORY_TIMEOUT_MS = 5000

export function createTableHistoryDiffLoader(createWorker = () => new Worker(
    new URL('./tableHistoryDiffWorker.js', import.meta.url), { type: 'module' },
)) {
    let pending = null
    function cancel() {
        if (!pending) return
        clearTimeout(pending.timer)
        pending.worker.terminate()
        pending.resolve(null)
        pending = null
    }
    return {
        cancel,
        load(older, newer) {
            cancel()
            if (!tableHistoryHasCalculations(older) && !tableHistoryHasCalculations(newer)) {
                return Promise.resolve({ diff: diffTableContent(older, newer) })
            }
            return new Promise((resolve) => {
                const worker = createWorker()
                const finish = (result) => {
                    if (pending?.worker !== worker) return
                    const complete = pending.resolve
                    clearTimeout(pending.timer)
                    worker.terminate()
                    pending = null
                    complete(result)
                }
                pending = {
                    worker, resolve,
                    timer: setTimeout(() => finish({ error: 'The calculations took too long to compare.' }), TABLE_HISTORY_TIMEOUT_MS),
                }
                worker.onmessage = ({ data }) => finish(data)
                worker.onerror = () => finish({ error: 'Could not compare the calculations in these versions.' })
                try {
                    worker.postMessage({ older, newer })
                } catch {
                    finish({ error: 'Could not compare these versions.' })
                }
            })
        },
    }
}
