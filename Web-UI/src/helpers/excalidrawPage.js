export const JOURNALS_FILES_KEY = 'journalsFiles'
const EXCALIDRAW_LIBRARY_SETTING_URL = '/user-settings/excalidraw.library'

export function createExcalidrawLibraryAdapter(fetchClient) {
    return {
        async load() {
            const libraryData = await fetchClient.get(
                EXCALIDRAW_LIBRARY_SETTING_URL,
            )
            return Array.isArray(libraryData?.libraryItems)
                ? libraryData
                : { libraryItems: [] }
        },
        async save(libraryData) {
            if (!Array.isArray(libraryData?.libraryItems)) {
                throw new Error('Invalid Excalidraw library')
            }
            await fetchClient.put(EXCALIDRAW_LIBRARY_SETTING_URL, {
                settingValue: libraryData,
            })
        },
    }
}

export function parseExcalidrawPageContent(pageContent) {
    if (!pageContent) {
        return {
            scene: { elements: [], appState: {} },
            fileNames: {},
        }
    }

    const parsed = JSON.parse(pageContent)
    const fileNamesValue = parsed[JOURNALS_FILES_KEY]
    const fileNames =
        fileNamesValue &&
        typeof fileNamesValue === 'object' &&
        !Array.isArray(fileNamesValue)
            ? fileNamesValue
            : {}

    const scene = { ...parsed }
    delete scene[JOURNALS_FILES_KEY]
    delete scene.files

    return { scene, fileNames }
}

export function getReferencedExcalidrawFileIds(elements) {
    return [
        ...new Set(
            elements
                .filter(
                    (element) =>
                        !element.isDeleted &&
                        element.type === 'image' &&
                        element.fileId,
                )
                .map((element) => element.fileId),
        ),
    ]
}

export function addExcalidrawFileNames(
    serializedScene,
    elements,
    fileNames,
    appState,
) {
    const scene = JSON.parse(serializedScene)
    const fileNamesReferenced = {}

    for (const fileId of getReferencedExcalidrawFileIds(elements)) {
        if (fileNames[fileId]) {
            fileNamesReferenced[fileId] = fileNames[fileId]
        }
    }

    scene[JOURNALS_FILES_KEY] = fileNamesReferenced
    if (appState) {
        scene.appState = {
            ...scene.appState,
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
            zoom: appState.zoom,
        }
    }
    return JSON.stringify(scene)
}

export function getExcalidrawUploadFilename(fileId, mimeType) {
    const extensions = {
        'image/avif': 'avif',
        'image/gif': 'gif',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/svg+xml': 'svg',
        'image/webp': 'webp',
    }

    return `excalidraw-${fileId}.${extensions[mimeType] || 'bin'}`
}
