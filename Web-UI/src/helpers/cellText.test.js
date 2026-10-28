// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cellText, cellTextLines } from './cellText.js'

describe('cellText', () => {
    it('reads entities as the characters the table shows', () => {
        expect(cellText('Settings &gt; Display')).toBe('Settings > Display')
        expect(cellText('Fish &amp; Chips')).toBe('Fish & Chips')
    })

    it('reads cells that look the same as the same text', () => {
        expect(cellText('Settings &gt;&nbsp;Sound')).toBe(cellText('Settings &gt; Sound'))
        expect(cellText('<b>Notes</b>  ')).toBe('Notes')
    })

    it('reads a line break as a space', () => {
        expect(cellText('Fish<br>Chips')).toBe('Fish Chips')
        expect(cellText('Fish\nChips')).toBe('Fish Chips')
        expect(cellText('<div>a</div><div>b</div>')).toBe('a b')
        expect(cellText('1<div><div><br></div><div>c</div></div>')).toBe('1 c')
    })

    it('reads a cell of empty lines or only an image as blank', () => {
        expect(cellText('<div><br></div><div><br></div>')).toBe('')
        expect(cellText('<img src="x.png">')).toBe('')
    })

    it('keeps a ">" inside an attribute from ending the tag', () => {
        expect(cellText('<a title="a>b" href="#">link</a>')).toBe('link')
    })

    it('reads nothing as empty text', () => {
        expect(cellText(undefined)).toBe('')
        expect(cellText(null)).toBe('')
        expect(cellText(42)).toBe('42')
    })
})

describe('cellTextLines', () => {
    it('keeps line breaks and spacing, so a moved line still reads as an edit', () => {
        expect(cellTextLines('one<br>two &gt; three')).toBe('one\ntwo > three')
        expect(cellTextLines('a&nbsp; b')).toBe('a' + String.fromCharCode(0xa0) + ' b')
        expect(cellTextLines('')).toBe('')
    })

    it('starts a line at each line the editor typed as a block', () => {
        expect(cellTextLines('<div>a</div><div>b</div>')).toBe('a\nb')
        expect(cellTextLines('a<div><br></div><div>b</div>')).toBe('a\n\nb')
        expect(cellTextLines('<p>a</p>b')).toBe('a\nb')
    })

    it('keeps a line break stored as text, as a plain-text column shows it', () => {
        expect(cellTextLines('a &lt; b\nc')).toBe('a < b\nc')
    })
})
