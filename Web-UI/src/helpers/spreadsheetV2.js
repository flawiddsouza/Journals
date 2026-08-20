export const SPREADSHEET_V2_SCHEMA_VERSION = 1

function disposeUniverListener(listener) {
    if (typeof listener?.dispose === 'function') listener.dispose()
    else listener?.unsubscribe?.()
}

export function installUniverScrollRepaint(
    renderManager,
    workbookId,
    scheduleFrame = globalThis.requestAnimationFrame,
    cancelFrame = globalThis.cancelAnimationFrame,
) {
    const scene = renderManager?.getRenderUnitById?.(workbookId)?.scene
    const viewport = scene?.getMainViewport?.()
    if (!scene || !viewport) return null

    let disposed = false
    let repaintFrame
    const makeDirtyForScrolling = scene.makeDirtyForScrolling
    const makeDirtyForScrollingResolved = () => scene.makeDirty(true)
    scene.makeDirtyForScrolling = makeDirtyForScrollingResolved

    const queueRepaint = () => {
        if (repaintFrame !== undefined) cancelFrame(repaintFrame)
        repaintFrame = scheduleFrame(() => {
            repaintFrame = undefined
            if (disposed) return
            scene.makeDirty(true)
            void scene.requestRender()
        })
    }
    const scrollbarListener = viewport.onScrollByBar$?.subscribeEvent(
        ({ isBarDragEnd }) => {
            if (!isBarDragEnd) return
            queueRepaint()
        },
    )
    return {
        dispose() {
            disposed = true
            disposeUniverListener(scrollbarListener)
            if (repaintFrame !== undefined) cancelFrame(repaintFrame)
            if (scene.makeDirtyForScrolling === makeDirtyForScrollingResolved)
                scene.makeDirtyForScrolling = makeDirtyForScrolling
        },
    }
}

export function parseSpreadsheetV2Content(pageContent) {
    if (
        pageContent === null ||
        pageContent === undefined ||
        pageContent === ''
    ) {
        return null
    }

    const content = JSON.parse(pageContent)

    if (
        !content ||
        Array.isArray(content) ||
        content.schemaVersion !== SPREADSHEET_V2_SCHEMA_VERSION ||
        !content.workbook ||
        typeof content.workbook !== 'object' ||
        Array.isArray(content.workbook)
    ) {
        throw new Error('This page does not contain a Spreadsheet v2 workbook.')
    }

    return content.workbook
}

export function parseSpreadsheetV2ActiveSheetId(pageContent) {
    if (
        pageContent === null ||
        pageContent === undefined ||
        pageContent === ''
    ) {
        return null
    }

    const content = JSON.parse(pageContent)
    return typeof content.activeSheetId === 'string'
        ? content.activeSheetId
        : null
}

export function parseSpreadsheetV2ViewStateBySheetId(pageContent) {
    if (
        pageContent === null ||
        pageContent === undefined ||
        pageContent === ''
    ) {
        return {}
    }

    const content = JSON.parse(pageContent)
    const viewStateBySheetId = content.viewStateBySheetId

    return viewStateBySheetId &&
        typeof viewStateBySheetId === 'object' &&
        !Array.isArray(viewStateBySheetId)
        ? viewStateBySheetId
        : {}
}

export function stringifySpreadsheetV2Content(
    workbook,
    activeSheetId = null,
    viewStateBySheetId = {},
) {
    return JSON.stringify({
        schemaVersion: SPREADSHEET_V2_SCHEMA_VERSION,
        workbook,
        ...(activeSheetId ? { activeSheetId } : {}),
        ...(Object.keys(viewStateBySheetId).length
            ? { viewStateBySheetId }
            : {}),
    })
}
