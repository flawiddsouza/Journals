import { describe, expect, it } from 'vitest'
import { shouldShowPageNav } from './pageCapabilities.js'

describe('shouldShowPageNav', () => {
    it.each(['PageGroup', 'Favorites'])(
        'shows page navigation for an unlocked %s page',
        (type) => {
            expect(shouldShowPageNav({ type, locked: false })).toBe(true)
        },
    )

    it('hides page navigation for a locked page', () => {
        expect(shouldShowPageNav({ type: 'FlatPage', locked: true })).toBe(false)
    })
})
