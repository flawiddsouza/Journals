<script>
import Table from './PageTypes/Table.svelte'
import FlatPage from './PageTypes/FlatPage.svelte'
import Spreadsheet from './PageTypes/Spreadsheet.svelte'
import DrawIO from './PageTypes/DrawIO.svelte'
import PageGroup from './PageTypes/PageGroup.svelte'
import { format } from 'date-fns'

export let activePage = null
export let updatePageName = null
export let className = null

function makeContentEditableSingleLine(e) {
    if(e.key.toLowerCase() === 'enter')  {
        e.preventDefault()
    }
}
</script>

<main class="journal-page {className}" style="display: grid; grid-template-rows: auto 1fr;">
    {#if activePage.id !== undefined && activePage.id !== null && activePage.locked === false}
        <div>
            {#if activePage.view_only }
                <h1 class="journal-page-title" style="margin-bottom: 0">{activePage.name}</h1>
            {:else}
                <h1 class="journal-page-title" contenteditable on:keydown={makeContentEditableSingleLine} spellcheck="false" on:input={updatePageName} style="margin-bottom: 0">
                    {activePage.name}
                </h1>
            {/if}
            <time style="font-size: 10px; color: darkgrey;">{format(activePage.created_at + 'Z', 'DD-MM-YYYY hh:mm A')}</time>
        </div>
        <div class="journal-page-entries">
            {#if activePage.type === 'Table'}
                <Table
                    bind:pageId={activePage.id}
                    style="font-size: {activePage.font_size || '14'}{activePage.font_size_unit || 'px'}; font-family: {activePage.font || 'Ubuntu'}"
                    bind:viewOnly={activePage.view_only}
                ></Table>
            {/if}
            {#if activePage.type === 'FlatPage'}
                <FlatPage
                    bind:pageId={activePage.id}
                    style="font-size: {activePage.font_size || '14'}{activePage.font_size_unit || 'px'}; font-family: {activePage.font || 'Ubuntu'}"
                    bind:viewOnly={activePage.view_only}
                ></FlatPage>
            {/if}
            {#if activePage.type === 'Spreadsheet'}
                <Spreadsheet
                    bind:pageId={activePage.id}
                    bind:viewOnly={activePage.view_only}
                ></Spreadsheet>
            {/if}
            {#if activePage.type === 'DrawIO'}
                <DrawIO
                    bind:pageId={activePage.id}
                    bind:viewOnly={activePage.view_only}
                ></DrawIO>
            {/if}
            {#if activePage.type === 'PageGroup'}
                <PageGroup
                    bind:pageId={activePage.id}
                    bind:viewOnly={activePage.view_only}
                    activePageId={activePage.activePageId}
                ></PageGroup>
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
}
</style>
