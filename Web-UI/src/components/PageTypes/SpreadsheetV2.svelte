<script>
import { onDestroy, onMount } from 'svelte'
import fetchPlus from '../../helpers/fetchPlus.js'
import {
    installUniverScrollRepaint,
    parseSpreadsheetV2ActiveSheetId,
    parseSpreadsheetV2Content,
    parseSpreadsheetV2ViewStateBySheetId,
    stringifySpreadsheetV2Content,
} from '../../helpers/spreadsheetV2.js'

export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined

let editorContainer
let univer
let univerAPI
let workbook
let commandListener
let viewStateListeners = []
let scrollRepaintListener
let themeObserver
let saveTimer
let saveQueue = Promise.resolve()
let lastQueuedContent = ''
let loadState = 'loading'
let saveState = 'saved'
let loadError = ''
let destroyed = false
let restoringViewState = false
let viewStateBySheetId = {}

const themeMap = {
    golden: 'yellowTheme',
    slate: 'blueTheme',
    forest: 'greenTheme',
    midnight: 'darkBlueTheme',
    rose: 'redTheme',
}

function applyTheme(themes) {
    const themeName =
        document.documentElement.getAttribute('data-theme') || 'golden'
    univerAPI?.setTheme(themes[themeMap[themeName]] || themes.greenTheme)
}

function getSnapshotContent() {
    captureSheetViewState(workbook.getActiveSheet())

    return stringifySpreadsheetV2Content(
        workbook.save(),
        workbook.getActiveSheet()?.getSheetId() || null,
        viewStateBySheetId,
    )
}

function captureSheetViewState(worksheet) {
    if (!worksheet) return

    try {
        const sheetId = worksheet.getSheetId()
        const scroll = worksheet.getScrollState()
        const selection = worksheet.getActiveRange()?.getRange() || null
        const zoom = worksheet.getZoom()

        viewStateBySheetId = {
            ...viewStateBySheetId,
            [sheetId]: {
                scroll: scroll
                    ? {
                          offsetX: scroll.offsetX,
                          offsetY: scroll.offsetY,
                          sheetViewStartColumn: scroll.sheetViewStartColumn,
                          sheetViewStartRow: scroll.sheetViewStartRow,
                      }
                    : null,
                selection: selection
                    ? {
                          startRow: selection.startRow,
                          endRow: selection.endRow,
                          startColumn: selection.startColumn,
                          endColumn: selection.endColumn,
                      }
                    : null,
                zoom,
            },
        }
    } catch {
        // The sheet may be between lifecycle states while switching or closing.
    }
}

function clampIndex(value, maximum) {
    if (!Number.isFinite(value)) return 0
    return Math.min(Math.max(Math.trunc(value), 0), Math.max(maximum - 1, 0))
}

function nextRender() {
    return new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )
}

async function waitForWorksheetRender(worksheet) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        if (worksheet.getVisibleRange()) return true
        await new Promise((resolve) => requestAnimationFrame(resolve))
    }

    return false
}

async function restoreSheetViewState(worksheet) {
    const sheetId = worksheet?.getSheetId()
    const viewState = sheetId ? viewStateBySheetId[sheetId] : null
    if (!worksheet || !viewState) return

    restoringViewState = true

    try {
        const maxRows = worksheet.getMaxRows()
        const maxColumns = worksheet.getMaxColumns()

        await waitForWorksheetRender(worksheet)

        if (Number.isFinite(viewState.zoom)) {
            worksheet.zoom(Math.min(Math.max(viewState.zoom, 0.1), 4))
        }

        if (viewState.selection) {
            const startRow = clampIndex(viewState.selection.startRow, maxRows)
            const endRow = clampIndex(viewState.selection.endRow, maxRows)
            const startColumn = clampIndex(
                viewState.selection.startColumn,
                maxColumns,
            )
            const endColumn = clampIndex(
                viewState.selection.endColumn,
                maxColumns,
            )

            const selectionStartRow = Math.min(startRow, endRow)
            const selectionEndRow = Math.max(startRow, endRow)
            const selectionStartColumn = Math.min(startColumn, endColumn)
            const selectionEndColumn = Math.max(startColumn, endColumn)

            worksheet.setActiveSelection(
                worksheet.getRange(
                    selectionStartRow,
                    selectionStartColumn,
                    selectionEndRow - selectionStartRow + 1,
                    selectionEndColumn - selectionStartColumn + 1,
                ),
            )
        }

        await nextRender()

        if (viewState.scroll) {
            worksheet.scrollToCell(
                clampIndex(viewState.scroll.sheetViewStartRow, maxRows),
                clampIndex(viewState.scroll.sheetViewStartColumn, maxColumns),
                0,
            )
        }
    } finally {
        restoringViewState = false
    }
}

function handleViewStateChange({ worksheet }) {
    if (restoringViewState) return
    captureSheetViewState(worksheet)
    scheduleSave()
}

function queueSave() {
    if (viewOnly || pageContentOverride !== undefined || destroyed) return

    let content
    try {
        content = getSnapshotContent()
    } catch {
        return
    }

    if (content === lastQueuedContent) {
        saveState = 'saved'
        return
    }

    lastQueuedContent = content
    saveState = 'saving'

    saveQueue = saveQueue
        .catch(() => undefined)
        .then(() =>
            fetchPlus.put(`/pages/${pageId}`, {
                pageContent: content,
            }),
        )
        .then(() => {
            if (!destroyed && content === lastQueuedContent) {
                saveState = 'saved'
            }
        })
        .catch(() => {
            if (!destroyed) saveState = 'error'
        })
}

function scheduleSave() {
    if (
        viewOnly ||
        pageContentOverride !== undefined ||
        destroyed ||
        restoringViewState
    )
        return

    saveState = 'saving'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(queueSave, 650)
}

async function loadPageContent() {
    if (pageContentOverride !== undefined) return pageContentOverride
    if (!pageId) return ''

    const response = await fetchPlus.get(`/pages/content/${pageId}`)
    return response.content
}

async function startEditor() {
    try {
        const pageContent = await loadPageContent()
        const workbookData = parseSpreadsheetV2Content(pageContent)
        const activeSheetId = parseSpreadsheetV2ActiveSheetId(pageContent)
        viewStateBySheetId = parseSpreadsheetV2ViewStateBySheetId(pageContent)

        const [presets, sheetsCore, sheetsLocale, themes, engineRender] =
            await Promise.all([
                import('@univerjs/presets'),
                import('@univerjs/preset-sheets-core'),
                import('@univerjs/preset-sheets-core/locales/en-US'),
                import('@univerjs/themes'),
                import('@univerjs/engine-render'),
                import('@univerjs/preset-sheets-core/lib/index.css'),
            ])

        if (destroyed) return

        const { createUniver, LocaleType, mergeLocales } = presets
        const { UniverSheetsCorePreset } = sheetsCore

        ;({ univer, univerAPI } = createUniver({
            locale: LocaleType.EN_US,
            locales: {
                [LocaleType.EN_US]: mergeLocales(sheetsLocale.default),
            },
            theme: themes.greenTheme,
            presets: [
                UniverSheetsCorePreset({
                    container: editorContainer,
                }),
            ],
        }))

        workbook = univerAPI.createWorkbook(
            workbookData || { name: 'Spreadsheet' },
        )

        if (activeSheetId && workbook.getSheetBySheetId(activeSheetId)) {
            workbook.setActiveSheet(activeSheetId)
        }

        await restoreSheetViewState(workbook.getActiveSheet())

        const renderManager = univer
            .__getInjector()
            .get(engineRender.IRenderManagerService)
        scrollRepaintListener = installUniverScrollRepaint(
            renderManager,
            workbook.getId(),
        )

        if (viewOnly || pageContentOverride !== undefined) {
            await workbook.getWorkbookPermission().setReadOnly()
        } else {
            lastQueuedContent = getSnapshotContent()
            commandListener = univerAPI.addEvent(
                univerAPI.Event.CommandExecuted,
                scheduleSave,
            )
            viewStateListeners = [
                univerAPI.addEvent(
                    univerAPI.Event.BeforeActiveSheetChange,
                    ({ oldActiveSheet }) =>
                        captureSheetViewState(oldActiveSheet),
                ),
                univerAPI.addEvent(
                    univerAPI.Event.ActiveSheetChanged,
                    async ({ activeSheet }) => {
                        await restoreSheetViewState(activeSheet)
                        scheduleSave()
                    },
                ),
                univerAPI.addEvent(
                    univerAPI.Event.Scroll,
                    handleViewStateChange,
                ),
                univerAPI.addEvent(
                    univerAPI.Event.SelectionChanged,
                    handleViewStateChange,
                ),
                univerAPI.addEvent(
                    univerAPI.Event.SheetZoomChanged,
                    handleViewStateChange,
                ),
            ]
        }

        applyTheme(themes)
        themeObserver = new MutationObserver(() => applyTheme(themes))
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        })

        loadState = 'ready'
    } catch (error) {
        console.error('Could not open Spreadsheet v2', error)
        loadError = error?.message || 'The spreadsheet could not be opened.'
        loadState = 'error'
    }
}

function retryLoad() {
    commandListener?.dispose()
    viewStateListeners.forEach((listener) => listener.dispose())
    scrollRepaintListener?.dispose()
    themeObserver?.disconnect()
    univer?.dispose()
    editorContainer?.replaceChildren()
    commandListener = undefined
    viewStateListeners = []
    scrollRepaintListener = undefined
    themeObserver = undefined
    univer = undefined
    univerAPI = undefined
    workbook = undefined
    loadState = 'loading'
    loadError = ''
    startEditor()
}

onMount(startEditor)

onDestroy(() => {
    clearTimeout(saveTimer)

    if (workbook && !viewOnly && pageContentOverride === undefined) {
        queueSave()
    }

    destroyed = true
    commandListener?.dispose()
    viewStateListeners.forEach((listener) => listener.dispose())
    scrollRepaintListener?.dispose()
    themeObserver?.disconnect()
    univer?.dispose()
})
</script>

<section
    class="spreadsheet-v2"
    class:is-loading={loadState === 'loading'}
    aria-busy={loadState === 'loading'}
>
    <div class="spreadsheet-v2-editor" bind:this={editorContainer}></div>

    {#if loadState === 'loading'}
        <div class="spreadsheet-v2-state" role="status">
            <span class="grid-mark" aria-hidden="true">
                {#each Array(9) as _}<i></i>{/each}
            </span>
            <strong>Opening spreadsheet</strong>
            <span>Preparing the workbook engine...</span>
        </div>
    {:else if loadState === 'error'}
        <div class="spreadsheet-v2-state spreadsheet-v2-error" role="alert">
            <span class="error-mark" aria-hidden="true">!</span>
            <strong>Spreadsheet unavailable</strong>
            <span>{loadError}</span>
            <button type="button" on:click={retryLoad}>Try again</button>
        </div>
    {:else if !viewOnly && pageContentOverride === undefined}
        <div
            class="save-state"
            class:save-state-error={saveState === 'error'}
            aria-live="polite"
        >
            <i aria-hidden="true"></i>
            {saveState === 'saving'
                ? 'Saving'
                : saveState === 'error'
                  ? 'Save failed'
                  : 'Saved'}
        </div>
    {/if}
</section>

<style>
.spreadsheet-v2 {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 28rem;
    overflow: hidden;
    background: var(--bg-center, #fff);
    isolation: isolate;
}

.spreadsheet-v2-editor {
    width: 100%;
    height: 100%;
}

.spreadsheet-v2.is-loading .spreadsheet-v2-editor {
    visibility: hidden;
}

.spreadsheet-v2-state {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.55rem;
    color: var(--color-section, #18321a);
    background:
        linear-gradient(
            color-mix(in srgb, var(--border-topbar, #d9e2d8) 45%, transparent)
                1px,
            transparent 1px
        ),
        linear-gradient(
            90deg,
            color-mix(in srgb, var(--border-topbar, #d9e2d8) 45%, transparent)
                1px,
            transparent 1px
        ),
        var(--bg-center, #fff);
    background-size: 4rem 2rem;
    font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif;
}

.spreadsheet-v2-state strong {
    margin-top: 0.7rem;
    font-size: 1rem;
    letter-spacing: -0.01em;
}

.spreadsheet-v2-state > span:last-child {
    max-width: 26rem;
    color: var(--color-utility, #617064);
    font-size: 0.78rem;
    text-align: center;
}

.grid-mark {
    display: grid;
    grid-template-columns: repeat(3, 0.72rem);
    gap: 0.18rem;
    padding: 0.65rem;
    border: 1px solid color-mix(in srgb, #16803c 35%, transparent);
    border-radius: 0.55rem;
    background: color-mix(in srgb, #16803c 8%, var(--bg-center, #fff));
    box-shadow: 0 0.8rem 2.4rem color-mix(in srgb, #0e4724 12%, transparent);
}

.grid-mark i {
    width: 0.72rem;
    aspect-ratio: 1;
    border-radius: 0.13rem;
    background: #16803c;
    animation: grid-pulse 1.15s ease-in-out infinite alternate;
}

.grid-mark i:nth-child(2n) {
    animation-delay: 120ms;
}

.grid-mark i:nth-child(3n) {
    animation-delay: 240ms;
}

.spreadsheet-v2-error {
    background: var(--bg-center, #fff);
}

.error-mark {
    display: grid;
    width: 2.4rem;
    aspect-ratio: 1;
    place-items: center;
    border: 1px solid
        color-mix(in srgb, var(--color-danger, #b83010) 40%, transparent);
    border-radius: 50%;
    color: var(--color-danger, #b83010);
    font-weight: 700;
}

.spreadsheet-v2-state button {
    margin-top: 0.65rem;
    border: 1px solid
        color-mix(in srgb, var(--color-pa-btn, #16803c) 55%, transparent);
    border-radius: 0.35rem;
    padding: 0.42rem 0.8rem;
    color: #fff;
    background: var(--color-pa-btn, #16803c);
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
}

.save-state {
    position: absolute;
    top: 0.48rem;
    right: 0.7rem;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid rgba(23, 112, 54, 0.16);
    border-radius: 999px;
    padding: 0.22rem 0.55rem;
    color: #27603a;
    background: rgba(244, 250, 246, 0.9);
    box-shadow: 0 0.2rem 0.75rem rgba(20, 64, 35, 0.06);
    font:
        500 0.68rem/1.2 'IBM Plex Sans',
        'Segoe UI',
        sans-serif;
    pointer-events: none;
    backdrop-filter: blur(8px);
}

.save-state i {
    width: 0.38rem;
    aspect-ratio: 1;
    border-radius: 50%;
    background: #23934d;
}

.save-state-error {
    color: #8c241d;
    border-color: rgba(170, 49, 39, 0.18);
    background: rgba(255, 246, 245, 0.92);
}

.save-state-error i {
    background: #c43f35;
}

@keyframes grid-pulse {
    from {
        opacity: 0.22;
        transform: scale(0.8);
    }
    to {
        opacity: 0.88;
        transform: scale(1);
    }
}

@media (prefers-reduced-motion: reduce) {
    .grid-mark i {
        animation: none;
    }
}
</style>
