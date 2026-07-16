import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

const orderPath = new URL('../src/page_history_order.cr', import.meta.url)

test('shared newest-first order resolves equal timestamps by descending ID', () => {
    assert.ok(existsSync(orderPath), 'shared page-history order is missing')

    const source = readFileSync(orderPath, 'utf8')
    const match = source.match(
        /PAGE_HISTORY_ORDER_NEWEST_FIRST\s*=\s*"([^"]+)"/,
    )
    assert.ok(match, 'shared page-history order constant is missing')

    const db = new DatabaseSync(':memory:')
    db.exec(`
        CREATE TABLE page_history (
            id INTEGER PRIMARY KEY,
            content TEXT,
            created_at TIMESTAMP
        );
        INSERT INTO page_history(content, created_at)
        VALUES ('first', '2026-07-16 12:00:00');
        INSERT INTO page_history(content, created_at)
        VALUES ('second', '2026-07-16 12:00:00');
    `)

    const rows = db
        .prepare(`SELECT content FROM page_history ORDER BY ${match[1]}`)
        .all()
    assert.deepEqual(
        rows.map((row) => row.content),
        ['second', 'first'],
    )
})

test('all newest-first page-history queries use the shared order', () => {
    const main = readFileSync(new URL('../src/main.cr', import.meta.url), 'utf8')
    const routes = readFileSync(
        new URL('../src/routes.cr', import.meta.url),
        'utf8',
    )
    const miniAppRoutes = readFileSync(
        new URL('../src/miniapp_routes.cr', import.meta.url),
        'utf8',
    )
    const usage = /ORDER BY #\{PAGE_HISTORY_ORDER_NEWEST_FIRST\}/g

    assert.match(main, /require "\.\/page_history_order"/)
    assert.equal(routes.match(usage)?.length, 2)
    assert.equal(miniAppRoutes.match(usage)?.length, 1)
})
