<script>
import LoginRegister from './components/LoginRegister.svelte'
import Frame2 from './components/Frame2.svelte'
import Search from './components/Search.svelte'

import { token } from './stores.js'
</script>

{#if $token === null}
    <LoginRegister></LoginRegister>
{:else}
    <Frame2></Frame2>
    <Search></Search>
{/if}
