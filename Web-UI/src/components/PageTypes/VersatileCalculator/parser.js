// A number with optional digit grouping, in either of the two groupings we emit: Indian
// (2,41,421 -- a 3-digit tail, then pairs) or Western (241,421). Only fully formed
// groupings count, so `eggs 1,2` still reads as 1 rather than 12, and the trailing
// (?!\d) stops `10,2023` from being read as the group `10,202`. Non-capturing throughout:
// parseMoney relies on its own group numbering.
const NUMBER = String.raw`(?:\d{1,2}(?:,\d{2})+,\d{3}|\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?!\d)`;

// Just the comma-bearing alternatives, for rewriting a grouped operand back to bare
// digits before it reaches evalMath.
const GROUPED_RE = new RegExp(String.raw`(?<![\w.])(?:\d{1,2}(?:,\d{2})+,\d{3}|\d{1,3}(?:,\d{3})+)(?!\d)`, 'g');
function ungroup(text) {
  return text.replace(GROUPED_RE, (m) => m.replace(/,/g, ''));
}

function formatMinutes(min) {
  min = Math.round(min);
  const sign = min < 0 ? '-' : '';
  min = Math.abs(min);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${sign}${h}h ${m}m`;
  if (h) return `${sign}${h}h`;
  return `${sign}${m}m`;
}

function parseTime(text) {
  const spans = [];
  let minutes = 0;
  let found = false;

  // The ',' in the lookbehind matters: without it, `1,000m` starts matching at `000m`
  // and reads as 0 minutes rather than 1000.
  const unit = new RegExp(String.raw`(?<![\w.,])(${NUMBER})\s*(hours?|hrs?|h|minutes?|mins?|m)(?![\w])`, 'gi');
  let mt;
  while ((mt = unit.exec(text)) !== null) {
    const n = parseFloat(mt[1].replace(/,/g, ''));
    const isHour = mt[2][0].toLowerCase() === 'h';
    minutes += isHour ? n * 60 : n;
    spans.push([mt.index, mt.index + mt[0].length]);
    found = true;
  }

  const colon = /(?<![\d:])(\d{1,2}):([0-5]\d)(?![\d:])/g;
  while ((mt = colon.exec(text)) !== null) {
    minutes += parseInt(mt[1], 10) * 60 + parseInt(mt[2], 10);
    spans.push([mt.index, mt.index + mt[0].length]);
    found = true;
  }

  return found ? { minutes, spans } : null;
}

const MONEY_RE = new RegExp(`([$€£₹])\\s*(${NUMBER})|(${NUMBER})\\s*([$€£₹])`, 'g');

function parseMoney(text) {
  const spans = [];
  let amount = 0, currency = null, found = false;
  MONEY_RE.lastIndex = 0;   // shared /g regex: the loop drains it, but don't depend on that
  let m;
  while ((m = MONEY_RE.exec(text)) !== null) {
    const sym = m[1] || m[4];
    const num = parseFloat((m[2] || m[3]).replace(/,/g, ''));
    amount += num;
    if (currency === null) currency = sym;
    spans.push([m.index, m.index + m[0].length]);
    found = true;
  }
  return found ? { amount, currency, spans } : null;
}

function evalMath(src) {
  let i = 0;
  const skip = () => { while (src[i] === ' ') i++; };
  function number() {
    skip();
    const start = i;
    if (src[i] === '+' || src[i] === '-') i++;
    let seen = false;
    while (i < src.length && /[\d.]/.test(src[i])) { i++; seen = true; }
    if (!seen) throw new Error('expected number');
    const v = parseFloat(src.slice(start, i));
    if (Number.isNaN(v)) throw new Error('bad number');
    return v;
  }
  function factor() {
    skip();
    if (src[i] === '(') { i++; const v = expr(); skip(); if (src[i] !== ')') throw new Error('unbalanced'); i++; return v; }
    return number();
  }
  function term() {
    let v = factor();
    for (;;) { skip(); const c = src[i];
      if (c === '*') { i++; v *= factor(); }
      else if (c === '/') { i++; v /= factor(); }
      else break; }
    return v;
  }
  function expr() {
    let v = term();
    for (;;) { skip(); const c = src[i];
      if (c === '+') { i++; v += term(); }
      else if (c === '-') { i++; v -= term(); }
      else break; }
    return v;
  }
  const result = expr();
  skip();
  if (i < src.length) throw new Error('trailing input');
  return result;
}

function parseMath(text) {
  // Rewrite grouped operands (1,000 -> 1000) first. Only well-formed groups are rewritten,
  // so `1,2+3` keeps its comma, fails the character class below, and is not read as 12+3.
  const t = ungroup(text.trim());
  if (t === '' || !/^[\d.+\-*/() ]+$/.test(t)) return null;
  if (!/[+\-*/]/.test(t.replace(/^\s*[+-]/, ''))) return null;   // need an operator (not just a leading unary sign)
  try {
    const value = evalMath(t);
    if (!Number.isFinite(value)) return null;
    return { value, spans: [[0, text.length]] };
  } catch {
    return null;
  }
}

const NUMBER_RE = new RegExp(String.raw`(?<![\w.])[-+]?${NUMBER}(?![\w])`);

function parseNumber(text) {
  const m = NUMBER_RE.exec(text);
  if (!m) return null;
  return { value: parseFloat(m[0].replace(/,/g, '')), spans: [[m.index, m.index + m[0].length]] };
}

function stripSpans(text, spans) {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let out = '', last = 0;
  for (const [s, e] of sorted) { out += text.slice(last, s); last = e; }
  out += text.slice(last);
  return out.replace(/\s+/g, ' ').trim();
}

// Digit grouping follows the locale -- an Indian locale gets lakh/crore grouping
// (2,41,421), everyone else gets thousands (241,421). The separators themselves stay
// ',' and '.' regardless: a locale like de-DE would print 241.421, which parseNumber
// would then read back as a decimal. Badges have to survive being copied into a line.
//
// Both caches below memoize: parseLine runs for every line on every keystroke, and
// Intl.Locale / Intl.NumberFormat are costly to construct.
const groupings = new Map();
function isIndian(tag) {
  try {
    const parsed = new Intl.Locale(tag);
    return (parsed.region || parsed.maximize().region) === 'IN';
  } catch {
    return false;
  }
}

// 'Asia/Calcutta' is the legacy identifier; Chromium still reports it.
const INDIAN_TIME_ZONES = new Set(['Asia/Kolkata', 'Asia/Calcutta']);

// Language alone is not enough to spot an Indian reader: an en-US browser is
// commonplace in India, and it carries no region at all. Fall back to the clock, which
// is the one signal that does place the machine.
let runtimeGrouping;
function resolveRuntimeGrouping() {
  if (runtimeGrouping) return runtimeGrouping;
  // Off the browser (the parser's unit tests) there is no reader to detect, and picking up
  // the host's time zone would make those tests depend on where they run.
  if (typeof window === 'undefined') return (runtimeGrouping = 'en-US');
  const tags = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
  let zone;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    zone = undefined;
  }
  runtimeGrouping = tags.some(isIndian) || INDIAN_TIME_ZONES.has(zone) ? 'en-IN' : 'en-US';
  return runtimeGrouping;
}

function resolveGrouping(locale) {
  // An explicit tag is a caller's decision -- honour it and ignore the environment.
  if (!locale) return resolveRuntimeGrouping();
  let grouping = groupings.get(locale);
  if (grouping === undefined) {
    grouping = isIndian(locale) ? 'en-IN' : 'en-US';
    groupings.set(locale, grouping);
  }
  return grouping;
}

const formatters = new Map();
function formatter(locale, minFraction, maxFraction) {
  const grouping = resolveGrouping(locale);
  const key = `${grouping}|${minFraction}|${maxFraction}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(grouping, { minimumFractionDigits: minFraction, maximumFractionDigits: maxFraction });
    formatters.set(key, f);
  }
  return f;
}

function formatMoney(amount, currency, locale) {
  return currency + formatter(locale, 2, 2).format(amount);
}

function formatNumber(v, locale) {
  // Intl renders -0 as '-0'; the old String(Math.round(...)) rendered it as '0'.
  return formatter(locale, 0, 6).format(Object.is(v, -0) ? 0 : v);
}

function parseLine(raw, locale) {
  if (raw.trim() === '') return { type: 'text', raw, label: '', value: 0, display: '' };
  let r;
  if ((r = parseMoney(raw)))  return { type: 'money',  raw, label: stripSpans(raw, r.spans), value: r.amount,  display: formatMoney(r.amount, r.currency, locale), currency: r.currency };
  if ((r = parseTime(raw)))   return { type: 'time',   raw, label: stripSpans(raw, r.spans), value: r.minutes, display: formatMinutes(r.minutes) };
  if ((r = parseMath(raw)))   return { type: 'number', raw, label: stripSpans(raw, r.spans), value: r.value,   display: formatNumber(r.value, locale) };
  if ((r = parseNumber(raw))) return { type: 'number', raw, label: stripSpans(raw, r.spans), value: r.value,   display: formatNumber(r.value, locale) };
  return { type: 'text', raw, label: raw.trim(), value: 0, display: '' };
}

function computeTotals(lines, locale) {
  let timeMin = 0, hasTime = false;
  let numberSum = 0, hasNumber = false;
  const money = new Map();
  let count = 0;
  for (const raw of lines) {
    const p = parseLine(raw, locale);
    if (p.type === 'text') continue;
    count++;
    if (p.type === 'time') { timeMin += p.value; hasTime = true; }
    else if (p.type === 'number') { numberSum += p.value; hasNumber = true; }
    else if (p.type === 'money') { money.set(p.currency, (money.get(p.currency) || 0) + p.value); }
  }
  const moneyStr = money.size ? [...money].map(([c, a]) => formatMoney(a, c, locale)).join(' ') : null;
  return {
    time: hasTime ? formatMinutes(timeMin) : null,
    money: moneyStr,
    numbers: hasNumber ? formatNumber(numberSum, locale) : null,
    count,
  };
}

export {
  formatMinutes,
  formatMoney,
  formatNumber,
  parseTime,
  parseMoney,
  parseMath,
  parseNumber,
  stripSpans,
  parseLine,
  computeTotals,
};
