const pageTypesWithStyles = new Set([
    'FlatPage',
    'FlatPageV2',
    'RichText',
    'Table',
    'TaskList',
    'VersatileCalculator',
])

const pageTypesWithExport = new Set([
    'FlatPage',
    'FlatPageV2',
    'RichText',
    'Table',
    'TaskList',
])

const pageContainerTypes = new Set(['PageGroup', 'Favorites'])

export function getPageCapabilities(type) {
    return {
        pageTools: !pageContainerTypes.has(type),
        styles: pageTypesWithStyles.has(type),
        export: pageTypesWithExport.has(type),
    }
}

export function shouldShowPageNav(page) {
    return page?.locked === false
}
