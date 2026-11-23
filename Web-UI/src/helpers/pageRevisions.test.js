import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearBanner, showAlert, showBanner, showConfirm } from './dialogs.js'
import { changedElsewhere, resetPageRevisions, tellSaveFailed, whenPageLoaded, withPageRevision } from './pageRevisions.js'

vi.mock('./dialogs.js', () => ({
    showAlert: vi.fn(),
    showConfirm: vi.fn(),
    showBanner: vi.fn(),
    clearBanner: vi.fn(),
}))

function deferred() {
    let resolve, reject
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })
    return { promise, resolve, reject }
}

let reload
const conflict = { status: 409, conflict: true }
// The notice is shown after the save has already been refused.
const settled = () => new Promise((resolve) => setTimeout(resolve))

beforeEach(() => {
    vi.resetAllMocks()
    resetPageRevisions()
    showConfirm.mockResolvedValue(false)
    reload = vi.fn()
    vi.stubGlobal('location', { reload })
})

afterEach(() => {
    vi.unstubAllGlobals()
})

const load = (pageId, revision) =>
    withPageRevision('get', `/pages/content/${pageId}`, undefined, () =>
        Promise.resolve({ content: 'x', revision }),
    )

describe('page revisions', () => {
    it('sends the revision a page was loaded at, then the one each save returns', async () => {
        await load(7, 'rev1')
        const send = vi.fn().mockResolvedValueOnce({ success: true, revision: 'rev2' }).mockResolvedValueOnce({ success: true, revision: 'rev3' })
        await withPageRevision('put', '/pages/7', { pageContent: 'a' }, send)
        await withPageRevision('put', '/pages/7', { pageContent: 'b' }, send)
        expect(send.mock.calls).toEqual([
            [{ pageContent: 'a', baseRevision: 'rev1' }],
            [{ pageContent: 'b', baseRevision: 'rev2' }],
        ])
    })

    it('holds a second save until the first has answered, so it carries the new revision', async () => {
        await load(7, 'rev1')
        const first = deferred()
        const send = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce({ success: true, revision: 'rev3' })
        const saveFirst = withPageRevision('put', '/pages/7', { pageContent: 'a' }, send)
        const saveSecond = withPageRevision('put', '/pages/7', { pageContent: 'b' }, send)
        expect(send).toHaveBeenCalledTimes(1)
        first.resolve({ success: true, revision: 'rev2' })
        await Promise.all([saveFirst, saveSecond])
        expect(send.mock.calls[1]).toEqual([{ pageContent: 'b', baseRevision: 'rev2' }])
    })

    it('a page that was never loaded here is saved without a revision', async () => {
        const send = vi.fn().mockResolvedValue({ success: true, revision: 'rev2' })
        await withPageRevision('put', '/pages/9', { pageContent: 'a' }, send)
        expect(send).toHaveBeenCalledWith({ pageContent: 'a' })
    })

    it('a refused save asks once, saves nothing more, and a fresh load clears it', async () => {
        await load(7, 'rev1')
        const send = vi.fn().mockRejectedValue({ status: 409 })
        await expect(withPageRevision('put', '/pages/7', { pageContent: 'a' }, send)).rejects.toEqual(conflict)
        await expect(withPageRevision('put', '/pages/7', { pageContent: 'b' }, send)).rejects.toEqual(conflict)
        await settled()
        expect(showConfirm).toHaveBeenCalledTimes(1)
        expect(send).toHaveBeenCalledTimes(1)
        expect(reload).not.toHaveBeenCalled()
        // Staying leaves a notice up, with the way out on it.
        expect(showBanner).toHaveBeenCalledTimes(1)
        showBanner.mock.calls[0][1].onAction()
        expect(reload).toHaveBeenCalledTimes(1)
        expect(clearBanner).not.toHaveBeenCalled()

        await load(7, 'rev5')
        const sendAgain = vi.fn().mockResolvedValue({ success: true, revision: 'rev6' })
        await withPageRevision('put', '/pages/7', { pageContent: 'c' }, sendAgain)
        expect(sendAgain).toHaveBeenCalledWith({ pageContent: 'c', baseRevision: 'rev5' })
        expect(clearBanner).toHaveBeenCalledTimes(1)
    })

    it('choosing to load the latest version reloads, with no notice left behind', async () => {
        showConfirm.mockResolvedValue(true)
        await load(7, 'rev1')
        await expect(withPageRevision('put', '/pages/7', { pageContent: 'a' }, () => Promise.reject({ status: 409 }))).rejects.toEqual(conflict)
        await settled()
        expect(reload).toHaveBeenCalledTimes(1)
        expect(showBanner).not.toHaveBeenCalled()
    })

    it('a page type reports a failed save, but not one that was refused and already explained', () => {
        tellSaveFailed(conflict)
        expect(showAlert).not.toHaveBeenCalled()
        tellSaveFailed({ status: 500 })
        expect(showAlert).toHaveBeenCalledWith('Page Save Failed')
    })

    it('any other failure is passed on without asking, and the next save still goes out', async () => {
        await load(7, 'rev1')
        await expect(withPageRevision('put', '/pages/7', { pageContent: 'a' }, () => Promise.reject({ status: 500 }))).rejects.toEqual({ status: 500 })
        expect(showConfirm).not.toHaveBeenCalled()
        const send = vi.fn().mockResolvedValue({ success: true, revision: 'rev2' })
        await withPageRevision('put', '/pages/7', { pageContent: 'b' }, send)
        expect(send).toHaveBeenCalledWith({ pageContent: 'b', baseRevision: 'rev1' })
    })

    it('a load waits for a save of the same page that is still on its way', async () => {
        await load(7, 'rev1')
        const saving = deferred()
        const save = withPageRevision('put', '/pages/7', { pageContent: 'a' }, () => saving.promise)
        const sendLoad = vi.fn().mockResolvedValue({ content: 'a', revision: 'rev2' })
        const loading = withPageRevision('get', '/pages/content/7', undefined, sendLoad)
        await Promise.resolve()
        expect(sendLoad).not.toHaveBeenCalled()
        saving.resolve({ success: true, revision: 'rev2' })
        await Promise.all([save, loading])
        expect(sendLoad).toHaveBeenCalledTimes(1)
    })

    it('a page saved somewhere else is told apart from one that was not', async () => {
        await load(7, 'rev1')
        expect(await changedElsewhere(7, () => Promise.resolve({ revision: 'rev1' }))).toBe(false)
        expect(await changedElsewhere(7, () => Promise.resolve({ revision: 'rev2' }))).toBe(true)
        // Its own save moves the revision this tab knows.
        await withPageRevision('put', '/pages/7', { pageContent: 'a' }, () => Promise.resolve({ success: true, revision: 'rev3' }))
        expect(await changedElsewhere(7, () => Promise.resolve({ revision: 'rev3' }))).toBe(false)
    })

    it('a page never loaded here, or one whose refused save is waiting on the person, is not reported', async () => {
        const fetchRevision = vi.fn().mockResolvedValue({ revision: 'rev2' })
        expect(await changedElsewhere(9, fetchRevision)).toBe(false)
        await load(7, 'rev1')
        await expect(withPageRevision('put', '/pages/7', { pageContent: 'a' }, () => Promise.reject({ status: 409 }))).rejects.toEqual(conflict)
        expect(await changedElsewhere(7, fetchRevision)).toBe(false)
        expect(fetchRevision).not.toHaveBeenCalled()
    })

    it('a save of this tab still on its way is not mistaken for one made elsewhere', async () => {
        await load(7, 'rev1')
        const saving = deferred()
        const save = withPageRevision('put', '/pages/7', { pageContent: 'a' }, () => saving.promise)
        const fetchRevision = vi.fn().mockResolvedValue({ revision: 'rev2' })
        expect(await changedElsewhere(7, fetchRevision)).toBe(false)
        expect(fetchRevision).not.toHaveBeenCalled()
        saving.resolve({ success: true, revision: 'rev2' })
        await save
    })

    it('a save of this tab that crosses the check is not mistaken for one made elsewhere', async () => {
        await load(7, 'rev1')
        const answer = deferred()
        const checking = changedElsewhere(7, () => answer.promise)
        // The check reached the API after this save had already landed there.
        await withPageRevision('put', '/pages/7', { pageContent: 'a' }, () => Promise.resolve({ success: true, revision: 'rev2' }))
        answer.resolve({ revision: 'rev2' })
        expect(await checking).toBe(false)
    })

    it('a save that crosses the check and lands back on the known content is not reported either', async () => {
        await load(7, 'rev1')
        const answer = deferred()
        const checking = changedElsewhere(7, () => answer.promise)
        await withPageRevision('put', '/pages/7', { pageContent: 'b' }, () => Promise.resolve({ success: true, revision: 'rev2' }))
        await withPageRevision('put', '/pages/7', { pageContent: 'a' }, () => Promise.resolve({ success: true, revision: 'rev1' }))
        // The check was answered between the two saves.
        answer.resolve({ revision: 'rev2' })
        expect(await checking).toBe(false)
    })

    it('tells a waiter when the next load of a page answers, also when it fails', async () => {
        const loaded = vi.fn()
        whenPageLoaded(7).then(loaded)
        await load(8, 'rev1')
        await settled()
        expect(loaded).not.toHaveBeenCalled()
        await expect(withPageRevision('get', '/pages/content/7', undefined, () => Promise.reject({ status: 500 }))).rejects.toEqual({ status: 500 })
        await settled()
        expect(loaded).toHaveBeenCalledTimes(1)
    })

    it('other requests pass straight through, untouched', async () => {
        const send = vi.fn().mockResolvedValue({ ok: 1 })
        await withPageRevision('put', '/pages/name/7', { pageName: 'n' }, send)
        await withPageRevision('get', '/pages/7', undefined, send)
        await withPageRevision('delete', '/pages/7', undefined, send)
        expect(send.mock.calls).toEqual([[{ pageName: 'n' }], [undefined], [undefined]])
    })
})
