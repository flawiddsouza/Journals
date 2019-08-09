<script>
import { createEventDispatcher } from 'svelte'

const dispatch = createEventDispatcher()

function closeModal() {
    dispatch('close-modal')
}
</script>

<div class="dialog-background" on:click={closeModal}></div>
<dialog open>
    <slot></slot>
</dialog>

<style>
.dialog-background {
    position: fixed;
    top: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.377);
}

dialog {
    position: fixed;
    top: 0;
}
</style>
