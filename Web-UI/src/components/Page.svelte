<script>
import Table from './PageTypes/Table.svelte'
import FlatPage from './PageTypes/FlatPage.svelte'
import FlatPageV2 from './PageTypes/FlatPageV2.svelte'
import RichText from './PageTypes/RichText.svelte'
import Spreadsheet from './PageTypes/Spreadsheet.svelte'
import DrawIO from './PageTypes/DrawIO.svelte'
import PageGroup from './PageTypes/PageGroup.svelte'
import Favorites from './PageTypes/Favorites.svelte'
import Kanban from './PageTypes/Kanban.svelte'
import MiniApp from './PageTypes/MiniApp.svelte'
import { format } from 'date-fns'
import defaultKeydownHandlerForContentEditableArea from '../helpers/defaultKeydownHandlerForContentEditableArea.js'

export let notebooks = []
export let activePage = null
export let updatePageName = null
export let className = null
export let viewOnly = null

let viewOnlyComputed = null

$: if (activePage) {
    if (viewOnly === null) {
        viewOnlyComputed = activePage.view_only
    }
}

$: if (viewOnly !== null) {
    if (viewOnly === false) {
        viewOnlyComputed = activePage.view_only
    } else {
        viewOnlyComputed = true
    }
}

function makeContentEditableSingleLine(e) {
    if (e.key.toLowerCase() === 'enter') {
        e.preventDefault()
    }

    defaultKeydownHandlerForContentEditableArea(e, true)
}
</script>

<main
    class="journal-page {className} {`PageType-${activePage.type}`}"
    style="display: grid; grid-template-rows: {activePage.hide_title ? '1fr' : 'auto 1fr'}; overflow: auto;"
>
    {#if activePage.id !== undefined && activePage.id !== null && activePage.locked === false}
        {#if !activePage.hide_title}
        <div class="page-title-wrapper">
            {#if viewOnlyComputed}
                <h1 class="journal-page-title" style="margin-bottom: 0">
                    {activePage.name}
                </h1>
            {:else}
                <h1
                    class="journal-page-title"
                    contenteditable
                    on:keydown={makeContentEditableSingleLine}
                    spellcheck="false"
                    on:input={updatePageName}
                    style="margin-bottom: 0"
                >
                    {activePage.name}
                </h1>
            {/if}
            <time style="font-size: 10px; color: darkgrey;"
                >{format(
                    activePage.created_at + 'Z',
                    'DD-MM-YYYY hh:mm A',
                )}</time
            >
        </div>
        {/if}
        <div class="journal-page-entries" style={activePage.hide_title ? 'margin-top: 0' : ''}>
            {#if activePage.type === 'Table'}
                <Table
                    bind:pageId={activePage.id}
                    style="font-size: {activePage.font_size ||
                        '14'}{activePage.font_size_unit ||
                        'px'}; font-family: {activePage.font || 'Ubuntu'}"
                    bind:viewOnly={viewOnlyComputed}
                ></Table>
            {/if}
            {#if activePage.type === 'FlatPage'}
                <FlatPage
                    bind:pageId={activePage.id}
                    style="font-size: {activePage.font_size ||
                        '14'}{activePage.font_size_unit ||
                        'px'}; font-family: {activePage.font || 'Ubuntu'}"
                    bind:viewOnly={viewOnlyComputed}
                ></FlatPage>
            {/if}
            {#if activePage.type === 'FlatPageV2'}
                <FlatPageV2
                    bind:pageId={activePage.id}
                    style="font-size: {activePage.font_size ||
                        '14'}{activePage.font_size_unit ||
                        'px'}; font-family: {activePage.font || 'Ubuntu'}"
                    bind:viewOnly={viewOnlyComputed}
                ></FlatPageV2>
            {/if}
            {#if activePage.type === 'RichText'}
                <RichText
                    bind:pageId={activePage.id}
                    style="font-size: {activePage.font_size ||
                        '14'}{activePage.font_size_unit ||
                        'px'}; font-family: {activePage.font || 'Ubuntu'}"
                    bind:viewOnly={viewOnlyComputed}
                ></RichText>
            {/if}
            {#if activePage.type === 'Spreadsheet'}
                {#key viewOnlyComputed}
                    <Spreadsheet
                        bind:pageId={activePage.id}
                        bind:viewOnly={viewOnlyComputed}
                    ></Spreadsheet>
                {/key}
            {/if}
            {#if activePage.type === 'DrawIO'}
                <DrawIO
                    bind:pageId={activePage.id}
                    bind:viewOnly={viewOnlyComputed}
                ></DrawIO>
            {/if}
            {#if activePage.type === 'PageGroup'}
                <PageGroup
                    {notebooks}
                    bind:pageGroupPage={activePage}
                    bind:pageId={activePage.id}
                    bind:viewOnly={viewOnlyComputed}
                    activePageId={activePage.activePageId}
                ></PageGroup>
            {/if}
            {#if activePage.type === 'Favorites'}
                <Favorites
                    {notebooks}
                    bind:pageId={activePage.id}
                    bind:viewOnly={viewOnlyComputed}
                    activePageId={activePage.activePageId}
                ></Favorites>
            {/if}
            {#if activePage.type === 'Kanban'}
                <Kanban
                    bind:pageId={activePage.id}
                    bind:viewOnly={viewOnlyComputed}
                ></Kanban>
            {/if}
            {#if activePage.type === 'MiniApp'}
                <MiniApp
                    bind:pageId={activePage.id}
                    bind:viewOnly={viewOnlyComputed}
                ></MiniApp>
            {/if}
        </div>
    {/if}
    {#if activePage.locked === true}
        Page Locked
    {/if}
</main>

<style>
h1.journal-page-title {
    margin-top: 0;
    outline: 0;
}

.journal-page-entries {
    margin-top: 0.7em;
    margin-right: 1em;
    overflow: auto;
}

:global(.PageType-RichText) .page-title-wrapper {
    margin-left: 4.5rem;
}

:global(.PageType-Spreadsheet) .page-title-wrapper,
:global(.PageType-DrawIO) .page-title-wrapper,
:global(.PageType-MiniApp) .page-title-wrapper,
:global(.PageType-Kanban) .page-title-wrapper {
    padding: 0.5rem;
}

:global(.PageType-Spreadsheet .journal-page-entries),
:global(.PageType-DrawIO .journal-page-entries),
:global(.PageType-MiniApp .journal-page-entries),
:global(.PageType-Kanban .journal-page-entries) {
    margin-top: 0;
    margin-right: 0;
}
</style>
