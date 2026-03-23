<script>
import fetchPlus from '../helpers/fetchPlus.js'
import { onMount } from 'svelte'
import { username as currentUsername } from '../stores.js'
import { toast } from '../helpers/adminToast.js'
import Modal from './Modal.svelte'

let data = { users: [], current_page: 1, total_pages: 1, total_count: 0 }
let currentPage = 1
let showNewUserForm = false
let newUser = { username: '', password: '', role: 'user' }
let error = ''
let passwordModal = null
let newPassword = ''
let passwordError = ''
let roleModal = null
let deleteModal = null
let deleteTyped = ''

function openNewUserForm() {
    newUser = { username: '', password: '', role: 'user' }
    error = ''
    showNewUserForm = true
}

function closeForm() {
    showNewUserForm = false
    newUser = { username: '', password: '', role: 'user' }
    error = ''
}

onMount(fetchUsers)

async function fetchUsers() {
    data = await fetchPlus.get(`/admin/users?page=${currentPage}`)
}

function goToPage(p) {
    if (p < 1 || p > data.total_pages) return
    currentPage = p
    fetchUsers()
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

function isRecent(ts) {
    return ts && Date.now() - new Date(ts + 'Z') < 86400000
}
function isOld(ts) {
    return !ts || Date.now() - new Date(ts + 'Z') > 30 * 86400000
}

async function createUser() {
    error = ''
    try {
        const res = await fetchPlus.post('/admin/users', newUser)
        if (res.error) {
            error = res.error
            return
        }
        closeForm()
        toast('User created')
        await fetchUsers()
    } catch (e) {
        try {
            const body = await e.json()
            error = body.error || 'Failed to create user'
        } catch {
            error = 'Failed to create user'
        }
    }
}

function openPasswordModal(user) {
    passwordModal = user
    newPassword = ''
    passwordError = ''
}

async function submitPasswordReset() {
    passwordError = ''
    const res = await fetchPlus.put(
        `/admin/users/${passwordModal.id}/password`,
        { password: newPassword },
    )
    if (res.error) {
        passwordError = res.error
        return
    }
    passwordModal = null
    toast('Password updated')
}

function openRoleModal(user) {
    roleModal = { user, newRole: user.role === 'admin' ? 'user' : 'admin' }
}

async function executeRoleChange() {
    const { user, newRole } = roleModal
    roleModal = null
    const res = await fetchPlus.put(`/admin/users/${user.id}/role`, {
        role: newRole,
    })
    if (res.error) toast(res.error)
    else {
        toast('Role updated')
        await fetchUsers()
    }
}

function openDeleteModal(user) {
    deleteModal = user
    deleteTyped = ''
}

async function executeDelete() {
    const user = deleteModal
    deleteModal = null
    const res = await fetchPlus.delete(`/admin/users/${user.id}`)
    if (res.error) toast(res.error)
    else {
        toast('User deleted')
        await fetchUsers()
    }
}

function focus(el) {
    el.focus()
}
function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

function isOwnAccount(user) {
    return user.username === $currentUsername
}

function relativeTime(ts) {
    if (!ts) return 'never'
    const diff = Math.floor((Date.now() - new Date(ts + 'Z')) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
    return Math.floor(diff / 86400) + 'd ago'
}
</script>

<div class="card">
    <div class="card-header">
        All Users
        <button class="btn btn-sm" on:click={openNewUserForm}>+ New User</button
        >
    </div>

    <table class="admin-table">
        <thead>
            <tr
                ><th>User</th><th>Role</th><th>Last Active</th><th>Joined</th
                ><th>Actions</th></tr
            >
        </thead>
        <tbody>
            {#each data.users as user}
                <tr>
                    <td><strong>{user.username}</strong></td>
                    <td
                        ><span class="badge badge-{user.role}"
                            >{cap(user.role)}</span
                        ></td
                    >
                    <td
                        class:active-recent={isRecent(user.last_seen_at)}
                        class:active-old={isOld(user.last_seen_at)}
                        class:active-normal={!isRecent(user.last_seen_at) &&
                            !isOld(user.last_seen_at)}
                    >
                        {relativeTime(user.last_seen_at)}
                    </td>
                    <td class="active-normal"
                        >{new Date(user.created_at).toLocaleDateString()}</td
                    >
                    <td>
                        <div class="td-actions">
                            <button
                                class="btn-sm"
                                on:click={() => openPasswordModal(user)}
                                >Reset Password</button
                            >
                            <button
                                class="btn-sm"
                                on:click={() => openRoleModal(user)}
                                disabled={isOwnAccount(user)}
                            >
                                Make {user.role === 'admin' ? 'User' : 'Admin'}
                            </button>
                            {#if !isOwnAccount(user)}
                                <button
                                    class="btn-danger"
                                    on:click={() => openDeleteModal(user)}
                                    >Delete</button
                                >
                            {/if}
                        </div>
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>

    {#if data.total_pages > 1}
        <div class="pagination">
            <button
                class="page-btn"
                on:click={() => goToPage(1)}
                disabled={currentPage === 1}>|&lt;</button
            >
            <button
                class="page-btn"
                on:click={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}>&lt;</button
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
                on:click={() => goToPage(currentPage + 1)}
                disabled={currentPage === data.total_pages}>&gt;</button
            >
            <button
                class="page-btn"
                on:click={() => goToPage(data.total_pages)}
                disabled={currentPage === data.total_pages}>&gt;|</button
            >
        </div>
    {/if}
</div>

{#if showNewUserForm}
    <Modal on:close-modal={closeForm} width="320px">
        <form on:submit|preventDefault={createUser}>
            <h2 class="heading">New User</h2>
            <div
                style="display:flex;flex-direction:column;gap:8px;margin-top:10px"
            >
                <input
                    class="input w-100p"
                    placeholder="Username"
                    required
                    bind:value={newUser.username}
                    use:focus
                />
                <input
                    class="input w-100p"
                    type="password"
                    placeholder="Password (min 6)"
                    required
                    minlength="6"
                    bind:value={newUser.password}
                />
                <select class="input w-100p" bind:value={newUser.role}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                </select>
            </div>
            {#if error}<p
                    style="color:var(--color-danger);font-size:12px;margin:6px 0 0"
                >
                    {error}
                </p>{/if}
            <button class="btn w-100p mt-1em" type="submit">Create</button>
        </form>
    </Modal>
{/if}

{#if passwordModal}
    <Modal on:close-modal={() => (passwordModal = null)}>
        <form on:submit|preventDefault={submitPasswordReset}>
            <h2 class="heading">Reset Password</h2>
            <p style="font-size:13px;margin:0 0 10px">
                New password for <strong>{passwordModal.username}</strong>
            </p>
            <input
                class="input w-100p"
                type="password"
                placeholder="New password (min 6)"
                minlength="6"
                required
                bind:value={newPassword}
                use:focus
            />
            {#if passwordError}<p
                    style="color:var(--color-danger);font-size:12px;margin:6px 0 0"
                >
                    {passwordError}
                </p>{/if}
            <button class="btn w-100p mt-1em" type="submit">Set Password</button
            >
        </form>
    </Modal>
{/if}

{#if roleModal}
    <Modal on:close-modal={() => (roleModal = null)}>
        <h2 class="heading">Change Role</h2>
        <p style="font-size:13px;margin:0 0 16px">
            Make <strong>{roleModal.user.username}</strong> a
            <strong>{cap(roleModal.newRole)}</strong>?
        </p>
        <div style="display:flex;gap:8px">
            <button class="btn" style="flex:1" on:click={executeRoleChange}
                >Confirm</button
            >
            <button
                class="btn-sm"
                style="flex:1"
                on:click={() => (roleModal = null)}>Cancel</button
            >
        </div>
    </Modal>
{/if}

{#if deleteModal}
    <Modal on:close-modal={() => (deleteModal = null)} width="360px">
        <h2 class="heading">Delete User</h2>
        <p style="font-size:13px;margin:0 0 10px">
            This will permanently delete <strong>{deleteModal.username}</strong>
            and all their data (notebooks, pages, uploads). Type their username to
            confirm.
        </p>
        <form on:submit|preventDefault={executeDelete}>
            <input
                class="input w-100p"
                placeholder={deleteModal.username}
                bind:value={deleteTyped}
                use:focus
            />
            <button
                class="btn w-100p mt-1em"
                style="background:var(--color-danger,#b83010)"
                type="submit"
                disabled={deleteTyped !== deleteModal.username}
                >Delete permanently</button
            >
        </form>
    </Modal>
{/if}
