import { diffArrays, diffWordsWithSpace } from 'diff'

function parseNodes(html) {
    const template = document.createElement('template')
    template.innerHTML = html ?? ''
    return [...template.content.childNodes]
}

function serialize(node) {
    const container = document.createElement('div')
    container.append(node.cloneNode(true))
    return container.innerHTML
}

function addClass(node, className) {
    if (node.nodeType === Node.ELEMENT_NODE) {
        node.classList.add(className)
        return node
    }

    const wrapper = document.createElement('span')
    wrapper.className = className
    wrapper.append(node)
    return wrapper
}

function addClassInPlace(node, className) {
    if (node.nodeType === Node.ELEMENT_NODE) {
        node.classList.add(className)
        return node
    }

    const wrapper = document.createElement('span')
    wrapper.className = className
    node.replaceWith(wrapper)
    wrapper.append(node)
    return wrapper
}

function textNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            return node.parentElement?.closest(
                '.flat-page-history-removed-text',
            )
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT
        },
    })
    const nodes = []
    while (walker.nextNode()) nodes.push(walker.currentNode)
    return nodes
}

function markAdded(node) {
    const marked = addClassInPlace(node, 'flat-page-history-added-block')

    for (const textNode of textNodes(marked).reverse()) {
        const marker = document.createElement('mark')
        marker.className = 'flat-page-history-added-text'
        textNode.replaceWith(marker)
        marker.append(textNode)
    }

    return marked
}

function renderRemoved(node) {
    return addClass(node.cloneNode(true), 'flat-page-history-removed-block')
}

function markContext(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
        node.classList.add('flat-page-history-context-block')
    }
}

function hasContextContent(entry) {
    if (entry.node.textContent?.trim()) return true
    if (entry.node.nodeType !== Node.ELEMENT_NODE) return false

    const contentSelector =
        'img, video, audio, iframe, canvas, svg, hr, input, object, embed'
    return (
        entry.node.matches(contentSelector) ||
        entry.node.querySelector(contentSelector) !== null
    )
}

function decorateUnchangedPart(
    entries,
    hasChangedRunBefore,
    hasChangedRunAfter,
) {
    if (!hasChangedRunBefore && !hasChangedRunAfter) return

    for (const entry of entries.filter(hasContextContent)) {
        markContext(entry.node)
    }
}

function textPosition(root, offset, bias) {
    const nodes = textNodes(root).filter((node) => node.data.length > 0)
    let consumed = 0

    for (const [index, node] of nodes.entries()) {
        const end = consumed + node.data.length
        const isLast = index === nodes.length - 1
        if (offset < end || (offset === end && (bias === 'end' || isLast))) {
            return {
                node,
                offset: Math.max(
                    0,
                    Math.min(offset - consumed, node.data.length),
                ),
            }
        }
        consumed = end
    }

    return null
}

function insertRemoval(root, offset, value) {
    const removed = document.createElement('del')
    removed.className = 'flat-page-history-removed-text'
    removed.textContent = value
    const position = textPosition(root, offset, 'start')
    if (!position) {
        root.append(removed)
        return
    }

    const range = document.createRange()
    range.setStart(position.node, position.offset)
    range.collapse(true)
    range.insertNode(removed)
}

function markAddition(root, start, end) {
    const positionStart = textPosition(root, start, 'start')
    const positionEnd = textPosition(root, end, 'end')
    if (!positionStart || !positionEnd) return

    const range = document.createRange()
    range.setStart(positionStart.node, positionStart.offset)
    range.setEnd(positionEnd.node, positionEnd.offset)
    const marker = document.createElement('mark')
    marker.className = 'flat-page-history-added-text'
    marker.append(range.extractContents())
    range.insertNode(marker)
}

function markTextChanges(root, valueOlder, valueNewer) {
    const additions = []
    const removals = []
    let offsetNewer = 0

    for (const part of diffWordsWithSpace(valueOlder, valueNewer)) {
        if (part.removed) {
            removals.push({ offset: offsetNewer, value: part.value })
        } else if (part.added) {
            additions.push({
                start: offsetNewer,
                end: offsetNewer + part.value.length,
            })
            offsetNewer += part.value.length
        } else {
            offsetNewer += part.value.length
        }
    }

    for (const removal of removals.reverse()) {
        insertRemoval(root, removal.offset, removal.value)
    }
    for (const addition of additions.reverse()) {
        markAddition(root, addition.start, addition.end)
    }

    return additions.length > 0 || removals.length > 0
}

function sameKind(nodeOlder, nodeNewer) {
    return (
        nodeOlder.nodeType === nodeNewer.nodeType &&
        (nodeOlder.nodeType !== Node.ELEMENT_NODE ||
            nodeOlder.tagName === nodeNewer.tagName)
    )
}

function markChanged(nodeOlder, nodeNewer) {
    const marked = addClassInPlace(nodeNewer, 'flat-page-history-changed-block')
    const hasTextChanges = markTextChanges(
        marked,
        nodeOlder.textContent ?? '',
        nodeNewer.textContent ?? '',
    )
    if (!hasTextChanges) {
        addClass(marked, 'flat-page-history-markup-changed')
    }
    return marked
}

function contentSimilarity(entryOlder, entryNewer) {
    const valueOlder = (entryOlder.node.textContent?.trim() || entryOlder.html)
        .replace(/\s+/g, ' ')
        .toLowerCase()
    const valueNewer = (entryNewer.node.textContent?.trim() || entryNewer.html)
        .replace(/\s+/g, ' ')
        .toLowerCase()
    if (valueOlder === valueNewer) return 1
    if (!valueOlder || !valueNewer) return 0

    let distancesPrevious = Array.from(
        { length: valueNewer.length + 1 },
        (_, index) => index,
    )
    for (let indexOlder = 1; indexOlder <= valueOlder.length; indexOlder += 1) {
        const distancesCurrent = [indexOlder]
        for (
            let indexNewer = 1;
            indexNewer <= valueNewer.length;
            indexNewer += 1
        ) {
            const substitutionCost =
                valueOlder[indexOlder - 1] === valueNewer[indexNewer - 1]
                    ? 0
                    : 1
            distancesCurrent[indexNewer] = Math.min(
                distancesCurrent[indexNewer - 1] + 1,
                distancesPrevious[indexNewer] + 1,
                distancesPrevious[indexNewer - 1] + substitutionCost,
            )
        }
        distancesPrevious = distancesCurrent
    }

    return (
        1 -
        distancesPrevious[valueNewer.length] /
            Math.max(valueOlder.length, valueNewer.length)
    )
}

function alignGroup(groupOlder, groupNewer) {
    const countOlder = groupOlder.length
    const countNewer = groupNewer.length
    const scores = Array.from({ length: countOlder + 1 }, () =>
        Array(countNewer + 1).fill(0),
    )
    const matchScores = Array.from({ length: countOlder }, () =>
        Array(countNewer).fill(-Infinity),
    )
    const forceSinglePair = countOlder === 1 && countNewer === 1

    for (let indexOlder = countOlder - 1; indexOlder >= 0; indexOlder -= 1) {
        for (
            let indexNewer = countNewer - 1;
            indexNewer >= 0;
            indexNewer -= 1
        ) {
            const entryOlder = groupOlder[indexOlder]
            const entryNewer = groupNewer[indexNewer]
            if (sameKind(entryOlder.node, entryNewer.node)) {
                const similarity = contentSimilarity(entryOlder, entryNewer)
                if (forceSinglePair || similarity >= 0.35) {
                    matchScores[indexOlder][indexNewer] = forceSinglePair
                        ? Math.max(similarity, 0.35)
                        : similarity
                }
            }

            scores[indexOlder][indexNewer] = Math.max(
                scores[indexOlder + 1][indexNewer],
                scores[indexOlder][indexNewer + 1],
                matchScores[indexOlder][indexNewer] +
                    scores[indexOlder + 1][indexNewer + 1],
            )
        }
    }

    const operations = []
    let indexOlder = 0
    let indexNewer = 0
    while (indexOlder < countOlder || indexNewer < countNewer) {
        const matchScore = matchScores[indexOlder]?.[indexNewer] ?? -Infinity
        if (
            matchScore > -Infinity &&
            scores[indexOlder][indexNewer] ===
                matchScore + scores[indexOlder + 1][indexNewer + 1]
        ) {
            operations.push({
                type: 'changed',
                entryOlder: groupOlder[indexOlder],
                entryNewer: groupNewer[indexNewer],
            })
            indexOlder += 1
            indexNewer += 1
        } else if (
            indexOlder < countOlder &&
            (indexNewer >= countNewer ||
                scores[indexOlder + 1][indexNewer] >=
                    scores[indexOlder][indexNewer + 1])
        ) {
            operations.push({
                type: 'removed',
                entryOlder: groupOlder[indexOlder],
            })
            indexOlder += 1
        } else {
            operations.push({
                type: 'added',
                entryNewer: groupNewer[indexNewer],
            })
            indexNewer += 1
        }
    }

    return operations
}

function decorateAlignedGroup(
    pageContainer,
    groupOlder,
    groupNewer,
    nodeBoundary,
) {
    const operations = alignGroup(groupOlder, groupNewer)

    for (const [index, operation] of operations.entries()) {
        if (operation.type === 'changed') {
            markChanged(operation.entryOlder.node, operation.entryNewer.node)
            continue
        }
        if (operation.type === 'added') {
            markAdded(operation.entryNewer.node)
            continue
        }

        const operationNextNewer = operations
            .slice(index + 1)
            .find((candidate) => candidate.entryNewer)
        pageContainer.insertBefore(
            renderRemoved(operation.entryOlder.node),
            operationNextNewer?.entryNewer.node ?? nodeBoundary,
        )
    }
}

export function decorateFlatPageHistoryPreview(pageContainer, html_older) {
    const nodesOlder = parseNodes(html_older).map((node) => ({
        node,
        html: serialize(node),
    }))
    const nodesNewer = [...pageContainer.childNodes].map((node) => ({
        node,
        html: serialize(node),
    }))
    const parts = diffArrays(nodesOlder, nodesNewer, {
        comparator: (left, right) => left.html === right.html,
    })

    for (let index = 0; index < parts.length; ) {
        if (!parts[index].added && !parts[index].removed) {
            decorateUnchangedPart(
                parts[index].value,
                index > 0,
                index < parts.length - 1,
            )
            index += 1
            continue
        }

        const groupOlder = []
        const groupNewer = []
        while (
            index < parts.length &&
            (parts[index].added || parts[index].removed)
        ) {
            if (parts[index].removed) groupOlder.push(...parts[index].value)
            if (parts[index].added) groupNewer.push(...parts[index].value)
            index += 1
        }

        const nodeBoundary = groupNewer.length
            ? groupNewer.at(-1).node.nextSibling
            : (parts[index]?.value[0]?.node ?? null)
        decorateAlignedGroup(
            pageContainer,
            groupOlder,
            groupNewer,
            nodeBoundary,
        )
    }
}
