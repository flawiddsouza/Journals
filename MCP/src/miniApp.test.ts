import { describe, expect, test } from 'bun:test'
import { applyModules, describeData, parseMiniApp, serialiseMiniApp, syntaxError } from './miniApp'

describe('parseMiniApp', () => {
  test('a never-saved page is null, so the caller can tell it from an empty app', () => {
    expect(parseMiniApp(null)).toBeNull()
    expect(parseMiniApp('')).toBeNull()
    expect(parseMiniApp('{"kv":{}}')).toBeNull()
    // Unparseable content is the same to the app: it shows the demo and its next save replaces it.
    expect(parseMiniApp('{"files":')).toBeNull()
  })

  test('a page that pulled a template has kv: null, which reads as no data', () => {
    const doc = parseMiniApp('{"files":{"html":"<p>x</p>","css":"","js":""},"kv":null}')
    expect(doc).toEqual({ files: { html: '<p>x</p>', css: '', js: '', modules: [] }, kv: {} })
  })

  test('round trip keeps the shape the app writes', () => {
    const stored = '{"files":{"html":"h","css":"c","js":"j","modules":[{"name":"u.js","code":"export const a=1"}]},"kv":{"n":7,"list":[{"t":"milk"}]}}'
    expect(serialiseMiniApp(parseMiniApp(stored)!)).toBe(stored)
  })
})

describe('applyModules', () => {
  const current = [{ name: 'a.js', code: '1' }, { name: 'b.css', code: '2' }]

  test('upsert replaces by name and appends new ones; remove deletes', () => {
    expect(applyModules(current, [{ name: 'a.js', code: 'new' }, { name: 'c.js', code: '3' }], ['b.css'])).toEqual([
      { name: 'a.js', code: 'new' },
      { name: 'c.js', code: '3' },
    ])
  })

  test("the app's own naming rule", () => {
    for (const name of ['', 'dir/x.js', 'x.ts', 'x', '..\\x.js']) {
      expect(() => applyModules([], [{ name, code: '' }], [])).toThrow(/flat file names/)
    }
  })

  test('removing a module that is not there is an error, not a silent no-op', () => {
    expect(() => applyModules(current, [], ['nope.js'])).toThrow(/a\.js, b\.css/)
  })

  test('at most 12', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `m${i}.js`, code: '' }))
    expect(applyModules(many, [{ name: 'm0.js', code: 'x' }], [])).toHaveLength(12)
    expect(() => applyModules(many, [{ name: 'extra.js', code: '' }], [])).toThrow(/at most 12/)
  })
})

test('syntaxError accepts what a mini app may use and reports what does not parse', () => {
  expect(syntaxError("import { createApp } from 'vue'\nimport { add } from './utils.js'\nconst n = (await Journals.getItem('n')) ?? 0\nexport {}")).toBeNull()
  expect(syntaxError('const x = (')).toBeString()
  expect(syntaxError('function () {}')).toMatch(/line 1/)
})

test('describeData previews large values and returns named keys whole', () => {
  const kv = { small: 7, big: 'x'.repeat(500) }
  const [small, big] = describeData(kv, [])
  expect(small).toEqual({ key: 'small', bytes: 1, value: 7 })
  expect(big).toMatchObject({ key: 'big', bytes: 502 })
  expect(big).not.toHaveProperty('value')
  expect(describeData(kv, ['big'])[1]).toHaveProperty('value', kv.big)
})
