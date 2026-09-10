import { captureCellSelection, restoreCellSelection } from './tableHistory.js'

// Let the browser edit the DOM, then record its resulting HTML. Only history
// commands are intercepted; typing, rich text, paste and IME remain native.
export function createTableCellEditor({
    history,
    editors,
    editable,
    onChange,
    onHistory,
}) {
    return function tableCellEditor(node, { row, columnName }) {
        let selectionBefore = null
        let composition = null
        const bookmark = () => ({
            row,
            columnName,
            selection: captureCellSelection(node),
        })
        const rememberSelection = () => {
            const selection = captureCellSelection(node)
            if (selection) selectionBefore = selection
        }
        const sync = () => {
            if (
                !composition &&
                node.innerHTML !== String(row[columnName] ?? '')
            ) {
                node.innerHTML = row[columnName] ?? ''
            }
        }
        sync()

        function record(before, beforeFocus, inputType, data) {
            history.recordCell({
                row,
                columnName,
                before,
                after: row[columnName],
                beforeFocus,
                afterFocus: bookmark(),
                inputType,
                data,
            })
        }

        function finishComposition() {
            if (!composition) return
            const { before, beforeFocus } = composition
            composition = null
            if (!editable(row)) return
            row[columnName] = node.innerHTML
            record(before, beforeFocus, 'insertCompositionText')
            rememberSelection()
            onChange({ target: node }, row, columnName)
        }

        function beforeinput(event) {
            if (
                event.inputType === 'historyUndo' ||
                event.inputType === 'historyRedo'
            ) {
                if (event.cancelable) {
                    event.preventDefault()
                    onHistory(event.inputType === 'historyRedo')
                }
                return
            }
            if (!editable(row)) {
                event.preventDefault()
                return
            }
            rememberSelection()
        }

        function input(event) {
            if (
                event.inputType === 'historyUndo' ||
                event.inputType === 'historyRedo'
            ) {
                // Some input methods send non-cancelable history events. Discard
                // their DOM change before applying our recorded transaction.
                sync()
                onHistory(event.inputType === 'historyRedo')
                return
            }
            if (!editable(row)) {
                sync()
                return
            }
            const before = row[columnName]
            row[columnName] = node.innerHTML
            if (!composition) {
                record(
                    before,
                    { row, columnName, selection: selectionBefore },
                    event.inputType,
                    event.data,
                )
            }
            rememberSelection()
            onChange(event, row, columnName)
        }

        function compositionstart() {
            history.breakGroup()
            composition = { before: row[columnName], beforeFocus: bookmark() }
        }

        function keydown(event) {
            rememberSelection()
            if (/^(Arrow|Home|End|Page|Tab|Escape)/.test(event.key))
                history.breakGroup()
        }

        function pointerdown() {
            history.breakGroup()
        }
        function blur() {
            finishComposition()
            history.breakGroup()
        }
        const listeners = {
            beforeinput,
            input,
            compositionstart,
            compositionend: finishComposition,
            keydown,
            pointerdown,
            pointerup: rememberSelection,
            keyup: rememberSelection,
            focus: rememberSelection,
            blur,
        }
        for (const [event, listener] of Object.entries(listeners)) {
            // Capture before existing shortcut handlers mutate the DOM.
            node.addEventListener(event, listener, true)
        }
        if (!editors.has(row)) editors.set(row, new Map())
        editors.get(row).set(columnName, {
            node,
            get composing() {
                return composition !== null
            },
            replaceText(text) {
                const beforeSelection =
                    captureCellSelection(node) ?? selectionBefore
                history.breakGroup()
                node.textContent = text
                node.focus({ preventScroll: true })
                restoreCellSelection(node, null)
                selectionBefore = beforeSelection
                node.dispatchEvent(
                    new InputEvent('input', {
                        inputType: 'insertReplacementText',
                        bubbles: true,
                    }),
                )
            },
        })

        return {
            update: sync,
            destroy() {
                finishComposition()
                for (const [event, listener] of Object.entries(listeners)) {
                    node.removeEventListener(event, listener, true)
                }
                editors.get(row)?.delete(columnName)
                if (editors.get(row)?.size === 0) editors.delete(row)
            },
        }
    }
}
