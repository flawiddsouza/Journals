import { describe, expect, test } from 'bun:test'
import { type LineEdit, applyLineEdit, linesOf } from './edit'
import { type PMNode, isTaskLine, proseCodec } from './prose'
import { assertLoads, flatPageV2Schema, taskListSchema } from './testSchema'

const v2 = proseCodec('FlatPageV2')
const tasks = proseCodec('TaskList')

const t = (text: string, ...marks: string[]): PMNode => ({ type: 'text', ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}), text })
const p = (...content: PMNode[]): PMNode => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' })
const task = (checked: boolean, text: string, ...nested: PMNode[]): PMNode => ({ type: 'taskItem', attrs: { checked }, content: [p(t(text)), ...nested] })
const li = (text: string, ...nested: PMNode[]): PMNode => ({ type: 'listItem', content: [p(t(text)), ...nested] })
const cell = (text: string, attrs: object = {}): PMNode => ({
  type: 'tableCell',
  attrs: { colspan: 1, rowspan: 1, colwidth: [180], align: 'right', nowrap: true, ...attrs },
  content: [p(t(text))],
})
const doc = (...content: PMNode[]) => JSON.stringify({ type: 'doc', content })

// Written the way the editor writes it: every attr present, marks in schema order.
const PAGE = doc(
  { type: 'heading', attrs: { level: 2 }, content: [t('Groceries')] },
  p(t('see '), { type: 'pageLink', attrs: { pageId: 42, pageName: 'Recipes' } }, t(' and '), { type: 'externalLink', attrs: { href: 'https://shop.example', label: 'the shop' } }),
  p(),
  { type: 'taskList', content: [task(true, 'milk', { type: 'taskList', content: [task(false, 'oat milk')] }), task(false, 'eggs')] },
  { type: 'table', content: [{ type: 'tableRow', content: [cell('item'), cell('price')] }, { type: 'tableRow', content: [cell('milk'), cell('2')] }] },
  p(t('25-Apr-26', 'bold'), t(' paid * rent # not a heading')),
  { type: 'orderedList', attrs: { start: 3, type: null }, content: [li('three'), li('four'), li('five')] },
  { type: 'codeBlock', attrs: { language: 'js' }, content: [t('const a = 1\n\n- not a list')] },
  p({ type: 'image', attrs: { src: 'https://api.example/uploads/images/1.png', alt: null, title: null } }),
)

const edit = (codec: typeof v2, content: string | null, change: LineEdit) => applyLineEdit(codec, codec.read(content), change)

describe('reading', () => {
  test('a page as lines', () => {
    expect(linesOf(v2.read(PAGE))).toEqual([
      '## Groceries',
      'see [[Recipes|42]] and [the shop](https://shop.example)',
      '',
      '- [x] milk',
      '  - [ ] oat milk',
      '- [ ] eggs',
      '| item | price |',
      '| milk | 2 |',
      '**25-Apr-26** paid \\* rent # not a heading',
      '3. three',
      '4. four',
      '5. five',
      '```js',
      'const a = 1',
      '',
      '- not a list',
      '```',
      '![](https://api.example/uploads/images/1.png)',
    ])
  })

  test('only the table is read-only', () => {
    const readOnly = v2.read(PAGE).filter((u) => u.readOnly)
    expect(readOnly.map((u) => [u.readOnly, u.lines.length])).toEqual([['a table', 2]])
  })

  test('writing back what was read changes nothing', () => {
    expect(v2.write(v2.read(PAGE))).toBe(PAGE)
  })

  test('a never-saved page is one empty line, and a Task List one empty task', () => {
    expect(linesOf(v2.read(null))).toEqual([''])
    expect(linesOf(tasks.read(null))).toEqual(['- [ ] '])
  })

  test('text that looks like markup comes back escaped, so it survives being sent back', () => {
    const content = doc(p(t('# heading?')), p(t('- bullet?')), p(t('1. one?')), p(t('  - indented?')), p(t('| pipe')), p(t('``` fence')))
    const lines = linesOf(v2.read(content))
    expect(lines).toEqual(['\\# heading?', '\\- bullet?', '1\\. one?', '  \\- indented?', '\\| pipe', '\\`\\`\\` fence'])
    expect(v2.read(content).some((u) => u.readOnly)).toBe(false)
    expect(v2.write(v2.parse(lines))).toBe(content)
  })

  test('what the line form cannot express is read-only, not flattened', () => {
    const twoParagraphs: PMNode = { type: 'listItem', content: [p(t('first')), p(t('second'))] }
    const stringId = p({ type: 'pageLink', attrs: { pageId: '42', pageName: 'Pasted' } })
    const future = { type: 'details', content: [p(t('from a later version of the app'))] }
    const units = v2.read(doc({ type: 'bulletList', content: [twoParagraphs] }, stringId, future, p(t('fine'))))
    expect(units.map((u) => Boolean(u.readOnly))).toEqual([true, true, true, false])
  })

  test('a line break stored inside a text node is shown as two lines and left alone', () => {
    const units = v2.read(doc(p(t('two' + String.fromCharCode(10) + 'lines'))))
    expect(units[0]!.lines).toEqual(['two', 'lines'])
    expect(units[0]!.readOnly).toBeDefined()
  })

  test('content that is not JSON is reported as that, not as an internal error', () => {
    expect(() => v2.read('{"type":"doc"')).toThrow(/not valid JSON/)
  })

  test('a document saved before an attribute existed is still editable', () => {
    const old = doc({ type: 'orderedList', content: [li('one')] }, { type: 'taskList', content: [{ type: 'taskItem', content: [p(t('x'))] }] })
    expect(v2.read(old).some((u) => u.readOnly)).toBe(false)
  })
})

describe('editing', () => {
  test('replacing one paragraph leaves every other block byte-identical', () => {
    const result = edit(v2, PAGE, { start: 9, end: 9, lines: ['**26-Apr-26** called the bank'] })
    const before = JSON.parse(PAGE).content as PMNode[]
    const after = JSON.parse(result.content).content as PMNode[]
    expect(after[5]).toEqual(p(t('26-Apr-26', 'bold'), t(' called the bank')))
    expect(after.filter((_, i) => i !== 5)).toEqual(before.filter((_, i) => i !== 5))
    expect(JSON.stringify(after[4])).toBe(JSON.stringify(before[4]))
    assertLoads(flatPageV2Schema, result.content)
  })

  test('ticking a task', () => {
    const result = edit(v2, PAGE, { start: 5, end: 5, lines: ['  - [x] oat milk'] })
    expect(result.lines.slice(3, 6)).toEqual(['- [x] milk', '  - [x] oat milk', '- [ ] eggs'])
    assertLoads(flatPageV2Schema, result.content)
  })

  test('an indented insert nests under the item above, and the list stays one list', () => {
    const result = edit(v2, PAGE, { after: 6, lines: ['  - [ ] free range', '- [ ] bread'] })
    expect(result.lines.slice(3, 8)).toEqual(['- [x] milk', '  - [ ] oat milk', '- [ ] eggs', '  - [ ] free range', '- [ ] bread'])
    const lists = (JSON.parse(result.content).content as PMNode[]).filter((n) => n.type === 'taskList')
    expect(lists).toHaveLength(1)
    expect(lists[0]!.content).toHaveLength(3)
    expect(result.changed).toEqual({ start: 6, end: 8 })
    assertLoads(flatPageV2Schema, result.content)
  })

  test('inserting into a numbered list renumbers what follows', () => {
    const result = edit(v2, PAGE, { after: 10, lines: ['9. three and a half'] })
    expect(result.lines.slice(9, 13)).toEqual(['3. three', '4. three and a half', '5. four', '6. five'])
  })

  test('a paragraph dropped into a numbered list does not restart the second half at 1', () => {
    const result = edit(v2, PAGE, { after: 11, lines: ['an aside'] })
    expect(result.lines.slice(9, 14)).toEqual(['3. three', '4. four', 'an aside', '5. five', '```js'])
  })

  test('removing the first numbered item keeps the list start', () => {
    const result = edit(v2, PAGE, { start: 10, end: 10, lines: [] })
    expect(result.lines.slice(9, 11)).toEqual(['3. four', '4. five'])
  })

  test('cutting into a table is refused, and says what to do instead', () => {
    expect(() => edit(v2, PAGE, { start: 7, end: 7, lines: ['| eggs | 3 |'] })).toThrow(/Lines 7-8 are a table/)
    expect(() => edit(v2, PAGE, { start: 6, end: 8, lines: ['- [ ] eggs'] })).toThrow(/a table/)
  })

  test('a table can be removed whole, or edited around', () => {
    const removed = edit(v2, PAGE, { start: 7, end: 8, lines: [] })
    expect((JSON.parse(removed.content).content as PMNode[]).some((n) => n.type === 'table')).toBe(false)
    const around = edit(v2, PAGE, { after: 8, lines: ['below the table'] })
    expect(around.lines[8]).toBe('below the table')
    expect(JSON.stringify(JSON.parse(around.content).content[4])).toBe(JSON.stringify(JSON.parse(PAGE).content[4]))
  })

  test('writing a table is refused', () => {
    expect(() => edit(v2, PAGE, { after: 0, lines: ['| a | b |'] })).toThrow(/Tables cannot be written/)
  })

  test('an edit inside a code block', () => {
    const result = edit(v2, PAGE, { start: 14, end: 14, lines: ['const a = 2', 'const b = 3'] })
    const code = (JSON.parse(result.content).content as PMNode[]).find((n) => n.type === 'codeBlock')!
    expect(code.content![0]!.text).toBe('const a = 2\nconst b = 3\n\n- not a list')
  })

  test('an unclosed code block is an error, not a page of code', () => {
    expect(() => edit(v2, PAGE, { after: 0, lines: ['```js', 'oops'] })).toThrow(/never closed/)
  })

  test('two lists that only sit next to each other are not merged by an edit elsewhere', () => {
    const content = doc({ type: 'bulletList', content: [li('a')] }, { type: 'bulletList', content: [li('b')] }, p(t('end')))
    const result = edit(v2, content, { start: 3, end: 3, lines: ['the end'] })
    expect((JSON.parse(result.content).content as PMNode[]).map((n) => n.type)).toEqual(['bulletList', 'bulletList', 'paragraph'])
  })

  test('a link to a page goes in as a number, which is what the API looks for', () => {
    const result = edit(v2, PAGE, { after: 0, lines: ['[[Budget|7]]'] })
    expect(result.content).toContain('"pageId":7')
  })

  test('emptying the page leaves one the editor can still load', () => {
    const result = edit(v2, doc(p(t('only'))), { start: 1, end: 1, lines: [] })
    expect(result.content).toBe(doc(p()))
    assertLoads(flatPageV2Schema, result.content)
  })

  test('line numbers outside the page are refused', () => {
    expect(() => edit(v2, PAGE, { start: 18, end: 19, lines: ['x'] })).toThrow(/1 <= start <= end <= 18/)
    expect(() => edit(v2, PAGE, { after: 19, lines: ['x'] })).toThrow(/between 0 and 18/)
  })
})

describe('Task List', () => {
  const LIST = doc({ type: 'taskList', content: [task(true, 'Buy milk'), task(false, 'Parent', { type: 'taskList', content: [task(false, 'child')] })] })

  test('reads as tasks', () => {
    expect(linesOf(tasks.read(LIST))).toEqual(['- [x] Buy milk', '- [ ] Parent', '  - [ ] child'])
    expect(tasks.write(tasks.read(LIST))).toBe(LIST)
  })

  test('every line written is a task, whatever it looks like', () => {
    const result = edit(tasks, LIST, { after: 3, lines: ['plain line', '- bullet', '# not a heading', '', '- [x] done **now**'] })
    expect(result.lines.slice(3)).toEqual(['- [ ] plain line', '- [ ] bullet', '- [ ] # not a heading', '- [x] done **now**'])
    assertLoads(taskListSchema, result.content)
  })

  test('which lines that changes is answerable, so edit_page can say so', () => {
    expect(['plain line', '- bullet', '# not a heading', ''].filter(isTaskLine)).toEqual([])
    expect(['- [ ] open', '- [x] done', '  - [X] nested', '- [ ]'].every(isTaskLine)).toBe(true)
    // A marker needs its space: "- [ ]x" is text that happens to start that way.
    expect(isTaskLine('- [ ]x')).toBe(false)
  })

  test('links do not exist there, so link syntax stays text', () => {
    const result = edit(tasks, LIST, { after: 3, lines: ['- [ ] read [docs](https://x.example)'] })
    expect(result.content).not.toContain('externalLink')
    assertLoads(taskListSchema, result.content)
  })

  test('the document stays a single list, even after deleting everything', () => {
    const added = edit(tasks, LIST, { after: 0, lines: ['- [ ] first'] })
    expect((JSON.parse(added.content).content as PMNode[]).map((n) => n.type)).toEqual(['taskList'])
    const emptied = edit(tasks, LIST, { start: 1, end: 3, lines: [] })
    expect(linesOf(tasks.read(emptied.content))).toEqual(['- [ ] '])
    assertLoads(taskListSchema, emptied.content)
  })
})

test('anything parsed from lines is a document the editor loads', () => {
  const fragments = ['plain', '', '# h', '###### h6', '- b', '  - nested', '    - deeper', '1. one', '2. two', '- [ ] t', '- [x] done', '  1. mixed', '**b** *i* ~~s~~ `c`', '[[P|3]] [l](https://a.b) ![](https://a.b/i.png)', 'a<br>b', '```', 'code', '```', '  indented text', '\\- escaped', '***both***', '7. seven']
  // Deterministic shuffles, so a failure can be reproduced.
  let seed = 7
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  for (let round = 0; round < 200; round++) {
    const lines = Array.from({ length: 1 + Math.floor(next() * 12) }, () => fragments[Math.floor(next() * fragments.length)]!)
    const closed = lines.filter((l) => l === '```').length % 2 ? [...lines, '```'] : lines
    const written = v2.parse(closed)
    const content = v2.write(written)
    // The check every edit makes: what was written reads back as the same
    // lines. Numbers are compared loosely there too, since a list numbers itself.
    const loose = (lines: string[]) => lines.map((l) => l.replace(/^[0-9]+[.] /, '#. '))
    expect(loose(linesOf(v2.read(content)))).toEqual(loose(linesOf(written)))
    assertLoads(flatPageV2Schema, content)
    // And reading it back is stable: the lines of a written page parse to the same page.
    expect(v2.write(v2.parse(linesOf(v2.read(content))))).toBe(content)
    assertLoads(taskListSchema, tasks.write(tasks.parse(lines)))
  }
})
