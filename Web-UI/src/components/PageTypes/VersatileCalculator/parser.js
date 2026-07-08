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

  const unit = /(?<![\w.])(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)(?![\w])/gi;
  let mt;
  while ((mt = unit.exec(text)) !== null) {
    const n = parseFloat(mt[1]);
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

function parseMoney(text) {
  const spans = [];
  let amount = 0, currency = null, found = false;
  const re = /([$€£₹])\s*(\d+(?:,\d{3})*(?:\.\d+)?)|(\d+(?:,\d{3})*(?:\.\d+)?)\s*([$€£₹])/g;
  let m;
  while ((m = re.exec(text)) !== null) {
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
  const t = text.trim();
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

function parseNumber(text) {
  const re = /(?<![\w.])[-+]?\d+(?:\.\d+)?(?![\w])/;
  const m = re.exec(text);
  if (!m) return null;
  return { value: parseFloat(m[0]), spans: [[m.index, m.index + m[0].length]] };
}

function stripSpans(text, spans) {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let out = '', last = 0;
  for (const [s, e] of sorted) { out += text.slice(last, s); last = e; }
  out += text.slice(last);
  return out.replace(/\s+/g, ' ').trim();
}

function formatMoney(amount, currency) {
  return currency + amount.toFixed(2);
}

function formatNumber(v) {
  return String(Math.round(v * 1e6) / 1e6);
}

function parseLine(raw) {
  if (raw.trim() === '') return { type: 'text', raw, label: '', value: 0, display: '' };
  let r;
  if ((r = parseMoney(raw)))  return { type: 'money',  raw, label: stripSpans(raw, r.spans), value: r.amount,  display: formatMoney(r.amount, r.currency), currency: r.currency };
  if ((r = parseTime(raw)))   return { type: 'time',   raw, label: stripSpans(raw, r.spans), value: r.minutes, display: formatMinutes(r.minutes) };
  if ((r = parseMath(raw)))   return { type: 'number', raw, label: stripSpans(raw, r.spans), value: r.value,   display: formatNumber(r.value) };
  if ((r = parseNumber(raw))) return { type: 'number', raw, label: stripSpans(raw, r.spans), value: r.value,   display: formatNumber(r.value) };
  return { type: 'text', raw, label: raw.trim(), value: 0, display: '' };
}

function computeTotals(lines) {
  let timeMin = 0, hasTime = false;
  let numberSum = 0, hasNumber = false;
  const money = new Map();
  let count = 0;
  for (const raw of lines) {
    const p = parseLine(raw);
    if (p.type === 'text') continue;
    count++;
    if (p.type === 'time') { timeMin += p.value; hasTime = true; }
    else if (p.type === 'number') { numberSum += p.value; hasNumber = true; }
    else if (p.type === 'money') { money.set(p.currency, (money.get(p.currency) || 0) + p.value); }
  }
  const moneyStr = money.size ? [...money].map(([c, a]) => formatMoney(a, c)).join(' ') : null;
  return {
    time: hasTime ? formatMinutes(timeMin) : null,
    money: moneyStr,
    numbers: hasNumber ? formatNumber(numberSum) : null,
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
