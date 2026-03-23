import { writable } from 'svelte/store'

export const toasts = writable([])

let nextId = 0
export function toast(msg) {
    const id = nextId++
    toasts.update((t) => [...t, { id, msg }])
    setTimeout(() => toasts.update((t) => t.filter((x) => x.id !== id)), 2500)
}
