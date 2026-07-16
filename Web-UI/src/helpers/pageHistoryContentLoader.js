export function createPageHistoryContentLoader(fetchContent) {
    let requestId = 0

    return {
        async load(pageHistory, pageHistoryItem, includeContentOlder) {
            const requestIdActive = ++requestId
            const itemIndex = pageHistory.findIndex(
                (item) => item.id === pageHistoryItem.id,
            )
            const itemOlder = includeContentOlder
                ? pageHistory[itemIndex + 1]
                : null
            try {
                const [response, responseOlder] = await Promise.all([
                    fetchContent(pageHistoryItem.id),
                    itemOlder
                        ? fetchContent(itemOlder.id)
                        : Promise.resolve({ content: '' }),
                ])

                if (requestIdActive !== requestId) return null

                return {
                    pageContent: response.content ?? '',
                    pageContentOlder: responseOlder.content ?? '',
                }
            } catch (error) {
                if (requestIdActive !== requestId) return null
                throw error
            }
        },

        cancel() {
            requestId += 1
        },
    }
}
