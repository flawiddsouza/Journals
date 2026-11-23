import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Each test imports the module afresh, for its own record of activity, so the
// mock is made once and handed to every copy.
const { changedElsewhere } = vi.hoisted(() => ({ changedElsewhere: vi.fn() }))
vi.mock('./fetchPlus.js', () => ({ default: { get: vi.fn() } }))
vi.mock('./pageRevisions.js', () => ({ changedElsewhere }))

function deferred() {
    let resolve
    const promise = new Promise((resolvePromise) => (resolve = resolvePromise))
    return { promise, resolve }
}

let windowStub, documentStub, focused
let watchForOutsideChanges, CHECK_EVERY_MS, QUIET_MS
let stops = []

const fire = (target, type, extra = {}) => {
    const event = new Event(type)
    Object.assign(event, extra)
    target.dispatchEvent(event)
}

const watch = (reload) => {
    const stop = watchForOutsideChanges(7, reload, () => Promise.resolve({}))
    stops.push(stop)
    return stop
}

beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    changedElsewhere.mockReset()
    windowStub = new EventTarget()
    focused = true
    documentStub = Object.assign(new EventTarget(), {
        visibilityState: 'visible',
        hasFocus: () => focused,
    })
    vi.stubGlobal('window', windowStub)
    vi.stubGlobal('document', documentStub)
    ;({ watchForOutsideChanges, CHECK_EVERY_MS, QUIET_MS } = await import('./outsideChanges.js'))
})

afterEach(() => {
    stops.forEach((stop) => stop())
    stops = []
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('loading a page saved somewhere else', () => {
    it('asks every few seconds and loads the page again once it changed', async () => {
        changedElsewhere.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
        const reload = vi.fn()
        watch(reload)
        await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
        expect(changedElsewhere).toHaveBeenCalledTimes(1)
        expect(reload).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('asks at once when the tab comes back into view or the window into focus', async () => {
        changedElsewhere.mockResolvedValue(true)
        const reload = vi.fn()
        watch(reload)
        fire(windowStub, 'focus')
        await vi.advanceTimersByTimeAsync(0)
        expect(reload).toHaveBeenCalledTimes(1)
        fire(documentStub, 'visibilitychange')
        await vi.advanceTimersByTimeAsync(0)
        expect(reload).toHaveBeenCalledTimes(2)
    })

    it('a hidden tab does not ask', async () => {
        documentStub.visibilityState = 'hidden'
        watch(vi.fn())
        await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 3)
        expect(changedElsewhere).not.toHaveBeenCalled()
    })

    it('waits while the person is typing, and loads the page once they stop', async () => {
        changedElsewhere.mockResolvedValue(true)
        const reload = vi.fn()
        watch(reload)
        await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS - 200)
        fire(windowStub, 'keydown')
        await vi.advanceTimersByTimeAsync(200)
        expect(changedElsewhere).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(QUIET_MS - 200 - 1)
        expect(reload).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('does not load the page when the person started on it while it was asking', async () => {
        const answer = deferred()
        changedElsewhere.mockReturnValueOnce(answer.promise).mockResolvedValue(true)
        const reload = vi.fn()
        watch(reload)
        await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
        vi.advanceTimersByTime(50)
        fire(windowStub, 'input')
        answer.resolve(true)
        await vi.advanceTimersByTimeAsync(0)
        expect(reload).not.toHaveBeenCalled()
        // Once they stop, it asks again rather than waiting a full round.
        await vi.advanceTimersByTimeAsync(QUIET_MS)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('the click that brings the window back into focus does not hold the page back', async () => {
        changedElsewhere.mockResolvedValue(true)
        const reload = vi.fn()
        watch(reload)
        focused = false
        fire(windowStub, 'pointerdown')
        focused = true
        fire(windowStub, 'focus')
        await vi.advanceTimersByTimeAsync(0)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('a press inside the focused window, or a message from an embedded editor, counts as working on the page', async () => {
        changedElsewhere.mockResolvedValue(true)
        const reload = vi.fn()
        watch(reload)
        fire(windowStub, 'pointerdown')
        fire(windowStub, 'focus')
        await vi.advanceTimersByTimeAsync(0)
        expect(reload).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(QUIET_MS)
        expect(reload).toHaveBeenCalledTimes(1)
        fire(windowStub, 'message', { source: {} })
        fire(windowStub, 'focus')
        await vi.advanceTimersByTimeAsync(0)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('a message the window sends itself does not count', async () => {
        changedElsewhere.mockResolvedValue(true)
        const reload = vi.fn()
        watch(reload)
        fire(windowStub, 'message', { source: windowStub })
        fire(windowStub, 'focus')
        await vi.advanceTimersByTimeAsync(0)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('a failed check is not a change, and the next one still asks', async () => {
        changedElsewhere.mockRejectedValueOnce({ status: 500 }).mockResolvedValueOnce(true)
        const reload = vi.fn()
        watch(reload)
        await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
        expect(reload).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('stops asking once stopped, also with a check on its way', async () => {
        const answer = deferred()
        changedElsewhere.mockReturnValueOnce(answer.promise)
        const reload = vi.fn()
        const stop = watch(reload)
        await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
        stop()
        answer.resolve(true)
        await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 3)
        expect(reload).not.toHaveBeenCalled()
        expect(changedElsewhere).toHaveBeenCalledTimes(1)
    })
})
