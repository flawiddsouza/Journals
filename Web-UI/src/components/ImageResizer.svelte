<script>
import { onMount } from 'svelte'

// The page's editable element. Clicking an <img> inside it shows the controls.
export let container = null
// Saves a width in pixels, or null for the image's own size, as an edit of the
// page. Returns the <img> showing afterwards, which an editor may have replaced.
export let saveWidth

// Keeps an image big enough to find and to grab again.
const MIN_WIDTH = 24

let overlay
let image = null
let ancestorsClipping = []
let clipStyle = ''
let boxStyle = ''
let widthSet = false
let resizing = null
let frame = null

function open(imageClicked) {
    cancelAnimationFrame(frame)
    image = imageClicked
    ancestorsClipping = []
    for (let element = image.parentElement; element; element = element.parentElement) {
        if (getComputedStyle(element).overflow !== 'visible') {
            ancestorsClipping.push(element)
        }
    }
    follow()
}

function close() {
    cancelAnimationFrame(frame)
    if (resizing) cancelResize()
    image = null
}

// The image moves with typing, scrolling, images loading above it and panels
// being dragged. Reading its place each frame covers all of them, and it only
// runs while an image has its controls open.
function follow() {
    if (!image?.isConnected) {
        close()
        return
    }

    const imageRect = image.getBoundingClientRect()
    let top = 0
    let left = 0
    let right = window.innerWidth
    let bottom = window.innerHeight

    for (const element of ancestorsClipping) {
        const rect = element.getBoundingClientRect()
        top = Math.max(top, rect.top)
        left = Math.max(left, rect.left)
        right = Math.min(right, rect.right)
        bottom = Math.min(bottom, rect.bottom)
    }

    clipStyle = `top: ${top}px; left: ${left}px; width: ${Math.max(0, right - left)}px; height: ${Math.max(0, bottom - top)}px`
    boxStyle = `top: ${imageRect.top - top}px; left: ${imageRect.left - left}px; width: ${imageRect.width}px; height: ${imageRect.height}px`
    widthSet = image.hasAttribute('width')
    frame = requestAnimationFrame(follow)
}

function startResize(event) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const { width, height } = image.getBoundingClientRect()
    resizing = {
        pointerStartX: event.clientX,
        pointerStartY: event.clientY,
        widthStart: width,
        heightPerWidth: height / width,
        preview: null,
    }
}

// A drag shows through an animation, which leaves the element as it is, so a save
// during the drag cannot pick up a width nobody has settled on.
function moveResize(event) {
    if (!resizing) return
    const { pointerStartX, pointerStartY, widthStart, heightPerWidth } = resizing
    // The image keeps its shape, so its corner can only move along one slanted
    // line. The point on that line nearest the pointer keeps the handle as close
    // to it as it can be, whichever way the drag goes.
    const widthChange =
        (event.clientX - pointerStartX + (event.clientY - pointerStartY) * heightPerWidth) /
        (1 + heightPerWidth * heightPerWidth)
    const width = Math.round(widthStart + widthChange)
    const keyframes = { width: `${Math.max(MIN_WIDTH, width)}px` }
    if (resizing.preview) resizing.preview.effect.setKeyframes(keyframes)
    else resizing.preview = image.animate(keyframes, { fill: 'forwards' })
}

function endResize() {
    if (!resizing) return
    const { preview, widthStart } = resizing
    resizing = null
    if (!preview) return

    // What the page shows, which max-width may have held below what was dragged.
    const width = Math.round(image.getBoundingClientRect().width)
    preview.cancel()
    if (width !== Math.round(widthStart)) image = saveWidth(image, width)
}

function cancelResize() {
    resizing?.preview?.cancel()
    resizing = null
}

function resetWidth() {
    if (widthSet) image = saveWidth(image, null)
}

function onClick(event) {
    const { target } = event
    if (
        target instanceof HTMLImageElement &&
        container?.contains(target) &&
        !target.matches('.upload-image-loader, .ProseMirror-separator') &&
        // A broken image shows as an icon whatever its width, so a width dragged
        // on it would be the icon's.
        target.naturalWidth > 0
    ) {
        open(target)
    }
}

function onPointerDown(event) {
    if (!image || event.target === image || overlay?.contains(event.target)) return
    close()
}

function onKeyDown(event) {
    if (!image) return
    // Escape only ever closes these controls, not whatever holds the page.
    if (event.key === 'Escape') event.stopPropagation()
    close()
}

onMount(() => {
    document.addEventListener('click', onClick, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
        document.removeEventListener('click', onClick, true)
        document.removeEventListener('pointerdown', onPointerDown, true)
        document.removeEventListener('keydown', onKeyDown, true)
        close()
    }
})
</script>

{#if image}
    <div class="image-resizer" style={clipStyle} bind:this={overlay}>
        <div class="image-resizer-box" style={boxStyle}>
            {#if widthSet && !resizing?.preview}
                <button
                    class="image-resizer-reset"
                    type="button"
                    title="Back to the image's own size"
                    on:mousedown|preventDefault
                    on:click={resetWidth}>Reset size</button
                >
            {/if}
            <button
                class="image-resizer-handle"
                type="button"
                aria-label="Resize image"
                title={widthSet
                    ? 'Drag to resize. Double-click to reset size.'
                    : 'Drag to resize.'}
                on:mousedown|preventDefault
                on:pointerdown={startResize}
                on:pointermove={moveResize}
                on:pointerup={endResize}
                on:pointercancel={cancelResize}
                on:dblclick={resetWidth}
            ></button>
        </div>
    </div>
{/if}

<style>
:global(.page-container[contenteditable] img:not(.upload-image-loader)),
:global(.page-container.editing img:not(.ProseMirror-separator)) {
    cursor: pointer;
}

/* Covers the part of the page the image can be seen in, so the controls scroll
   out of view with it. Only the buttons take the pointer. */
.image-resizer {
    position: fixed;
    z-index: 6;
    overflow: hidden;
    pointer-events: none;
}

.image-resizer-box {
    position: absolute;
    box-sizing: border-box;
    outline: 2px solid var(--color-pa-btn);
    outline-offset: -2px;
}

/* Inside the corner, so an image as wide as the page keeps its handle. */
.image-resizer-handle {
    position: absolute;
    right: 0;
    bottom: 0;
    box-sizing: border-box;
    width: 0.875rem;
    height: 0.875rem;
    padding: 0;
    border: 2px solid var(--color-pa-btn);
    background: var(--bg-center);
    cursor: nwse-resize;
    pointer-events: auto;
    touch-action: none;
}

.image-resizer-handle:hover {
    background: var(--bg-pa-hover);
}

@media (pointer: coarse) {
    .image-resizer-handle {
        width: 1.5rem;
        height: 1.5rem;
    }
}

.image-resizer-reset {
    position: absolute;
    top: 0.4rem;
    left: 0.4rem;
    padding: 0.2em 0.5em;
    border: 1px solid var(--border-table);
    border-radius: 4px;
    background: var(--bg-center);
    color: var(--color-pa-btn);
    font: inherit;
    white-space: nowrap;
    cursor: pointer;
    pointer-events: auto;
}

.image-resizer-reset:hover {
    background: var(--bg-pa-hover);
}
</style>
