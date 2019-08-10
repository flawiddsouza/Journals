<script>
import LoginRegister from './components/LoginRegister.svelte'
import Frame from './components/Frame.svelte'

import { token } from './stores.js'
</script>

{#if $token === null}
    <LoginRegister></LoginRegister>
{:else}
    <Frame></Frame>
{/if}
