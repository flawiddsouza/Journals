// Test-only harness: mounts the real Core.svelte with localStorage persistence,
// reproducing the original app's seed + legacy-migration behavior so the moved
// Playwright specs pass unchanged. Not part of the shipped app.
import Core from '../../src/components/PageTypes/VersatileCalculator/Core.svelte'
import { SEED, normalizeSections } from '../../src/components/PageTypes/VersatileCalculator/state.js'

const SECTIONS_KEY = 'versatile-calc-sections'
const LEGACY_KEY = 'versatile-calc'

function load() {
  let raw = null
  const saved = localStorage.getItem(SECTIONS_KEY)
  if (saved !== null) {
    try { raw = JSON.parse(saved) } catch { raw = null }
  }
  if (!Array.isArray(raw) || !raw.length) {
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy !== null) raw = [{ lines: legacy.split('\n') }]
    else raw = [{ lines: SEED.slice() }] // fresh start: seed the canonical example (test fixture only)
  }
  return normalizeSections(raw)
}

const core = new Core({
  target: document.getElementById('app'),
  props: { sections: load() },
})

core.$on('change', (e) => {
  localStorage.setItem(SECTIONS_KEY, JSON.stringify(e.detail))
})
