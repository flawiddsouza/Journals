<script>
import fetchPlus from '../helpers/fetchPlus.js'
import { focus } from '../actions/focus.js'
import { initTheme } from '../helpers/theme.js'
import { role } from '../stores.js'

initTheme()

let type = 'login'
let loginUsername = ''
let loginPassword = ''
let loginDuration = '30 Minutes'
let registerUsername = ''
let registerPassword = ''
let error = ''

function login() {
    fetchPlus
        .post('/login', {
            username: loginUsername,
            password: loginPassword,
            duration: loginDuration,
        })
        .then((response) => {
            if (response.hasOwnProperty('error')) {
                error = response.error
            } else {
                if (loginDuration === 'Permanent') {
                    localStorage.setItem('password', loginPassword)
                }
                localStorage.setItem('username', loginUsername)
                localStorage.setItem('token', response.token)
                localStorage.setItem('role', response.role)
                role.set(response.role)
                location.reload()
            }
        })
}

function register() {
    fetchPlus
        .post('/register', {
            username: registerUsername,
            password: registerPassword,
        })
        .then((response) => {
            if (response.hasOwnProperty('error')) {
                error = response.error
            } else {
                type = 'login'
                registerUsername = ''
                registerPassword = ''
                alert('Registered Successfully!')
            }
        })
}

let accounts = localStorage.getItem('accounts')
accounts = JSON.parse(accounts ? accounts : '[]')

let accountIndexToSwitchTo = accounts.length > 0 ? 0 : null

import { switchToAccount } from '../helpers/account'

function switchAccount() {
    const account = accounts[accountIndexToSwitchTo]
    switchToAccount(account)
}
</script>

<div class="container">
    <div class="box">
        <div class="ta-c mb-1em">
            <a href="#login" on:click|preventDefault={() => (type = 'login')}
                >Login</a
            >
            |
            <a
                href="#register"
                on:click|preventDefault={() => (type = 'register')}>Register</a
            >
        </div>
        {#if type === 'login'}
            <h1 class="ta-c">Login</h1>
            <form on:submit|preventDefault={login}>
                <label>
                    Username:<br />
                    <input
                        class="input w-100p"
                        type="text"
                        required
                        bind:value={loginUsername}
                        use:focus
                    />
                </label>
                <label class="mt-0_5em">
                    Password:<br />
                    <input
                        class="input w-100p"
                        type="password"
                        required
                        bind:value={loginPassword}
                    />
                </label>
                <label class="mt-0_5em"
                    >Login Duration:<br />
                    <select class="input w-100p" bind:value={loginDuration}>
                        <option>30 Minutes</option>
                        <option>9 Hours</option>
                        <option>Permanent</option>
                    </select>
                </label>
                <button class="btn mt-1em w-100p">Login</button>
            </form>
        {:else}
            <h1 class="ta-c">Register</h1>
            <form on:submit|preventDefault={register}>
                <label>
                    Username:<br />
                    <input
                        class="input w-100p"
                        type="text"
                        required
                        bind:value={registerUsername}
                        use:focus
                    />
                </label>
                <label class="mt-0_5em">
                    Password:<br />
                    <input
                        class="input w-100p"
                        type="password"
                        required
                        bind:value={registerPassword}
                    />
                </label>
                <button class="btn mt-1em w-100p">Register</button>
            </form>
        {/if}
        <div class="mt-1em red">
            {#if error}
                Error: {error}
            {/if}
        </div>
        {#if accounts.length > 0}
            <div style="margin-top: 2em">
                Currently Logged In Accounts:
                <div style="display: flex;" class="mt-0_5em">
                    <select class="input w-100p" bind:value={accountIndexToSwitchTo}>
                        {#each accounts as account, index}
                            <option value={index}>{account.username}</option>
                        {/each}
                    </select>
                    <button class="btn" style="margin-left: 0.5em;" on:click={switchAccount}
                        >Switch</button
                    >
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
.container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    background: var(--bg-body);
}

.box {
    background: var(--bg-topbar);
    border: 1px solid var(--border-topbar);
    border-radius: 8px;
    padding: 2em 2.5em;
    min-width: 300px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
}

h1 {
    margin-top: 0;
    margin-bottom: 0.75em;
    font-size: 1.4em;
}

label {
    display: block;
}

a {
    color: var(--color-tb-link);
    text-decoration: none;
}

a:hover {
    color: var(--color-tb-hover);
}


.mt-0_5em {
    margin-top: 0.5em;
}

.ta-c {
    text-align: center;
}

.mb-1em {
    margin-bottom: 1em;
}

.red {
    color: red;
}
</style>
