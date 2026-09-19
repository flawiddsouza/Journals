import vm from 'node:vm'
import type { TableColumn, TableDocument } from './tableDoc'

/**
 * Runs a candidate expression against the real rows and reports both what it
 * produced and what it cost.
 *
 * The cost half matters as much as the output. The browser only ever computes
 * visible cells, and tableComputeEngine.js:59-68 registers a dependency for
 * every property read through the row Proxy. A running total written the
 * obvious way,
 *
 *     return items.slice(0, rowIndex).reduce((a, r) => a + Number(r['Amount']), 0)
 *
 * is correct, returns the right numbers, and registers O(n^2) dependency
 * entries across a full table. Nothing in the app tells you. The same Proxy
 * instrumentation runs here so the agent sees it before saving.
 */

export type ScriptTarget =
  | 'computed'
  | 'total'
  | 'colStyle'
  | 'rowStyle'
  | 'startup'
  | 'customFns'
  | 'statsWidget'

/** Signatures differ per target; taken from Table.svelte:1468-1505 and
 *  TableStats.svelte:39-41. statsWidget notably gets no customFunctions. */
const SIGNATURES: Record<Exclude<ScriptTarget, 'customFns'>, string[]> = {
  computed: ['items', 'rowIndex', 'item', 'columnName'],
  total: ['items', 'rowIndex', 'item', 'columnName'],
  colStyle: ['items', 'rowIndex', 'item', 'columnName'],
  rowStyle: ['items', 'rowIndex', 'item'],
  startup: ['rows'],
  statsWidget: ['items'],
}

const USES_CUSTOM_FUNCTIONS: Record<ScriptTarget, boolean> = {
  computed: true,
  total: true,
  colStyle: true,
  rowStyle: true,
  startup: false,
  customFns: true,
  statsWidget: false,
}

export type EvaluateOptions = {
  rowCap?: number
  timeoutMs?: number
  /** Specific row indices to report individually. */
  rows?: number[]
  /** Evaluate these row indices only. For reading values, where the cost
   *  figures do not matter and the rest of the table is not wanted. */
  onlyRows?: number[]
  sampleSize?: number
}

export type EvaluateResult = {
  target: ScriptTarget
  rowsEvaluated: number
  rowsTotal: number
  truncated: boolean
  compiled: boolean
  /** The script was killed mid-run. No output survives, and set_table_script treats
   *  this as fatal: a runaway expression must not be saved. */
  timedOut: boolean
  threw: number
  errors: { rowIndex: number; message: string }[]
  distinctOutputs?: { value: string; count: number }[]
  sample: { rowIndex: number; output: string }[]
  cost: {
    wallMs: number
    perRowMs: number
    dependencyEntries: number
    projectedFullTable: number
    growsWithRowIndex: boolean
  }
}

/** Runs inside the vm. Kept as source text so the user's code never shares a
 *  scope with anything of ours. */
const HARNESS = `
(function (input) {
  var columns = input.columns
  var items = input.items
  var rowCap = input.rowCap
  // No prototype: a plain object would answer for 'constructor' and
  // 'hasOwnProperty' too, and item.hasOwnProperty() would be run as a column.
  var computedByName = Object.create(null)
  for (var c = 0; c < columns.length; c++) {
    if (columns[c].expression) computedByName[columns[c].name] = columns[c].expression
  }
  // A candidate for a computed column is that column from now on, so another
  // column that reads it sees the new expression and not the saved one.
  if (input.target === 'computed' && input.columnName) computedByName[input.columnName] = input.code

  var depCount = 0
  var depsPerRow = []

  // Mirrors tableComputeEngine.js:59-68: every property read through a row
  // registers idx:prop, which is what makes an O(rowIndex) expression cost
  // O(n^2) across the table.
  function makeItemProxy(idx, seen) {
    return new Proxy(items[idx] || {}, {
      get: function (target, prop) {
        if (typeof prop !== 'string') return target[prop]
        var key = idx + ':' + prop
        if (!seen[key]) { seen[key] = 1; depCount++ }
        if (computedByName[prop] && input.enrich) return computeCell(idx, prop, seen)
        return target[prop]
      },
    })
  }

  function makeItemsProxy(seen) {
    return new Proxy(items, {
      get: function (target, prop) {
        var n = Number(prop)
        if (Number.isInteger(n) && n >= 0 && String(n) === prop) return makeItemProxy(n, seen)
        return target[prop]
      },
    })
  }

  // As getOrCompute in tableComputeEngine.js:46-105: a value is worked out once,
  // and a cell that is read while it is still being worked out, which only a
  // cycle does, reads as null.
  var cellCache = {}
  var evaluating = {}
  function computeCell(idx, name, seen) {
    var key = idx + '|' + name
    if (key in cellCache) return cellCache[key]
    if (evaluating[key]) return null
    evaluating[key] = 1
    try {
      var fn = new Function('items', 'rowIndex', 'item', 'columnName',
        input.customFunctions + '\\n' + computedByName[name])
      cellCache[key] = fn(makeItemsProxy(seen), idx, makeItemProxy(idx, seen), name)
    } catch (e) {
      cellCache[key] = 'error evaluating given expression'
    }
    delete evaluating[key]
    return cellCache[key]
  }

  var outputs = []
  var errors = []
  var limit = Math.min(items.length, rowCap)
  // Targets that run once count as one evaluation, and so does a table with
  // no rows, so "threw on every row" is never true of nothing.
  var evaluated = 1
  var started = Date.now()

  // Constructing the function is where a syntax error surfaces, and a syntax
  // error is the likeliest thing a candidate expression has. Catch it here or
  // it escapes the sandbox and takes the whole tool call with it.
  var prelude = input.usesCustomFunctions ? input.customFunctions + '\\n' : ''
  var fn
  try {
    fn = Function.apply(null, input.params.concat([prelude + input.code]))
  } catch (e) {
    return {
      wallMs: 0,
      outputs: [],
      errors: [{ rowIndex: -1, message: 'does not compile: ' + String(e && e.message || e) }],
      rowsEvaluated: 0,
      depCount: 0,
      depsPerRow: [],
      compiled: false,
    }
  }

  if (input.target === 'customFns') {
    // Constructing it is the compile check. Whether the helpers still satisfy
    // their callers is decided by re-running the dependents, which set_table_script
    // does rather than this call.
    outputs.push({ rowIndex: -1, output: 'helpers compiled' })
    limit = 0
  } else if (input.target === 'startup') {
    var rows = JSON.parse(JSON.stringify(items))
    try {
      fn(rows)
      outputs.push({ rowIndex: -1, output: 'rows after script: ' + rows.length })
    } catch (e) {
      errors.push({ rowIndex: -1, message: String(e && e.message || e) })
    }
    limit = 0
  } else if (input.target === 'total' || input.target === 'statsWidget') {
    var seen = {}
    try {
      var value = input.target === 'statsWidget'
        ? fn(makeItemsProxy(seen))
        : fn(makeItemsProxy(seen), null, null, input.columnName)
      outputs.push({ rowIndex: -1, output: format(value) })
    } catch (e) {
      errors.push({ rowIndex: -1, message: String(e && e.message || e) })
    }
    depsPerRow.push(depCount)
    limit = 0
  } else {
    // Reading a window of rows wants those rows only, not the whole table.
    var only = input.onlyRows && input.onlyRows.filter(function (n) { return n >= 0 && n < limit })
    var count = only ? only.length : limit
    for (var k = 0; k < count; k++) {
      var i = only ? only[k] : k
      var before = depCount
      var rowSeen = {}
      // The cell being evaluated is in progress, like any other the engine
      // works out, so a cycle back to it reads null here as it does in the app.
      var own = input.target === 'computed' ? i + '|' + input.columnName : null
      if (own) evaluating[own] = 1
      try {
        var out = input.target === 'rowStyle'
          ? fn(makeItemsProxy(rowSeen), i, makeItemProxy(i, rowSeen))
          : fn(makeItemsProxy(rowSeen), i, makeItemProxy(i, rowSeen), input.columnName)
        outputs.push({ rowIndex: i, output: format(out) })
      } catch (e) {
        errors.push({ rowIndex: i, message: String(e && e.message || e) })
      }
      if (own) delete evaluating[own]
      depsPerRow.push(depCount - before)
    }
    evaluated = count || 1
  }

  function format(value) {
    if (value === null || value === undefined) return String(value)
    if (typeof value === 'object') { try { return JSON.stringify(value) } catch (e) { return '[object]' } }
    return String(value)
  }

  return {
    wallMs: Date.now() - started,
    outputs: outputs,
    errors: errors,
    rowsEvaluated: evaluated,
    depCount: depCount,
    depsPerRow: depsPerRow,
    compiled: true,
  }
})
`

type HarnessResult = {
  wallMs: number
  outputs: { rowIndex: number; output: string }[]
  errors: { rowIndex: number; message: string }[]
  rowsEvaluated: number
  depCount: number
  depsPerRow: number[]
  compiled: boolean
  timedOut?: boolean
}

const DEFAULT_ROW_CAP = 50_000
const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_SAMPLE = 10
const MAX_ERRORS = 5
const LOW_CARDINALITY = 20

export function evaluateScript(
  doc: TableDocument,
  target: ScriptTarget,
  code: string,
  columnName: string | null,
  options: EvaluateOptions = {},
): EvaluateResult {
  const rowCap = options.rowCap ?? DEFAULT_ROW_CAP
  const params = target === 'customFns' ? ['items'] : SIGNATURES[target]

  const input = {
    target,
    code: target === 'customFns' ? 'return true' : code,
    customFunctions:
      target === 'customFns' ? code : (doc.customFunctions ?? ''),
    usesCustomFunctions: USES_CUSTOM_FUNCTIONS[target],
    params,
    columns: doc.columns as TableColumn[],
    items: doc.items,
    columnName,
    rowCap,
    onlyRows: options.onlyRows ?? null,
    // The app resolves computed columns on every read through the row Proxy
    // (tableComputeEngine.js:64), and stats widgets are handed enriched items
    // too (TableStats.svelte:41). Only the startup script sees raw rows, and
    // customFns is never invoked against rows at all.
    enrich: target !== 'startup' && target !== 'customFns',
  }

  // Compiled and invoked in one runInContext so the timeout covers the user's
  // code actually running, not just its construction. The context holds
  // nothing but the input: no require, no process, no fetch.
  // The input crosses as a string and is parsed inside. An object from this
  // realm would hand the script our Function constructor through
  // items.constructor.constructor, and with it process.env and JWT_SECRET.
  // The sandbox object has no prototype for the same reason: it is the
  // script's `this`.
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const sandbox = Object.assign(Object.create(null), { __input: JSON.stringify(input) })
  // afterEvaluate: what the script queues, a promise callback or the rest of
  // an async function, runs inside runInContext and under its timeout. By
  // default it would run on our own queue afterwards, where nothing stops it.
  const context = vm.createContext(sandbox, { microtaskMode: 'afterEvaluate' })

  let result: HarnessResult
  try {
    const raw = vm.runInContext(`JSON.stringify((${HARNESS})(JSON.parse(__input)))`, context, {
      timeout: timeoutMs,
    }) as string
    // Serialised on the way out: objects built in the sandbox otherwise carry
    // that realm's prototype, which leaks vm internals into tool output.
    result = JSON.parse(raw) as HarnessResult
  } catch (error) {
    // A runaway expression is a finding to report, not a crash. There is no
    // partial result to salvage: the timeout kills the script mid-run.
    const timedOut = (error as { code?: string })?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT'
    result = {
      wallMs: timeoutMs,
      outputs: [],
      errors: [
        {
          rowIndex: -1,
          message: timedOut
            ? `did not finish within ${timeoutMs}ms over ${doc.items.length} rows`
            : String((error as Error)?.message ?? error),
        },
      ],
      rowsEvaluated: 0,
      depCount: 0,
      depsPerRow: [],
      // The harness catches compile errors itself, so anything escaping it got
      // past construction and ran.
      compiled: true,
      timedOut,
    }
  }

  return summarise(target, doc, result, rowCap, options)
}

function summarise(
  target: ScriptTarget,
  doc: TableDocument,
  result: HarnessResult,
  rowCap: number,
  options: EvaluateOptions,
): EvaluateResult {
  const counts = new Map<string, number>()
  for (const { output } of result.outputs) {
    counts.set(output, (counts.get(output) ?? 0) + 1)
  }

  const requested = options.rows?.length
    ? result.outputs.filter((o) => options.rows!.includes(o.rowIndex))
    : []
  const sampleSize = options.sampleSize ?? DEFAULT_SAMPLE
  const sample = requested.length
    ? requested
    : result.outputs.slice(0, sampleSize)

  const perRow = result.depsPerRow
  const head = perRow.slice(0, Math.max(1, Math.floor(perRow.length / 10)))
  const tail = perRow.slice(-Math.max(1, Math.floor(perRow.length / 10)))
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const growsWithRowIndex = perRow.length >= 20 && mean(tail) > mean(head) * 3 + 1

  const rowsTotal = doc.items.length
  const truncated = rowsTotal > rowCap

  return {
    target,
    compiled: result.compiled,
    timedOut: result.timedOut ?? false,
    rowsEvaluated: result.rowsEvaluated,
    rowsTotal,
    truncated,
    threw: result.errors.length,
    errors: result.errors.slice(0, MAX_ERRORS),
    distinctOutputs:
      counts.size > 0 && counts.size <= LOW_CARDINALITY
        ? [...counts.entries()]
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count)
        : undefined,
    sample,
    cost: {
      wallMs: result.wallMs,
      perRowMs: result.rowsEvaluated ? result.wallMs / result.rowsEvaluated : 0,
      dependencyEntries: result.depCount,
      // Only a projection when the cap bit. A cost that grows with rowIndex
      // extrapolates quadratically, everything else linearly.
      projectedFullTable: !truncated
        ? result.depCount
        : growsWithRowIndex
          ? Math.round(result.depCount * (rowsTotal / rowCap) ** 2)
          : Math.round((result.depCount / Math.max(1, result.rowsEvaluated)) * rowsTotal),
      growsWithRowIndex,
    },
  }
}
