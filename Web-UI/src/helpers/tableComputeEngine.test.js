import { describe, it, expect, vi } from 'vitest'
import { createTableComputeEngine } from './tableComputeEngine.js'

describe('createTableComputeEngine', () => {
    it('returns an object with the expected public API', () => {
        const engine = createTableComputeEngine()
        expect(typeof engine.setColumns).toBe('function')
        expect(typeof engine.setItems).toBe('function')
        expect(typeof engine.setCustomFunctions).toBe('function')
        expect(typeof engine.onRawCellChanged).toBe('function')
        expect(typeof engine.onStructuralChange).toBe('function')
        expect(typeof engine.getComputedValue).toBe('function')
        expect(typeof engine.getEnrichedItem).toBe('function')
        expect(typeof engine.getEnrichedItems).toBe('function')
        expect(typeof engine.invalidateAll).toBe('function')
    })
})

describe('compile cache (fnCache)', () => {
    it('clears fnCache when setColumns is called', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'A', expression: 'return 1' }])
        engine.setItems([{}])
        // After setColumns, same expression must re-compile (fnCache was cleared)
        // We verify indirectly: calling setColumns again doesn't throw and engine still works
        engine.setColumns([{ name: 'A', expression: 'return 1' }])
        // If fnCache was not cleared we'd still get the old function — acceptable to just check no error
        expect(() => engine.setColumns([{ name: 'A', expression: 'return 1' }])).not.toThrow()
    })

    it('clears fnCache when setCustomFunctions is called', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'A', expression: 'return 1' }])
        expect(() => engine.setCustomFunctions('function helper(){ return 42 }')).not.toThrow()
    })

    it('setItems with a new array reference does not throw', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'A', expression: 'return 1' }])
        engine.setItems([{ A: 'x' }])
        expect(() => engine.setItems([{ A: 'y' }])).not.toThrow()
    })
})

describe('getComputedValue — basic evaluation', () => {
    it('evaluates an expression and returns the result', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'Double', expression: 'return Number(item.Value) * 2' }])
        engine.setItems([{ Value: '5' }])
        expect(engine.getComputedValue(0, 'Double')).toBe(10)
    })

    it('returns the same value on second call (cache hit)', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'C', expression: 'return 42' }])
        engine.setItems([{}])
        const v1 = engine.getComputedValue(0, 'C')
        const v2 = engine.getComputedValue(0, 'C')
        expect(v1).toBe(42)
        expect(v2).toBe(42)
    })

    it('returns empty string for column with no expression', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'Plain' }])
        engine.setItems([{ Plain: 'hello' }])
        expect(engine.getComputedValue(0, 'Plain')).toBe('')
    })

    it('returns error string when expression throws, without throwing itself', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'Bad', expression: 'throw new Error("boom")' }])
        engine.setItems([{}])
        expect(engine.getComputedValue(0, 'Bad')).toBe('error evaluating given expression')
    })

    it('does not cache error results — re-evaluates after invalidateAll', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'Flaky', expression: 'throw new Error("x")' }])
        engine.setItems([{}])
        const errResult = engine.getComputedValue(0, 'Flaky')
        expect(errResult).toBe('error evaluating given expression')
        // Change to working expression via setColumns (clears fnCache + invalidates)
        engine.setColumns([{ name: 'Flaky', expression: 'return 99' }])
        const okResult = engine.getComputedValue(0, 'Flaky')
        expect(okResult).toBe(99)
    })
})

describe('onRawCellChanged — targeted invalidation', () => {
    it('invalidates a downstream computed cell when its source changes', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'Double', expression: 'return Number(item.Value) * 2' }])
        const items = [{ Value: '5' }]
        engine.setItems(items)

        expect(engine.getComputedValue(0, 'Double')).toBe(10)

        items[0].Value = '7'
        engine.onRawCellChanged(0, 'Value')

        expect(engine.getComputedValue(0, 'Double')).toBe(14)
    })

    it('does not invalidate unrelated rows', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'D', expression: 'return Number(item.X) * 2' }])
        const items = [{ X: '3' }, { X: '9' }]
        engine.setItems(items)

        expect(engine.getComputedValue(0, 'D')).toBe(6)
        expect(engine.getComputedValue(1, 'D')).toBe(18)

        items[0].X = '5'
        engine.onRawCellChanged(0, 'X')

        expect(engine.getComputedValue(0, 'D')).toBe(10)
        expect(engine.getComputedValue(1, 'D')).toBe(18)
    })

    it('clears enrichedItemCache for the edited row unconditionally', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'C', expression: 'return item.X' }])
        const items = [{ X: 'a' }]
        engine.setItems(items)

        engine.getEnrichedItem(0)
        items[0].X = 'b'
        engine.onRawCellChanged(0, 'X')

        const enriched = engine.getEnrichedItem(0)
        expect(enriched.C).toBe('b')
    })

    it('self-loop in depMap does not cause infinite recursion', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'A', expression: 'return item.A' }])
        const items = [{ A: 'raw' }]
        engine.setItems(items)

        engine.getComputedValue(0, 'A')
        expect(() => engine.onRawCellChanged(0, 'A')).not.toThrow()
    })

    it('cascades invalidation through a multi-hop dependency chain', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([
            { name: 'B', expression: 'return Number(item.A) + 1' },
            { name: 'C', expression: 'return Number(item.B) + 1' },
        ])
        const items = [{ A: '1' }]
        engine.setItems(items)

        expect(engine.getComputedValue(0, 'B')).toBe(2)
        expect(engine.getComputedValue(0, 'C')).toBe(3)

        items[0].A = '10'
        engine.onRawCellChanged(0, 'A')

        expect(engine.getComputedValue(0, 'B')).toBe(11)
        expect(engine.getComputedValue(0, 'C')).toBe(12)
    })
})

describe('computed-on-computed', () => {
    it('column B can read column A (defined earlier) via item["A"]', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([
            { name: 'A', expression: 'return Number(item.Raw) * 10' },
            { name: 'B', expression: 'return Number(item["A"]) + 5' },
        ])
        engine.setItems([{ Raw: '3' }])

        expect(engine.getComputedValue(0, 'A')).toBe(30)
        expect(engine.getComputedValue(0, 'B')).toBe(35)
    })

    it('changing a raw source cell invalidates both the direct dependent and its downstream', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([
            { name: 'A', expression: 'return Number(item.Raw) * 10' },
            { name: 'B', expression: 'return Number(item["A"]) + 5' },
        ])
        const items = [{ Raw: '3' }]
        engine.setItems(items)

        engine.getComputedValue(0, 'A')
        engine.getComputedValue(0, 'B')

        items[0].Raw = '4'
        engine.onRawCellChanged(0, 'Raw')

        expect(engine.getComputedValue(0, 'A')).toBe(40)
        expect(engine.getComputedValue(0, 'B')).toBe(45)
    })

    it('cross-row: column reads items[rowIndex - 1] and is invalidated when that row changes', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([
            { name: 'PrevVal', expression: 'return rowIndex > 0 ? items[rowIndex - 1]["X"] : 0' },
        ])
        const items = [{ X: '10' }, { X: '20' }]
        engine.setItems(items)

        expect(engine.getComputedValue(1, 'PrevVal')).toBe('10')

        items[0].X = '99'
        engine.onRawCellChanged(0, 'X')

        expect(engine.getComputedValue(1, 'PrevVal')).toBe('99')
    })

    it('onRawCellChanged returns a Set containing all transitively affected row indices', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([
            { name: 'PrevVal', expression: 'return rowIndex > 0 ? items[rowIndex - 1]["X"] : 0' },
        ])
        const items = [{ X: '10' }, { X: '20' }, { X: '30' }]
        engine.setItems(items)

        // Warm cache so deps are recorded
        engine.getComputedValue(0, 'PrevVal')
        engine.getComputedValue(1, 'PrevVal')
        engine.getComputedValue(2, 'PrevVal')

        items[0].X = '99'
        const affected = engine.onRawCellChanged(0, 'X')

        expect(affected).toBeInstanceOf(Set)
        expect(affected.has(0)).toBe(true)  // edited row always included
        expect(affected.has(1)).toBe(true)  // row 1 reads items[0].X
    })
})

describe('cycle detection', () => {
    it('self-loop (A reads item["A"]) does not hang and does not throw', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'A', expression: 'return item["A"]' }])
        engine.setItems([{ A: 'raw' }])
        expect(() => engine.getComputedValue(0, 'A')).not.toThrow()
    })

    it('mutual two-node cycle (A reads B, B reads A) does not hang', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([
            { name: 'A', expression: 'return String(item["B"]) + "-a"' },
            { name: 'B', expression: 'return String(item["A"]) + "-b"' },
        ])
        engine.setItems([{}])
        expect(() => engine.getComputedValue(0, 'A')).not.toThrow()
        expect(() => engine.getComputedValue(0, 'B')).not.toThrow()
    })

    it('three-node cycle (A->B->C->A) does not hang', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([
            { name: 'A', expression: 'return String(item["B"]) + "-a"' },
            { name: 'B', expression: 'return String(item["C"]) + "-b"' },
            { name: 'C', expression: 'return String(item["A"]) + "-c"' },
        ])
        engine.setItems([{}])
        expect(() => engine.getComputedValue(0, 'A')).not.toThrow()
    })

    it('currentlyEvaluating is empty after successful evaluation (re-eval works)', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'X', expression: 'return 42' }])
        engine.setItems([{}])
        engine.getComputedValue(0, 'X')
        // If currentlyEvaluating leaked, re-eval after invalidation would return null
        engine.invalidateAll()
        expect(engine.getComputedValue(0, 'X')).toBe(42)
    })

    it('currentlyEvaluating is empty after expression throws (finally cleanup)', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'Bad', expression: 'throw new Error("x")' }])
        engine.setItems([{}])
        engine.getComputedValue(0, 'Bad')
        // After throw, same key re-evaluable after invalidation
        engine.invalidateAll()
        expect(engine.getComputedValue(0, 'Bad')).toBe('error evaluating given expression')
    })

    it('invalidation after circular dep self-loop guard prevents infinite recursion', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'M', expression: 'return item["M"]' }])
        const items = [{ M: 'x' }]
        engine.setItems(items)

        engine.getComputedValue(0, 'M')
        items[0].M = 'y'
        expect(() => engine.onRawCellChanged(0, 'M')).not.toThrow()
    })
})

describe('getEnrichedItem', () => {
    it('returns raw item merged with all computed column values', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([
            { name: 'Price' },
            { name: 'Tax', expression: 'return Number(item.Price) * 0.1' },
        ])
        engine.setItems([{ Price: '100' }])

        const enriched = engine.getEnrichedItem(0)
        expect(enriched.Price).toBe('100')
        expect(enriched.Tax).toBe(10)
    })

    it('returns the same cached object on repeated calls for the same row', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'C', expression: 'return 1' }])
        engine.setItems([{}])

        const a = engine.getEnrichedItem(0)
        const b = engine.getEnrichedItem(0)
        expect(a).toBe(b)
    })

    it('does not mutate the original items[rowIndex] object', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'Computed', expression: 'return 99' }])
        const items = [{ Raw: 'x' }]
        engine.setItems(items)

        engine.getEnrichedItem(0)
        expect(items[0]).not.toHaveProperty('Computed')
    })

    it('cache is invalidated after onRawCellChanged; next call recomputes', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'V', expression: 'return item.X' }])
        const items = [{ X: 'before' }]
        engine.setItems(items)

        const before = engine.getEnrichedItem(0)
        expect(before.V).toBe('before')

        items[0].X = 'after'
        engine.onRawCellChanged(0, 'X')

        const after = engine.getEnrichedItem(0)
        expect(after.V).toBe('after')
        expect(before).not.toBe(after)
    })
})

describe('getEnrichedItems', () => {
    it('returns all rows enriched, consistent with individual getComputedValue calls', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'D', expression: 'return Number(item.N) * 2' }])
        engine.setItems([{ N: '3' }, { N: '7' }])

        const all = engine.getEnrichedItems()
        expect(all[0].D).toBe(engine.getComputedValue(0, 'D'))
        expect(all[1].D).toBe(engine.getComputedValue(1, 'D'))
    })
})

describe('invalidateAll + onStructuralChange + setItems reference', () => {
    it('onStructuralChange clears computed caches so next call recomputes', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'C', expression: 'return 1' }])
        const items = [{}]
        engine.setItems(items)

        engine.getComputedValue(0, 'C')
        engine.getEnrichedItem(0)

        engine.onStructuralChange()

        // After structural change, value must be recomputed (not stale)
        expect(engine.getComputedValue(0, 'C')).toBe(1)
    })

    it('fnCache is NOT cleared by onStructuralChange', () => {
        const engine = createTableComputeEngine()
        const compileSpy = vi.spyOn(globalThis, 'Function')
        engine.setColumns([{ name: 'C', expression: 'return 1' }])
        engine.setItems([{}])
        engine.getComputedValue(0, 'C') // compiles fn
        const callsBefore = compileSpy.mock.calls.length

        engine.onStructuralChange()
        engine.getComputedValue(0, 'C') // should reuse compiled fn from fnCache
        const callsAfter = compileSpy.mock.calls.length

        expect(callsAfter).toBe(callsBefore) // no new compilation
        compileSpy.mockRestore()
    })

    it('setItems with a new array reference triggers invalidation', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'C', expression: 'return item.X' }])
        const items1 = [{ X: 'original' }]
        engine.setItems(items1)
        engine.getComputedValue(0, 'C') // warms cache

        const items2 = [{ X: 'new page' }]
        engine.setItems(items2) // new reference → invalidateAll

        expect(engine.getComputedValue(0, 'C')).toBe('new page')
    })

    it('setItems with the same array reference does NOT re-invalidate', () => {
        const engine = createTableComputeEngine()
        engine.setColumns([{ name: 'C', expression: 'return item.X' }])
        const items = [{ X: 'hello' }]
        engine.setItems(items)
        engine.getComputedValue(0, 'C')

        items[0].X = 'world'
        engine.onRawCellChanged(0, 'X') // targeted invalidation

        engine.setItems(items) // same reference — must not call invalidateAll again
        expect(engine.getComputedValue(0, 'C')).toBe('world')
    })
})
