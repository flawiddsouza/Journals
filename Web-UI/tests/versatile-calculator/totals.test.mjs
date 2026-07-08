import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from './_load.mjs';

test('computeTotals reproduces the canonical example', () => {
  const t = P.computeTotals([
    'Dev sprint 2h',
    'Team standup 1h 30m',
    'Code cleanup 30m',
    'Team review 1h',
  ]);
  assert.equal(t.time, '5h');
  assert.equal(t.money, null);
  assert.equal(t.numbers, null);
  assert.equal(t.count, 4);
});

test('computeTotals separates types and skips text lines', () => {
  const t = P.computeTotals(['## Monday', 'Lunch $12.50', 'Coffee $5', 'Standup 30m', 'Reps 12', '3*3']);
  assert.equal(t.time, '30m');
  assert.equal(t.money, '$17.50');
  assert.equal(t.numbers, '21');   // 12 + (3*3=9)
  assert.equal(t.count, 5);        // the header line is not counted
});

test('computeTotals on an empty note', () => {
  const t = P.computeTotals(['', '']);
  assert.deepEqual(t, { time: null, money: null, numbers: null, count: 0 });
});
