import fetchPlus from './fetchPlus.js'

// Share pending saves across table instances so closing and reopening a page
// cannot let an older request overwrite newer edits. Other pages stay independent.
const pageSaveRequests = new Map()

export function saveTablePageContent(pageId, pageContent) {
    const save = () => fetchPlus.put(`/pages/${pageId}`, { pageContent })
    const requestPrevious = pageSaveRequests.get(pageId)
    // A failed save must not prevent a later full snapshot from being saved.
    const request = requestPrevious ? requestPrevious.then(save, save) : save()
    pageSaveRequests.set(pageId, request)
    const removeRequest = () => {
        if (pageSaveRequests.get(pageId) === request)
            pageSaveRequests.delete(pageId)
    }
    request.then(removeRequest, removeRequest)
    return request
}

export async function fetchTablePageContent(pageId) {
    // Reopening the same page must read the edits still being saved by its
    // previous instance. Without a pending save, fetch immediately.
    await pageSaveRequests.get(pageId)
    return fetchPlus.get(`/pages/content/${pageId}`)
}
