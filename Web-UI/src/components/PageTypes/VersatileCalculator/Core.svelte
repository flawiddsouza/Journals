<script>
import { tick, createEventDispatcher } from 'svelte'
import { parseLine, computeTotals } from './parser.js'

export let sections = []
export let viewOnly = false
export let style = ''

const dispatch = createEventDispatcher()
let rootEl
let popEl
let confirmOpen = false
let pendingSi = null
let popRight = 0
let popTop = 0

// Fill a contenteditable line without clobbering the caret while the user types.
function line(node, text) {
    node.textContent = text
    return {
        update(newText) {
            if (
                document.activeElement !== node &&
                node.textContent !== newText
            ) {
                node.textContent = newText
            }
        },
    }
}

function emitChange() {
    dispatch('change', sections)
}

function caretOffset(el) {
    const sel = window.getSelection()
    if (!sel.rangeCount) return 0
    const r = sel.getRangeAt(0)
    const pre = r.cloneRange()
    pre.selectNodeContents(el)
    pre.setEnd(r.endContainer, r.endOffset)
    return pre.toString().length
}

async function focusRow(si, idx, off) {
    await tick()
    const secEl = rootEl.querySelector(`.vcalc-section[data-sec="${si}"]`)
    if (!secEl) return
    const row = secEl.querySelector(`.vcalc-row[data-idx="${idx}"]`)
    if (!row) return
    const el = row.querySelector('.vcalc-line')
    el.focus()
    const sel = window.getSelection()
    const range = document.createRange()
    const at = Math.min(off, (el.textContent || '').length)
    if (el.firstChild) range.setStart(el.firstChild, at)
    else range.setStart(el, 0)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
}

function onInput(e, si, idx) {
    sections[si].lines[idx] = e.target.textContent
    sections = sections
    emitChange()
}

function onKeydown(e, si, idx) {
    const lines = sections[si].lines
    const off = caretOffset(e.target)
    const text = e.target.textContent
    if (e.key === 'Enter') {
        e.preventDefault()
        lines.splice(idx, 1, text.slice(0, off), text.slice(off))
        sections = sections
        // Blur now: the keyed each-block reuses this row's DOM node for the same
        // index, and the `line` action's caret-preserving guard would otherwise
        // skip the textContent update because this node is still document.activeElement
        // at the moment Svelte flushes (focusRow's tick() resolves in that same flush,
        // before it moves focus to the new row).
        e.target.blur()
        focusRow(si, idx + 1, 0)
        emitChange()
    } else if (e.key === 'Backspace' && off === 0 && idx > 0) {
        e.preventDefault()
        const prevLen = lines[idx - 1].length
        lines[idx - 1] = lines[idx - 1] + lines[idx]
        lines.splice(idx, 1)
        sections = sections
        e.target.blur()
        focusRow(si, idx - 1, prevLen)
        emitChange()
    } else if (e.key === 'ArrowUp' && idx > 0) {
        e.preventDefault()
        focusRow(si, idx - 1, off)
    } else if (e.key === 'ArrowDown' && idx < lines.length - 1) {
        e.preventDefault()
        focusRow(si, idx + 1, off)
    }
}

function onPaste(e, si, idx) {
    e.preventDefault()
    const lines = sections[si].lines
    const off = caretOffset(e.target)
    const text = e.target.textContent
    const clip = (e.clipboardData || window.clipboardData).getData('text')
    const parts = clip.split(/\r?\n/)
    const head = text.slice(0, off)
    const tail = text.slice(off)
    const merged = [head + parts[0], ...parts.slice(1)]
    merged[merged.length - 1] += tail
    lines.splice(idx, 1, ...merged)
    sections = sections
    e.target.blur()
    focusRow(
        si,
        idx + merged.length - 1,
        merged[merged.length - 1].length - tail.length,
    )
    emitChange()
}

function addSection() {
    sections = [...sections, { lines: [''] }]
    focusRow(sections.length - 1, 0, 0)
    emitChange()
}

function deleteSection(si) {
    sections.splice(si, 1)
    if (!sections.length) sections = [{ lines: [''] }]
    else sections = sections
    emitChange()
    closeConfirm()
}

function requestDelete(e, si) {
    const hasContent = sections[si].lines.some((l) => l.trim() !== '')
    if (!hasContent) {
        deleteSection(si)
        return
    }
    pendingSi = si
    // .vcalc-confirm is absolutely positioned and .vcalc is its containing block, so
    // anchor it in the component's coordinate space, not the document's. Offsetting
    // from the right edge also avoids measuring the popover, which has no width
    // while it is still `hidden`.
    const btn = e.currentTarget.getBoundingClientRect()
    const host = rootEl.getBoundingClientRect()
    popRight = host.right - btn.right
    popTop = btn.bottom - host.top + 6
    confirmOpen = true
}

function confirmDelete() {
    if (pendingSi === null) return
    deleteSection(pendingSi)
}

function closeConfirm() {
    confirmOpen = false
    pendingSi = null
}

function onDocClick(e) {
    if (!confirmOpen) return
    if (popEl && popEl.contains(e.target)) return
    if (e.target.closest && e.target.closest('.vcalc-remove')) return
    closeConfirm()
}

function onDocKeydown(e) {
    if (e.key === 'Escape') closeConfirm()
}
</script>

<svelte:document on:click={onDocClick} on:keydown={onDocKeydown} />

<div bind:this={rootEl} class="vcalc" {style}>
    <div class="vcalc-sections">
        {#each sections as sec, si (si)}
            {@const t = computeTotals(sec.lines)}
            <div class="vcalc-section" data-sec={si}>
                {#if !viewOnly}
                    <button
                        type="button"
                        class="vcalc-remove"
                        title="Remove section"
                        on:click={(e) => requestDelete(e, si)}>×</button
                    >
                {/if}
                <div class="vcalc-editor">
                    {#each sec.lines as text, idx (idx)}
                        {@const p = parseLine(text)}
                        <div class="vcalc-row" data-idx={idx}>
                            <div
                                class="vcalc-line"
                                contenteditable={!viewOnly}
                                spellcheck="false"
                                use:line={text}
                                on:input={(e) => onInput(e, si, idx)}
                                on:keydown={(e) => onKeydown(e, si, idx)}
                                on:paste={(e) => onPaste(e, si, idx)}
                            ></div>
                            <div
                                class="vcalc-badge vcalc-{p.type === 'text'
                                    ? 'empty'
                                    : p.type}"
                            >
                                {p.display}
                            </div>
                        </div>
                    {/each}
                </div>
                <div class="vcalc-totals">
                    {#if t.time}<span class="vcalc-tot vcalc-time"
                            >Time<b>{t.time}</b></span
                        >{/if}
                    {#if t.money}<span class="vcalc-tot vcalc-money"
                            >Money<b>{t.money}</b></span
                        >{/if}
                    {#if t.numbers}<span class="vcalc-tot vcalc-number"
                            >Numbers<b>{t.numbers}</b></span
                        >{/if}
                    <span class="vcalc-tot vcalc-count"
                        >{t.count} line{t.count === 1 ? '' : 's'} counted</span
                    >
                </div>
            </div>
        {/each}
    </div>

    {#if !viewOnly}
        <button class="vcalc-add-section" type="button" on:click={addSection}
            >+ Add section</button
        >
    {/if}

    <div
        bind:this={popEl}
        class="vcalc-confirm"
        hidden={!confirmOpen}
        style="right:{popRight}px; top:{popTop}px;"
    >
        <div class="vcalc-confirm-msg">Delete this section?</div>
        <div class="vcalc-confirm-actions">
            <button
                type="button"
                class="vcalc-confirm-btn vcalc-confirm-cancel"
                on:click={closeConfirm}>Cancel</button
            >
            <button
                type="button"
                class="vcalc-confirm-btn vcalc-confirm-del"
                on:click={confirmDelete}>Delete</button
            >
        </div>
    </div>
</div>

<style>
/* Every class is `vcalc-` prefixed. Svelte's scoping only guards properties we
   declare, so generic names (.badge, .row, .section) would silently inherit any
   same-named rule from the app's global.css. Namespacing removes that coupling.
   These are also classes rather than ids: two instances can be mounted at once
   (the page renders one, the page-history preview another). */
.vcalc {
    position: relative;
    /* A line's value badge is right-aligned, so an unbounded row pushes it far
       from the text it belongs to. Cap the column and let it shrink on narrow screens. */
    max-width: 720px;
}

.vcalc-sections {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-right: 32px;
}

.vcalc-section {
    position: relative;
    border: 1px solid #8883;
    border-radius: 8px;
}

.vcalc-remove {
    position: absolute;
    top: 3px;
    left: 100%;
    margin-left: 6px;
    border: none;
    background: none;
    color: #9996;
    font-size: 17px;
    line-height: 1;
    cursor: pointer;
    padding: 3px 7px;
    border-radius: 5px;
}

.vcalc-remove:hover {
    color: #dc2626;
    background: #8881;
}

.vcalc-editor {
    padding: 2px 0;
}

.vcalc-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 4px 12px;
}

.vcalc-row:not(:last-child) {
    border-bottom: 1px solid #8881;
}

.vcalc-line {
    flex: 1;
    outline: none;
    white-space: pre-wrap;
    word-break: break-word;
    min-height: 1.5em;
}

.vcalc-badge {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    opacity: 0.9;
}

.vcalc-badge.vcalc-empty {
    display: none;
}

.vcalc-badge.vcalc-time {
    color: #2563eb;
}

.vcalc-badge.vcalc-money {
    color: #16a34a;
}

.vcalc-badge.vcalc-number {
    color: #9333ea;
}

.vcalc-totals {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 10px 14px;
    border-top: 1px solid #8882;
}

.vcalc-tot {
    font-variant-numeric: tabular-nums;
}

.vcalc-tot b {
    margin-left: 6px;
}

.vcalc-tot.vcalc-count {
    margin-left: auto;
    opacity: 0.6;
}

.vcalc-add-section {
    margin-top: 16px;
    width: calc(100% - 32px);
    padding: 9px 14px;
    font: inherit;
    color: inherit;
    background: none;
    border: 1px dashed #8884;
    border-radius: 8px;
    cursor: pointer;
}

.vcalc-add-section:hover {
    border-color: #8888;
    background: #8881;
}

.vcalc-confirm {
    position: absolute;
    z-index: 20;
    min-width: 170px;
    padding: 11px 12px;
    background: Canvas;
    color: CanvasText;
    border: 1px solid #8884;
    border-radius: 9px;
    box-shadow: 0 8px 24px #0003;
}

.vcalc-confirm[hidden] {
    display: none;
}

.vcalc-confirm-msg {
    font-size: 13px;
    margin-bottom: 9px;
}

.vcalc-confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}

/* Base and modifier are both single classes, so the modifiers below win on source
   order. A `.vcalc-confirm button` base would out-specify them (class + type beats
   class alone) and silently strip the Delete button's colours. */
.vcalc-confirm-btn {
    font: inherit;
    font-size: 13px;
    padding: 4px 11px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid #8884;
    background: none;
    color: inherit;
}

.vcalc-confirm-cancel:hover {
    background: #8881;
}

.vcalc-confirm-del {
    border-color: #dc2626;
    background: #dc2626;
    color: #fff;
}

.vcalc-confirm-del:hover {
    background: #b91c1c;
    border-color: #b91c1c;
}
</style>
