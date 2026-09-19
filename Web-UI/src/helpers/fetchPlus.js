import { token } from '../stores.js'
import { baseURL } from '../../config.js'
import { logoutAccount } from './account.js'
import { withPageRevision } from './pageRevisions.js'

const request = function (method, url, data, headers = {}) {
    const isMultipart = data instanceof FormData
    const baseHeaders = isMultipart
        ? { Accept: 'application/json', Token: fetchPlus.headers['Token'] }
        : fetchPlus.headers
    // A full address goes where it says: the MCP sidecar is served from the
    // app's own address, not the API's.
    const address = /^https?:\/\//.test(url) ? url : baseURL + url
    return fetch(address, {
        method: method.toUpperCase(),
        body: isMultipart ? data : JSON.stringify(data),
        credentials: fetchPlus.credentials,
        headers: Object.assign({}, baseHeaders, headers),
    })
        .then((res) => (res.ok ? res.json() : Promise.reject(res)))
        .catch((res) => {
            if (res.status === 401) {
                // if response code is unauthorized
                // Try to refresh token
                return fetchPlus
                    .post('/login', {
                        username: localStorage.getItem('username'),
                        password: localStorage.getItem('password'),
                        refresh: true,
                    })
                    .then((response) => {
                        if (response.hasOwnProperty('error')) {
                            // if there's an error, perform logout + avoid infinite loop
                            logoutAccount()
                            return Promise.reject(res)
                        } else {
                            localStorage.setItem('token', response.token)
                            fetchPlus.token = response.token
                            // Update token in headers
                            fetchPlus.headers['Token'] = response.token
                            // Retry the original request with new token
                            const retryBaseHeaders = isMultipart
                                ? { Accept: 'application/json', Token: fetchPlus.headers['Token'] }
                                : fetchPlus.headers
                            return fetch(address, {
                                method: method.toUpperCase(),
                                body: isMultipart ? data : JSON.stringify(data),
                                credentials: fetchPlus.credentials,
                                headers: Object.assign(
                                    {},
                                    retryBaseHeaders,
                                    headers,
                                ),
                            }).then((res2) =>
                                res2.ok ? res2.json() : Promise.reject(res2),
                            )
                        }
                    })
            }
            return Promise.reject(res)
        })
}

// Loading and saving page content goes through the revision check. Everything
// else is sent as it is.
const fetchPlus = function (method, url, data, headers = {}) {
    return withPageRevision(method, url, data, (dataToSend) =>
        request(method, url, dataToSend, headers),
    )
}

fetchPlus.token = null

token.subscribe((value) => {
    fetchPlus.token = value
})

fetchPlus.credentials = 'include'
fetchPlus.headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Token: fetchPlus.token,
}

const httpMethods = ['get', 'post', 'put', 'delete']
httpMethods.forEach((method) => {
    fetchPlus[method] = fetchPlus.bind(null, method)
})

export default fetchPlus
