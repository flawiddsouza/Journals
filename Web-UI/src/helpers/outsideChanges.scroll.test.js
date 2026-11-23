// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { keepScrollPlace } from './outsideChanges.js'

vi.mock('./fetchPlus.js', () => ({ default: { get: vi.fn() } }))
vi.mock('./pageRevisions.js', () => ({ changedElsewhere: vi.fn() }))

function deferred() {
    let resolve
    const promise = new Promise((resolvePromise) => (resolve = resolvePromise))
    return { promise, resolve }
}

// Lets the wait after a load (a task and two frames) run out.
const laidOut = () => new Promise((resolve) => setTimeout(resolve, 100))

let page, content
// The page type's own scroller, as Flat Page v2 has, which a reload replaces.
const drawPageType = () => {
    content.innerHTML = '<section><div class="scroller"></div></section>'
    return content.querySelector('.scroller')
}

beforeEach(() => {
    document.body.innerHTML = '<main><div class="title"></div><div class="entries"></div></main>'
    page = document.querySelector('main')
    content = document.querySelector('.entries')
})

describe('keeping the scroll place while a page loads again', () => {
    it('keeps the content hidden until it has loaded, then shows it where it was', async () => {
        drawPageType().scrollTop = 640
        const loaded = deferred()
        keepScrollPlace(page, content, loaded.promise)
        expect(content.style.visibility).toBe('hidden')

        const scrollerDrawnAgain = drawPageType()
        await laidOut()
        expect(content.style.visibility).toBe('hidden')
        loaded.resolve()
        await laidOut()
        expect(scrollerDrawnAgain.scrollTop).toBe(640)
        expect(content.style.visibility).toBe('')
    })

    it('does not leave the page hidden when the load never answers', async () => {
        vi.useFakeTimers()
        try {
            keepScrollPlace(page, content, new Promise(() => {}))
            await vi.advanceTimersByTimeAsync(4_900)
            expect(content.style.visibility).toBe('hidden')
            await vi.advanceTimersByTimeAsync(200)
            expect(content.style.visibility).toBe('')
        } finally {
            vi.useRealTimers()
        }
    })
})
