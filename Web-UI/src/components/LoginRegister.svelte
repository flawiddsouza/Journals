<script>
import fetchPlus from '../helpers/fetchPlus.js'

function focus(element) {
    element.focus()
}

let type = 'login'
let loginUsername = ''
let loginPassword = ''
let loginDuration = '30 Minutes'
let registerUsername = ''
let registerPassword = ''
let error = ''

function login() {
    fetchPlus.post('/login', {
        username: loginUsername,
        password: loginPassword,
        duration: loginDuration
    }).then(response => {
        if(response.hasOwnProperty('error')) {
            error = response.error
        } else {
            if(loginDuration === 'Permanent') {
                localStorage.setItem('password', loginPassword)
            }
            localStorage.setItem('username', loginUsername)
            localStorage.setItem('token', response.token)
            location.reload()
        }
    })
}

function register() {
    fetchPlus.post('/register', {
        username: registerUsername,
        password: registerPassword
    }).then(response => {
        if(response.hasOwnProperty('error')) {
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
            <a href="#login" on:click|preventDefault={() => type = 'login'}>Login</a> | <a href="#register" on:click|preventDefault={() => type = 'register'}>Register</a>
        </div>
        {#if type === 'login'}
            <h1 class="ta-c">Login</h1>
            <form on:submit|preventDefault={login}>
                <label>
                    Username:<br>
                    <input type="text" required bind:value={loginUsername} class="w-100p" use:focus>
                </label>
                <label class="mt-0_5em">
                    Password:<br>
                    <input type="password" required bind:value={loginPassword} class="w-100p">
                </label>
                <label class="mt-0_5em">Login Duration:<br>
                    <select bind:value={loginDuration} class="w-100p">
                        <option>30 Minutes</option>
                        <option>Permanent</option>
                    </select>
                </label>
                <button class="mt-1em w-100p">Login</button>
            </form>
        {:else}
            <h1 class="ta-c">Register</h1>
            <form on:submit|preventDefault={register}>
                <label>
                    Username:<br>
                    <input type="text" required bind:value={registerUsername} use:focus>
                </label>
                <label class="mt-0_5em">
                    Password:<br>
                    <input type="password" required bind:value={registerPassword}>
                </label>
                <button class="mt-1em w-100p">Register</button>
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
                    <select class="w-100p" bind:value={accountIndexToSwitchTo}>
                        {#each accounts as account, index}
                            <option value={index}>{account.username}</option>
                        {/each}
                    </select>
                    <button style="margin-left: 0.5em;" on:click={switchAccount}>Switch</button>
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
}

.box {
    padding: 1em;
    margin: 0 auto;
    border: 1px solid black;
}

h1 {
    margin-top: 0;
}

label {
    display: block;
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
