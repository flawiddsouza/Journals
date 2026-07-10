import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// When a page is created, the client builds an optimistic page object while the
// server independently decides the row's hide_title column -- POST /pages never
// sends the flag. If the two disagree, a new page renders one way and then flips
// after a reload. Nothing in the UI can catch that, so pin the lists to each other.

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

// Pulls the string literals out of e.g. `['DrawIO', 'Spreadsheet'].includes(pageType)`
function embeddedTypesNear(source, anchor) {
    const start = source.indexOf(anchor);
    assert.notEqual(start, -1, `could not find ${JSON.stringify(anchor)} -- did the source move?`);
    const list = source.slice(start).match(/\[([^\]]*)\]/);
    assert.ok(list, `no array literal follows ${JSON.stringify(anchor)}`);
    const types = list[1].match(/["']([^"']+)["']/g) ?? [];
    return types.map((t) => t.slice(1, -1)).sort();
}

const apiRoutes = '../../../API/src/routes.cr';

test('the client and the API agree on which page types default to a hidden title', { skip: !existsSync(fileURLToPath(new URL(apiRoutes, import.meta.url))) && 'API source not present in this checkout' }, () => {
    const client = embeddedTypesNear(read('../../src/components/Modals/AddPageModal.svelte'), 'hide_title:');
    const server = embeddedTypesNear(read(apiRoutes), 'hide_title = [');

    assert.deepEqual(client, server);

    // A content page type (one that keeps its title bar) must be in neither list.
    assert.ok(!client.includes('VersatileCalculator'));
    assert.ok(!client.includes('FlatPage'));
});
