const fetchPlus = function(method, url, data, headers = {}) {
    return fetch(url, {
        method: method.toUpperCase(),
        body: JSON.stringify(data),
        credentials: fetchPlus.credentials,
        headers: Object.assign({}, fetchPlus.headers, headers)
    }).then(res => res.ok ? res.json() : Promise.reject(res))
}

// fetchPlus.credentials = 'include'
fetchPlus.headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
}

const httpMethods = ['get', 'post', 'put', 'delete']
httpMethods.forEach(method => {
    fetchPlus[method] = fetchPlus.bind(null, method)
})

export default fetchPlus
