<script>
export let message = ''
export let variant = 'success' // 'success' | 'error' | 'info'
export let position = 'top' // 'top' | 'bottom'
export let align = 'center' // 'center' | 'left' | 'right'
export let offset = 8 // px from edge
export let z = 2 // z-index relative to parent
</script>

<div
    class="toast-wrapper {position} {align}"
    style="--offset: {offset}px; z-index: {z};"
>
    {#if message}
        <div class="toast {variant}">{message}</div>
    {/if}
</div>

<style>
.toast-wrapper {
    position: absolute;
    pointer-events: none; /* allow clicks through when hidden */
}

.toast-wrapper.top {
    top: var(--offset);
}

.toast-wrapper.bottom {
    bottom: var(--offset);
}

.toast-wrapper.center {
    left: 50%;
    transform: translateX(-50%);
}

.toast-wrapper.left {
    left: var(--offset);
}

.toast-wrapper.right {
    right: var(--offset);
}

.toast {
    pointer-events: auto;
    border-radius: 6px;
    padding: 0.4rem 0.75rem;
    background: #e5f6ff; /* default info */
    color: #0c4a6e;
    border: 1px solid #bae6fd;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
    font-size: 0.85rem;
    animation: fadeSlide 200ms ease-out;
}

.toast.success {
    background: #d1fae5;
    color: #065f46;
    border-color: #a7f3d0;
}

.toast.error {
    background: #fee2e2;
    color: #991b1b;
    border-color: #fecaca;
}

.toast.info {
    background: #e0e7ff;
    color: #3730a3;
    border-color: #c7d2fe;
}

@keyframes fadeSlide {
    from {
        opacity: 0;
        transform: translateY(-6px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
