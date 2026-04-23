export function watchPageUpdates(getPageId, onClientId, onUpdate) {
    let eventSource = null

    function connect() {
        const pageId = getPageId()
        if (!pageId) return

        eventSource = new EventSource(`/pages/events/${pageId}`)

        eventSource.addEventListener('message', (event) => {
            const data = JSON.parse(event.data)
            if (data.clientId) {
                onClientId(data.clientId)
                return
            }
            onUpdate()
        })

        eventSource.addEventListener('error', () => {
            eventSource.close()
            setTimeout(connect, 5000)
        })
    }

    connect()

    return function () {
        eventSource?.close()
    }
}
