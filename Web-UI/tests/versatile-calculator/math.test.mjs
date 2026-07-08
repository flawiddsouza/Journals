import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from './_load.mjs';

test('parseMath evaluates whole-line expressions', () => {
  assert.equal(P.parseMath('3*8 + 2').value, 26);
  assert.equal(P.parseMath('(10-4)/2').value, 3);
  assert.equal(P.parseMath('2 + 2').value, 4);
  assert.equal(P.parseMath('10 / 4').value, 2.5);
});

test('parseMath ignores non-math and operator-less lines', () => {
  assert.equal(P.parseMath('12'), null);            // no operator -> number, not math
  assert.equal(P.parseMath('-5'), null);            // leading sign only -> number
  assert.equal(P.parseMath('reps 3*8'), null);      // has letters -> not a calculator line
  assert.equal(P.parseMath('2h'), null);
});

test('parseMath rejects malformed expressions', () => {
  assert.equal(P.parseMath('2 +'), null);
  assert.equal(P.parseMath('(1+2'), null);
  assert.equal(P.parseMath('5/0') && Number.isFinite(P.parseMath('5/0').value), null); // 5/0 -> Infinity -> null
});

test('parseMath recognizes operands that are parenthesized or dot-terminated', () => {
  assert.equal(P.parseMath('(1)+(2)').value, 3);   // every operand parenthesized
  assert.equal(P.parseMath('5. + 3').value, 8);    // operand ends in a dot
  assert.equal(P.parseMath('12'), null);           // still no operator -> number, not math
  assert.equal(P.parseMath('-5'), null);           // leading sign only -> number
});
