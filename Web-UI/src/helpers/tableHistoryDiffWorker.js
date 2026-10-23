import { diffTableContent } from './tableHistoryDiff.js'

// History expressions calculate display values; they do not make requests.
// Keep this worker separate from the live editor and its integrations.
for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'importScripts']) {
    Object.defineProperty(self, name, { value: undefined, configurable: false })
}

const reply = self.postMessage.bind(self)
self.onmessage = ({ data }) => {
    try {
        reply({ diff: diffTableContent(data.older, data.newer) })
    } catch {
        reply({ error: 'Could not compare the calculations in these versions.' })
    }
}
