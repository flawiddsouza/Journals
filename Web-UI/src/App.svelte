<script>
import LoginRegister from './components/LoginRegister.svelte'
import Frame from './components/Frame.svelte'
import Search from './components/Search.svelte'
import Admin from './components/Admin.svelte'

import { token, role } from './stores.js'

let hash = window.location.hash
window.addEventListener('hashchange', () => { hash = window.location.hash })
</script>

{#if $token === null}
    <LoginRegister></LoginRegister>
{:else if hash === '#admin' && $role === 'admin'}
    <Admin />
{:else}
    <Frame></Frame>
    <Search></Search>
{/if}
