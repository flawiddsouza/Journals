import { describe, expect, test } from 'bun:test'
import { evaluateScript, type ScriptTarget } from './evaluate'
import type { TableDocument } from './tableDoc'

const doc: TableDocument = {
  columns: [
    { name: 'Amount', type: '' },
    { name: 'Double', type: 'Computed', expression: "return dbl(Number(item['Amount']))" },
    { name: 'Next', type: '' },
  ],
  items: [{ Amount: '1' }, { Amount: '2' }, { Amount: '3' }],
  customFunctions: 'function dbl(x){return x*2}',
  stats: { widgets: [{ id: 'w', title: 't', type: 'stat', expression: 'return 1' }] },
}

const outputs = (target: ScriptTarget, code: string, column: string | null = 'Amount') =>
  evaluateScript(doc, target, code, column).sample.map((s) => s.output)

describe('sandbox', () => {
  // Each root is a way to reach a Function constructor. If any of them belongs
  // to the host realm, the function it builds can see process.env.
  const roots = [
    'items.constructor.constructor',
    'item.constructor.constructor',
    'this.constructor.constructor',
    'globalThis.constructor.constructor',
    'columnName.constructor.constructor',
    'console.log.constructor',
    '__input.constructor.constructor',
    'JSON.parse.constructor',
    '(function(){ return this })().constructor.constructor',
  ]
  const probe = (root: string) =>
    `throw new Error('got:' + ${root}('return typeof process')())`

  for (const root of roots) {
    test(`${root} cannot reach process`, () => {
      const result = evaluateScript(doc, 'computed', probe(root), 'Amount')
      expect(result.errors[0]?.message).toBe('got:undefined')
    })
  }

  test('the startup script cannot reach process either', () => {
    const result = evaluateScript(doc, 'startup', probe('rows.constructor.constructor'), null)
    expect(result.errors[0]?.message).toBe('got:undefined')
  })

  test('a script that never finishes is reported, not hung on', () => {
    const result = evaluateScript(doc, 'computed', 'while(true){}', 'Amount', { timeoutMs: 200 })
    expect(result.timedOut).toBe(true)
    expect(result.rowsEvaluated).toBe(0)
  })

  test('nor is one that leaves the endless part for after it returns', () => {
    for (const code of ['Promise.resolve().then(() => { for (;;) {} }); return 1', '(async () => { await null; for (;;) {} })(); return 1']) {
      const result = evaluateScript(doc, 'computed', code, 'Amount', { timeoutMs: 200 })
      expect(result.timedOut).toBe(true)
    }
  })
})

describe('harness matches the app', () => {
  test('reading a computed column yields its computed value', () => {
    expect(outputs('computed', "return item['Double'] + 1", 'Next')).toEqual(['3', '5', '7'])
  })

  test('a candidate is its column from then on, so a cycle through it reads null as in the app', () => {
    // Double reads Amount. Making Amount computed from Double closes a loop.
    expect(outputs('computed', "return item['Double'] + 1", 'Amount')).toEqual(['1', '1', '1'])
  })

  test('Object.prototype methods on a row are not mistaken for columns', () => {
    expect(outputs('computed', "return String(item.hasOwnProperty('Amount'))")).toEqual([
      'true',
      'true',
      'true',
    ])
  })

  test('totals see enriched rows and the helpers', () => {
    expect(outputs('total', "return items.reduce((a, r) => a + r['Double'], 0)")).toEqual(['12'])
  })

  test('stats widgets do not get customFunctions', () => {
    expect(outputs('statsWidget', 'return typeof dbl', null)).toEqual(['undefined'])
  })

  // items is a Proxy, and for..of, spread and Array.from read its
  // Symbol.iterator before any index. The app runs these, so refusing them
  // here would refuse a script that works.
  test('for..of walks the rows, enriched, in every target that gets items', () => {
    const forOf = "let out = ''; for (const r of items) out += r['Double']; return out"
    expect(outputs('computed', forOf, 'Next')).toEqual(['246', '246', '246'])
    expect(outputs('total', forOf)).toEqual(['246'])
    expect(outputs('statsWidget', forOf, null)).toEqual(['246'])
  })

  test('spread and Array.from too', () => {
    expect(outputs('total', 'return [...items].length')).toEqual(['3'])
    expect(outputs('total', "return Array.from(items, (r) => r['Double']).join('-')")).toEqual(['2-4-6'])
  })

  test('rows reached by iteration are counted as dependencies', () => {
    const cost = (code: string) => evaluateScript(doc, 'total', code, 'Amount').cost.dependencyEntries
    // Three rows read once each, the same as reaching them by index.
    expect(cost("let n = 0; for (const r of items) n += Number(r['Amount']); return n")).toBe(
      cost("let n = 0; for (let i = 0; i < items.length; i++) n += Number(items[i]['Amount']); return n"),
    )
  })

  test('the startup script works on a copy of the rows', () => {
    expect(outputs('startup', "rows.push({ Amount: '9' })", null)).toEqual(['rows after script: 4'])
    expect(doc.items).toHaveLength(3)
  })
})

describe('failures', () => {
  test('a syntax error is a result, not an exception', () => {
    const result = evaluateScript(doc, 'computed', 'return (', 'Amount')
    expect(result.compiled).toBe(false)
    expect(result.errors[0]?.message).toStartWith('does not compile')
  })

  test('helpers that do not compile are caught', () => {
    expect(evaluateScript(doc, 'customFns', 'function (', null).compiled).toBe(false)
    expect(evaluateScript(doc, 'customFns', 'function ok(){}', null).compiled).toBe(true)
  })

  test('throwing on every row is countable as such', () => {
    const result = evaluateScript(doc, 'computed', 'return nope()', 'Amount')
    expect(result.threw).toBe(result.rowsEvaluated)
    expect(result.errors[0]?.rowIndex).toBe(0)
  })
})

describe('cost', () => {
  const big: TableDocument = {
    columns: [{ name: 'Amount' }, { name: 'Run' }],
    items: Array.from({ length: 200 }, (_, i) => ({ Amount: String(i) })),
  }

  test('a running total that rereads every earlier row is flagged', () => {
    const code = "return items.slice(0, rowIndex + 1).reduce((a, r) => a + Number(r['Amount']), 0)"
    expect(evaluateScript(big, 'computed', code, 'Run').cost.growsWithRowIndex).toBe(true)
  })

  test('a per-row expression is not', () => {
    const result = evaluateScript(big, 'computed', "return Number(item['Amount']) * 2", 'Run')
    expect(result.cost.growsWithRowIndex).toBe(false)
    expect(result.cost.dependencyEntries).toBe(200)
  })
})
