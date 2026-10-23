import { createTableComputeEngine } from './tableComputeEngine.js'

const historyHtml = (value) => value === null || value === undefined ? '' : String(value)

// Match the Table's value rendering, including old plain-text saves that used
// <br>. Calculations must still receive the original stored values.
function tableHistoryCellValue(value, column) {
    const valueResolved = value ?? ''
    return column.type === 'Input (Plain Text)'
        ? String(valueResolved).replace(/\n/g, '<br>')
        : historyHtml(valueResolved)
}

export const tableHistoryHasCalculations = (doc) => Boolean(
    doc.rowStyle || doc.columns.some((column) => column.expression || column.style) || Object.values(doc.totals ?? {}).some(Boolean),
)

// Evaluate only display expressions, on copies. Startup and pull scripts do
// not run while reading history, and no saved rows are rewritten.
export function createTableHistorySnapshot(doc) {
    const items = structuredClone(doc.items)
    const engine = createTableComputeEngine()
    engine.setColumns(doc.columns)
    engine.setItems(items)
    engine.setCustomFunctions(doc.customFunctions)
    const functions = new Map()
    const run = (code, args) => {
        if (!code) return ''
        try {
            const source = `${doc.customFunctions || ''}\n${code}`
            if (!functions.has(source)) {
                functions.set(source, new Function('items', 'rowIndex', 'item', 'columnName', source))
            }
            return historyHtml(functions.get(source)(...args))
        } catch {
            return 'error evaluating given expression'
        }
    }
    const style = (code, index, columnName) => code
        ? run(code, [items, index, engine.getEnrichedItem(index), columnName]) : ''
    const cells = new Map()
    doc.items.forEach((row, index) => {
        const rowStyle = style(doc.rowStyle, index, null)
        cells.set(row, Object.fromEntries(doc.columns.map((column) => [column.name, {
            html: column.type === 'Computed'
                ? historyHtml(engine.getComputedValue(index, column.name))
                : tableHistoryCellValue(row[column.name], column),
            style: `${column.wrap === 'No' ? 'white-space: nowrap' : 'word-break: break-word'}; text-align: ${column.align || 'left'}; ${rowStyle}; ${style(column.style, index, column.name)}`,
        }])))
    })
    const totals = Object.fromEntries(doc.columns.filter((column) => doc.totals?.[column.name]).map((column) =>
        [column.name, run(doc.totals[column.name], [engine.getEnrichedItems(), null, null, column.name])],
    ))
    return { cells, totals }
}
