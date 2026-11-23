// An open page that was saved somewhere else, on another device, in another
// tab or by an agent over MCP, is loaded again in place, so the person does not
// go on editing an old copy whose saves the API would refuse.
//
// It is loaded again only when nothing typed here can still be waiting to be
// saved. Page types save a moment after the last change, and a copy taken out
// from under such a save would lose it. So the page waits until the person has
// left it alone for QUIET_MS. A save that does go out from the old copy carries
// the old revision, and the API refuses it with the usual notice.

import fetchPlus from './fetchPlus.js'
import { changedElsewhere } from './pageRevisions.js'

// How often an open page asks, while the tab is in view. A tab coming back into
// view, or the window back into focus, asks at once.
export const CHECK_EVERY_MS = 10_000
// Longer than the longest wait before a page type saves a change (Excalidraw,
// 700 ms), so a quiet page has nothing left to save.
export const QUIET_MS = 1_000

// Anything that can change a page: typing, pasting, dropping, a press that
// drags or ticks something, scrolling a sheet or drawing whose view is saved,
// and messages from embedded editors (draw.io, Mini Apps), whose own input
// this document never sees.
const ACTIVITY_EVENTS = ['keydown', 'input', 'compositionstart', 'paste', 'cut', 'drop', 'pointerdown', 'wheel', 'scroll']

let lastActivityAt = -Infinity
let listening = false

function noteActivity(event) {
    // The click that brings the window back into focus is the person arriving,
    // not editing. Reloading then is the point.
    if (event.type === 'pointerdown' && !document.hasFocus()) return
    lastActivityAt = Date.now()
}

function noteMessage(event) {
    if (event.source && event.source !== window) lastActivityAt = Date.now()
}

function listen() {
    if (listening) return
    listening = true
    // Capture, so a handler that stops the event still lets it be seen, and
    // scroll, which does not bubble, is seen too.
    ACTIVITY_EVENTS.forEach((type) => window.addEventListener(type, noteActivity, { capture: true, passive: true }))
    window.addEventListener('message', noteMessage)
}

/**
 * Starts watching `pageId` and calls `reload()` when it was saved somewhere
 * else and the person is not in the middle of changing it. Returns a function
 * that stops watching.
 */
export function watchForOutsideChanges(pageId, reload, fetchRevision = () => fetchPlus.get(`/pages/revision/${pageId}`)) {
    listen()
    let stopped = false
    let checking = false
    let timer = null

    const schedule = (ms) => {
        clearTimeout(timer)
        if (!stopped) timer = setTimeout(check, ms)
    }

    async function check() {
        if (stopped || checking) return
        // A hidden tab asks again when it is shown.
        if (document.visibilityState === 'hidden') return
        const quietFor = Date.now() - lastActivityAt
        if (quietFor < QUIET_MS) return schedule(QUIET_MS - quietFor)

        checking = true
        const startedAt = Date.now()
        let changed = false
        try {
            changed = await changedElsewhere(pageId, fetchRevision)
        } catch {
            // Offline, signed out or the page is gone: nothing to load. The
            // next check asks again.
        }
        checking = false
        if (stopped) return
        if (changed && lastActivityAt < startedAt) {
            reload()
        } else if (changed) {
            // The person started on the page while it was asking. Their
            // change is saved against the old copy and refused, or, once they
            // stop, the next check loads the page.
            return schedule(QUIET_MS)
        }
        schedule(CHECK_EVERY_MS)
    }

    const checkNow = () => schedule(0)
    const onVisibility = () => {
        if (document.visibilityState === 'visible') checkNow()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', checkNow)
    window.addEventListener('online', checkNow)
    schedule(CHECK_EVERY_MS)

    return () => {
        stopped = true
        clearTimeout(timer)
        document.removeEventListener('visibilitychange', onVisibility)
        window.removeEventListener('focus', checkNow)
        window.removeEventListener('online', checkNow)
    }
}

// Where an element sits under `root`, as child positions, so the matching
// element of content drawn again can be found.
function pathFrom(root, element) {
    const path = []
    for (let node = element; node !== root; node = node.parentElement) {
        path.unshift(Array.prototype.indexOf.call(node.parentElement.children, node))
    }
    return path
}

const follow = (root, path) => path.reduce((node, index) => node && node.children[index], root)

/**
 * Call just before the content inside `content` is replaced by the same page
 * loaded again. Every scrolled element in `page`, the page type's own included,
 * is put back where it was once `loaded` resolves and the new content is laid
 * out. Until then the content stays hidden, so it never shows at the top first
 * and then jumps.
 */
export function keepScrollPlace(page, content, loaded) {
    if (!page || !content) return
    const scrolled = [page, ...page.querySelectorAll('*')]
        .filter((element) => element.scrollTop > 0 || element.scrollLeft > 0)
        .map((element) => ({ path: pathFrom(page, element), top: element.scrollTop, left: element.scrollLeft }))
    content.style.visibility = 'hidden'

    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
    // A load that never answers must not leave the page hidden.
    const giveUp = new Promise((resolve) => setTimeout(resolve, 5_000))
    Promise.race([loaded, giveUp])
        .then(() => new Promise((resolve) => setTimeout(resolve)))
        .then(frame)
        .then(frame)
        .then(() => {
            scrolled.forEach(({ path, top, left }) => {
                const element = follow(page, path)
                if (!element) return
                element.scrollTop = top
                element.scrollLeft = left
            })
            content.style.visibility = ''
        })
}
