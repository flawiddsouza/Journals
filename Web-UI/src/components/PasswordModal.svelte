<script>
import Modal from './Modal.svelte'

export let isOpen = false
export let title = 'Enter Password'
export let passwordLabel = 'Password:'
export let confirmLabel = 'Confirm Password:'
export let showConfirm = false
export let onSubmit = null
export let onCancel = null

let password = ''
let confirmPassword = ''
let error = ''

function handleSubmit() {
    error = ''

    if (!password.trim()) {
        error = 'Password cannot be empty'
        return
    }

    if (showConfirm && password !== confirmPassword) {
        error = 'Passwords do not match'
        return
    }

    onSubmit?.(password, confirmPassword)
    reset()
}

function handleCancel() {
    onCancel?.()
    reset()
}

function reset() {
    password = ''
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
            <h2 class="heading">{title}</h2>

            <label>
                {passwordLabel}<br>
                <input
                    type="password"
                    bind:value={password}
                    required
                    class="w-100p"
                    use:focus
                >
            </label>

            {#if showConfirm}
                <label class="d-b mt-0_5em">
                    {confirmLabel}<br>
                    <input
                        type="password"
                        bind:value={confirmPassword}
                        required
                        class="w-100p"
                    >
                </label>
            {/if}

            {#if error}
                <div class="mt-0_5em" style="color: red; font-size: 0.9em;">
                    {error}
                </div>
            {/if}

            <div class="mt-1em" style="display: flex; gap: 0.5em;">
                <button type="submit" class="flex-1">Submit</button>
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
