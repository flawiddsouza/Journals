import { token } from '../stores.js'
import { baseURL } from '../../config.js'
import { logoutAccount } from './account.js'

const fetchPlus = function(method, url, data, headers = {}) {
    return fetch(baseURL + url, {
        method: method.toUpperCase(),
        body: JSON.stringify(data),
        credentials: fetchPlus.credentials,
        headers: Object.assign({}, fetchPlus.headers, headers)
    }).then(res => res.ok ? res.json() : Promise.reject(res)).catch(res => {
        if(res.status === 401) { // if response code is unauthorized
            fetchPlus.post('/login', {
                username: localStorage.getItem('username'),
                password: localStorage.getItem('password')
            }).then(response => {
                if(response.hasOwnProperty('error')) {
                    // if there's an error, perform logout + avoid infinite loop
                    logoutAccount()
                } else {
                    localStorage.setItem('token', response.token)
                    location.reload()
                }
            })
        }
        return Promise.reject(res)
    })
}

fetchPlus.token = null

token.subscribe(value => {
    fetchPlus.token = value
})

// fetchPlus.credentials = 'include'
fetchPlus.headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Token': fetchPlus.token
}

const httpMethods = ['get', 'post', 'put', 'delete']
httpMethods.forEach(method => {
    fetchPlus[method] = fetchPlus.bind(null, method)
})

export default fetchPlus
