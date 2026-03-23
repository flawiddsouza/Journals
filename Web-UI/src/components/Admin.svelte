<script>
import AdminAnalytics from './AdminAnalytics.svelte'
import AdminUsers from './AdminUsers.svelte'
import AdminActivity from './AdminActivity.svelte'
import AdminSettings from './AdminSettings.svelte'
import AdminToast from './AdminToast.svelte'
import {
    getTheme,
    setTheme as persistTheme,
    initTheme,
} from '../helpers/theme.js'

initTheme()
let theme = getTheme()
function setTheme(value) {
    theme = value
    persistTheme(value)
}

let activePanel = 'analytics'
const panels = {
    analytics: 'Analytics',
    users: 'Users',
    activity: 'Activity',
    settings: 'Settings',
}

function goToApp() {
    window.location.hash = ''
    window.location.reload()
}
</script>

<div class="admin-app">
    <div class="admin-sidebar">
        <div class="admin-logo">
            Journals
            <span class="admin-chip">Admin</span>
        </div>
        <div class="admin-nav">
            {#each Object.entries(panels) as [key, label]}
                <div
                    class="admin-nav-item"
                    class:active={activePanel === key}
                    on:click={() => (activePanel = key)}
                >
                    {label}
                </div>
            {/each}
        </div>
    </div>

    <div class="admin-main">
        <div class="admin-topbar">
            <div class="admin-breadcrumb">
                <span class="admin-back" on:click={goToApp}>← App</span>
                <span class="admin-sep">/</span>
                <strong>{panels[activePanel]}</strong>
            </div>
            <div class="admin-topbar-right">
                <span class="admin-theme-label">Theme:</span>
                <select
                    value={theme}
                    on:change={(e) => setTheme(e.target.value)}
                    on:click|stopPropagation
                >
                    <option value="golden">Golden</option>
                    <option value="slate">Slate</option>
                    <option value="forest">Forest</option>
                    <option value="midnight">Midnight</option>
                    <option value="rose">Rose</option>
                </select>
            </div>
        </div>
        <AdminToast />
        <div class="admin-content">
            {#if activePanel === 'analytics'}
                <AdminAnalytics />
            {:else if activePanel === 'users'}
                <AdminUsers />
            {:else if activePanel === 'activity'}
                <AdminActivity />
            {:else if activePanel === 'settings'}
                <AdminSettings />
            {/if}
        </div>
    </div>
</div>

<style>
.admin-app {
    display: flex;
    height: 100vh;
    font-family: inherit;
}

.admin-sidebar {
    width: 15em;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border-sidebar);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
}
.admin-logo {
    height: 42px;
    padding: 0 14px;
    font-size: 16px;
    font-weight: 700;
    border-bottom: 1px solid var(--border-topbar);
    background: var(--bg-topbar);
    display: flex;
    align-items: center;
    gap: 8px;
}
.admin-chip {
    font-size: 10px;
    font-weight: 500;
    background: var(--color-pa-btn);
    color: #fff;
    padding: 2px 6px;
    border-radius: 3px;
    margin-left: auto;
}
.admin-nav-item {
    padding: 8px 14px;
    cursor: pointer;
    font-size: 13px;
    opacity: 0.75;
    border-left: 2px solid transparent;
}
.admin-nav {
    padding-top: 10px;
}
.admin-nav-item:hover {
    background: var(--bg-section-hover);
    opacity: 1;
}
.admin-nav-item.active {
    background: var(--bg-section-active);
    opacity: 1;
    border-left-color: var(--color-pa-btn);
}

.admin-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.admin-topbar {
    height: 42px;
    padding: 0 18px;
    background: var(--bg-topbar);
    border-bottom: 1px solid var(--border-topbar);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
}
.admin-topbar-right {
    display: flex;
    align-items: center;
    gap: 6px;
}
.admin-theme-label {
    font-size: 11px;
    color: var(--color-tb-link);
    flex-shrink: 0;
    margin-right: 4px;
}
.admin-topbar-right select {
    appearance: none;
    border: 1px solid var(--border-select);
    background: var(--bg-select);
    border-radius: 5px;
    padding: 3px 22px 3px 8px;
    font-size: 12px;
    color: var(--color-tb-link);
    outline: none;
    cursor: pointer;
    font-family: inherit;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
}
.admin-breadcrumb {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
}
.admin-back {
    cursor: pointer;
    color: var(--color-utility);
    font-size: 12px;
}
.admin-back:hover {
    color: var(--color-section);
}
.admin-sep {
    color: var(--border-nb);
}
.admin-content {
    flex: 1;
    overflow-y: auto;
    padding: 18px;
    background: var(--bg-body);
}
</style>
