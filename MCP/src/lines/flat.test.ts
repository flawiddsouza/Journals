import { describe, expect, test } from 'bun:test'
import { type LineEdit, applyLineEdit, linesOf } from './edit'
import { flatCodec } from './flat'

// What a real page looks like: a bare first line, the app's own link and image
// shapes, a Tab-indented line, a pasted styled span, and a pasted table.
const LINK = '<a data-page-id="42" class="page-link" href="/page/42" target="_blank" contenteditable="false">Recipes</a>'
const PARTS = [
  'Groceries &amp; <b>things</b>',
  `<div>see ${LINK} or <a href="https://shop.example" target="_blank" contenteditable="false">the shop</a></div>`,
  '<div><br></div>',
  '<div>&nbsp;&nbsp;&nbsp;&nbsp;milk</div>',
  '<div><span style="color: rgb(255, 0, 0);">pasted</span> red text</div>',
  '<div><img style="max-width: 100%" loading="lazy" src="https://api.example/uploads/images/1.png"></div>',
  '<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>',
  '<div>2 * 3 &lt; 7</div>',
]
const PAGE = PARTS.join('')

const edit = (content: string | null, change: LineEdit) => applyLineEdit(flatCodec, flatCodec.read(content), change)

describe('reading', () => {
  test('a page as lines', () => {
    expect(linesOf(flatCodec.read(PAGE))).toEqual([
      'Groceries & **things**',
      'see [[Recipes|42]] or [the shop](https://shop.example)',
      '',
      '    milk',
      'pasted red text',
      '![](https://api.example/uploads/images/1.png)',
      'ab',
      'cd',
      '2 \\* 3 < 7',
    ])
  })

  test('pasted styling and tables are read-only, everything else is editable', () => {
    expect(flatCodec.read(PAGE).map((u) => u.readOnly ?? null)).toEqual([
      null, null, null, null, 'formatting the line form cannot express', null, 'a table', null,
    ])
  })

  test('writing back what was read changes nothing', () => {
    expect(flatCodec.write(flatCodec.read(PAGE))).toBe(PAGE)
    const messy = 'text <b>unclosed<div>x</div>\n  <div dir="rtl">y</div><p>z</p><hr>tail'
    expect(flatCodec.write(flatCodec.read(messy))).toBe(messy)
  })

  test('a <div> wrapped around other lines is a container, not one giant line', () => {
    // Browsers wrap a whole page, or everything after its first line, like this.
    const wrapped = '<div>first<div>second</div><div><div>third</div><div><br></div></div></div>'
    expect(linesOf(flatCodec.read(wrapped))).toEqual(['first', 'second', 'third', ''])
    expect(flatCodec.read(wrapped).some((u) => u.readOnly)).toBe(false)
    expect(flatCodec.write(flatCodec.read(wrapped))).toBe(wrapped)
    // An append lands inside the wrapper, next to the line it follows.
    expect(edit(wrapped, { after: 2, lines: ['new'] }).content).toBe('<div>first<div>second</div><div>new</div><div><div>third</div><div><br></div></div></div>')
    expect(edit(wrapped, { start: 3, end: 3, lines: ['3rd'] }).content).toBe('<div>first<div>second</div><div><div>3rd</div><div><br></div></div></div>')
  })

  test('entities are decoded once, and a bad one does not break the page', () => {
    expect(linesOf(flatCodec.read('<div>&amp;lt; &#65;&#x42; &#99999999; &nbsp;x</div>'))).toEqual(['&lt; AB &#99999999;  x'])
  })

  test('a never-saved page has no lines', () => {
    expect(linesOf(flatCodec.read(null))).toEqual([])
    expect(edit(null, { after: 0, lines: ['first'] }).content).toBe('<div>first</div>')
  })
})

describe('editing', () => {
  test('only the replaced line changes; the rest is the same bytes', () => {
    const result = edit(PAGE, { start: 4, end: 4, lines: ['    oat milk, **2** cartons'] })
    const expected = [...PARTS]
    expected[3] = '<div>&nbsp;&nbsp;&nbsp;&nbsp;oat milk, <b>2</b> cartons</div>'
    expect(result.content).toBe(expected.join(''))
  })

  test('inserted lines use the markup the app itself writes', () => {
    const result = edit(PAGE, { after: 9, lines: ['[[Budget|7]] and [a site](https://a.example/?x=1&y=2)', '', '![pic](https://a.example/p.png)'] })
    expect(result.content.slice(PAGE.length)).toBe(
      '<div><a data-page-id="7" class="page-link" href="/page/7" target="_blank" contenteditable="false">Budget</a> and ' +
        '<a href="https://a.example/?x=1&amp;y=2" target="_blank" contenteditable="false">a site</a></div>' +
        '<div><br></div>' +
        '<div><img style="max-width: 100%" loading="lazy" alt="pic" src="https://a.example/p.png"></div>',
    )
  })

  test('text is escaped, because the app renders this content as HTML', () => {
    const result = edit(null, { after: 0, lines: ['<script>alert(1)</script> & <img src=x onerror=alert(1)>', '[x](https://a.example/"onmouseover="alert(1))'] })
    expect(result.content).toBe(
      '<div>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;img src=x onerror=alert(1)&gt;</div>' +
        '<div><a href="https://a.example/&quot;onmouseover=&quot;alert(1" target="_blank" contenteditable="false">x</a>)</div>',
    )
    expect(() => edit(null, { after: 0, lines: ['[x](javascript:alert(1))'] })).toThrow(/http/)
  })

  test('styled lines and tables are refused, but can be removed whole or edited around', () => {
    expect(() => edit(PAGE, { start: 5, end: 5, lines: ['plain now'] })).toThrow(/Lines 5-5 are formatting/)
    expect(() => edit(PAGE, { start: 7, end: 7, lines: ['x'] })).toThrow(/Lines 7-8 are a table/)
    expect(edit(PAGE, { start: 7, end: 8, lines: [] }).content).toBe(PARTS.filter((_, i) => i !== 6).join(''))
    expect(edit(PAGE, { after: 8, lines: ['below'] }).content).toBe([...PARTS.slice(0, 7), '<div>below</div>', PARTS[7]].join(''))
  })

  test('spacing survives HTML, which would otherwise collapse it', () => {
    const result = edit(null, { after: 0, lines: ['  two  spaces  '] })
    expect(result.content).toBe('<div>&nbsp;&nbsp;two &nbsp;spaces&nbsp;&nbsp;</div>')
    expect(result.lines).toEqual(['  two  spaces  '])
  })

  test('what HTML does not show is normalised, so the line reads back as written', () => {
    const nbsp = String.fromCharCode(160)
    const result = edit(null, { after: 0, lines: ['ends with a break<br>', '<br>', '\ttabbed', `non${nbsp}breaking`, '![a b](https://a.example/i.png "the title")'] })
    expect(result.lines).toEqual(['ends with a break', '', '    tabbed', 'non breaking', '![a b](https://a.example/i.png "the title")'])
  })
})

test('a line is editable only when sending it back unchanged would change nothing', () => {
  const echo = (html: string) => {
    const [unit] = flatCodec.read(html)
    return unit!.readOnly ? 'read-only' : flatCodec.parse(unit!.lines)[0]!.data.html
  }
  // The app's own shapes come back as themselves.
  for (const html of [
    '<div>plain &amp; simple</div>',
    '<div><b>bold</b> <i>it</i> <strike>gone</strike> <code>x</code></div>',
    `<div>${LINK}</div>`,
    '<div><a href="https://a.example" target="_blank" contenteditable="false">site</a></div>',
    '<div><img style="max-width: 100%" loading="lazy" src="https://a.example/i.png"></div>',
    '<div><br></div>',
  ]) {
    expect(echo(html)).toBe(html)
  }
  // The browser re-serialises the image style with a semicolon. Still the app's image.
  expect(echo('<div><img style="max-width: 100%;" loading="lazy" src="https://a.example/i.png"></div>')).not.toBe('read-only')
  // Anything the line form would lose makes the line read-only instead.
  for (const html of [
    '<div><a href="https://a.example/(x)" target="_blank" contenteditable="false">paren in address</a></div>',
    '<div><img id="i1" width="40" src="https://a.example/i.png"></div>',
    '<div><code><b>bold inside code</b></code></div>',
    '<div><a href="javascript:alert(1)">bad address</a></div>',
    '<div><strong>pasted strong</strong></div>',
    '<div>two\nsource lines</div>',
  ]) {
    expect(echo(html)).toBe('read-only')
  }
})

test('any line that parses reads back as it was written', () => {
  const nbsp = String.fromCharCode(160)
  const fragments = ['plain', '', '  indented', 'a  b   c ', '**b** *i* ~~s~~ `c`', '***both***', '[[P|3]]', '[l](https://a.b)', '![](https://a.b/i.png)', 'a<br>b', 'end<br>', '\ttab', `n${nbsp}b`, '<b>tag</b> & "quotes"', '\\*literal\\*', '2 * 3 * 4', '# not a heading', '- not a list']
  let seed = 11
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  for (let round = 0; round < 300; round++) {
    const lines = Array.from({ length: 1 + Math.floor(next() * 3) }, () => fragments[Math.floor(next() * fragments.length)]!)
    // Joined into one line as well, so fragments meet each other mid-line.
    for (const text of [lines, [lines.join(' ')]]) {
      const written = flatCodec.parse(text)
      expect(linesOf(flatCodec.read(flatCodec.write(written)))).toEqual(linesOf(written))
    }
  }
})
