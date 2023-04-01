import { writable } from 'svelte/store'

export const username = writable(localStorage.getItem('username'))
export const password = writable(localStorage.getItem('password'))
export const token = writable(localStorage.getItem('token'))
export const eventStore = writable(null)
