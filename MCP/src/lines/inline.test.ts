import { describe, expect, test } from 'bun:test'
import { CodecError, type Inline, parseInline, renderInline } from './inline'

const parse = (s: string) => parseInline(s, { links: true })
const text = (t: string, ...marks: Inline['marks']): Inline => ({ kind: 'text', text: t, marks })

describe('parseInline', () => {
  test('marks', () => {
    expect(parse('a **b** *c* ~~d~~ `e`')).toEqual([
      text('a '), text('b', 'bold'), text(' '), text('c', 'italic'), text(' '), text('d', 'strike'), text(' '), text('e', 'code'),
    ])
  })

  test('nested marks come out in the order the editor stores them', () => {
    expect(parse('***x***')).toEqual([text('x', 'bold', 'italic')])
    expect(parse('*a **b***')).toEqual([text('a ', 'italic'), text('b', 'bold', 'italic')])
  })

  test('arithmetic and lone delimiters are text', () => {
    expect(parse('2 * 3 * 4')).toEqual([text('2 * 3 * 4')])
    expect(parse('a * b')).toEqual([text('a * b')])
    expect(parse('5* stars')).toEqual([text('5* stars')])
    expect(parse('**bold** and a stray ** here')).toEqual([text('bold', 'bold'), text(' and a stray ** here')])
    expect(parse('a ` b')).toEqual([text('a ` b')])
  })

  test('code spans are raw', () => {
    expect(parse('`**x** [a](b)`')).toEqual([text('**x** [a](b)', 'code')])
  })

  test('links, page links, images and breaks', () => {
    expect(parse('see [[Recipes|42]] or [site](https://a.b/c)<br>![cat](https://a.b/c.png "Cat")')).toEqual([
      text('see '),
      { kind: 'pageLink', pageId: 42, pageName: 'Recipes', marks: [] },
      text(' or '),
      { kind: 'link', href: 'https://a.b/c', label: 'site', marks: [] },
      { kind: 'break', marks: [] },
      { kind: 'image', src: 'https://a.b/c.png', alt: 'cat', title: 'Cat', marks: [] },
    ])
  })

  test('a page link without an id is an error that says how to write one', () => {
    expect(() => parse('[[Recipes]]')).toThrow(CodecError)
    expect(() => parse('[[Recipes]]')).toThrow(/\[\[Page name\|id\]\]/)
  })

  test('only web and mail addresses are accepted, since Flat Page renders links as HTML', () => {
    expect(() => parse('[x](javascript:alert(1))')).toThrow(/http/)
    expect(() => parse('![x](data:image/png;base64,AAAA)')).toThrow(/http/)
    expect(parse('[mail](mailto:a@b.c)')[0]).toMatchObject({ kind: 'link', href: 'mailto:a@b.c' })
  })

  test('with links off, as on a Task List, link syntax is just text', () => {
    expect(parseInline('[a](https://b) [[P|1]]', { links: false })).toEqual([text('[a](https://b) [[P|1]]')])
  })

  test('brackets that are not a link stay text', () => {
    expect(parse('[todo] and [x](not a url')).toEqual([text('[todo] and [x](not a url')])
  })
})

describe('round trip', () => {
  const samples: Inline[][] = [
    [text('plain')],
    [text('a * b ** c ` d [e] ~~ f \\ g <br> h')],
    [text('[[not a link|1]] and [label](https://x)')],
    [text('trailing space ', 'bold'), text('next')],
    [text('both', 'bold', 'italic', 'strike')],
    [text('a', 'italic'), text('b', 'bold'), text('c', 'bold', 'italic')],
    [text('x', 'code'), text(' then '), text('y', 'bold')],
    [{ kind: 'pageLink', pageId: 7, pageName: 'Pipes | and ] brackets', marks: [] }],
    [{ kind: 'link', href: 'https://a.b/?q=1&r=2', label: 'a ] b', marks: ['bold'] }],
    [{ kind: 'image', src: 'https://a.b/c.png', alt: null, title: null, marks: [] }],
    [text('line one'), { kind: 'break', marks: [] }, text('line two')],
  ]
  for (const tokens of samples) {
    test(renderInline(tokens), () => {
      expect(parse(renderInline(tokens))).toEqual(tokens)
    })
  }
})
