import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from './_load.mjs';

test('parseTime handles unit forms', () => {
  assert.equal(P.parseTime('Dev sprint 2h').minutes, 120);
  assert.equal(P.parseTime('Team standup 1h 30m').minutes, 90);
  assert.equal(P.parseTime('quick 45m').minutes, 45);
  assert.equal(P.parseTime('90m').minutes, 90);
  assert.equal(P.parseTime('1.5h').minutes, 90);
  assert.equal(P.parseTime('review 1 hour 15 mins').minutes, 75);
});

test('parseTime handles H:MM colon form', () => {
  assert.equal(P.parseTime('standup 1:30').minutes, 90);
  assert.equal(P.parseTime('0:45').minutes, 45);
});

test('parseTime returns null when no duration present', () => {
  assert.equal(P.parseTime('Dev sprint'), null);
  assert.equal(P.parseTime('html5 rocks'), null);   // must not match the "5" as time
  assert.equal(P.parseTime('12'), null);            // bare number is not time
});

test('parseTime reports spans covering the tokens', () => {
  const r = P.parseTime('Team standup 1h 30m');
  const covered = r.spans.map(([s, e]) => 'Team standup 1h 30m'.slice(s, e).trim());
  assert.deepEqual(covered, ['1h', '30m']);
});
