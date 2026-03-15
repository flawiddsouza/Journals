const THEME_KEY = 'theme'
const DEFAULT_THEME = 'golden'

export function getTheme() {
    return localStorage.getItem(THEME_KEY) || DEFAULT_THEME
}

export function setTheme(value) {
    localStorage.setItem(THEME_KEY, value)
    document.documentElement.setAttribute('data-theme', value)
}

export function initTheme() {
    document.documentElement.setAttribute('data-theme', getTheme())
}
