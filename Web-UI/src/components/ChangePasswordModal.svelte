<script>
import Modal from './Modal.svelte'

export let isOpen = false
export let onSubmit = null
export let onCancel = null

let currentPassword = ''
let newPassword = ''
let confirmPassword = ''
let error = ''

function handleSubmit() {
    error = ''

    if (!currentPassword.trim()) {
        error = 'Current password cannot be empty'
        return
    }

    if (!newPassword.trim()) {
        error = 'New password cannot be empty'
        return
    }

    if (newPassword !== confirmPassword) {
        error = 'New passwords do not match'
        return
    }

    onSubmit?.(currentPassword, newPassword)
    reset()
}

function handleCancel() {
    onCancel?.()
    reset()
}

function reset() {
    currentPassword = ''
    newPassword = ''
    confirmPassword = ''
    error = ''
    isOpen = false
}

function focus(element) {
    element.focus()
}
</script>

{#if isOpen}
    <Modal on:close-modal={handleCancel}>
        <form on:submit|preventDefault={handleSubmit}>
            <h2 class="heading">Change Password</h2>

            <label>
                Current Password:<br>
                <input
                    type="password"
                    bind:value={currentPassword}
                    required
                    class="w-100p"
                    use:focus
                >
            </label>

            <label class="d-b mt-0_5em">
                New Password:<br>
                <input
                    type="password"
                    bind:value={newPassword}
                    required
                    class="w-100p"
                >
            </label>

            <label class="d-b mt-0_5em">
                Confirm New Password:<br>
                <input
                    type="password"
                    bind:value={confirmPassword}
                    required
                    class="w-100p"
                >
            </label>

            {#if error}
                <div class="mt-0_5em" style="color: red; font-size: 0.9em;">
                    {error}
                </div>
            {/if}

            <div class="mt-1em" style="display: flex; gap: 0.5em;">
                <button type="submit" class="flex-1">Change Password</button>
                <button type="button" on:click={handleCancel} class="flex-1">Cancel</button>
            </div>
        </form>
    </Modal>
{/if}

<style>
.flex-1 {
    flex: 1;
}
</style>
