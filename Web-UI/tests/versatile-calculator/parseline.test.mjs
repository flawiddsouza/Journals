import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from './_load.mjs';

test('parseLine classifies by priority', () => {
  assert.equal(P.parseLine('Lunch $12.50').type, 'money');
  assert.equal(P.parseLine('Team standup 1h 30m').type, 'time');
  assert.equal(P.parseLine('3*8 + 2').type, 'number');
  assert.equal(P.parseLine('Reps 12').type, 'number');
  assert.equal(P.parseLine('## Monday').type, 'text');
  assert.equal(P.parseLine('').type, 'text');
});

test('parseLine builds label, value, and display', () => {
  const t = P.parseLine('Team standup 1h 30m');
  assert.equal(t.label, 'Team standup');
  assert.equal(t.value, 90);
  assert.equal(t.display, '1h 30m');

  const m = P.parseLine('Lunch $12.50');
  assert.equal(m.label, 'Lunch');
  assert.equal(m.display, '$12.50');
  assert.equal(m.currency, '$');

  const n = P.parseLine('Reps 12');
  assert.equal(n.label, 'Reps');
  assert.equal(n.display, '12');
});

test('bare 100 is a number, $100 is money', () => {
  assert.equal(P.parseLine('100').type, 'number');
  assert.equal(P.parseLine('$100').type, 'money');
});

test('formatMoney and formatNumber', () => {
  assert.equal(P.formatMoney(12.5, '$'), '$12.50');
  assert.equal(P.formatNumber(15), '15');
  assert.equal(P.formatNumber(3.5), '3.5');
});
