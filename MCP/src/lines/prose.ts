import { isDeepStrictEqual } from 'node:util'
import type { LineCodec, Unit } from './edit'
import { CodecError, MARKS, type Inline, type Mark, inlineText, parseInline, renderInline } from './inline'

/**
 * Flat Page v2 and Task List pages: ProseMirror document JSON as lines.
 *
 * The schemas are FlatPageV2.svelte:171-208 and TaskList.svelte:22-45. A Flat
 * Page v2 document is `block+`. A Task List document is exactly one taskList.
 *
 * Whether a unit can be edited is not decided by a list of supported nodes. It
 * is decided by rendering the unit and parsing the lines back: if that does
 * not reproduce the unit, it is read-only. Tables, merged cells, an item
 * holding two paragraphs or a node added to the app later all end up protected
 * without being named here.
 */

export type PMNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

type ListType = 'bulletList' | 'orderedList' | 'taskList'
const LIST_TYPES: string[] = ['bulletList', 'orderedList', 'taskList']

/** One top-level block, or one item of a top-level list. `origin` numbers the
 *  list an item was read from, so two lists that merely sit next to each other
 *  are not merged on the way back. New items have none and join a neighbour. */
export type ProseData =
  | { block: PMNode }
  | { item: PMNode; list: ListType; listAttrs?: Record<string, unknown>; number: number; origin: number | null }

export type ProseMode = 'FlatPageV2' | 'TaskList'

// ---- document to lines

function toInline(content: PMNode[] | undefined): Inline[] {
  return (content ?? []).map((node): Inline => {
    const marks = (node.marks ?? []).map((m) => m.type as Mark)
    const attrs = node.attrs ?? {}
    if (node.type === 'text') return { kind: 'text', text: node.text ?? '', marks }
    if (node.type === 'hardBreak') return { kind: 'break', marks }
    if (node.type === 'pageLink') {
      return { kind: 'pageLink', pageId: Number(attrs.pageId), pageName: String(attrs.pageName ?? ''), marks }
    }
    if (node.type === 'externalLink') {
      return { kind: 'link', href: String(attrs.href ?? ''), label: String(attrs.label ?? ''), marks }
    }
    if (node.type === 'image') {
      return {
        kind: 'image',
        src: String(attrs.src ?? ''),
        alt: (attrs.alt as string | null) ?? null,
        title: (attrs.title as string | null) ?? null,
        marks,
      }
    }
    // Not something the text form has a spelling for. The unit fails its round
    // trip and is shown read-only.
    return { kind: 'text', text: `[${node.type}]`, marks }
  })
}

/** A line of text that would otherwise be read as the start of a block. The
 *  backslash goes before a punctuation character, the only place the parser
 *  honours one, so a numbered marker is escaped at its dot. */
const escapeBlockStart = (line: string) =>
  line
    .replace(/^(\s*)(#{1,6} |- |```|\|)/, (_, indent: string, marker: string) => `${indent}\\${marker}`)
    .replace(/^(\s*\d+)(\. )/, (_, number: string, dot: string) => `${number}\\${dot}`)

const inlineLine = (content: PMNode[] | undefined) => escapeBlockStart(renderInline(toInline(content)))

function renderList(list: PMNode, depth: number): string[] {
  const start = Number(list.attrs?.start ?? 1)
  return (list.content ?? []).flatMap((item, index) => renderItem(item, list.type as ListType, start + index, depth))
}

function renderItem(item: PMNode, list: ListType, number: number, depth: number): string[] {
  const marker = list === 'orderedList' ? `${number}. ` : list === 'taskList' ? (item.attrs?.checked ? '- [x] ' : '- [ ] ') : '- '
  const children = item.content ?? []
  const head = children[0]?.type === 'paragraph' ? children[0] : undefined
  const indent = '  '.repeat(depth)
  return [
    // After a marker the rest of the line is always inline, so nothing in it
    // can be mistaken for a block.
    indent + marker + (head ? renderInline(toInline(head.content)) : ''),
    ...children
      .slice(head ? 1 : 0)
      .flatMap((child) => (LIST_TYPES.includes(child.type) ? renderList(child, depth + 1) : renderBlock(child).map((l) => `${indent}  ${l}`))),
  ]
}

const cellText = (cell: PMNode): string =>
  (cell.content ?? []).map((b) => (b.type === 'paragraph' ? inlineText(toInline(b.content)) : renderBlock(b).join(' '))).join(' / ')

function renderBlock(node: PMNode): string[] {
  if (node.type === 'paragraph') return [inlineLine(node.content)]
  if (node.type === 'heading') return [`${'#'.repeat(Number(node.attrs?.level ?? 1))} ${renderInline(toInline(node.content))}`]
  if (node.type === 'codeBlock') {
    const code = (node.content ?? []).map((t) => t.text ?? '').join('')
    return ['```' + String(node.attrs?.language ?? ''), ...code.split('\n'), '```']
  }
  if (LIST_TYPES.includes(node.type)) return renderList(node, 0)
  if (node.type === 'table') {
    return (node.content ?? []).map((row) => `| ${(row.content ?? []).map(cellText).join(' | ')} |`)
  }
  return [`[${node.type}]`]
}

// ---- lines to document

const textNodes = (source: string, mode: ProseMode): PMNode[] =>
  parseInline(source, { links: mode === 'FlatPageV2' }).map((token): PMNode => {
    const marks = token.marks.length ? { marks: token.marks.map((type) => ({ type })) } : {}
    if (token.kind === 'text') return { type: 'text', ...marks, text: token.text }
    if (token.kind === 'break') return { type: 'hardBreak', ...marks }
    if (token.kind === 'pageLink') return { type: 'pageLink', attrs: { pageId: token.pageId, pageName: token.pageName }, ...marks }
    if (token.kind === 'link') return { type: 'externalLink', attrs: { href: token.href, label: token.label }, ...marks }
    return { type: 'image', attrs: { src: token.src, alt: token.alt, title: token.title }, ...marks }
  })

const paragraph = (source: string, mode: ProseMode): PMNode => {
  const content = textNodes(source, mode)
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

type ListLine = { indent: number; list: ListType; checked: boolean; number: number; text: string }

function readListLine(line: string, mode: ProseMode): ListLine | null {
  const match = line.match(/^(\s*)(?:- \[([ xX])\](?: |$)|(- )|(\d+)\. )(.*)$/)
  // Tabs count as one level, like two spaces.
  const indent = (s: string) => s.replace(/\t/g, '  ').length
  if (mode === 'TaskList') {
    // Every line is a task. A bare line or a bullet is an unchecked one, which
    // is what pasting a plain list into the app does (taskList.js:27-85).
    if (!match || match[4] !== undefined) {
      const bare = line.match(/^(\s*)(.*)$/)!
      return { indent: indent(bare[1]!), list: 'taskList', checked: false, number: 1, text: bare[2]! }
    }
    return { indent: indent(match[1]!), list: 'taskList', checked: /x/i.test(match[2] ?? ''), number: 1, text: match[5]! }
  }
  if (!match) return null
  const list: ListType = match[2] !== undefined ? 'taskList' : match[3] !== undefined ? 'bulletList' : 'orderedList'
  return { indent: indent(match[1]!), list, checked: /x/i.test(match[2] ?? ''), number: Number(match[4] ?? 1), text: match[5]! }
}

const listNode = (line: ListLine): PMNode =>
  line.list === 'orderedList'
    ? { type: 'orderedList', attrs: { start: line.number, type: null }, content: [] }
    : { type: line.list, content: [] }

/** Consecutive list lines become lists, nested by indentation. */
function parseLists(lines: ListLine[], mode: ProseMode): PMNode[] {
  const top: PMNode[] = []
  const stack: { indent: number; node: PMNode }[] = []
  for (const line of lines) {
    while (stack.length && line.indent < stack[stack.length - 1]!.indent) stack.pop()
    let open = stack[stack.length - 1]
    if (open && line.indent === open.indent && open.node.type !== line.list) {
      stack.pop()
      open = undefined
    }
    if (!open || line.indent > open.indent) {
      const node = listNode(line)
      const parent = stack[stack.length - 1]?.node.content
      const under = parent?.[parent.length - 1]
      if (under) under.content!.push(node)
      else top.push(node)
      stack.push({ indent: line.indent, node })
      open = stack[stack.length - 1]
    }
    const item: PMNode =
      line.list === 'taskList'
        ? { type: 'taskItem', attrs: { checked: line.checked }, content: [paragraph(line.text, mode)] }
        : { type: 'listItem', content: [paragraph(line.text, mode)] }
    open!.node.content!.push(item)
  }
  return top
}

function parseBlocks(lines: string[], mode: ProseMode): PMNode[] {
  const blocks: PMNode[] = []
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]!
    if (mode === 'TaskList') {
      // Blank lines separate nothing here: the document is one list.
      const run: ListLine[] = []
      for (; i < lines.length; i++) if (lines[i]!.trim()) run.push(readListLine(lines[i]!, mode)!)
      blocks.push(...parseLists(run, mode))
      continue
    }
    const fence = line.match(/^```(.*)$/)
    if (fence) {
      const close = lines.indexOf('```', i + 1)
      if (close < 0) throw new CodecError(`The code block opened with ${line} is never closed. End it with a line holding only \`\`\``)
      const code = lines.slice(i + 1, close).join('\n')
      blocks.push({ type: 'codeBlock', attrs: { language: fence[1]!.trim() || null }, ...(code ? { content: [{ type: 'text', text: code }] } : {}) })
      i = close + 1
      continue
    }
    const heading = line.match(/^(#{1,6}) (.*)$/)
    if (heading) {
      const content = textNodes(heading[2]!, mode)
      blocks.push({ type: 'heading', attrs: { level: heading[1]!.length }, ...(content.length ? { content } : {}) })
      i++
      continue
    }
    if (line.startsWith('|')) {
      throw new CodecError('Tables cannot be written through this tool. Make the table in the app. To start a line with | as text, write \\|')
    }
    if (readListLine(line, mode)) {
      const run: ListLine[] = []
      for (let next; i < lines.length && (next = readListLine(lines[i]!, mode)); i++) run.push(next)
      blocks.push(...parseLists(run, mode))
      continue
    }
    blocks.push(paragraph(line, mode))
    i++
  }
  return blocks
}

// ---- units

/** Fills in what the editor's toJSON always writes, so a document saved before
 *  an attribute existed still compares equal to what parsing produces. */
function normalise(node: PMNode): PMNode {
  const defaults: Record<string, Record<string, unknown>> = {
    heading: { level: 1 },
    codeBlock: { language: null },
    orderedList: { start: 1, type: null },
    taskItem: { checked: false },
    image: { src: null, alt: null, title: null },
    pageLink: { pageId: null, pageName: '' },
    externalLink: { href: null, label: '' },
  }
  const attrs = defaults[node.type] || node.attrs ? { ...defaults[node.type], ...node.attrs } : undefined
  const marks = node.marks?.length ? [...node.marks].sort((a, b) => MARKS.indexOf(a.type as Mark) - MARKS.indexOf(b.type as Mark)) : undefined
  const content = node.content?.length ? node.content.map(normalise) : undefined
  return JSON.parse(JSON.stringify({ type: node.type, attrs, content, marks, text: node.text })) as PMNode
}

function splitBlocks(blocks: PMNode[], originOf: (listIndex: number) => number | null): ProseData[] {
  let lists = 0
  return blocks.flatMap((block): ProseData[] => {
    if (!LIST_TYPES.includes(block.type)) return [{ block }]
    const origin = originOf(lists++)
    return (block.content ?? []).map((item, index) => ({
      item,
      list: block.type as ListType,
      listAttrs: block.attrs,
      // Numbering belongs to the list, not the item. This is only the number
      // the item shows, and the start of a list it would begin.
      number: Number(block.attrs?.start ?? 1) + index,
      origin,
    }))
  })
}

/** The unit standing alone, which is how it is rendered and checked. */
const asBlock = (data: ProseData): PMNode => {
  if ('block' in data) return data.block
  const attrs = data.list === 'orderedList' ? { ...data.listAttrs, start: data.number } : data.listAttrs
  return { type: data.list, ...(attrs ? { attrs } : {}), content: [data.item] }
}

function toUnit(data: ProseData, mode: ProseMode): Unit<ProseData> {
  const block = asBlock(data)
  let lines = renderBlock(block)
  let readOnly: string | undefined
  if (block.type === 'table') readOnly = 'a table'
  else if (lines.some((l) => /[\r\n]/.test(l))) {
    // A line break stored inside a text node, from a paste. One numbered line
    // has to be one line, so it is shown split and left alone.
    lines = lines.flatMap((l) => l.split(/\r?\n|\r/))
    readOnly = 'formatting the line form cannot express'
  } else {
    try {
      const back = parseBlocks(lines, mode)
      if (back.length !== 1 || !isDeepStrictEqual(normalise(back[0]!), normalise(block))) {
        readOnly = 'formatting the line form cannot express'
      }
    } catch {
      readOnly = 'formatting the line form cannot express'
    }
  }
  return { lines, data, ...(readOnly ? { readOnly } : {}), ...('item' in data ? { nestable: true } : {}) }
}

function emptyDocument(mode: ProseMode): PMNode[] {
  return mode === 'TaskList'
    ? [{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] }]
    : [{ type: 'paragraph' }]
}

export function proseCodec(mode: ProseMode): LineCodec<ProseData> {
  return {
    read(content) {
      let doc: PMNode | null = null
      try {
        doc = content ? (JSON.parse(content) as PMNode) : null
      } catch {
        throw new CodecError('The page content is not valid JSON, so the app cannot load this page either')
      }
      if (doc && doc.type !== 'doc') throw new CodecError('The page content is not an editor document')
      const blocks = doc?.content?.length ? doc.content : emptyDocument(mode)
      return splitBlocks(blocks, (listIndex) => listIndex).map((data) => toUnit(data, mode))
    },

    parse(lines) {
      return splitBlocks(parseBlocks(lines, mode), () => null).map((data) => toUnit(data, mode))
    },

    write(units) {
      const blocks: PMNode[] = []
      let open: { node: PMNode; origin: number | null } | null = null
      const begun = new Set<number>()
      for (const { data } of units) {
        if ('block' in data) {
          blocks.push(data.block)
          open = null
          continue
        }
        const joins = open && open.node.type === data.list && (open.origin === null || data.origin === null || open.origin === data.origin)
        if (!joins) {
          // A list read from the page keeps its own start even when its first
          // items were removed. A new list starts at the number written, and
          // so does the second half of a list that a block now splits, or
          // "3." would turn into "1.".
          const continues = data.origin !== null && !begun.has(data.origin)
          if (data.origin !== null) begun.add(data.origin)
          const attrs = continues ? data.listAttrs : asBlock(data).attrs
          const node: PMNode = { type: data.list, ...(attrs ? { attrs } : {}), content: [] }
          blocks.push(node)
          open = { node, origin: data.origin }
        } else if (data.origin === null) {
          // A new item in the middle takes the list with it, so what follows
          // from a different original list joins too rather than splitting.
          open!.origin = null
        }
        open!.node.content!.push(data.item)
      }
      return JSON.stringify({ type: 'doc', content: blocks.length ? blocks : emptyDocument(mode) })
    },
  }
}
