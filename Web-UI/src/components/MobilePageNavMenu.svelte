<script>
import { onMount, onDestroy } from 'svelte'
import { mobileViewportMql } from '../actions/touchGuard.js'
import { clickOutside } from '../actions/clickOutside.js'

export let links = []

let open = false
let isMobile = false
let mql = null

function toggle() {
    open = !open
}

function close() {
    open = false
}

function handleMqlChange(e) {
    isMobile = e.matches
}

onMount(() => {
    mql = mobileViewportMql()
    if (mql) {
        isMobile = mql.matches
        mql.addEventListener('change', handleMqlChange)
    }
})

onDestroy(() => {
    if (mql) mql.removeEventListener('change', handleMqlChange)
})

$: visibleLinks = isMobile ? links.filter((l) => !l.mobileHide) : links

function selectItem(link) {
    if (link.onClick) link.onClick()
    close()
}
</script>

{#if visibleLinks.length > 0}
    <div class="mobile-pagenav" use:clickOutside={close}>
        <button
            class="trigger"
            type="button"
            on:click|stopPropagation={toggle}
            aria-label="Page actions"
        >⋯</button>

        {#if open}
            <div class="menu">
                {#each visibleLinks as link}
                    {#if link.type === 'link'}
                        <a
                            class="item"
                            class:active={link.active}
                            href={link.href}
                            target={link.target}
                            on:click|stopPropagation={close}
                        >{link.text}</a>
                    {:else}
                        <button
                            type="button"
                            class="item"
                            class:active={link.active}
                            on:click|stopPropagation={() => selectItem(link)}
                        >{link.text}</button>
                    {/if}
                {/each}
            </div>
        {/if}
    </div>
{/if}

<style>
.mobile-pagenav {
    position: relative;
    display: none;
    flex-shrink: 0;
}

@media (max-width: 1000px) {
    .mobile-pagenav {
        display: inline-block;
    }
}

.trigger {
    border: 1px solid var(--border-select);
    border-radius: 5px;
    background: var(--bg-select);
    cursor: pointer;
    padding: 4px 10px;
    font-size: 16px;
    color: var(--color-tb-link);
    font-family: inherit;
    line-height: 1;
    min-height: 32px;
    min-width: 36px;
}

.menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 180px;
    background: var(--bg-section-active);
    border: 1px solid var(--border-nb);
    border-radius: 5px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
    z-index: 50;
    padding: 4px 0;
}

.item {
    display: block;
    width: 100%;
    padding: 10px 14px;
    color: inherit;
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--border-topbar);
    text-decoration: none;
    text-align: left;
    cursor: pointer;
    font: inherit;
    font-size: 14px;
}

.item:last-child {
    border-bottom: 0;
}

.item:hover {
    background: var(--bg-pa-hover);
    color: var(--color-pa-hover);
}

.item.active {
    background: var(--color-pa-btn);
    color: #fff;
}
</style>
