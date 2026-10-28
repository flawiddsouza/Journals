// A table cell holds HTML, so the editor stores ">" as "&gt;", a typed run of
// spaces as "&nbsp;", and a new line as a <br> or a <div>. These read the text
// of a cell, not its markup.

let parser = null

// Elements that start a line of their own.
const BLOCKS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'FOOTER',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL',
])

// The text with a "\n" for each <br> and around each block, so the lines of
// "<div>a</div><div>b</div>" do not run together. A line break the cell stores
// as text stays one, which is how an "Input (Plain Text)" column shows it.
function textOf(html) {
    parser ??= new DOMParser()
    let text = ''
    const lineBreak = () => {
        if (text && !text.endsWith('\n')) text += '\n'
    }
    const walk = (node) => {
        for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                text += child.data
            } else if (child.nodeName === 'BR') {
                text += '\n'
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const block = BLOCKS.has(child.nodeName)
                if (block) lineBreak()
                walk(child)
                if (block) lineBreak()
            }
        }
    }
    walk(parser.parseFromString(html, 'text/html').body)
    return text
}

// The cell's text with its line breaks and spacing, for showing a value or
// comparing two versions of it where a change to only those must still show.
export function cellTextLines(value) {
    if (value === undefined || value === null || value === '') return ''
    return textOf(String(value)).trim()
}

// Filtering reads every row again on each change to the table, so the text of
// a cell is remembered. The cap keeps a long session from holding every value
// it ever saw.
const CACHE_LIMIT = 10000
const cache = new Map()

// The cell's text on one line, with any run of spaces, non-breaking ones and
// line breaks read as one space, so cells that look the same compare equal.
export function cellText(value) {
    const html = String(value ?? '')
    if (!/[<&]/.test(html)) return html.replace(/\s+/g, ' ').trim()
    let text = cache.get(html)
    if (text === undefined) {
        text = textOf(html).replace(/\s+/g, ' ').trim()
        if (cache.size >= CACHE_LIMIT) cache.clear()
        cache.set(html, text)
    }
    return text
}
