export function createTableComputeEngine() {
    let _columns = []
    let _computedColumnNames = new Set()
    let _items = []
    let _itemsRef = null
    let _customFunctions = ''

    const fnCache = new Map()
    const colMap = new Map()
    const valueCache = new Map()
    const depMap = new Map()
    const keyDeps = new Map()
    const currentlyEvaluating = new Set()
    const enrichedItemCache = new Map()

    function getCompiledFn(expression) {
        const code = (_customFunctions ? _customFunctions + '\n' : '') + expression
        if (!fnCache.has(code)) {
            fnCache.set(code, new Function('items', 'rowIndex', 'item', 'columnName', code))
        }
        return fnCache.get(code)
    }

    function invalidateAll() {
        valueCache.clear()
        keyDeps.clear()
        depMap.clear()
        enrichedItemCache.clear()
    }

    function invalidateComputed(key, affectedRows) {
        if (!valueCache.has(key) && !keyDeps.has(key)) return
        valueCache.delete(key)
        keyDeps.delete(key)
        const rowIndex = parseInt(key.split(':')[0], 10)
        enrichedItemCache.delete(rowIndex)
        affectedRows?.add(rowIndex)
        const downstream = depMap.get(key)
        if (downstream) {
            for (const downKey of [...downstream]) {
                invalidateComputed(downKey, affectedRows)
            }
        }
    }

    function getOrCompute(rowIndex, colName) {
        const key = `${rowIndex}:${colName}`

        if (valueCache.has(key)) return valueCache.get(key)
        if (currentlyEvaluating.has(key)) return null

        currentlyEvaluating.add(key)
        try {
            const col = colMap.get(colName)
            if (!col || !col.expression) return ''

            const deps = new Set()

            function makeItemProxy(idx) {
                return new Proxy(_items[idx] ?? {}, {
                    get(target, prop) {
                        if (typeof prop !== 'string') return target[prop]
                        deps.add(`${idx}:${prop}`)
                        if (_computedColumnNames.has(prop)) return getOrCompute(idx, prop)
                        return target[prop]
                    },
                })
            }

            const itemsProxy = new Proxy(_items, {
                get(target, prop) {
                    const n = Number(prop)
                    if (Number.isInteger(n) && n >= 0 && String(n) === prop) {
                        return makeItemProxy(n)
                    }
                    return target[prop]
                },
            })

            const value = getCompiledFn(col.expression)(
                itemsProxy, rowIndex, makeItemProxy(rowIndex), colName
            )

            // Clean stale deps from previous evaluation
            const prevDeps = keyDeps.get(key) ?? new Set()
            for (const src of prevDeps) {
                depMap.get(src)?.delete(key)
            }

            // Register new deps
            keyDeps.set(key, deps)
            for (const src of deps) {
                if (!depMap.has(src)) depMap.set(src, new Set())
                depMap.get(src).add(key)
            }

            valueCache.set(key, value)
            return value
        } catch (e) {
            console.error('Computed Column:', e)
            return 'error evaluating given expression'
        } finally {
            currentlyEvaluating.delete(key)
        }
    }

    function getEnrichedItemInternal(rowIndex) {
        if (enrichedItemCache.has(rowIndex)) return enrichedItemCache.get(rowIndex)
        const rawItem = _items[rowIndex] ?? {}
        const computedValues = {}
        for (const col of _columns) {
            if (col.expression) {
                computedValues[col.name] = getOrCompute(rowIndex, col.name)
            }
        }
        const enriched = { ...rawItem, ...computedValues }
        enrichedItemCache.set(rowIndex, enriched)
        return enriched
    }

    return {
        setColumns(columns) {
            _columns = columns
            _computedColumnNames = new Set(
                columns.filter(c => c.expression).map(c => c.name)
            )
            colMap.clear()
            for (const col of columns) colMap.set(col.name, col)
            fnCache.clear()
            invalidateAll()
        },

        setItems(items) {
            if (items !== _itemsRef) {
                _itemsRef = items
                _items = items
                invalidateAll()
            }
        },

        setCustomFunctions(cf) {
            _customFunctions = cf ?? ''
            fnCache.clear()
            invalidateAll()
        },

        onRawCellChanged(rowIndex, colName) {
            const affectedRows = new Set([rowIndex])
            enrichedItemCache.delete(rowIndex)
            const srcKey = `${rowIndex}:${colName}`
            const downstream = depMap.get(srcKey)
            if (downstream) {
                for (const key of [...downstream]) {
                    invalidateComputed(key, affectedRows)
                }
            }
            return affectedRows
        },

        onStructuralChange() {
            invalidateAll()
        },

        getComputedValue(rowIndex, colName) {
            return getOrCompute(rowIndex, colName)
        },

        getEnrichedItem: getEnrichedItemInternal,

        getEnrichedItems() {
            return _items.map((_, rowIndex) => getEnrichedItemInternal(rowIndex))
        },

        invalidateAll,
    }
}
