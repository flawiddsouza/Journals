import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

class MockEventSource {
    constructor(url) {
        this.url = url
        this.closed = false
        this._listeners = {}
        MockEventSource.instances.push(this)
    }
    addEventListener(event, fn) {
        this._listeners[event] = fn
    }
    close() {
        this.closed = true
    }
    _trigger(event, data) {
        this._listeners[event]?.({ data: JSON.stringify(data) })
    }
    _triggerError() {
        this._listeners['error']?.({})
    }
}
MockEventSource.instances = []

vi.stubGlobal('EventSource', MockEventSource)

import { watchPageUpdates } from './pageEventSource.js'

describe('watchPageUpdates', () => {
    beforeEach(() => {
        MockEventSource.instances = []
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('does not connect when pageId is null', () => {
        watchPageUpdates(() => null, vi.fn(), vi.fn())
        expect(MockEventSource.instances).toHaveLength(0)
    })

    it('connects to correct URL', () => {
        watchPageUpdates(() => '42', vi.fn(), vi.fn())
        expect(MockEventSource.instances[0].url).toBe('/pages/events/42')
    })

    it('calls onClientId with clientId from first message', () => {
        const onClientId = vi.fn()
        watchPageUpdates(() => '42', onClientId, vi.fn())

        MockEventSource.instances[0]._trigger('message', { clientId: 'abc123' })

        expect(onClientId).toHaveBeenCalledWith('abc123')
    })

    it('does not call onUpdate for clientId message', () => {
        const onUpdate = vi.fn()
        watchPageUpdates(() => '42', vi.fn(), onUpdate)

        MockEventSource.instances[0]._trigger('message', { clientId: 'abc123' })

        expect(onUpdate).not.toHaveBeenCalled()
    })

    it('calls onUpdate for update message', () => {
        const onUpdate = vi.fn()
        watchPageUpdates(() => '42', vi.fn(), onUpdate)

        MockEventSource.instances[0]._trigger('message', {})

        expect(onUpdate).toHaveBeenCalledOnce()
    })

    it('closes EventSource and reconnects after 5s on error', () => {
        watchPageUpdates(() => '42', vi.fn(), vi.fn())
        expect(MockEventSource.instances).toHaveLength(1)

        MockEventSource.instances[0]._triggerError()
        vi.advanceTimersByTime(5000)

        expect(MockEventSource.instances).toHaveLength(2)
    })

    it('cleanup closes the EventSource', () => {
        const cleanup = watchPageUpdates(() => '42', vi.fn(), vi.fn())
        const es = MockEventSource.instances[0]

        cleanup()

        expect(es.closed).toBe(true)
    })
})
