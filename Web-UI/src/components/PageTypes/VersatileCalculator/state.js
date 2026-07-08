// Canonical example note, used only by the e2e test harness as its fresh-start
// fixture. The in-app page type starts empty (see normalizeSections).
export const SEED = [
  'Dev sprint 2h',
  'Team standup 1h 30m',
  'Code cleanup 30m',
  'Team review 1h',
]

// Coerce any parsed value into a valid sections array.
// Every section is guaranteed at least one string line; empty/invalid input
// yields a single blank section (a new page starts empty, not pre-filled).
export function normalizeSections(value) {
  if (!Array.isArray(value) || !value.length) return [{ lines: [''] }]
  return value.map((s) => ({
    lines: s && Array.isArray(s.lines) && s.lines.length ? s.lines.map(String) : [''],
  }))
}
