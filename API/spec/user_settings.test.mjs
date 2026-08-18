import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

const routes = readFileSync(new URL('../src/routes.cr', import.meta.url), 'utf8')
const authHandler = readFileSync(
    new URL('../src/auth_handler.cr', import.meta.url),
    'utf8',
)

test('account settings store one value per user and key', () => {
    const tableSql = routes.match(
        /CREATE TABLE IF NOT EXISTS user_settings \([\s\S]*?\n      \);/,
    )
    assert.ok(tableSql, 'User settings table migration is missing')
    assert.match(tableSql[0], /PRIMARY KEY\(user_id, setting_key\)/)
    assert.match(
        tableSql[0],
        /FOREIGN KEY\(user_id\) REFERENCES users\(id\) ON DELETE CASCADE/,
    )
    assert.match(routes, /PRAGMA user_version = 18/)

    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)')
    db.exec(tableSql[0])
    db.exec('INSERT INTO users(id) VALUES (1), (2)')

    const save = db.prepare(`
        INSERT INTO user_settings(user_id, setting_key, setting_value)
        VALUES(?, ?, ?)
        ON CONFLICT(user_id, setting_key) DO UPDATE SET
          setting_value = excluded.setting_value,
          updated_at = CURRENT_TIMESTAMP
    `)
    save.run(1, 'excalidraw.library', '{"libraryItems":[{"id":"first"}]}')
    save.run(2, 'excalidraw.library', '{"libraryItems":[{"id":"second"}]}')
    save.run(1, 'editor.preferences', '{"fontSize":16}')
    save.run(1, 'excalidraw.library', '{"libraryItems":[{"id":"updated"}]}')

    const load = db.prepare(
        'SELECT setting_value FROM user_settings WHERE user_id = ? AND setting_key = ?',
    )
    assert.equal(
        load.get(1, 'excalidraw.library').setting_value,
        '{"libraryItems":[{"id":"updated"}]}',
    )
    assert.equal(
        load.get(2, 'excalidraw.library').setting_value,
        '{"libraryItems":[{"id":"second"}]}',
    )
    assert.equal(
        load.get(1, 'editor.preferences').setting_value,
        '{"fontSize":16}',
    )
})

test('user setting routes validate keys and scope every operation', () => {
    assert.match(
        routes,
        /def valid_user_setting_key\?\(setting_key : String\) : Bool/,
    )
    assert.match(routes, /get "\/user-settings\/:setting_key"/)
    assert.match(routes, /put "\/user-settings\/:setting_key"/)
    assert.match(routes, /delete "\/user-settings\/:setting_key"/)
    assert.match(
        routes,
        /SELECT setting_value FROM user_settings WHERE user_id = \? AND setting_key = \?",\s*env\.auth_id,\s*setting_key/,
    )
    assert.match(
        routes,
        /setting_value = env\.params\.json\["settingValue"\]\?[\s\S]*INSERT INTO user_settings\(user_id, setting_key, setting_value\)[\s\S]*env\.auth_id, setting_key, setting_value\.to_json/,
    )
    assert.match(
        routes,
        /DELETE FROM user_settings WHERE user_id = \? AND setting_key = \?", env\.auth_id, setting_key/,
    )
    assert.match(
        authHandler,
        /env\.params\.json\["token"\]\?[\s\S]*rescue JSON::ParseException[\s\S]*nil/,
    )
})
