<script>
import fetchPlus from '../helpers/fetchPlus.js'
import { onMount } from 'svelte'

let data = { entries: [], current_page: 1, total_pages: 1, total_count: 0 }
let users = []
let selectedUserId = ''
let currentPage = 1

onMount(async () => {
    const [res] = await Promise.all([
        fetchPlus.get('/admin/users/list'),
        fetchActivity(),
    ])
    users = res
})

async function fetchActivity() {
    const params = new URLSearchParams({ page: currentPage })
    if (selectedUserId) params.set('user_id', selectedUserId)
    data = await fetchPlus.get(`/admin/activity?${params}`)
}

function goToPage(p) {
    if (p < 1 || p > data.total_pages) return
    currentPage = p
    fetchActivity()
}

function getPageNumbers(current, total) {
    const pages = []
    const delta = 2
    const range = []
    for (
        let i = Math.max(1, current - delta);
        i <= Math.min(total, current + delta);
        i++
    )
        range.push(i)
    if (range[0] > 1) {
        pages.push(1)
        if (range[0] > 2) pages.push('...')
    }
    pages.push(...range)
    if (range[range.length - 1] < total) {
        if (range[range.length - 1] < total - 1) pages.push('...')
        pages.push(total)
    }
    return pages
}

function relativeTime(ts) {
    const diff = Math.floor((Date.now() - new Date(ts + 'Z')) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
    return new Date(ts).toLocaleDateString()
}
</script>

<div class="card">
    <div class="card-header">
        Activity Log
        <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:11px;color:var(--color-utility)"
                >Filter by user:</span
            >
            <select
                class="input"
                style="font-size:12px;padding:3px 6px"
                bind:value={selectedUserId}
                on:change={() => {
                    currentPage = 1
                    fetchActivity()
                }}
            >
                <option value="">All users</option>
                {#each users as u}
                    <option value={u.id}>{u.username}</option>
                {/each}
            </select>
        </div>
    </div>

    <table class="admin-table">
        <thead>
            <tr><th>User</th><th>Action</th><th>Time</th></tr>
        </thead>
        <tbody>
            {#each data.entries as entry}
                <tr>
                    <td style="color:var(--color-tb-link);font-size:12px"
                        >{entry.username}</td
                    >
                    <td>{entry.action.replace(/_/g, ' ')}</td>
                    <td title={entry.created_at} class="active-normal"
                        >{relativeTime(entry.created_at)}</td
                    >
                </tr>
            {/each}
        </tbody>
    </table>

    {#if data.total_pages > 1}
        <div class="pagination">
            <button
                class="page-btn"
                disabled={currentPage === 1}
                on:click={() => goToPage(1)}>|&lt;</button
            >
            <button
                class="page-btn"
                disabled={currentPage === 1}
                on:click={() => goToPage(currentPage - 1)}>&lt;</button
            >
            {#each getPageNumbers(currentPage, data.total_pages) as p}
                {#if p === '...'}
                    <span class="page-btn page-ellipsis">…</span>
                {:else}
                    <button
                        class="page-btn"
                        class:active={p === currentPage}
                        on:click={() => goToPage(p)}>{p}</button
                    >
                {/if}
            {/each}
            <button
                class="page-btn"
                disabled={currentPage === data.total_pages}
                on:click={() => goToPage(currentPage + 1)}>&gt;</button
            >
            <button
                class="page-btn"
                disabled={currentPage === data.total_pages}
                on:click={() => goToPage(data.total_pages)}>&gt;|</button
            >
        </div>
    {/if}
</div>
