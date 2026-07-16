// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { decorateFlatPageHistoryPreview } from './flatPageHistoryPreview.js'

function renderPreview(html_newer, html_older) {
    const root = document.createElement('div')
    root.innerHTML = html_newer
    decorateFlatPageHistoryPreview(root, html_older)
    return root
}

describe('decorateFlatPageHistoryPreview', () => {
    it('decorates the existing newer DOM without replacing its nodes', () => {
        const pageContainer = document.createElement('div')
        pageContainer.innerHTML =
            '<section data-layout="original"><p>Invoice total is 101</p></section><p>Stable</p>'
        const layoutNewer = pageContainer.querySelector('[data-layout]')
        const paragraphNewer = layoutNewer.querySelector('p')

        decorateFlatPageHistoryPreview(
            pageContainer,
            '<section data-layout="original"><p>Invoice total is 100</p></section><p>Stable</p>',
        )

        expect(pageContainer.querySelector('[data-layout]')).toBe(layoutNewer)
        expect(pageContainer.querySelector('[data-layout] > p')).toBe(
            paragraphNewer,
        )
        expect(
            pageContainer.querySelector('.flat-page-history-added-text')
                .textContent,
        ).toBe('101')
        expect(
            pageContainer.querySelector('.flat-page-history-removed-text')
                .textContent,
        ).toBe('100')
    })

    it('keeps every original context node visible and in place', () => {
        const pageContainer = document.createElement('div')
        pageContainer.innerHTML =
            '<p>Before 1</p><p>Before 2</p><p>Before 3</p><p>Before 4</p><p>Before 5</p><p>New value</p><p>After 1</p><p>After 2</p><p>After 3</p><p>After 4</p><p>After 5</p>'
        const nodesNewer = [...pageContainer.childNodes]

        decorateFlatPageHistoryPreview(
            pageContainer,
            '<p>Before 1</p><p>Before 2</p><p>Before 3</p><p>Before 4</p><p>Before 5</p><p>Old value</p><p>After 1</p><p>After 2</p><p>After 3</p><p>After 4</p><p>After 5</p>',
        )

        expect(
            nodesNewer.every((node) => node.parentNode === pageContainer),
        ).toBe(true)
        expect(nodesNewer.every((node) => node.hidden === false)).toBe(true)
        expect(
            pageContainer.querySelectorAll(
                ':scope > details.flat-page-history-context-gap',
            ),
        ).toHaveLength(0)
    })

    it('keeps all unchanged context visible around a changed block', () => {
        const root = renderPreview(
            '<p>Before 1</p><p>Before 2</p><p>Before 3</p><p>Before 4</p><p>Before 5</p><ul><li>New item</li></ul><p>After 1</p><p>After 2</p><p>After 3</p><p>After 4</p><p>After 5</p>',
            '<p>Before 1</p><p>Before 2</p><p>Before 3</p><p>Before 4</p><p>Before 5</p><p>After 1</p><p>After 2</p><p>After 3</p><p>After 4</p><p>After 5</p>',
        )

        expect(
            [...root.children]
                .filter(
                    (node) =>
                        node.classList.contains(
                            'flat-page-history-context-block',
                        ) && !node.hidden,
                )
                .map((node) => node.textContent),
        ).toEqual([
            'Before 1',
            'Before 2',
            'Before 3',
            'Before 4',
            'Before 5',
            'After 1',
            'After 2',
            'After 3',
            'After 4',
            'After 5',
        ])
        expect(root.querySelector('.flat-page-history-context-gap')).toBeNull()
        expect(root.querySelector('ul > li')).not.toBeNull()
        expect(
            root.querySelector('.flat-page-history-added-text').textContent,
        ).toBe('New item')
    })

    it('skips empty blocks when selecting surrounding context', () => {
        const root = renderPreview(
            '<p>Far before</p><p>Before</p><div><br></div><div>New item</div><div></div><p>After</p><p>Far after</p>',
            '<p>Far before</p><p>Before</p><div><br></div><div></div><p>After</p><p>Far after</p>',
        )

        expect(
            [...root.querySelectorAll('.flat-page-history-context-block')].map(
                (node) => node.textContent,
            ),
        ).toEqual(['Far before', 'Before', 'After', 'Far after'])
    })

    it('merges overlapping context around nearby changed blocks', () => {
        const root = renderPreview(
            '<p>Far before</p><p>Before</p><p>First 101</p><p>Between</p><p>Second 201</p><p>After</p><p>Far after</p>',
            '<p>Far before</p><p>Before</p><p>First 100</p><p>Between</p><p>Second 200</p><p>After</p><p>Far after</p>',
        )

        expect(
            [...root.querySelectorAll('.flat-page-history-context-block')].map(
                (node) => node.textContent,
            ),
        ).toEqual(['Far before', 'Before', 'Between', 'After', 'Far after'])
        expect(root.querySelector('.flat-page-history-context-gap')).toBeNull()
        expect(
            root.querySelectorAll('.flat-page-history-changed-block'),
        ).toHaveLength(2)
    })

    it('keeps newer formatting and marks changed and removed words', () => {
        const root = renderPreview(
            '<p>Hello <strong>new</strong> world</p>',
            '<p>Hello <strong>old</strong> world</p>',
        )

        expect(root.querySelectorAll('p')).toHaveLength(1)
        expect(root.querySelector('p > strong')).not.toBeNull()
        expect(
            root.querySelector('.flat-page-history-added-text').textContent,
        ).toBe('new')
        expect(
            root.querySelector('.flat-page-history-removed-text').textContent,
        ).toBe('old')
    })

    it('renders a fully removed block with following context', () => {
        const root = renderPreview(
            '<p>Keep</p>',
            '<p>Removed block</p><p>Keep</p>',
        )

        expect(
            root.querySelector('.flat-page-history-removed-block').textContent,
        ).toBe('Removed block')
        expect(
            root.querySelector('.flat-page-history-context-block').textContent,
        ).toBe('Keep')
    })

    it('renders newer HTML with an outline marker for attribute-only changes', () => {
        const root = renderPreview(
            '<a href="/new">Docs</a>',
            '<a href="/old">Docs</a>',
        )

        const link = root.querySelector('a')
        expect(link.getAttribute('href')).toBe('/new')
        expect(
            link.classList.contains('flat-page-history-markup-changed'),
        ).toBe(true)
        expect(root.querySelector('.flat-page-history-added-text')).toBeNull()
    })

    it('renders both sides when a block changes element type', () => {
        const root = renderPreview(
            '<h2>New heading</h2>',
            '<p>Old paragraph</p>',
        )

        expect(
            root.querySelector('p.flat-page-history-removed-block'),
        ).not.toBeNull()
        expect(
            root.querySelector('h2.flat-page-history-added-block'),
        ).not.toBeNull()
    })

    it('aligns a similar edited block after a preceding block is removed', () => {
        const root = renderPreview(
            '<p>Invoice total is 101</p><p>Stable</p>',
            '<p>Remove this block entirely</p><p>Invoice total is 100</p><p>Stable</p>',
        )

        expect(
            root.querySelector('.flat-page-history-removed-block').textContent,
        ).toBe('Remove this block entirely')
        const changedBlock = root.querySelector(
            '.flat-page-history-changed-block',
        )
        expect(changedBlock.textContent).toContain('Invoice total is')
        expect(
            changedBlock.querySelector('.flat-page-history-removed-text')
                .textContent,
        ).toBe('100')
        expect(
            changedBlock.querySelector('.flat-page-history-added-text')
                .textContent,
        ).toBe('101')
    })

    it('aligns a similar edited block after a preceding block is added', () => {
        const root = renderPreview(
            '<p>New introductory block</p><p>Invoice total is 101</p><p>Stable</p>',
            '<p>Invoice total is 100</p><p>Stable</p>',
        )

        expect(
            root.querySelector('.flat-page-history-added-block').textContent,
        ).toBe('New introductory block')
        const changedBlock = root.querySelector(
            '.flat-page-history-changed-block',
        )
        expect(changedBlock.textContent).toContain('Invoice total is')
        expect(
            changedBlock.querySelector('.flat-page-history-removed-text')
                .textContent,
        ).toBe('100')
        expect(
            changedBlock.querySelector('.flat-page-history-added-text')
                .textContent,
        ).toBe('101')
    })

    it('renders all actual HTML as added when older HTML is empty', () => {
        const root = renderPreview('<h2>Title</h2><p>Body</p>', '')

        expect(root.querySelector('h2')).not.toBeNull()
        expect(root.querySelector('p')).not.toBeNull()
        expect(
            root.querySelectorAll('.flat-page-history-added-text'),
        ).toHaveLength(2)
    })

    it('supports unwrapped top-level text', () => {
        const root = renderPreview('Hello new', 'Hello old')

        expect(
            root.querySelector('.flat-page-history-added-text').textContent,
        ).toBe('new')
        expect(
            root.querySelector('.flat-page-history-removed-text').textContent,
        ).toBe('old')
    })

    it('leaves identical newer HTML intact', () => {
        const root = renderPreview('<p>Same</p>', '<p>Same</p>')

        expect(root.innerHTML).toBe('<p>Same</p>')
    })
})
