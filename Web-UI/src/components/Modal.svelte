<script>
import { createEventDispatcher } from 'svelte'
import { onMount } from 'svelte'

const dispatch = createEventDispatcher()

function closeModal(event) {
    if (event.target.closest('dialog')) {
        return
    }
    dispatch('close-modal')
}

onMount(() => {
    const escapeHandler = (event) => {
        if (event.key === 'Escape') {
            dispatch('close-modal')
        }
    }

    document.addEventListener('keyup', escapeHandler)

    return () => {
        document.removeEventListener('keyup', escapeHandler)
    }
})
</script>

<div class="dialog-background"></div>
<div class="modal-container" on:click={closeModal}>
    <dialog open>
        <slot></slot>
    </dialog>
</div>

<style>
.dialog-background {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.377);
}

.modal-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: grid;
    place-items: center;
    z-index: 2;
}

dialog {
    padding: 14px;
}
</style>
