import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from './_load.mjs';

test('formatMinutes renders hours and minutes', () => {
  assert.equal(P.formatMinutes(90), '1h 30m');
  assert.equal(P.formatMinutes(120), '2h');
  assert.equal(P.formatMinutes(45), '45m');
  assert.equal(P.formatMinutes(0), '0m');
  assert.equal(P.formatMinutes(240), '4h');
});
