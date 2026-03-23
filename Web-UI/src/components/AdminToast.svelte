<script>
import { toasts } from '../helpers/adminToast.js'
</script>

<div class="toast-stack">
    {#each $toasts as t (t.id)}
        <div class="admin-toast">{t.msg}</div>
    {/each}
</div>

<style>
.toast-stack {
    position: fixed;
    bottom: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 999;
    pointer-events: none;
}
.admin-toast {
    background: var(--color-section);
    color: var(--bg-center);
    font-size: 12px;
    padding: 7px 14px;
    border-radius: 5px;
}
</style>
