// A page is saved whole, so a save made from an older copy would undo whatever
// was saved in between: another tab, another device, an agent over MCP. The API
// refuses such a save when it is told which revision the copy came from
// (PUT /pages/:page_id, baseRevision). This keeps that revision per page and
// sends it along, so every page type gets the check without knowing about it.

import { clearBanner, showAlert, showBanner, showConfirm } from './dialogs.js'

const CONTENT_URL = /^\/pages\/content\/(\d+)$/
const SAVE_URL = /^\/pages\/(\d+)$/

const revisions = new Map()
// One save per page at a time. A second one sent before the first answers
// would carry the revision the first is about to replace.
const saves = new Map()
const conflicted = new Set()
// Counts each load and save of a page as it starts and as it answers, so a
// check for changes made elsewhere can tell that one of this tab's own crossed it.
const touches = new Map()
const touch = (pageId) => touches.set(pageId, (touches.get(pageId) || 0) + 1)
const loadWaiters = new Map()

const reload = () => globalThis.location.reload()

async function tellAboutConflict(pageId) {
    conflicted.add(pageId)
    const reloadNow = await showConfirm(
        [
            'This page was changed somewhere else after you opened it: another tab, another device or an agent.',
            'Your last change here was NOT saved, and nothing more will be saved from this tab until the page is loaded again.',
            'You can stay to copy your text out first.',
        ].join('\n\n'),
        { confirmLabel: 'Load the latest version', cancelLabel: 'Stay here' },
    )
    if (reloadNow) return reload()
    showBanner('This page changed somewhere else. Nothing is being saved from this tab.', {
        actionLabel: 'Load the latest version',
        onAction: reload,
    })
}

/** What a page type calls when a save fails. A refused save has already been
 *  explained, so it is not reported a second time. */
export function tellSaveFailed(failure) {
    if (failure && failure.conflict) return
    showAlert('Page Save Failed')
}

/**
 * Wraps a request when it loads or saves page content, and passes any other
 * straight through. `send(data)` makes the request and resolves to its JSON.
 */
export function withPageRevision(method, url, data, send) {
    const verb = method.toUpperCase()
    const loading = verb === 'GET' && url.match(CONTENT_URL)
    const saving =
        verb === 'PUT' && data && typeof data.pageContent === 'string' && url.match(SAVE_URL)

    if (loading) {
        const pageId = loading[1]
        touch(pageId)
        // A save still on its way would make this read, and its revision, old
        // the moment it arrives.
        const settled = () => {}
        const answered = () => {
            touch(pageId)
            const waiters = loadWaiters.get(pageId) || []
            loadWaiters.delete(pageId)
            waiters.forEach((resolve) => resolve())
        }
        return Promise.resolve(saves.get(pageId))
            .then(settled, settled)
            .then(() => send(data))
            .then(
                (response) => {
                    if (response && response.revision) {
                        revisions.set(pageId, response.revision)
                        if (conflicted.delete(pageId) && !conflicted.size) clearBanner()
                    }
                    answered()
                    return response
                },
                (failure) => {
                    answered()
                    return Promise.reject(failure)
                },
            )
    }

    if (!saving) return send(data)

    const pageId = saving[1]
    touch(pageId)
    const save = () => {
        if (conflicted.has(pageId)) return Promise.reject({ status: 409, conflict: true })
        const baseRevision = revisions.get(pageId)
        return send(baseRevision ? { ...data, baseRevision } : data).then(
            (response) => {
                touch(pageId)
                if (response && response.revision)
                    revisions.set(pageId, response.revision)
                return response
            },
            (failure) => {
                touch(pageId)
                if (failure && failure.status === 409) {
                    tellAboutConflict(pageId)
                    return Promise.reject({ status: 409, conflict: true })
                }
                return Promise.reject(failure)
            },
        )
    }
    const previous = saves.get(pageId)
    const request = previous ? previous.then(save, save) : save()
    saves.set(pageId, request)
    const forget = () => {
        if (saves.get(pageId) === request) saves.delete(pageId)
    }
    request.then(forget, forget)
    return request
}

/**
 * Whether a page this tab loaded was saved somewhere else since this tab last
 * loaded or saved it. `fetchRevision()` resolves to `{ revision }`, the page's
 * revision now. Answers false whenever it cannot tell: the page was never
 * loaded here, a save from this tab is on its way or crossed the check, or a
 * refused save has already told the person and is waiting on them.
 */
export async function changedElsewhere(pageId, fetchRevision) {
    const id = String(pageId)
    const known = revisions.get(id)
    if (!known || saves.has(id) || conflicted.has(id)) return false
    const touched = touches.get(id)
    const response = await fetchRevision()
    if (touches.get(id) !== touched || conflicted.has(id)) return false
    return Boolean(response && response.revision) && response.revision !== known
}

/** Resolves once the next load of the page has answered, either way. */
export function whenPageLoaded(pageId) {
    const id = String(pageId)
    return new Promise((resolve) => {
        loadWaiters.set(id, [...(loadWaiters.get(id) || []), resolve])
    })
}

/** For tests. */
export function resetPageRevisions() {
    revisions.clear()
    saves.clear()
    conflicted.clear()
    touches.clear()
    loadWaiters.clear()
}
