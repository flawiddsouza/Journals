/**
 * UndoRedoManager - A generic undo/redo system for managing operation history
 *
 * Supports two kinds of operations:
 * - 'row': Custom operations (e.g., insert/delete rows) managed by this system
 * - 'text': Browser-native text edits tracked for coordination
 */
export class UndoRedoManager {
    constructor() {
        this.historyTimeline = []
        this.redoTimelineEntries = []
        this.suppressRowHistory = false
        this.suppressTextHistory = false
    }

    /**
     * Record a row operation (insert, delete, etc.)
     * @param {Object} operation - The operation to record
     */
    recordRowOperation(operation) {
        if (this.suppressRowHistory) {
            return
        }
        this.historyTimeline.push({ kind: 'row', op: operation })
        this.redoTimelineEntries.length = 0
    }

    /**
     * Record a text operation with before and after values
     * @param {Object} meta - Metadata about the text operation including itemIndex, columnName, oldValue, newValue
     */
    recordTextOperation(meta) {
        if (this.suppressTextHistory) {
            return
        }
        this.historyTimeline.push({ kind: 'text', meta })
        this.redoTimelineEntries.length = 0
    }

    /**
     * Get the last row operation from history (for undo)
     * @returns {Object|null} The operation entry or null
     */
    getLastRowOperationFromHistory() {
        for (let i = this.historyTimeline.length - 1; i >= 0; i--) {
            if (this.historyTimeline[i].kind === 'row') {
                return { entry: this.historyTimeline[i], index: i }
            }
        }
        return null
    }

    /**
     * Get the last row operation from redo stack
     * @returns {Object|null} The operation entry or null
     */
    getLastRowOperationFromRedo() {
        for (let i = this.redoTimelineEntries.length - 1; i >= 0; i--) {
            if (this.redoTimelineEntries[i].kind === 'row') {
                return { entry: this.redoTimelineEntries[i], index: i }
            }
        }
        return null
    }

    /**
     * Get the last text operation from history (for undo)
     * @returns {Object|null} The operation entry or null
     */
    getLastTextOperationFromHistory() {
        for (let i = this.historyTimeline.length - 1; i >= 0; i--) {
            if (this.historyTimeline[i].kind === 'text') {
                return { entry: this.historyTimeline[i], index: i }
            }
        }
        return null
    }

    /**
     * Get the last text operation from redo stack
     * @returns {Object|null} The operation entry or null
     */
    getLastTextOperationFromRedo() {
        for (let i = this.redoTimelineEntries.length - 1; i >= 0; i--) {
            if (this.redoTimelineEntries[i].kind === 'text') {
                return { entry: this.redoTimelineEntries[i], index: i }
            }
        }
        return null
    }

    /**
     * Get the last operation of ANY kind from history (for undo)
     * Respects chronological order - returns the most recently added operation
     * @returns {Object|null} The operation entry with { entry, index, kind } or null
     */
    getLastOperationFromHistory() {
        if (this.historyTimeline.length === 0) {
            return null
        }
        const index = this.historyTimeline.length - 1
        const entry = this.historyTimeline[index]
        return { entry, index, kind: entry.kind }
    }

    /**
     * Get the last operation of ANY kind from redo stack (for redo)
     * Respects chronological order - returns the most recently added operation
     * @returns {Object|null} The operation entry with { entry, index, kind } or null
     */
    getLastOperationFromRedo() {
        if (this.redoTimelineEntries.length === 0) {
            return null
        }
        const index = this.redoTimelineEntries.length - 1
        const entry = this.redoTimelineEntries[index]
        return { entry, index, kind: entry.kind }
    }

    /**
     * Move a single entry from history to redo stack (for undo)
     * @param {number} index - Index of the entry to move
     */
    moveHistoryToRedo(index) {
        const movedEntry = this.historyTimeline.splice(index, 1)[0]
        this.redoTimelineEntries.push(movedEntry)
    }

    /**
     * Move a single entry from redo to history stack (for redo)
     * @param {number} index - Index of the entry to move
     */
    moveRedoToHistory(index) {
        const movedEntry = this.redoTimelineEntries.splice(index, 1)[0]
        this.historyTimeline.push(movedEntry)
    }

    /**
     * Pop an entry from history (for native undo events)
     * @returns {Object|null}
     */
    popHistory() {
        return this.historyTimeline.pop()
    }

    /**
     * Pop an entry from redo (for native redo events)
     * @returns {Object|null}
     */
    popRedo() {
        return this.redoTimelineEntries.pop()
    }

    /**
     * Push an entry to history
     * @param {Object} entry
     */
    pushHistory(entry) {
        this.historyTimeline.push(entry)
    }

    /**
     * Push an entry to redo
     * @param {Object} entry
     */
    pushRedo(entry) {
        this.redoTimelineEntries.push(entry)
    }

    /**
     * Temporarily suppress history recording
     * @param {Function} callback - Function to execute with suppressed history
     */
    async withSuppressedHistory(callback) {
        this.suppressRowHistory = true
        this.suppressTextHistory = true
        try {
            await callback()
        } finally {
            this.suppressRowHistory = false
            // Keep text history suppressed briefly to avoid recording focus changes
            setTimeout(() => {
                this.suppressTextHistory = false
            }, 50)
        }
    }

    /**
     * Temporarily suppress only text history recording
     * @param {Function} callback - Function to execute
     */
    withSuppressedTextHistory(callback) {
        this.suppressTextHistory = true
        try {
            callback()
        } finally {
            queueMicrotask(() => {
                this.suppressTextHistory = false
            })
        }
    }

    /**
     * Reset all history (useful when changing context)
     */
    reset() {
        this.historyTimeline = []
        this.redoTimelineEntries = []
    }

    /**
     * Check if text history is suppressed
     */
    isTextHistorySuppressed() {
        return this.suppressTextHistory
    }

    /**
     * Clear all text history entries for a specific row
     * This is needed when a row is deleted and restored, because the DOM element
     * is recreated and browser native undo no longer works for those entries
     * @param {number} rowIndex - The row index to clear history for
     */
    clearTextHistoryForRow(rowIndex) {
        // Remove from main history
        this.historyTimeline = this.historyTimeline.filter((entry) => {
            if (entry.kind === 'text' && entry.meta.itemIndex === rowIndex) {
                return false
            }
            return true
        })
        // Remove from redo stack
        this.redoTimelineEntries = this.redoTimelineEntries.filter((entry) => {
            if (entry.kind === 'text' && entry.meta.itemIndex === rowIndex) {
                return false
            }
            return true
        })
    }

    /**
     * Perform an undo operation
     * @param {Object} callbacks - Callbacks for applying operations
     * @param {Function} callbacks.applyRowOperation - Function to apply row operation (operation, direction)
     * @param {Function} callbacks.applyTextOperation - Function to apply text operation (entry, direction)
     * @param {Function} callbacks.logOperation - Optional function to log operation details
     * @returns {boolean} True if undo was performed, false if nothing to undo
     */
    undo(callbacks) {
        const result = this.getLastOperationFromHistory()
        if (!result) {
            return false
        }

        this.moveHistoryToRedo(result.index)

        if (result.kind === 'row') {
            if (callbacks.logOperation) {
                callbacks.logOperation('undo-row', {
                    operationType: result.entry.op.type,
                    rowIndex: result.entry.op.index,
                    historySize: this.historyTimeline.length,
                    redoSize: this.redoTimelineEntries.length
                })
            }
            callbacks.applyRowOperation(result.entry.op, 'undo')
        } else if (result.kind === 'text') {
            callbacks.applyTextOperation(result.entry, 'undo')
            if (callbacks.logOperation) {
                // Log AFTER applying to capture correct state
                queueMicrotask(() => {
                    callbacks.logOperation('undo-text', {
                        row: result.entry.meta.itemIndex,
                        column: result.entry.meta.columnName,
                        value: result.entry.meta.oldValue,
                        historySize: this.historyTimeline.length,
                        redoSize: this.redoTimelineEntries.length
                    })
                })
            }
        }

        return true
    }

    /**
     * Perform a redo operation
     * @param {Object} callbacks - Callbacks for applying operations
     * @param {Function} callbacks.applyRowOperation - Function to apply row operation (operation, direction)
     * @param {Function} callbacks.applyTextOperation - Function to apply text operation (entry, direction)
     * @param {Function} callbacks.logOperation - Optional function to log operation details
     * @param {string} shortcut - Optional shortcut name for logging (e.g., 'Ctrl+Y')
     * @returns {boolean} True if redo was performed, false if nothing to redo
     */
    redo(callbacks, shortcut = null) {
        const result = this.getLastOperationFromRedo()
        if (!result) {
            return false
        }

        this.moveRedoToHistory(result.index)

        if (result.kind === 'row') {
            const logData = {
                operationType: result.entry.op.type,
                rowIndex: result.entry.op.index,
                historySize: this.historyTimeline.length,
                redoSize: this.redoTimelineEntries.length
            }
            if (shortcut) {
                logData.shortcut = shortcut
            }
            if (callbacks.logOperation) {
                callbacks.logOperation('redo-row', logData)
            }
            callbacks.applyRowOperation(result.entry.op, 'redo')
        } else if (result.kind === 'text') {
            callbacks.applyTextOperation(result.entry, 'redo')
            if (callbacks.logOperation) {
                // Log AFTER applying to capture correct state
                queueMicrotask(() => {
                    const logData = {
                        row: result.entry.meta.itemIndex,
                        column: result.entry.meta.columnName,
                        value: result.entry.meta.newValue,
                        historySize: this.historyTimeline.length,
                        redoSize: this.redoTimelineEntries.length
                    }
                    if (shortcut) {
                        logData.shortcut = shortcut
                    }
                    callbacks.logOperation('redo-text', logData)
                })
            }
        }

        return true
    }
}

/**
 * Helper function to clone a row object deeply
 * @param {Object} row - The row object to clone
 * @returns {Object} Deep clone of the row
 */
export function cloneRow(row) {
    if (typeof structuredClone === 'function') {
        return structuredClone(row)
    }
    return JSON.parse(JSON.stringify(row))
}
