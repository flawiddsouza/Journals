// Centralized viewport / pointer media-query helpers used to gate mobile UI
// behavior. `isTouchPrimary` is cached because pointer capability does not
// change at runtime; `isMobileViewport` is uncached because viewport width
// can change (window resize, rotate). Components that need reactivity to
// resize should subscribe to a MediaQueryList directly.

const MOBILE_QUERY = '(max-width: 768px)'
const TOUCH_QUERY = '(pointer: coarse)'

let touchPrimaryCache = null

export function isTouchPrimary() {
    if (touchPrimaryCache !== null) return touchPrimaryCache
    if (typeof window === 'undefined') return false
    let result
    if (window.matchMedia) {
        try {
            result = window.matchMedia(TOUCH_QUERY).matches
        } catch (_) {
            result = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0
        }
    } else {
        result = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0
    }
    touchPrimaryCache = result
    return result
}

export function isMobileViewport() {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(MOBILE_QUERY).matches
}

export function mobileViewportMql() {
    if (typeof window === 'undefined' || !window.matchMedia) return null
    return window.matchMedia(MOBILE_QUERY)
}
