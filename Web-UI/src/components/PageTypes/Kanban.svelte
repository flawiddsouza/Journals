<script>
export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined
export let style = ''

import fetchPlus from '../../helpers/fetchPlus.js'
import * as encryptionManager from '../../helpers/encryptionManager.js'
import { dndzone } from 'svelte-dnd-action'
import { flip } from 'svelte/animate'
import debounce from '../../helpers/debounce.js'

let pageContent = null
let loaded = false
let boards = []
let flipDurationMs = 300

function formatDate(dateString) {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

let editState = {
    cards: {}  // Will store cardId -> { isEditing, isEditingDescription, isNew }
}

function getCardEditState(cardId) {
    if (!editState.cards[cardId]) {
        editState.cards[cardId] = { isEditing: false, isEditingDescription: false, isNew: false }
    }
    return editState.cards[cardId]
}

function setCardEditing(cardId, isEditing, isNew = false) {
    if (!editState.cards[cardId]) {
        editState.cards[cardId] = { isEditing: false, isEditingDescription: false, isNew: false }
    }
    editState.cards[cardId].isEditing = isEditing
    editState.cards[cardId].isNew = isNew
    editState = {...editState} // Trigger reactivity
}

function setCardEditingDescription(cardId, isEditingDescription) {
    if (!editState.cards[cardId]) {
        editState.cards[cardId] = { isEditing: false, isEditingDescription: false, isNew: false }
    }
    editState.cards[cardId].isEditingDescription = isEditingDescription
    editState = {...editState} // Trigger reactivity
}

// Custom action for selecting text in an input when mounted,
// but only if it's a new card
function selectTextOnMount(node) {
    // Check if the card is marked as new and needs text selection
    const cardId = node.dataset.cardId
    if (cardId && editState.cards[cardId]?.isNew) {
        setTimeout(() => node.select(), 0) // Use setTimeout to ensure DOM is ready
    }
    return {}
}

$: if(pageContentOverride !== undefined) {
    try {
        pageContent = JSON.parse(pageContentOverride)
        boards = pageContent.boards || defaultBoards()
        loaded = true
    } catch (e) {
        console.error('Error parsing page content', e)
        boards = defaultBoards()
        loaded = true
    }
}

$: fetchPage(pageId)

function defaultBoards() {
    return [
        {
            id: 'todo',
            title: 'To Do',
            cards: []
        },
        {
            id: 'in-progress',
            title: 'In Progress',
            cards: []
        },
        {
            id: 'done',
            title: 'Done',
            cards: []
        }
    ]
}

function fetchPage(pageId) {
    if(pageId) {
        fetchPlus.get(`/pages/content/${pageId}`).then(response => {
            try {
                // Check if we have a decrypted version in session
                const decryptedContent = encryptionManager.getPageContent(pageId.toString())

                let contentToUse
                if (decryptedContent !== null) {
                    // Use decrypted content from session
                    contentToUse = decryptedContent
                } else {
                    // Use content as-is (either unprotected or encrypted)
                    contentToUse = response.content
                }

                pageContent = contentToUse ? JSON.parse(contentToUse) : { boards: defaultBoards() }
                boards = pageContent.boards || defaultBoards()
            } catch (e) {
                console.error('Error parsing page content', e)
                boards = defaultBoards()
            }
            loaded = true
        }).catch(error => {
            console.error('Error fetching page content', error)
            boards = defaultBoards()
            loaded = true
        })
    }
}

const savePageContent = debounce(async function() {
    if(pageId === null) {
        return
    }

    try {
        const contentString = JSON.stringify({
            boards
        })

        // Check if page is encrypted and we have the key
        if (encryptionManager.hasPageKey(pageId.toString())) {
            // Save encrypted content
            const result = await encryptionManager.saveEncryptedContent(pageId.toString(), contentString)
            if (!result.success) {
                alert(result.error || 'Page Save Failed')
            }
        } else {
            // Save unencrypted content normally
            await fetchPlus.put(`/pages/${pageId}`, {
                pageContent: contentString
            })
        }
    } catch (error) {
        console.error('Save error:', error)
        alert('Page Save Failed')
    }
}, 500)

function handleAddCard(boardId) {
    const board = boards.find(b => b.id === boardId)
    if (board) {
        const now = new Date().toISOString()
        // Create a new card at the top of the board
        const newCard = {
            id: Date.now().toString(),
            title: 'New Card',
            description: '',
            createdAt: now,
            updatedAt: now
        }
        board.cards.unshift(newCard)
        setCardEditing(newCard.id, true, true) // Mark as new card
        boards = boards // trigger svelte reactivity
        savePageContent()
    }
}

function handleEditCard(boardId, cardId) {
    const board = boards.find(b => b.id === boardId)
    if (board) {
        const card = board.cards.find(c => c.id === cardId)
        if (card) {
            setCardEditing(cardId, true, false) // Not a new card
            boards = boards // trigger svelte reactivity
        }
    }
}

function handleEditCardDescription(boardId, cardId) {
    const board = boards.find(b => b.id === boardId)
    if (board) {
        const card = board.cards.find(c => c.id === cardId)
        if (card) {
            setCardEditingDescription(cardId, true)
            boards = boards // trigger svelte reactivity
        }
    }
}

function saveCardTitle(boardId, cardId, newTitle) {
    const board = boards.find(b => b.id === boardId)
    if (board) {
        const card = board.cards.find(c => c.id === cardId)
        if (card) {
            // Only update if the title isn't empty
            if (newTitle && newTitle.trim()) {
                card.title = newTitle.trim()
                setCardEditing(cardId, false)
                // Update the updatedAt timestamp
                card.updatedAt = new Date().toISOString()
                boards = boards // trigger svelte reactivity
                savePageContent()
            } else if (!newTitle.trim() && !card.description) {
                // Remove empty cards with no description
                handleDeleteCard(boardId, cardId)
            } else {
                // If empty but has description, revert to previous title
                setCardEditing(cardId, false)
            }
        }
    }
}

function saveCardDescription(boardId, cardId, newDescription) {
    const board = boards.find(b => b.id === boardId)
    if (board) {
        const card = board.cards.find(c => c.id === cardId)
        if (card) {
            card.description = newDescription
            setCardEditingDescription(cardId, false)
            // Update the updatedAt timestamp
            card.updatedAt = new Date().toISOString()
            boards = boards // trigger svelte reactivity
            savePageContent()
        }
    }
}

function handleDeleteCard(boardId, cardId) {
    const board = boards.find(b => b.id === boardId)
    if (board) {
        if (confirm('Are you sure you want to delete this card?')) {
            board.cards = board.cards.filter(c => c.id !== cardId)
            delete editState.cards[cardId]
            boards = boards // trigger svelte reactivity
            savePageContent()
        }
    }
}

function handleAddBoard() {
    const boardTitle = prompt('Enter board title:')
    if (boardTitle && boardTitle.trim()) {
        const now = new Date().toISOString()
        boards.push({
            id: Date.now().toString(),
            title: boardTitle,
            cards: [],
            createdAt: now,
            updatedAt: now
        })
        boards = [...boards] // trigger reactivity
        savePageContent()
    }
}

function handleEditBoard(boardId) {
    const board = boards.find(b => b.id === boardId)
    if (board) {
        const boardTitle = prompt('Edit board title:', board.title)
        if (boardTitle && boardTitle.trim()) {
            board.title = boardTitle
            // Update the updatedAt timestamp
            board.updatedAt = new Date().toISOString()
            boards = [...boards] // trigger reactivity
            savePageContent()
        }
    }
}

function handleDeleteBoard(boardId) {
    const board = boards.find(b => b.id === boardId)
    if (board) {
        if (confirm(`Are you sure you want to delete the "${board.title}" board and all its cards?`)) {
            boards = boards.filter(b => b.id !== boardId)
            savePageContent()
        }
    }
}

// Handle drag and drop between boards
function handleBoardCardsDndConsider(e, boardId) {
    if (viewOnly) return;

    const board = boards.find(b => b.id === boardId);
    if (board) {
        board.cards = e.detail.items;
        boards = [...boards]; // trigger reactivity
    }
}

function handleBoardCardsDndFinalize(e, boardId) {
    if (viewOnly) return;

    const board = boards.find(b => b.id === boardId);
    if (board) {
        board.cards = e.detail.items;
        boards = [...boards]; // trigger reactivity
        savePageContent();
    }
}

// Handle drag and drop for rearranging boards
function handleBoardsDndConsider(e) {
    if (viewOnly) return;
    boards = e.detail.items;
}

function handleBoardsDndFinalize(e) {
    if (viewOnly) return;
    boards = e.detail.items;
    savePageContent();
}
</script>

<div class="kanban-container" style="{style}">
    {#if loaded}
        <section
            use:dndzone={{
                items: boards,
                flipDurationMs,
                type: 'boards',
                dragDisabled: viewOnly,
                dropTargetStyle: { outline: 'none' }
            }}
            on:consider={handleBoardsDndConsider}
            on:finalize={handleBoardsDndFinalize}
            class="kanban-boards"
        >
            {#each boards as board (board.id)}
                <div
                    class="kanban-board"
                    animate:flip={{duration: flipDurationMs}}
                >
                    <div class="kanban-board-header">
                        <h2>{board.title}</h2>
                        {#if !viewOnly}
                            <div class="board-actions">
                                <button class="icon-button" on:click={() => handleAddCard(board.id)} title="Add Card">+</button>
                                <button class="icon-button" on:click={() => handleEditBoard(board.id)} title="Edit Board">✎</button>
                                <button class="icon-button delete" on:click={() => handleDeleteBoard(board.id)} title="Delete Board">×</button>
                            </div>
                        {/if}
                    </div>

                    <section
                        use:dndzone={{items: board.cards, flipDurationMs, type: 'cards', dragDisabled: viewOnly}}
                        on:consider={e => handleBoardCardsDndConsider(e, board.id)}
                        on:finalize={e => handleBoardCardsDndFinalize(e, board.id)}
                        class="kanban-cards"
                    >
                        {#each board.cards as card (card.id)}
                            <div
                                class="kanban-card"
                                animate:flip={{duration: flipDurationMs}}
                            >
                                <div class="kanban-card-header">
                                    {#if getCardEditState(card.id).isEditing && !viewOnly}
                                        <input
                                            type="text"
                                            class="card-title-input"
                                            bind:value={card.title}
                                            on:blur={() => saveCardTitle(board.id, card.id, card.title)}
                                            on:keydown={(e) => e.key === 'Enter' && saveCardTitle(board.id, card.id, card.title)}
                                            use:selectTextOnMount
                                            data-card-id={card.id}
                                            autofocus
                                            spellcheck="false"
                                        />
                                    {:else}
                                        <h3 on:dblclick={() => !viewOnly && handleEditCard(board.id, card.id)}>{card.title}</h3>
                                    {/if}
                                    {#if !viewOnly}
                                        <div class="card-actions">
                                            <button class="icon-button" on:click={() => handleEditCard(board.id, card.id)} title="Edit Title">✎</button>
                                            <button class="icon-button" on:click={() => handleEditCardDescription(board.id, card.id)} title="Edit Description">✐</button>
                                            <button class="icon-button delete" on:click={() => handleDeleteCard(board.id, card.id)} title="Delete Card">×</button>
                                        </div>
                                    {/if}
                                </div>
                                {#if getCardEditState(card.id).isEditingDescription && !viewOnly}
                                    <textarea
                                        class="card-description-input"
                                        bind:value={card.description}
                                        on:blur={() => saveCardDescription(board.id, card.id, card.description)}
                                        autofocus
                                        spellcheck="false"
                                    ></textarea>
                                {:else if card.description}
                                    <div class="kanban-card-description" on:dblclick={() => !viewOnly && handleEditCardDescription(board.id, card.id)}>
                                        {card.description}
                                    </div>
                                {/if}

                                {#if card.createdAt}
                                    <div class="kanban-card-timestamp">
                                        Created: {formatDate(card.createdAt)}
                                    </div>
                                {/if}
                            </div>
                        {/each}

                        {#if board.cards.length === 0}
                            <div class="empty-board-message">
                                {#if viewOnly}
                                    No cards
                                {:else}
                                    Drag cards here or click + to add a card
                                {/if}
                            </div>
                        {/if}
                    </section>
                </div>
            {/each}
            {#if !viewOnly}
                <div class="add-board">
                    <button on:click={handleAddBoard}>Add Board +</button>
                </div>
            {/if}
        </section>
    {:else}
        <div>Loading...</div>
    {/if}
</div>

<style>
.kanban-container {
    height: 100%;
    overflow: auto;
    padding: 1rem 0;
}

.kanban-boards {
    display: flex;
    gap: 1rem;
    height: 100%;
    min-height: calc(100% - 2rem);
}

.kanban-board {
    background: #f4f5f7;
    border-radius: 3px;
    width: 300px;
    min-width: 300px;
    max-height: 100%;
    display: flex;
    flex-direction: column;
}

.kanban-board-header {
    padding: 0.75rem;
    border-bottom: 1px solid #ddd;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.kanban-board-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
}

.kanban-cards {
    padding: 0.75rem;
    overflow-y: auto;
    flex-grow: 1;
}

.kanban-card {
    background: white;
    border-radius: 3px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    margin-bottom: 0.75rem;
    padding: 0.75rem;
    cursor: grab;
    position: relative;
}

.kanban-card:active {
    cursor: grabbing;
}

.kanban-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.kanban-card-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
    word-break: break-word;
}

.kanban-card-description {
    margin-top: 0.5rem;
    white-space: pre-line;
    color: #555;
    word-break: break-word;
    font-size: 0.875rem;
}

.kanban-card-timestamp {
    margin-top: 0.5rem;
    color: #aaa;
    font-size: 0.75rem;
    font-style: italic;
}

.board-actions, .card-actions {
    display: flex;
    gap: 0.25rem;
}

.icon-button {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    line-height: 1;
    font-size: 1rem;
}

.icon-button:hover {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 3px;
}

.icon-button.delete:hover {
    color: #e11d48;
}

.add-board {
    display: flex;
    align-items: flex-start;
    min-width: fit-content;
}

.add-board button {
    padding: 0.75rem;
    background: #f4f5f7;
    border: none;
    border-radius: 3px;
    cursor: pointer;
}

.add-board button:hover {
    background: #e4e5e7;
}

.empty-board-message {
    color: #8e8e8e;
    text-align: center;
    padding: 1rem;
    font-style: italic;
    border-radius: 3px;
    min-height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.card-title-input {
    width: 100%;
    border: 1px solid #ddd;
    border-radius: 3px;
    padding: 0.25rem;
    font-size: 1rem;
    font-weight: 500;
    margin-right: 0.5rem;
    font-family: inherit;
}

.card-description-input {
    width: 100%;
    min-height: 80px;
    border: 1px solid #ddd;
    border-radius: 3px;
    padding: 0.25rem;
    margin-top: 0.5rem;
    resize: vertical;
    font-family: inherit;
    font-size: 0.875rem;
}
</style>
