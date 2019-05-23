export function hide(element) {
    element.style.display = 'none'
}

export function show(element) {
    element.style.display = 'block'
}

export function shown(element) {
    let displayProp = window.getComputedStyle(element, null).getPropertyValue('display')
    return displayProp === 'block' || !displayProp ? true : false
}

export function hidden(element) {
    let displayProp = window.getComputedStyle(element, null).getPropertyValue('display')
    return displayProp === 'none' ? true : false
}
