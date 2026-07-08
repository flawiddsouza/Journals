import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from './_load.mjs';

test('parseMoney handles prefix and suffix symbols', () => {
  assert.equal(P.parseMoney('Lunch $12.50').amount, 12.5);
  assert.equal(P.parseMoney('Lunch $12.50').currency, '$');
  assert.equal(P.parseMoney('coffee 5€').amount, 5);
  assert.equal(P.parseMoney('coffee 5€').currency, '€');
  assert.equal(P.parseMoney('rent ₹100').amount, 100);
});

test('parseMoney sums multiple amounts and strips thousands commas', () => {
  assert.equal(P.parseMoney('$5 + $3').amount, 8);
  assert.equal(P.parseMoney('$1,000.50').amount, 1000.5);
});

test('parseMoney returns null without a currency symbol', () => {
  assert.equal(P.parseMoney('just 100 things'), null);
  assert.equal(P.parseMoney('2h'), null);
});
