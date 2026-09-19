// @vitest-environment jsdom
import { tick } from 'svelte'
import { afterEach, describe, expect, it } from 'vitest'
import { clearBanner, dialogQueue, showAlert, showBanner, showConfirm, showPrompt } from './dialogs.js'

const dialog = () => document.querySelector('[role="alertdialog"]')
const button = (label) => [...document.querySelectorAll('.app-dialog-actions button')].find((b) => b.textContent.trim() === label)
const shown = async () => {
    await tick()
    await tick()
}
const click = async (label) => {
    button(label).click()
    await shown()
}

afterEach(async () => {
    dialogQueue.set([])
    clearBanner()
    await shown()
})

describe('in-page dialogs', () => {
    it('an alert shows its message with one button and resolves when it is pressed', async () => {
        let done = false
        showAlert('Saved').then(() => (done = true))
        await shown()
        expect(dialog().textContent).toContain('Saved')
        expect(document.querySelectorAll('.app-dialog-actions button')).toHaveLength(1)
        await click('OK')
        expect(done).toBe(true)
        expect(dialog()).toBeNull()
    })

    it('a confirm resolves true or false, with the labels it was given', async () => {
        const yes = showConfirm('Delete?', { confirmLabel: 'Delete', danger: true })
        await shown()
        expect(button('Delete').className).toContain('btn-danger')
        await click('Delete')
        expect(await yes).toBe(true)

        const no = showConfirm('Delete?')
        await shown()
        await click('Cancel')
        expect(await no).toBe(false)
    })

    it('a prompt starts from its default, resolves to what was typed, and to null when cancelled', async () => {
        const typed = showPrompt('Page name:', 'Old name')
        await shown()
        const input = document.querySelector('.app-dialog input')
        expect(input.value).toBe('Old name')
        expect(document.activeElement).toBe(input)
        input.value = 'New name'
        input.dispatchEvent(new Event('input'))
        document.querySelector('.app-dialog').dispatchEvent(new Event('submit', { cancelable: true }))
        expect(await typed).toBe('New name')

        const cancelled = showPrompt('Page name:')
        await shown()
        await click('Cancel')
        expect(await cancelled).toBeNull()
    })

    it('a password prompt hides what is typed', async () => {
        showPrompt('Password:', '', { type: 'password' })
        await shown()
        expect(document.querySelector('.app-dialog input').type).toBe('password')
    })

    it('Escape cancels, and does not reach a modal underneath', async () => {
        let reachedUnderneath = false
        const underneath = () => (reachedUnderneath = true)
        document.addEventListener('keyup', underneath)
        const answer = showConfirm('Sure?')
        await shown()
        document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
        expect(await answer).toBe(false)
        expect(reachedUnderneath).toBe(false)
        document.removeEventListener('keyup', underneath)
    })

    it('a second dialog waits for the first, and the same alert asked twice shows once', async () => {
        const first = showConfirm('First?')
        const second = showConfirm('Second?')
        await shown()
        expect(dialog().textContent).toContain('First?')
        await click('OK')
        expect(dialog().textContent).toContain('Second?')
        await click('OK')
        expect(await Promise.all([first, second])).toEqual([true, true])

        const a = showAlert('Invalid column type')
        const b = showAlert('Invalid column type')
        await shown()
        await click('OK')
        await Promise.all([a, b])
        expect(dialog()).toBeNull()
    })

    it('focus goes back to where it was', async () => {
        const editor = document.createElement('textarea')
        document.body.appendChild(editor)
        editor.focus()
        showAlert('Done')
        await shown()
        expect(document.activeElement).toBe(button('OK'))
        await click('OK')
        expect(document.activeElement).toBe(editor)
        editor.remove()
    })

    it('a banner stays up until it is cleared, and runs its action', async () => {
        let acted = false
        showBanner('Nothing is being saved', { actionLabel: 'Reload', onAction: () => (acted = true) })
        await shown()
        const banner = document.querySelector('.app-banner')
        expect(banner.textContent).toContain('Nothing is being saved')
        banner.querySelector('button').click()
        expect(acted).toBe(true)
        clearBanner()
        await shown()
        expect(document.querySelector('.app-banner')).toBeNull()
    })
})
