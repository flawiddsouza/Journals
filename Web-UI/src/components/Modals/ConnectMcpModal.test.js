// @vitest-environment jsdom
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fetchPlus from '../../helpers/fetchPlus.js'
import { showConfirm } from '../../helpers/dialogs.js'
import ConnectMcpModal from './ConnectMcpModal.svelte'

vi.mock('../../helpers/fetchPlus.js', () => ({ default: { get: vi.fn(), delete: vi.fn() } }))
vi.mock('../../helpers/dialogs.js', () => ({ showConfirm: vi.fn() }))

const apps = [
    { id: 'a', name: 'Claude Code', since: '2026-09-19T00:00:00.000Z', canWrite: true },
    { id: 'b', name: 'ChatGPT', since: '2026-09-18T00:00:00.000Z', canWrite: false },
]

let modal
const settled = async () => {
    await new Promise((resolve) => setTimeout(resolve))
    await tick()
}
const open = async () => {
    modal = new ConnectMcpModal({ target: document.body })
    await settled()
}
const rows = () => [...document.querySelectorAll('.mcp-connection')].map((row) => row.textContent.replace(/\s+/g, ' ').trim())
const alertText = () => document.querySelector('[role="alert"]')?.textContent ?? null
const disconnect = async (name) => {
    ;[...document.querySelectorAll('.mcp-connection')].find((row) => row.textContent.includes(name)).querySelector('button').click()
    await settled()
}

beforeEach(() => {
    vi.resetAllMocks()
    showConfirm.mockResolvedValue(true)
})

afterEach(() => {
    modal.$destroy()
})

describe('Connect AI Apps', () => {
    it("fills this app's own address into the steps, and lists each app with its access", async () => {
        fetchPlus.get.mockResolvedValue(apps)
        await open()
        expect(fetchPlus.get).toHaveBeenCalledWith(`${window.location.origin}/oauth/connections`)
        expect(document.querySelector('.mcp-steps').textContent).toContain(`journals ${window.location.origin}/mcp`)
        expect(rows()[0]).toContain('Claude Code read and write')
        expect(rows()[1]).toContain('ChatGPT read only')
    })

    it('Copy copies the command, and selects it instead where the clipboard is refused', async () => {
        fetchPlus.get.mockResolvedValue([])
        const writeText = vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(new Error('denied'))
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        await open()
        const command = `claude mcp add --scope user --transport http journals ${window.location.origin}/mcp`
        const copy = document.querySelector('.mcp-code button')
        copy.click()
        await settled()
        expect(writeText).toHaveBeenCalledWith(command)
        expect(copy.textContent).toBe('Copied')

        window.getSelection().removeAllRanges()
        copy.click()
        await settled()
        expect(window.getSelection().toString()).toBe(command)
    })

    it('says so when nothing is connected, and when the list cannot be read', async () => {
        fetchPlus.get.mockResolvedValue([])
        await open()
        expect(document.body.textContent).toContain('No apps connected yet')
        expect(alertText()).toBeNull()
        modal.$destroy()

        fetchPlus.get.mockRejectedValue(new Error('down'))
        await open()
        expect(alertText()).toContain("Couldn't load the connected apps")
        expect(document.querySelector('.mcp-steps')).not.toBeNull()
    })

    it('disconnects the app that was named, after asking, and reads the list again', async () => {
        fetchPlus.get.mockResolvedValueOnce(apps).mockResolvedValueOnce([apps[0]])
        fetchPlus.delete.mockResolvedValue({ disconnected: true })
        await open()
        await disconnect('ChatGPT')
        expect(showConfirm.mock.calls[0][0]).toContain('Disconnect "ChatGPT"?')
        expect(showConfirm.mock.calls[0][0]).toContain('no longer read your pages')
        expect(fetchPlus.delete).toHaveBeenCalledWith(`${window.location.origin}/oauth/connections/b`)
        expect(rows()).toHaveLength(1)
        expect(alertText()).toBeNull()
    })

    it('does nothing when the question is answered no', async () => {
        showConfirm.mockResolvedValue(false)
        fetchPlus.get.mockResolvedValue(apps)
        await open()
        await disconnect('ChatGPT')
        expect(fetchPlus.delete).not.toHaveBeenCalled()
        expect(rows()).toHaveLength(2)
    })

    it('a failed disconnect is still reported after the list is read again', async () => {
        fetchPlus.get.mockResolvedValue(apps)
        fetchPlus.delete.mockRejectedValue({ status: 500 })
        await open()
        await disconnect('ChatGPT')
        expect(alertText()).toBe('Couldn\'t disconnect "ChatGPT".')
        expect(rows()).toHaveLength(2)
    })

    it('but not when the app turns out to be gone anyway', async () => {
        fetchPlus.get.mockResolvedValueOnce(apps).mockResolvedValueOnce([apps[0]])
        fetchPlus.delete.mockRejectedValue({ status: 404 })
        await open()
        await disconnect('ChatGPT')
        expect(alertText()).toBeNull()
        expect(rows()).toHaveLength(1)
    })
})
