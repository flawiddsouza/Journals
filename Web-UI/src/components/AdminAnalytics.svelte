<script>
import fetchPlus from '../helpers/fetchPlus.js'
import { onMount } from 'svelte'

let data = null
let error = null

onMount(async () => {
    try {
        data = await fetchPlus.get('/admin/analytics')
    } catch (e) {
        error = 'Failed to load analytics'
    }
})

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024)
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function relativeTime(ts) {
    if (!ts) return 'never'
    const diff = Math.floor((Date.now() - new Date(ts + 'Z')) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago'
    return new Date(ts).toLocaleDateString()
}

function isRecent(ts) {
    if (!ts) return false
    return Date.now() - new Date(ts + 'Z') < 86400000
}
function isOld(ts) {
    if (!ts) return true
    return Date.now() - new Date(ts + 'Z') > 30 * 86400000
}

$: maxPageCount = data
    ? Math.max(...data.pages_per_day.map((d) => d.count), 1)
    : 1
$: maxTypeCount = data
    ? Math.max(...data.type_distribution.map((d) => d.count), 1)
    : 1
$: maxStorage = data
    ? Math.max(...data.users.map((u) => u.storage_bytes), 1)
    : 1
</script>

{#if error}
    <p>{error}</p>
{:else if !data}
    <p>Loading...</p>
{:else}
    <!-- Stat cards -->
    <div class="stat-grid">
        <div class="stat-card">
            <div class="stat-label">Users</div>
            <div class="stat-value">{data.total_users}</div>
            <div class="stat-sub">
                {data.admin_count} Admin · {data.user_count} User
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Pages</div>
            <div class="stat-value">{data.total_pages}</div>
            <div class="stat-sub">across {data.total_notebooks} notebooks</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Total Edits</div>
            <div class="stat-value">{data.total_edits.toLocaleString()}</div>
            <div class="stat-sub">page history entries</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Storage Used</div>
            <div class="stat-value">
                {formatBytes(data.total_storage_bytes)}
            </div>
            <div class="stat-sub">all users combined</div>
        </div>
    </div>

    <!-- Charts -->
    <div class="charts-row">
        <div class="card fill-chart">
            <div class="card-body">
                <div class="chart-title">Pages Created — Last 30 Days</div>
                <div class="chart-container">
                    <div class="chart-y-axis">
                        <span class="chart-y-label">{maxPageCount}</span>
                        <span class="chart-y-label"
                            >{Math.round(maxPageCount / 2)}</span
                        >
                        <span class="chart-y-label">0</span>
                    </div>
                    <div class="chart-main">
                        <div class="chart-bars">
                            {#each data.pages_per_day as day}
                                <div class="bar-wrap">
                                    <div
                                        class="bar"
                                        style="height:{(day.count /
                                            maxPageCount) *
                                            100}%"
                                    ></div>
                                    <div class="bar-tooltip">
                                        {day.day}: {day.count}
                                    </div>
                                </div>
                            {/each}
                        </div>
                        <div class="chart-x-axis">
                            {#if data.pages_per_day.length > 0}
                                <span class="chart-x-label"
                                    >{data.pages_per_day[0].day}</span
                                >
                                <span class="chart-x-label"
                                    >{data.pages_per_day[
                                        data.pages_per_day.length - 1
                                    ].day}</span
                                >
                            {/if}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-body">
                <div class="chart-title">Page Type Distribution</div>
                <div class="type-list">
                    {#each data.type_distribution as t}
                        <div class="type-row">
                            <div class="type-name">{t.type}</div>
                            <div class="type-bar-bg">
                                <div
                                    class="type-bar-fill"
                                    style="width:{(t.count / maxTypeCount) *
                                        100}%"
                                ></div>
                            </div>
                            <div class="type-count">{t.count}</div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </div>

    <!-- Per-user breakdown -->
    <div class="card">
        <div class="card-header">Per-User Breakdown</div>
        <table class="admin-table">
            <thead>
                <tr>
                    <th>User</th><th>Role</th><th>Pages</th><th>Edits</th>
                    <th>Storage</th><th>Last Active</th><th>Joined</th>
                </tr>
            </thead>
            <tbody>
                {#each data.users as u}
                    <tr>
                        <td><strong>{u.username}</strong></td>
                        <td
                            ><span class="badge badge-{u.role}"
                                >{u.role.charAt(0).toUpperCase() +
                                    u.role.slice(1)}</span
                            ></td
                        >
                        <td>{u.page_count}</td>
                        <td>{u.edit_count.toLocaleString()}</td>
                        <td>
                            <div class="storage-cell">
                                <div class="storage-bar">
                                    <div
                                        class="storage-fill"
                                        style="width:{(u.storage_bytes /
                                            maxStorage) *
                                            100}%"
                                    ></div>
                                </div>
                                {formatBytes(u.storage_bytes)}
                            </div>
                        </td>
                        <td
                            class:active-recent={isRecent(u.last_seen_at)}
                            class:active-old={isOld(u.last_seen_at)}
                            class:active-normal={!isRecent(u.last_seen_at) &&
                                !isOld(u.last_seen_at)}
                        >
                            {relativeTime(u.last_seen_at)}
                        </td>
                        <td class="active-normal"
                            >{new Date(u.created_at).toLocaleDateString(
                                'en-US',
                                { month: 'short', year: 'numeric' },
                            )}</td
                        >
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
{/if}
