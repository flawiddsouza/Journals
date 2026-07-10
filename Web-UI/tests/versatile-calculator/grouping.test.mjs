import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from './_load.mjs';

// Badges and totals group their digits the way the reader's locale does: an Indian
// locale gets lakh/crore grouping, everyone else gets thousands. The locale argument
// is only ever passed by these tests -- the component omits it and picks up
// navigator.language -- so pin it here rather than depending on the runner's default.

test('an Indian locale groups by lakh and crore', () => {
  assert.equal(P.formatNumber(241421, 'en-IN'), '2,41,421');
  assert.equal(P.formatNumber(1234567890, 'en-IN'), '1,23,45,67,890');
  assert.equal(P.formatMoney(241421, '₹', 'en-IN'), '₹2,41,421.00');
});

test('any other locale groups by thousand', () => {
  assert.equal(P.formatNumber(241421, 'en-US'), '241,421');
  assert.equal(P.formatNumber(1234567890, 'en-US'), '1,234,567,890');
  assert.equal(P.formatMoney(241421, '$', 'en-US'), '$241,421.00');
});

test('a region-less Indian language still gets Indian grouping', () => {
  assert.equal(P.formatNumber(241421, 'hi'), '2,41,421'); // maximizes to hi-Deva-IN
  assert.equal(P.formatNumber(241421, 'ta-IN'), '2,41,421');
});

// de-DE would natively render 241.421, which parseNumber would then read back as the
// decimal 241.421. Badges must survive being copied into a line, so the separators are
// fixed at ',' and '.' and only the *grouping* follows the locale.
test('locales that separate with a period fall back to comma grouping', () => {
  assert.equal(P.formatNumber(241421, 'de-DE'), '241,421');
  assert.equal(P.formatNumber(1234.56, 'de-DE'), '1,234.56');
});

test('an unrecognisable locale tag does not throw', () => {
  assert.equal(P.formatNumber(241421, 'not a locale'), '241,421');
});

test('grouping does not disturb small numbers or decimals', () => {
  assert.equal(P.formatNumber(15), '15');
  assert.equal(P.formatNumber(3.5), '3.5');
  assert.equal(P.formatNumber(0.1 + 0.2), '0.3'); // still rounded to 6 places
  assert.equal(P.formatNumber(-2500, 'en-IN'), '-2,500');
});

// `0*-1` evaluates to -0, which Intl renders as '-0'. formatNumber normalizes it,
// matching what the old String(Math.round(...)) produced.
test('negative zero displays as zero', () => {
  assert.equal(P.formatNumber(-0), '0');
  assert.equal(P.parseLine('0*-1').display, '0');
});

// Switching formatMoney from toFixed(2) to Intl changed how a float whose shortest
// decimal representation ends in 5 rounds: toFixed(2) looked at the binary value
// (2.67499999...) and gave 2.67. This is display only -- the summed value is untouched --
// and Intl's answer is the one a reader expects.
test('money rounds half away from zero, not by binary representation', () => {
  assert.equal(P.formatMoney(2.675, '$', 'en-US'), '$2.68'); // toFixed(2) said $2.67
  assert.equal(P.formatMoney(1.005, '$', 'en-US'), '$1.01'); // toFixed(2) said $1.00
  assert.equal(P.formatMoney(12.5, '$', 'en-US'), '$12.50'); // unchanged
});

test('parseNumber reads back both groupings', () => {
  assert.equal(P.parseNumber('2,41,421').value, 241421);
  assert.equal(P.parseNumber('241,421').value, 241421);
  assert.equal(P.parseNumber('1,23,45,67,890').value, 1234567890);
  assert.equal(P.parseNumber('budget 1,234.56 total').value, 1234.56);
});

test('parseNumber ignores commas that are not a real grouping', () => {
  assert.equal(P.parseNumber('eggs 1,2').value, 1); // a list, not the number 12
  assert.equal(P.parseNumber('10,00').value, 10); // neither grouping allows a 2-digit tail
});

test('parseMoney reads back both groupings', () => {
  assert.equal(P.parseMoney('rent ₹2,41,421').amount, 241421);
  assert.equal(P.parseMoney('$1,000.50').amount, 1000.5);
  assert.equal(P.parseMoney('₹12,34,567.89').currency, '₹');
});

// The span has to cover the separators too, or they leak into the line's label.
test('a grouped amount is stripped whole from the label', () => {
  const m = P.parseLine('rent ₹2,41,421', 'en-IN');
  assert.equal(m.label, 'rent');
  assert.equal(m.value, 241421);
  assert.equal(m.display, '₹2,41,421.00');
});

// MONEY_RE is a module-level /g regex now; a stale lastIndex would make every other
// call miss the first match.
test('repeated parseMoney calls do not trip over the shared regex', () => {
  for (let i = 0; i < 3; i++) assert.equal(P.parseMoney('a $5 b $3').amount, 8);
});

// The whole point of fixing the separators: whatever a badge prints, a user can paste
// back into a line and get the same value.
test('every badge round-trips through the parser', () => {
  for (const locale of ['en-IN', 'en-US', 'de-DE']) {
    for (const value of [5, 2500, 241421, 1234567890, 1234.56]) {
      const badge = P.formatNumber(value, locale);
      assert.equal(P.parseNumber(badge).value, value, `${badge} (${locale})`);
    }
  }
});

test('totals are grouped too', () => {
  const t = P.computeTotals(['241421', '421412'], 'en-IN');
  assert.equal(t.numbers, '6,62,833');
  assert.equal(P.computeTotals(['241421', '421412'], 'en-US').numbers, '662,833');
});

test('money totals are grouped, per currency', () => {
  const t = P.computeTotals(['rent ₹241421', 'food ₹100000'], 'en-IN');
  assert.equal(t.money, '₹3,41,421.00');
  assert.equal(P.computeTotals(['$1000', '€2000'], 'en-US').money, '$1,000.00 €2,000.00');
});

// parseMath used to reject any line containing a comma, so `1,000 + 500` fell through to
// parseNumber and silently reported 1000 -- the arithmetic was dropped.
test('arithmetic accepts grouped operands', () => {
  assert.equal(P.parseMath('1,000 + 500').value, 1500);
  assert.equal(P.parseMath('1,000+5').value, 1005);
  assert.equal(P.parseMath('12,34,567 * 2').value, 2469134);
  assert.equal(P.parseMath('1,000.5+1').value, 1001.5);
});

// ...but a comma that is not a grouping must not be dissolved into one.
test('arithmetic still refuses commas that are not groupings', () => {
  assert.equal(P.parseMath('1,2+3'), null); // must not evaluate as 12+3
  assert.equal(P.parseMath('1,5*2'), null);
  assert.equal(P.parseLine('ids 1,2,3').type, 'number'); // reads the leading 1, as before
  assert.equal(P.parseLine('ids 1,2,3').value, 1);
});

// The time regex used to start matching inside the group: `1,000m` matched `000m` and
// counted as zero minutes, and `2,500 mins` counted as 500.
test('durations accept grouped operands', () => {
  assert.equal(P.parseTime('1,000m').minutes, 1000);
  assert.equal(P.parseTime('1,000h').minutes, 60000);
  assert.equal(P.parseTime('2,500 mins').minutes, 2500);
  assert.equal(P.parseLine('run 1,000m').display, '16h 40m');
});

// A stray comma must not be mistaken for a group and swallow the digits after it.
test('a comma that is not a grouping leaves the number alone', () => {
  assert.equal(P.parseNumber('10,2023').value, 10); // not the group 10,202
  assert.equal(P.parseNumber('2,41,4215').value, 2); // eight digits: not a valid grouping
});
