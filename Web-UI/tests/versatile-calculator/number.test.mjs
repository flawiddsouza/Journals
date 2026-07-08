import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from './_load.mjs';

test('parseNumber finds the first bare number', () => {
  assert.equal(P.parseNumber('Reps 12').value, 12);
  assert.equal(P.parseNumber('3.5').value, 3.5);
  assert.equal(P.parseNumber('temp -5 today').value, -5);
});

test('parseNumber reports the span of the matched token', () => {
  const r = P.parseNumber('Reps 12');
  assert.deepEqual(r.spans, [[5, 7]]);
});

test('parseNumber returns null when there is no number', () => {
  assert.equal(P.parseNumber('Dev sprint'), null);
  assert.equal(P.parseNumber('html5'), null);     // digit embedded in a word does not count
});

test('parseNumber counts a number followed by sentence punctuation', () => {
  assert.equal(P.parseNumber('Reps 12.').value, 12);   // trailing period is punctuation, not part of a word
  assert.equal(P.parseNumber('5.').value, 5);
  assert.equal(P.parseNumber('3.5').value, 3.5);       // real decimals still parse fully
  assert.equal(P.parseNumber('v2.5'), null);           // digit still embedded in a word -> null
});
