const parameters = new URLSearchParams(window.location.search)
const channelName = parameters.get('channel')
const libraryParameters = new URLSearchParams(window.location.hash.slice(1))
const status = document.getElementById('status')

if (channelName && libraryParameters.has('addLibrary')) {
    const channel = new BroadcastChannel(channelName)
    const message = {
        type: 'excalidraw-library',
        hash: window.location.hash,
    }
    let finished = false

    const finish = () => {
        if (finished) return
        finished = true
        window.clearInterval(retryTimer)
        channel.close()
        status.textContent = 'Library added. Closing...'
        window.setTimeout(() => window.close(), 0)
    }

    channel.onmessage = ({ data }) => {
        if (data?.type === 'excalidraw-library-received') finish()
    }
    channel.postMessage(message)
    const retryTimer = window.setInterval(
        () => channel.postMessage(message),
        200,
    )
    window.setTimeout(finish, 2000)
} else {
    status.textContent =
        'The library could not be added. You can close this window.'
}
