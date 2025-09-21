export const logoutAccount = () => {
    let accounts = localStorage.getItem('accounts')
    if (accounts) {
        accounts = JSON.parse(accounts)
        accounts = accounts.filter(
            (account) => account.username !== localStorage.getItem('username'),
        )
        localStorage.setItem('accounts', JSON.stringify(accounts))
    }
    localStorage.removeItem('username')
    localStorage.removeItem('password')
    localStorage.removeItem('token')
    localStorage.removeItem('activePage')
    localStorage.removeItem('activeSection')
    document.location.reload()
}

export const switchAccount = () => {
    let accounts = localStorage.getItem('accounts')
    if (accounts) {
        accounts = JSON.parse(accounts)
    } else {
        accounts = []
    }

    const username = localStorage.getItem('username')

    const account = accounts.find((account) => account.username === username)

    if (!account) {
        accounts.push({
            username: username,
            password: localStorage.getItem('password'),
            token: localStorage.getItem('token'),
            activePage: localStorage.getItem('activePage'),
            activeSection: localStorage.getItem('activeSection'),
        })
    } else {
        account.activePage = localStorage.getItem('activePage')
        account.activeSection = localStorage.getItem('activeSection')
    }

    localStorage.setItem('accounts', JSON.stringify(accounts))

    localStorage.removeItem('username')
    localStorage.removeItem('password')
    localStorage.removeItem('token')
    localStorage.removeItem('activePage')
    localStorage.removeItem('activeSection')

    document.location.reload()
}

export const switchToAccount = (account) => {
    localStorage.setItem('username', account.username)
    localStorage.setItem('password', account.password)
    localStorage.setItem('token', account.token)
    localStorage.setItem('activePage', account.activePage)
    localStorage.setItem('activeSection', account.activeSection)
    document.location.reload()
}
