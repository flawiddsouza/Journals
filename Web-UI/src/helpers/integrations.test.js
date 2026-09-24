import { describe, expect, it, vi } from 'vitest'

vi.mock('./fetchPlus.js', () => ({ default: { headers: {} }, refreshLogin: vi.fn() }))
vi.mock('../../config.js', () => ({ baseURL: 'http://api.test' }))

const { integrationClient, runPullScript } = await import('./integrations.js')

const encode = (text) => new TextEncoder().encode(text).buffer
const answering = (status, body, headers = {}) =>
    vi.fn(async () => ({ status, headers, bytes: typeof body === 'string' ? encode(body) : body }))

describe('integrationClient', () => {
    it('sends the integration name, method and path, and reads the answer as text or JSON', async () => {
        const send = answering(200, '[1,2]', { link: '<next>', 'content-type': 'application/json' })
        const response = await integrationClient('GitHub', send).get('/user/repos?page=2')
        expect(send).toHaveBeenCalledWith({
            name: 'GitHub',
            method: 'GET',
            path: '/user/repos?page=2',
            headers: {},
            body: undefined,
        })
        expect(response.json()).toEqual([1, 2])
        expect(response.body).toBe('[1,2]')
        expect(response.headers.link).toBe('<next>')
    })

    it('gives a binary answer back byte for byte, and as a Blob of its type', async () => {
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]).buffer
        const response = await integrationClient('Images', answering(200, bytes, { 'content-type': 'image/png' })).get('/a.png')
        expect([...new Uint8Array(response.arrayBuffer())]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff])
        const blob = response.blob()
        expect(blob.type).toBe('image/png')
        expect(blob.size).toBe(6)
    })

    it('decodes text in the charset the service declared', async () => {
        const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]).buffer // "café" in ISO-8859-1
        const response = await integrationClient('Old', answering(200, latin1, { 'content-type': 'text/plain; charset=ISO-8859-1' })).get('/')
        expect(response.text()).toBe('café')
    })

    it('sends an object body as JSON with its content type, and a string as it is', async () => {
        const send = answering(201, '{}')
        await integrationClient('Gitea', send).post('/issues', { title: 'x' })
        const sent = send.mock.calls[0][0]
        expect(new TextDecoder().decode(sent.body)).toBe('{"title":"x"}')
        expect(sent.headers).toEqual({ 'Content-Type': 'application/json' })

        await integrationClient('Gitea', send).post('/raw', 'a=1', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
        const raw = send.mock.calls[1][0]
        expect(new TextDecoder().decode(raw.body)).toBe('a=1')
        expect(raw.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' })
    })

    it('sends a file as its bytes with its own content type', async () => {
        const send = answering(201, '{}')
        const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/zip' })
        await integrationClient('Uploads', send).put('/asset', file)
        const sent = send.mock.calls[0][0]
        expect([...sent.body]).toEqual([1, 2, 3])
        expect(sent.headers).toEqual({ 'Content-Type': 'application/zip' })
    })

    it('throws on a status outside 2xx, with the answer attached', async () => {
        const send = answering(404, 'Not Found')
        const failure = await integrationClient('GitHub', send).get('/nope').catch((error) => error)
        expect(failure.message).toContain('GitHub answered 404 to GET /nope')
        expect(failure.response.status).toBe(404)
        expect(failure.response.text()).toBe('Not Found')
    })
})

describe('runPullScript', () => {
    it('runs on a copy and resolves to the rows as the script left them', async () => {
        const rows = [{ A: '1' }]
        const result = await runPullScript(
            `const answer = await integration('Svc').get('/x')
             rows.push({ A: answer.json().value })`,
            rows,
            (name) => integrationClient(name, answering(200, '{"value":"2"}')),
        )
        expect(result).toEqual([{ A: '1' }, { A: '2' }])
        expect(rows).toEqual([{ A: '1' }])
    })

    it('refuses rows that are not row objects', async () => {
        await expect(runPullScript('rows.push(5)', [])).rejects.toThrow('not a row object')
    })
})
