<script>
import Table from './Table.svelte'
import FlatPage from './FlatPage.svelte'
import Spreadsheet from './PageTypes/Spreadsheet.svelte'
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

<main class="journal-page {className}">
    {#if activePage.id !== undefined && activePage.id !== null && activePage.locked === false}
        {#if activePage.view_only }
            <h1 class="journal-page-title" style="margin-bottom: 0">{activePage.name}</h1>
        {:else}
            <h1 class="journal-page-title" contenteditable on:keydown={makeContentEditableSingleLine} spellcheck="false" on:input={updatePageName} style="margin-bottom: 0">
                {activePage.name}
            </h1>
        {/if}
        <time style="font-size: 10px; color: darkgrey;">{format(activePage.created_at + 'Z', 'DD-MM-YYYY hh:mm A')}</time>
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
        </div>
    {/if}
    {#if activePage.locked === true}
        Page Locked
    {/if}
</main>

<style>
.journal-page {
    padding-bottom: 5.4em;
}

h1.journal-page-title {
    margin-top: 0;
    outline: 0;
}

.journal-page-entries {
    margin-top: 0.7em;
    margin-right: 1em;
}
</style>