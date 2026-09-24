// Integrations are saved in the API with their secret headers, and the API makes
// every request (integration_routes.cr), so scripts only ever name one.

import { baseURL } from '../../config.js'
import fetchPlus, { refreshLogin } from './fetchPlus.js'

export const listIntegrations = () => fetchPlus.get('/integrations')
export const createIntegration = (integration) => fetchPlus.post('/integrations', integration)
export const updateIntegration = (id, integration) => fetchPlus.put(`/integrations/${id}`, integration)
export const deleteIntegration = (id) => fetchPlus.delete(`/integrations/${id}`)

export const listIntegrationGrants = (pageId) => fetchPlus.get(`/integration-grants/${pageId}`)
export const grantIntegration = (pageId, integrationId) =>
    fetchPlus.put(`/integration-grants/${pageId}/${integrationId}`, {})
export const revokeIntegration = (pageId, integrationId) =>
    fetchPlus.delete(`/integration-grants/${pageId}/${integrationId}`)

/** Turns a refused API call into an Error carrying the API's own message. */
export async function apiError(failure, fallback) {
    let message = fallback
    try {
        const body = await failure.json()
        if (body?.error) message = body.error
    } catch {
        // not an API answer, keep the fallback
    }
    return new Error(message)
}

const answerHeader = (response, name) => response.headers.get(name)

function postIntegrationRequest({ name, method, path, headers, body }, token) {
    return fetch(baseURL + '/integration-requests', {
        method: 'POST',
        credentials: fetchPlus.credentials,
        headers: {
            Token: token,
            // Not JSON or a form: the API would read either itself and the
            // route would find no body (integration_routes.cr).
            'Content-Type': 'application/octet-stream',
            'X-Integration-Name': encodeURIComponent(name),
            'X-Integration-Method': encodeURIComponent(method),
            'X-Integration-Path': encodeURIComponent(path),
            'X-Integration-Headers': encodeURIComponent(JSON.stringify(headers)),
        },
        body,
    })
}

/**
 * Sends one request through the API and resolves to the service's answer as
 * { status, headers, bytes }, whatever its status. Rejects when the API
 * refused the request or got no answer, with the API's reason.
 */
export async function sendIntegrationRequest(request) {
    let response = await postIntegrationRequest(request, fetchPlus.headers['Token'])
    if (response.status === 401) {
        response = await postIntegrationRequest(request, await refreshLogin(response))
    }
    const status = answerHeader(response, 'X-Integration-Status')
    if (status === null) throw await apiError(response, `The request through ${request.name} failed`)
    return {
        status: Number(status),
        headers: JSON.parse(decodeURIComponent(answerHeader(response, 'X-Integration-Headers') || '%7B%7D')),
        bytes: await response.arrayBuffer(),
    }
}

// The charset the service declared, or UTF-8.
function decodeText(bytes, contentType) {
    const charset = /charset=([^;]+)/i.exec(contentType || '')?.[1]?.trim().replace(/^"|"$/g, '')
    try {
        return new TextDecoder(charset || 'utf-8').decode(bytes)
    } catch {
        return new TextDecoder().decode(bytes)
    }
}

/** The answer as a script sees it: the ways to read a fetch Response, but
 *  synchronous, since the bytes are already here. body is the text. */
export function integrationResponse({ status, headers, bytes }) {
    const contentType = headers['content-type'] || ''
    let text
    return {
        status,
        ok: status >= 200 && status < 300,
        headers,
        get body() {
            return this.text()
        },
        text: () => (text ??= decodeText(bytes, contentType)),
        json() {
            return JSON.parse(this.text())
        },
        arrayBuffer: () => bytes.slice(0),
        blob: () => new Blob([bytes], { type: contentType }),
    }
}

/** What a script passes as a body, as bytes and the Content-Type it implies.
 *  A string goes as it is, bytes and files as bytes, anything else as JSON. */
async function requestBody(body) {
    if (body === undefined || body === null) return { bytes: undefined, contentType: null }
    if (typeof body === 'string') return { bytes: new TextEncoder().encode(body), contentType: null }
    if (body instanceof Blob) return { bytes: new Uint8Array(await body.arrayBuffer()), contentType: body.type || null }
    if (body instanceof ArrayBuffer) return { bytes: new Uint8Array(body), contentType: null }
    if (ArrayBuffer.isView(body)) {
        return { bytes: new Uint8Array(body.buffer, body.byteOffset, body.byteLength), contentType: null }
    }
    return { bytes: new TextEncoder().encode(JSON.stringify(body)), contentType: 'application/json' }
}

/**
 * What a script gets from integration(name). Every call resolves to the
 * service's answer (integrationResponse) and throws when its status is not
 * 2xx, with that answer on error.response.
 */
export function integrationClient(name, send = sendIntegrationRequest) {
    async function request(method, path, { body, headers = {} } = {}) {
        const sentHeaders = { ...headers }
        const { bytes, contentType } = await requestBody(body)
        if (contentType && !Object.keys(sentHeaders).some((key) => key.toLowerCase() === 'content-type')) {
            sentHeaders['Content-Type'] = contentType
        }
        const response = integrationResponse(await send({ name, method, path, headers: sentHeaders, body: bytes }))
        if (!response.ok) {
            const error = new Error(`${name} answered ${response.status} to ${method} ${path}: ${response.text().slice(0, 300)}`)
            error.response = response
            throw error
        }
        return response
    }

    return {
        request,
        get: (path, options) => request('GET', path, options),
        delete: (path, options) => request('DELETE', path, options),
        post: (path, body, options) => request('POST', path, { ...options, body }),
        put: (path, body, options) => request('PUT', path, { ...options, body }),
        patch: (path, body, options) => request('PATCH', path, { ...options, body }),
    }
}

const AsyncFunction = (async () => {}).constructor

/**
 * Runs a Table's pull script on a copy of the rows and resolves to that copy
 * as the script left it. The script changes rows in place, as a startup
 * script does, and nothing is saved here.
 */
export async function runPullScript(code, rows, makeClient = integrationClient) {
    const copy = structuredClone(rows)
    await new AsyncFunction('rows', 'integration', code)(copy, makeClient)
    if (!copy.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
        throw new Error('The pull script left something in rows that is not a row object')
    }
    return copy
}
