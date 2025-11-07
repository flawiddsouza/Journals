import fetchPlus from './fetchPlus.js'

/**
 * Add a page to a favorites page
 * @param {number} favoritesPageId - The ID of the favorites page
 * @param {number} pageId - The ID of the page to add
 */
export async function addPageToFavorites(favoritesPageId, pageId) {
    // Get current favorites page content
    const pageData = await fetchPlus.get(`/pages/content/${favoritesPageId}`)

    let parsedContent = pageData.content
        ? JSON.parse(pageData.content)
        : { activePageId: null, pageRefs: [] }

    const pageRefs = parsedContent.pageRefs || []

    // Add page if not already present
    if (!pageRefs.includes(pageId)) {
        pageRefs.push(pageId)
    }

    // Update the favorites page
    await fetchPlus.put(`/pages/${favoritesPageId}`, {
        pageContent: JSON.stringify({
            activePageId: parsedContent.activePageId,
            pageRefs: pageRefs,
        }),
    })
}

/**
 * Remove a page from a favorites page
 * @param {number} favoritesPageId - The ID of the favorites page
 * @param {number} pageId - The ID of the page to remove
 */
export async function removePageFromFavorites(favoritesPageId, pageId) {
    // Get current favorites page content
    const pageData = await fetchPlus.get(`/pages/content/${favoritesPageId}`)

    let parsedContent = pageData.content
        ? JSON.parse(pageData.content)
        : { activePageId: null, pageRefs: [] }

    let pageRefs = parsedContent.pageRefs || []
    let activePageId = parsedContent.activePageId

    // Remove the page
    pageRefs = pageRefs.filter((id) => id !== pageId)

    // If the removed page was active, set active to first page or null
    if (activePageId === pageId) {
        activePageId = pageRefs.length > 0 ? pageRefs[0] : null
    }

    // Update the favorites page
    await fetchPlus.put(`/pages/${favoritesPageId}`, {
        pageContent: JSON.stringify({
            activePageId: activePageId,
            pageRefs: pageRefs,
        }),
    })
}
