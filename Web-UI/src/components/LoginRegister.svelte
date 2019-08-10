<script>
import fetchPlus from '../helpers/fetchPlus.js'

function focus(element) {
    element.focus()
}

let type = 'login'
let loginUsername = ''
let loginPassword = ''
let registerUsername = ''
let registerPassword = ''
let error = ''

function login() {
    fetchPlus.post('/login', {
        username: loginUsername,
        password: loginPassword
    }).then(response => {
        if(response.hasOwnProperty('error')) {
            error = response.error
        } else {
            localStorage.setItem('username', loginUsername)
            localStorage.setItem('password', loginPassword)
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
                    <input type="text" required bind:value={loginUsername} use:focus>
                </label>
                <label class="mt-0_5em">
                    Password:<br>
                    <input type="password" required bind:value={loginPassword}>
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

.mt-1em {
    margin-top: 1em;
}

.mt-0_5em {
    margin-top: 0.5em;
}

.w-100p {
    width: 100%;
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
