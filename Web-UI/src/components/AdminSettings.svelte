<script>
import fetchPlus from '../helpers/fetchPlus.js'
import { onMount } from 'svelte'
import { toast } from '../helpers/adminToast.js'

let settings = {}

onMount(async () => {
    const rows = await fetchPlus.get('/admin/settings')
    settings = Object.fromEntries(rows.map((r) => [r.key, r.value === 'true']))
})

async function toggle(key) {
    settings[key] = !settings[key]
    await fetchPlus.put('/admin/settings', {
        key,
        value: String(settings[key]),
    })
    toast('Setting saved')
}
</script>

<div class="card">
    <div class="setting-row">
        <div class="setting-info">
            <h4>Allow Registration</h4>
            <p>Let new users sign up from the login page</p>
        </div>
        <div
            class="toggle"
            class:off={!settings.allow_registration}
            on:click={() => toggle('allow_registration')}
        ></div>
    </div>
    <div class="setting-row">
        <div class="setting-info">
            <h4>Activity Logging</h4>
            <p>Record user actions for the activity feed</p>
        </div>
        <div
            class="toggle"
            class:off={!settings.activity_logging}
            on:click={() => toggle('activity_logging')}
        ></div>
    </div>
</div>

<style>
.setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px;
    border-bottom: 1px solid var(--border-topbar);
}
.setting-row:last-child {
    border-bottom: none;
}
.setting-info h4 {
    font-size: 13px;
    font-weight: 500;
    margin: 0 0 2px 0;
}
.setting-info p {
    font-size: 11px;
    color: var(--color-utility);
    margin: 0;
}
.toggle {
    width: 36px;
    height: 20px;
    background: var(--color-pa-btn);
    border-radius: 10px;
    position: relative;
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0.85;
    transition: background 0.2s;
}
.toggle::after {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    background: #fff;
    border-radius: 50%;
    top: 3px;
    right: 3px;
    transition:
        right 0.2s,
        left 0.2s;
}
.toggle.off {
    background: var(--border-select);
}
.toggle.off::after {
    right: auto;
    left: 3px;
}
</style>
