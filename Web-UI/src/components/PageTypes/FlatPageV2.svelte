<script>
export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined
export let style = ''

let pageContent = ''

$: if (pageContentOverride !== undefined) {
    pageContent = pageContentOverride
}

$: fetchPage(pageId)

import fetchPlus from '../../helpers/fetchPlus.js'
let pageContainer

let loaded = false

function fetchPage(pageId) {
    if (pageId) {
        fetchPlus.get(`/pages/content/${pageId}`).then((response) => {
            pageContent = JSON.parse(response.content)
            loaded = true
        })
    }
}

import debounce from '../../helpers/debounce.js'

const savePageContent = debounce(function () {
    fetchPlus
        .put(`/pages/${pageId}`, {
            pageContent: JSON.stringify(pageContent),
        })
        .catch(() => {
            alert('Page Save Failed')
        })
}, 500)

let showInsertFileModal = false
let insertFileModalLinkLabel = ''
let savedCursorPosition = null

import { baseURL } from '../../../config.js'

function saveCursorPosition() {
    savedCursorPosition = window.getSelection().getRangeAt(0)
}

import { format } from 'date-fns'
import { onDestroy } from 'svelte'
import { Editor, Node as TiptapNode, getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Paragraph from '@tiptap/extension-paragraph'
import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'
import PageLinkDropdown from '../PageLinkDropdown.svelte'

const PageLink = TiptapNode.create({
    name: 'pageLink',
    inline: true,
    group: 'inline',
    atom: true,
    addAttributes() {
        return {
            pageId: { default: null },
            pageName: { default: '' },
        }
    },
    renderHTML({ node }) {
        return ['a', {
            'data-page-id': node.attrs.pageId,
            'class': 'page-link',
            'href': `/page/${node.attrs.pageId}`,
            'target': '_blank',
        }, node.attrs.pageName]
    },
    parseHTML() {
        return [{ tag: 'a[data-page-id]', getAttrs: (dom) => ({
            pageId: dom.getAttribute('data-page-id'),
            pageName: dom.textContent,
        }) }]
    },
})

const ExternalLink = TiptapNode.create({
    name: 'externalLink',
    inline: true,
    group: 'inline',
    atom: true,
    selectable: false,
    addAttributes() {
        return {
            href: { default: null },
            label: { default: '' },
        }
    },
    renderHTML({ node }) {
        return ['a', {
            href: node.attrs.href,
            target: '_blank',
            contenteditable: 'false',
        }, node.attrs.label || node.attrs.href]
    },
    parseHTML() {
        return [{ tag: 'a[href]:not([data-page-id])', getAttrs: (dom) => ({
            href: dom.getAttribute('href'),
            label: dom.textContent,
        }) }]
    },
})

const extensions = [
    StarterKit.configure({
        paragraph: false,
        horizontalRule: false,
        blockquote: false,
    }),
    // From: https://github.com/ueberdosis/tiptap/issues/291#issuecomment-867346201
    Paragraph.extend({
        parseHTML() {
            return [{ tag: 'div' }]
        },
        renderHTML({ HTMLAttributes }) {
            return [
                'div',
                mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
                0,
            ]
        },
    }),
    PageLink,
    ExternalLink,
    Image.configure({ inline: true, HTMLAttributes: { style: 'max-width: 100%' } }).extend({ atom: true, selectable: false }),
]

const tiptapSchema = getSchema(extensions)

// [[ page link state
let pageLinkQuery = ''
let pageLinkAnchorRect = null
let pageLinkStartPos = null
let pageLinkDropdown
let lastBracketKeyPos = null

function getCaretRect() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    return sel.getRangeAt(0).getBoundingClientRect()
}

function closePageLinkDropdown() {
    pageLinkQuery = ''
    pageLinkAnchorRect = null
    pageLinkStartPos = null
}

function insertPageLink(page) {
    if (!editor) return
    const currentPos = editor.state.selection.$from.pos
    editor.chain()
        .deleteRange({ from: pageLinkStartPos, to: currentPos })
        .insertContent({
            type: 'pageLink',
            attrs: { pageId: page.id, pageName: page.name }
        })
        .run()
    closePageLinkDropdown()
}

let editor
$: editorDom = editor?.view.dom

function pageContainerMounted(element) {
    pageContainer = element

    editor = new Editor({
        element: element,
        extensions,
        content: pageContent,
        onTransaction() {
            // force re-render so `editor.isActive` works as expected
            editor = editor
        },
        onUpdate() {
            pageContent = editor.getJSON()
            savePageContent()
        },
        editorProps: {
            handleKeyDown(view, event) {
                if (pageLinkAnchorRect) {
                    if (pageLinkDropdown) {
                        const handled = pageLinkDropdown.handleKeydown(event)
                        if (handled) return true
                    }
                    if (event.key === 'Escape') {
                        closePageLinkDropdown()
                        return true
                    }
                    if (event.key === 'Backspace') {
                        if (pageLinkQuery.length > 0) {
                            pageLinkQuery = pageLinkQuery.slice(0, -1)
                        } else {
                            closePageLinkDropdown()
                        }
                        return false
                    }
                    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
                        pageLinkQuery += event.key
                    }
                    return false
                }

                if (event.ctrlKey && event.key.toLowerCase() === 'i') {
                    event.preventDefault()
                    insertFileModalLinkLabel = editor.state.doc.textBetween(
                        editor.state.selection.from,
                        editor.state.selection.to,
                        ''
                    )
                    saveCursorPosition()
                    showInsertFileModal = true
                    return true
                }

                if (event.ctrlKey && event.key.toLowerCase() === 'k') {
                    event.preventDefault()
                    const url = prompt('Enter link')
                    if (url) {
                        const label = editor.state.doc.textBetween(
                            editor.state.selection.from,
                            editor.state.selection.to,
                            ''
                        ) || url
                        if (!editor.state.selection.empty) {
                            editor.chain().deleteSelection().insertContent({
                                type: 'externalLink',
                                attrs: { href: url, label },
                            }).run()
                        } else {
                            editor.commands.insertContent({
                                type: 'externalLink',
                                attrs: { href: url, label },
                            })
                        }
                    }
                    return true
                }

                if (event.key === 'Tab') {
                    event.preventDefault()
                    editor.commands.insertContent('    ')
                    return true
                }

                if ((event.altKey && event.shiftKey || event.metaKey && event.shiftKey) && event.key.toLowerCase() === 'd') {
                    editor.commands.insertContent(format(new Date(), 'DD-MMM-YY'))
                    return true
                }

                if (event.key === 'F11') {
                    event.preventDefault()
                    editor.commands.insertContent(format(new Date(), '(hh:mm A) '))
                    return true
                }

                if (event.key === 'F12') {
                    event.preventDefault()
                    editor.commands.insertContent(format(new Date(), 'DD-MMM-YY hh:mm A: '))
                    return true
                }

                if (event.key === '[' && !event.ctrlKey && !event.metaKey) {
                    if (lastBracketKeyPos !== null) {
                        const startPos = lastBracketKeyPos
                        lastBracketKeyPos = null
                        setTimeout(() => {
                            pageLinkStartPos = startPos
                            pageLinkAnchorRect = getCaretRect()
                            pageLinkQuery = ''
                        }, 0)
                    } else {
                        lastBracketKeyPos = view.state.selection.$from.pos
                    }
                } else {
                    lastBracketKeyPos = null
                }
                return false
            },
            handlePaste(view, event) {
                const items = Array.from(event.clipboardData?.items || [])
                const imageItem = items.find(i => i.type.startsWith('image/'))

                if (imageItem) {
                    event.preventDefault()
                    const blob = imageItem.getAsFile()
                    const data = new FormData()
                    data.append('image', blob)
                    fetchPlus.post(`/upload-image/${pageId}`, data)
                        .then((r) => {
                            editor.commands.insertContent({
                                type: 'image',
                                attrs: { src: `${baseURL}/${r.imageUrl}` },
                            })
                        })
                    return true
                }

                if (event.clipboardData?.types.includes('text/plain')) {
                    const text = event.clipboardData.getData('text/plain')
                    const links = text.match(/(https?:\/\/[^\s]+)/g)
                    if (links?.length > 0) {
                        if (confirm(`Do you want to convert ${links.length} links to clickable links?`)) {
                            event.preventDefault()
                            const paragraphs = text.split('\n').map((line) => {
                                const parts = line.split(/(https?:\/\/[^\s]+)/)
                                const content = parts
                                    .filter((p) => p.length > 0)
                                    .map((part) =>
                                        /^https?:\/\//.test(part)
                                            ? { type: 'externalLink', attrs: { href: part, label: part } }
                                            : { type: 'text', text: part }
                                    )
                                return { type: 'paragraph', content: content.length ? content : [] }
                            })
                            editor.commands.insertContent(paragraphs)
                            return true
                        }
                    }
                }

                return false
            },
            // From: https://github.com/bluesky-social/social-app/pull/6658/files
            clipboardTextParser(text, context) {
                const blocks = text.split(/(?:\r\n?|\n)/)
                const nodes = blocks.map((line) => {
                    return Node.fromJSON(
                        context.doc.type.schema,
                        line.length > 0
                            ? {
                                  type: 'paragraph',
                                  content: [{ type: 'text', text: line }],
                              }
                            : { type: 'paragraph', content: [] },
                    )
                })

                const fragment = Fragment.fromArray(nodes)
                return Slice.maxOpen(fragment)
            },
        },
    })

    editor.commands.focus('end')

    const scrollContainerParent = document.querySelector(
        'main.journal-page > .journal-page-entries .ProseMirror',
    )

    let scrollContainer = scrollContainerParent?.querySelector(
        'div > main.journal-page > .journal-page-entries .ProseMirror',
    )

    if (!scrollContainer) {
        scrollContainer = scrollContainerParent
    }

    scrollContainer.scrollTop = scrollContainer.scrollHeight
}

/*
    getPageContentHTML makes generateHTML output the same html structure as prosemirror

    Example:

    input json:
    [
        {"type":"paragraph","content":[{"type":"text","text":"cat"}]},
        {"type":"paragraph"},
        {"type":"paragraph"},
        {"type":"paragraph","content":[{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"}]},
        {"type":"paragraph"},
        {"type":"paragraph","content":[{"type":"text","text":"cat"}]}
    ]

    promemirror outputs:
    <div>cat</div>
    <div><br class="ProseMirror-trailingBreak"></div>
    <div><br class="ProseMirror-trailingBreak"></div>
    <div><br><br><br><br><br><br><br><br class="ProseMirror-trailingBreak"></div>
    <div><br class="ProseMirror-trailingBreak"></div>
    <div>cat</div>

    generateHTML outputs:
    <div>cat</div>
    <div></div>
    <div></div>
    <div><br><br><br><br><br><br><br></div>
    <div></div>
    <div>cat</div>

    our below modification outputs the same dom structure as prosemirror sans the "ProseMirror-trailingBreak" class:
    <div>cat</div>
    <div><br></div>
    <div><br></div>
    <div><br><br><br><br><br><br><br><br></div>
    <div><br></div>
    <div>cat</div>
*/
function getPageContentHTML() {
    const pageContentCopy = JSON.parse(JSON.stringify(pageContent))

    pageContentCopy.content.forEach((block) => {
        if ('content' in block) {
            const hardBreakIndexes = []

            block.content?.forEach((content, index) => {
                if (content.type === 'hardBreak') {
                    hardBreakIndexes.push(index)
                }
            })

            if (hardBreakIndexes.length > 0) {
                block.content.splice(
                    hardBreakIndexes[hardBreakIndexes.length - 1],
                    0,
                    { type: 'hardBreak' },
                )
            }
        } else {
            if (block.type === 'paragraph') {
                block.content = [{ type: 'hardBreak' }]
            }
        }
    })

    const doc = Node.fromJSON(tiptapSchema, pageContentCopy)
    const container = document.createElement('div')
    DOMSerializer.fromSchema(tiptapSchema).serializeFragment(doc.content, { document }, container)
    const generatedHTML = container.innerHTML

    globalThis.generatedHTML = generatedHTML

    return generatedHTML
}

$: pageContentParsed = pageContent ? getPageContentHTML() : ''

onDestroy(() => {
    if (editor) {
        editor.destroy()
    }
})

import InsertFileModal from '../Modals/InsertFileModal.svelte'
import { DOMSerializer, Fragment, Node, Slice } from '@tiptap/pm/model'
</script>

{#if pageContentOverride === undefined && viewOnly === false}
    {#if loaded === false}
        <div class="page-container" {style}>Loading...</div>
    {:else}
        <div
            class="page-container"
            spellcheck="false"
            {style}
            use:pageContainerMounted
        ></div>
    {/if}
{:else}
    <div class="page-container view-only" {style}>
        {@html pageContentParsed}
    </div>
{/if}

{#if showInsertFileModal}
    <InsertFileModal
        bind:pageId
        bind:savedCursorPosition
        bind:contentEditableDivToFocus={editorDom}
        bind:insertFileModalLinkLabel
        bind:showInsertFileModal
        onInsertImage={(src) => editor.commands.insertContent({ type: 'image', attrs: { src, style: 'max-width: 100%' } })}
        onInsertLink={(href, label) => editor.commands.insertContent({ type: 'externalLink', attrs: { href, label } })}
    ></InsertFileModal>
{/if}

<PageLinkDropdown
    bind:this={pageLinkDropdown}
    query={pageLinkQuery}
    anchorRect={pageLinkAnchorRect}
    on:select={(e) => insertPageLink(e.detail)}
    on:close={closePageLinkDropdown}
/>

<style>
.page-container {
    height: 100%;
}

.page-container.view-only {
    padding-bottom: 5.4em;
}

.page-container > :global(.ProseMirror) {
    height: 100%;
    padding-bottom: 5.4em;
    outline: none;
    overflow: auto;
}

.page-container > :global(.ProseMirror :where(ul, ol)) {
    padding-left: 1rem;
    margin: 0;
}

:global(.page-link) {
    color: #4a6cf7;
    background: rgba(74, 108, 247, 0.08);
    border-radius: 3px;
    padding: 0 2px;
    text-decoration: none;
    cursor: pointer;
}

:global(.page-link:hover) {
    background: rgba(74, 108, 247, 0.16);
}
</style>
