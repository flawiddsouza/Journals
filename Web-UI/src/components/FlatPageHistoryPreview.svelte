<script>
import { tick } from 'svelte'
import FlatPage from './PageTypes/FlatPage.svelte'
import { decorateFlatPageHistoryPreview } from '../helpers/flatPageHistoryPreview.js'

export let pageContent = ''
export let pageContentOlder = ''
export let style = ''

let pageContainer = null

function focusFirstChange(pageContainerCurrent) {
    const changeMarker = pageContainerCurrent.querySelector(
        '.flat-page-history-added-text, .flat-page-history-removed-text, .flat-page-history-added-block, .flat-page-history-removed-block, .flat-page-history-markup-changed',
    )
    changeMarker?.scrollIntoView({ block: 'center', inline: 'nearest' })
}

$: if (pageContainer) {
    const pageContainerCurrent = pageContainer
    const pageContentOlderCurrent = pageContentOlder ?? ''
    tick().then(() => {
        if (pageContainer !== pageContainerCurrent) return
        decorateFlatPageHistoryPreview(
            pageContainerCurrent,
            pageContentOlderCurrent,
        )
        requestAnimationFrame(() => {
            if (pageContainer !== pageContainerCurrent) return
            focusFirstChange(pageContainerCurrent)
        })
    })
}
</script>

<div class="flat-page-history-preview">
    {#key `${pageContent ?? ''}\u0000${pageContentOlder ?? ''}`}
        <FlatPage
            viewOnly={true}
            pageContentOverride={pageContent ?? ''}
            bind:pageContainer
            {style}
        />
    {/key}
</div>

<style>
.flat-page-history-preview {
    height: 100%;
    word-break: break-word;
}

:global(.flat-page-history-added-text) {
    background: rgba(46, 160, 67, 0.28);
    color: inherit;
}

:global(.flat-page-history-context-block) {
    opacity: 0.55;
}

:global(.flat-page-history-removed-text),
:global(.flat-page-history-removed-block) {
    background: rgba(220, 53, 69, 0.18);
    color: inherit;
    text-decoration: line-through;
    opacity: 0.8;
}

:global(.flat-page-history-added-block) {
    box-shadow: inset 3px 0 rgba(46, 160, 67, 0.8);
}

:global(.flat-page-history-markup-changed) {
    outline: 2px solid rgba(210, 153, 34, 0.8);
    outline-offset: 2px;
}
</style>
