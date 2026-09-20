import { describe, expect, test } from 'bun:test'
import { pageText, snippetAround } from './pageText'

describe('what a page says', () => {
  test('a Flat Page reads as its text, not its HTML', () => {
    const link = '<a href="https://x.test" target="_blank" contenteditable="false">a link</a>'
    expect(pageText('FlatPage', `<div>Milk and <b>bread</b></div><div>then ${link}</div>`)).toBe('Milk and **bread**\nthen [a link](https://x.test)')
  })

  test('formatting the line form cannot express still reads as plain text', () => {
    expect(pageText('FlatPage', '<div><span style="color: red">Urgent</span> today</div>')).toBe('Urgent today')
  })

  test('a Flat Page v2 reads as its text, not its ProseMirror JSON', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Shopping' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Bread and milk' }] },
      ],
    })
    expect(pageText('FlatPageV2', doc)).toBe('## Shopping\nBread and milk')
  })

  test('a Table reads as its rows, keyed by column', () => {
    const doc = JSON.stringify({
      columns: [{ name: 'Item' }, { name: 'Price', label: 'Cost' }],
      items: [{ Item: '<b>Bread</b>', Price: '55' }, { Item: 'Milk', Price: '' }],
      totals: {},
    })
    expect(pageText('Table', doc)).toBe('Item | Cost\nItem: Bread | Price: 55\nItem: Milk')
  })

  test('a Mini App reads as its code and what it has stored', () => {
    const files = { html: '<div id="app"></div>', css: '', js: 'const total = 1', modules: [{ name: 'helpers.js', code: 'export const one = 1' }] }
    expect(pageText('MiniApp', JSON.stringify({ files, kv: {} }))).toBe('<div id="app"></div>\nconst total = 1\nhelpers.js\nexport const one = 1')
    // The stored data is indexed with the code, so a search that matched an
    // item has to be able to find that item in what is shown.
    const withData = JSON.stringify({ files, kv: { items: [{ text: 'ring the plumber', done: false }] } })
    expect(pageText('MiniApp', withData)).toEndWith('ring the plumber')
    // Stored data is not a document shape: a key named type holds a value the
    // app means to show, unlike the node names of a Rich Text page.
    const tagged = JSON.stringify({ files, kv: { entries: [{ type: 'groceries', note: 'milk' }] } })
    expect(pageText('MiniApp', tagged)).toEndWith('groceries\nmilk')
  })

  test('a page type with no codec here still gives up its text', () => {
    // Rich Text is Editor.js blocks; Kanban and Spreadsheet v2 are their own shapes.
    const doc = JSON.stringify({ time: 1, blocks: [{ type: 'paragraph', data: { text: 'A <b>note</b> here' } }] })
    // The node names are shape, not text: "paragraph" would crowd out the page.
    expect(pageText('RichText', doc)).toBe('A note here')
  })

  test('dropping the shape keys keeps what the page says', () => {
    const board = JSON.stringify({ boards: [{ id: '1789', title: 'Doing', cards: [{ id: '1790', title: 'Fix the boiler', description: 'ring the plumber' }] }] })
    expect(pageText('Kanban', board)).toBe('Doing\nFix the boiler\nring the plumber')
  })

  test('XML content comes back without its tags', () => {
    expect(pageText('DrawIO', '<mxfile><diagram>Flow chart</diagram></mxfile>')).toBe('Flow chart')
  })

  test('nothing to read is nothing to show', () => {
    expect(pageText('FlatPage', null)).toBeNull()
    expect(pageText('MiniApp', 'not json')).toBeNull()
  })
})

describe('the window around a match', () => {
  const long = (word: string) => `${'filler '.repeat(60)}${word} ${'more '.repeat(60)}`

  test('short text comes back whole', () => {
    expect(snippetAround('Bread and milk', 'milk')).toBe('Bread and milk')
  })

  test('a long page is windowed around the match', () => {
    const snippet = snippetAround(long('needle'), 'needle')
    expect(snippet).toContain('needle')
    expect(snippet.startsWith('...')).toBe(true)
    expect(snippet.endsWith('...')).toBe(true)
    expect(snippet.length).toBeLessThan(260)
  })

  test('a multi-word query falls back to its longest word', () => {
    expect(snippetAround(long('reconciliation'), 'the reconciliation report')).toContain('reconciliation')
  })

  test('text that matched on something the decoder dropped still shows the start', () => {
    expect(snippetAround(long('elsewhere'), 'nowhere')).toStartWith('filler')
  })

  test('no markers are added, so a snippet cannot be mistaken for markup', () => {
    expect(snippetAround('Bread and milk', 'milk')).not.toContain('*')
  })

  test('whitespace is collapsed', () => {
    expect(snippetAround('Bread\n\nand   milk', 'milk')).toBe('Bread and milk')
  })
})
