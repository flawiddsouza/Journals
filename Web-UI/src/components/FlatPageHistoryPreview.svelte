<script>
import { tick } from 'svelte'
import FlatPage from './PageTypes/FlatPage.svelte'
import FlatPageV2 from './PageTypes/FlatPageV2.svelte'
import { decorateFlatPageHistoryPreview } from '../helpers/flatPageHistoryPreview.js'

export let pageContent = ''
export let pageContentOlder = ''
export let pageType = 'FlatPage'
export let style = ''

let pageContainer = null
let pageContainerOlder = null

$: pageContentV2 =
    pageType === 'FlatPageV2' && pageContent ? JSON.parse(pageContent) : null
$: pageContentOlderV2 =
    pageType === 'FlatPageV2' && pageContentOlder
        ? JSON.parse(pageContentOlder)
        : null

function focusFirstChange(pageContainerCurrent) {
    const changeMarker = pageContainerCurrent.querySelector(
        '.flat-page-history-added-text, .flat-page-history-removed-text, .flat-page-history-added-block, .flat-page-history-removed-block, .flat-page-history-markup-changed',
    )
    changeMarker?.scrollIntoView({ block: 'center', inline: 'nearest' })
}

$: if (
    pageContainer &&
    (pageType !== 'FlatPageV2' || pageContainerOlder)
) {
    const pageContainerCurrent = pageContainer
    const pageContainerOlderCurrent = pageContainerOlder
    tick().then(() => {
        if (pageContainer !== pageContainerCurrent) return
        if (
            pageType === 'FlatPageV2' &&
            pageContainerOlder !== pageContainerOlderCurrent
        ) {
            return
        }
        const pageContentOlderCurrent =
            pageType === 'FlatPageV2'
                ? pageContainerOlderCurrent.innerHTML
                : (pageContentOlder ?? '')
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
    {#key `${pageType}\u0000${pageContent ?? ''}\u0000${pageContentOlder ?? ''}`}
        {#if pageType === 'FlatPageV2'}
            <div class="flat-page-history-preview-older" aria-hidden="true">
                <FlatPageV2
                    viewOnly={true}
                    pageContentOverride={pageContentOlderV2}
                    bind:pageContainer={pageContainerOlder}
                    {style}
                />
            </div>
            <FlatPageV2
                viewOnly={true}
                pageContentOverride={pageContentV2}
                bind:pageContainer
                {style}
            />
        {:else}
            <FlatPage
                viewOnly={true}
                pageContentOverride={pageContent ?? ''}
                bind:pageContainer
                {style}
            />
        {/if}
    {/key}
</div>

<style>
.flat-page-history-preview {
    height: 100%;
    word-break: break-word;
}

.flat-page-history-preview-older {
    display: none;
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
