import { getPageCapabilities } from './pageCapabilities.js'

const pageTypeHelp = {
    FlatPage: {
        title: 'Flat Page',
        description:
            'A simple free-form page for quick notes, pasted content, links, and files.',
        groups: [
            {
                title: 'Editing',
                items: [
                    {
                        name: 'Indent text',
                        shortcut: 'Tab',
                        description: 'Inserts four spaces at the cursor.',
                    },
                    {
                        name: 'Web link',
                        shortcut: 'Ctrl+K',
                        description:
                            'Turns selected text into a web link. It can also make pasted links clickable.',
                    },
                    {
                        name: 'Page link',
                        shortcut: '[[',
                        description:
                            'Searches for another Journals page and inserts a link to it.',
                    },
                    {
                        name: 'File or image',
                        shortcut: 'Ctrl+I',
                        description:
                            'Opens the file insertion dialog. Pasted images upload automatically.',
                    },
                ],
            },
            {
                title: 'Date shortcuts',
                items: [
                    {
                        name: 'Date',
                        shortcut: 'Alt+Shift+D',
                        description: "Inserts today's date.",
                    },
                    {
                        name: 'Time',
                        shortcut: 'F11',
                        description: 'Inserts the current time.',
                    },
                    {
                        name: 'Date and time',
                        shortcut: 'F12',
                        description: 'Inserts the current date and time.',
                    },
                ],
            },
        ],
    },
    FlatPageV2: {
        title: 'Flat Page v2',
        description:
            'A free-form page with lists, checklists, tables, links, files, and date shortcuts.',
        groups: [
            {
                title: 'Create blocks',
                items: [
                    {
                        name: 'Checklist',
                        shortcut: '[] then Space',
                        description:
                            'Starts a checklist. Ctrl+Enter also converts the current line or toggles the current task.',
                    },
                    {
                        name: 'Table',
                        shortcut: '/table then Enter',
                        description:
                            'Creates a three-column table with a header row.',
                    },
                    {
                        name: 'Bulleted list',
                        shortcut: '- then Space',
                        description: 'Starts a bulleted list.',
                    },
                    {
                        name: 'Numbered list',
                        shortcut: '1. then Space',
                        description: 'Starts a numbered list.',
                    },
                ],
            },
            {
                title: 'Move and edit',
                items: [
                    {
                        name: 'Nest or outdent',
                        shortcut: 'Tab / Shift+Tab',
                        description:
                            'Nests list and checklist items. In a table, it moves between cells and adds a row after the final cell.',
                    },
                    {
                        name: 'Add table row below',
                        shortcut: 'Ctrl+Enter',
                        description:
                            'Adds a row below the current row and moves the cursor into it.',
                    },
                    {
                        name: 'Add table row above',
                        shortcut: 'Ctrl+Shift+Enter',
                        description:
                            'Adds a row above the current row and moves the cursor into it.',
                    },
                    {
                        name: 'Table structure',
                        shortcut: '⋯',
                        description:
                            'Opens row and column controls below the selected table.',
                    },
                ],
            },
            {
                title: 'Insert',
                items: [
                    {
                        name: 'Page link',
                        shortcut: '[[',
                        description:
                            'Searches for another Journals page and inserts a link to it.',
                    },
                    {
                        name: 'Web link',
                        shortcut: 'Ctrl+K',
                        description:
                            'Turns the selected text into a web link, or inserts the URL as its label.',
                    },
                    {
                        name: 'File or image',
                        shortcut: 'Ctrl+I',
                        description:
                            'Opens the file insertion dialog. Pasted images upload automatically.',
                    },
                    {
                        name: 'Date',
                        shortcut: 'Alt+Shift+D',
                        description: "Inserts today's date.",
                    },
                    {
                        name: 'Time',
                        shortcut: 'F11',
                        description: 'Inserts the current time.',
                    },
                    {
                        name: 'Date and time',
                        shortcut: 'F12',
                        description: 'Inserts the current date and time.',
                    },
                ],
            },
        ],
    },
    RichText: {
        title: 'Rich Text',
        description:
            'A block editor for structured notes with movable text, media, code, and tables.',
        groups: [
            {
                title: 'Blocks',
                items: [
                    {
                        name: 'Block menu',
                        shortcut: '+',
                        description:
                            'Adds headings, lists, tables, code, toggles, images, or file attachments.',
                    },
                    {
                        name: 'Move blocks',
                        shortcut: 'Drag',
                        description: 'Drags a block to reorder the page.',
                    },
                    {
                        name: 'Undo and redo',
                        shortcut: 'Ctrl+Z / Ctrl+Shift+Z',
                        description:
                            'Reverses or reapplies recent block edits.',
                    },
                ],
            },
            {
                title: 'Formatting and links',
                items: [
                    {
                        name: 'Inline toolbar',
                        shortcut: 'Select text',
                        description:
                            'Formats selected text with bold, italic, underline, strike, inline code, and colors.',
                    },
                    {
                        name: 'Page link',
                        shortcut: '[[',
                        description: 'Inserts a link to another Journals page.',
                    },
                    {
                        name: 'Underline',
                        shortcut: 'Ctrl+U',
                        description: 'Underlines selected text.',
                    },
                ],
            },
        ],
    },
    Table: {
        title: 'Table',
        description:
            'A structured data page with editable columns, filters, computed values, and stats.',
        groups: [
            {
                title: 'Editing',
                items: [
                    {
                        name: 'Add row below',
                        shortcut: 'Ctrl+Enter',
                        description: 'Adds a row below the current row.',
                    },
                    {
                        name: 'Add row above',
                        shortcut: 'Ctrl+Shift+Enter',
                        description: 'Adds a row above the current row.',
                    },
                    {
                        name: 'Delete row',
                        shortcut: 'Ctrl+Delete',
                        description: 'Removes the current row.',
                    },
                    {
                        name: 'Copy cell above',
                        shortcut: 'Ctrl+;',
                        description:
                            'Copies the value from the cell directly above into the current cell.',
                    },
                    {
                        name: 'Page link',
                        shortcut: '[[',
                        description: 'Inserts a link to another Journals page.',
                    },
                    {
                        name: 'File or image',
                        shortcut: 'Ctrl+I',
                        description: 'Opens the file insertion dialog.',
                    },
                ],
            },
            {
                title: 'Table tools',
                items: [
                    {
                        name: 'Configure Table',
                        description:
                            'Sets columns, labels, filters, computed values, styles, and pagination.',
                    },
                    {
                        name: 'Stats',
                        description:
                            'Builds summary values and charts from the table rows.',
                    },
                ],
            },
        ],
    },
    Spreadsheet: {
        title: 'Spreadsheet (legacy)',
        description:
            'The original spreadsheet editor with formulas, formatting, and multiple sheets.',
        groups: [
            {
                title: 'Workbook',
                items: [
                    {
                        name: 'Formulas',
                        shortcut: '= formula',
                        description:
                            'Starts a formula in a cell, such as =SUM(A1:A5).',
                    },
                    {
                        name: 'Cell formatting',
                        description:
                            'Uses the toolbar for number formats, fonts, colors, borders, alignment, wrapping, and merged cells.',
                    },
                    {
                        name: 'Rows and columns',
                        shortcut: 'Right-click',
                        description:
                            'Opens row, column, copy, paste, and delete actions.',
                    },
                    {
                        name: 'Sheets',
                        shortcut: '+',
                        description:
                            'Adds sheets and uses the sheet tabs to switch, rename, or remove them.',
                    },
                ],
            },
        ],
    },
    SpreadsheetV2: {
        title: 'Spreadsheet',
        description:
            'A full workbook with formulas, rich formatting, multiple sheets, and remembered view state.',
        groups: [
            {
                title: 'Workbook',
                items: [
                    {
                        name: 'Formulas',
                        shortcut: '= formula',
                        description:
                            'Starts a formula and supports cell and range references.',
                    },
                    {
                        name: 'Format cells',
                        description:
                            'Uses the toolbar for number formats, fonts, colors, borders, alignment, wrapping, and merged cells.',
                    },
                    {
                        name: 'Rows and columns',
                        shortcut: 'Right-click',
                        description:
                            'Opens insert, delete, hide, and sizing actions for rows and columns.',
                    },
                    {
                        name: 'Sheets',
                        shortcut: '+',
                        description:
                            'Adds sheets and uses the bottom tabs to switch or manage them.',
                    },
                ],
            },
            {
                title: 'Navigation',
                items: [
                    {
                        name: 'Edit cell',
                        shortcut: 'Enter / double-click',
                        description: 'Edits the selected cell.',
                    },
                    {
                        name: 'Move selection',
                        shortcut: 'Arrow keys / Tab',
                        description: 'Moves between workbook cells.',
                    },
                    {
                        name: 'Remembered position',
                        description:
                            'Restores the active sheet, selected cell, scroll position, and zoom when reopened.',
                    },
                ],
            },
        ],
    },
    DrawIO: {
        title: 'Draw.io',
        description:
            'An embedded diagrams.net canvas for flows, diagrams, maps, and visual notes.',
        groups: [
            {
                title: 'Drawing',
                items: [
                    {
                        name: 'Shapes and text',
                        description:
                            'Drags shapes from the left library onto the canvas and edits their labels.',
                    },
                    {
                        name: 'Connect shapes',
                        shortcut: 'Drag connector handle',
                        description:
                            'Creates arrows and connectors between shapes.',
                    },
                    {
                        name: 'Format selection',
                        description:
                            'Uses the right panel to change style, text, and arrangement.',
                    },
                    {
                        name: 'Undo and redo',
                        shortcut: 'Ctrl+Z / Ctrl+Y',
                        description: 'Reverses or reapplies drawing changes.',
                    },
                    {
                        name: 'Autosave',
                        description:
                            'Saves diagram changes back to Journals automatically.',
                    },
                ],
            },
        ],
    },
    Excalidraw: {
        title: 'Excalidraw',
        description:
            'A hand-drawn canvas for sketches, diagrams, annotations, and images.',
        groups: [
            {
                title: 'Canvas',
                items: [
                    {
                        name: 'Drawing tools',
                        description:
                            'Adds rectangles, diamonds, arrows, lines, freehand strokes, text, and images.',
                    },
                    {
                        name: 'Select and move',
                        shortcut: '1 or V',
                        description:
                            'Selects, moves, resizes, and groups elements.',
                    },
                    {
                        name: 'Pan and zoom',
                        shortcut: 'Space+drag / mouse wheel',
                        description:
                            'Moves around the canvas and changes its zoom.',
                    },
                    {
                        name: 'Undo and redo',
                        shortcut: 'Ctrl+Z / Ctrl+Shift+Z',
                        description: 'Reverses or reapplies drawing changes.',
                    },
                    {
                        name: 'Library',
                        description:
                            'Browses reusable Excalidraw elements. Imported library items are remembered.',
                    },
                ],
            },
        ],
    },
    PageGroup: {
        title: 'Page Group',
        description:
            'A tabbed collection that keeps related Journals pages together.',
        groups: [
            {
                title: 'Pages',
                items: [
                    {
                        name: 'Add page',
                        shortcut: '+',
                        description: 'Creates a new page inside this group.',
                    },
                    {
                        name: 'Switch page',
                        shortcut: 'Click a tab',
                        description:
                            'Opens a grouped page without leaving the group.',
                    },
                    {
                        name: 'Reorder pages',
                        shortcut: 'Drag a tab',
                        description: 'Changes the order of pages in the group.',
                    },
                    {
                        name: 'Page actions',
                        shortcut: 'Right-click a tab',
                        description:
                            'Opens rename, duplicate, move, favorites, access, and delete actions.',
                    },
                    {
                        name: 'Inner page tools',
                        description:
                            'The compact nav below the tabs contains Help, History, Uploads, Backlinks, and other tools for the selected page.',
                    },
                ],
            },
        ],
    },
    Favorites: {
        title: 'Favorites',
        description:
            'A tabbed shortcut collection for pages stored anywhere in Journals.',
        groups: [
            {
                title: 'Pages',
                items: [
                    {
                        name: 'Add a favorite',
                        shortcut: 'Page right-click menu',
                        description:
                            'Uses Add to Favorites on any page to place it in this collection.',
                    },
                    {
                        name: 'Switch page',
                        shortcut: 'Click a tab',
                        description: 'Opens a favorite inside this page.',
                    },
                    {
                        name: 'Reorder favorites',
                        shortcut: 'Drag a tab',
                        description: 'Changes the order of favorite tabs.',
                    },
                    {
                        name: 'Remove a favorite',
                        shortcut: 'Right-click a tab',
                        description:
                            'Removes the shortcut from this Favorites page without deleting the original page.',
                    },
                    {
                        name: 'Inner page tools',
                        description:
                            'The compact nav below the tabs contains Help, History, Uploads, Backlinks, and other tools for the selected page.',
                    },
                ],
            },
        ],
    },
    Kanban: {
        title: 'Kanban',
        description:
            'A board for organizing cards into movable workflow columns.',
        groups: [
            {
                title: 'Boards and cards',
                items: [
                    {
                        name: 'Add board',
                        shortcut: 'Add Board +',
                        description: 'Creates another workflow column.',
                    },
                    {
                        name: 'Add card',
                        shortcut: '+ on a board',
                        description: 'Creates a card in that board.',
                    },
                    {
                        name: 'Edit',
                        shortcut: 'Pencil buttons',
                        description:
                            'Edits a board title or a card title and description.',
                    },
                    {
                        name: 'Move cards',
                        shortcut: 'Drag',
                        description:
                            'Reorders cards or moves them between boards. On touch devices, use the drag handle.',
                    },
                    {
                        name: 'Move boards',
                        shortcut: 'Drag',
                        description:
                            'Reorders boards. On touch devices, use the board handle.',
                    },
                ],
            },
        ],
    },
    MiniApp: {
        title: 'Mini App',
        description:
            'A sandboxed interactive tool built from HTML, CSS, JavaScript, and optional modules.',
        groups: [
            {
                title: 'Build',
                items: [
                    {
                        name: 'Configure Mini App',
                        description:
                            'Opens the HTML, CSS, JS, and Modules editors beside a live preview.',
                    },
                    {
                        name: 'Run',
                        description:
                            'Builds the current code and refreshes the preview.',
                    },
                    {
                        name: 'Auto build',
                        description:
                            'Refreshes the preview automatically as code changes.',
                    },
                    {
                        name: 'Modules',
                        shortcut: 'HTML / CSS / JS / Modules tabs',
                        description:
                            'Adds reusable flat .js and .css files to the app.',
                    },
                    {
                        name: 'AI Chat',
                        description:
                            'Drafts and applies HTML, CSS, JavaScript, and module changes.',
                    },
                ],
            },
            {
                title: 'Data and reuse',
                items: [
                    {
                        name: 'Stored Data',
                        description: 'Views data saved by this mini app.',
                    },
                    {
                        name: 'Mini App API',
                        description:
                            'Documents page-scoped storage, uploads, protected files, Vue, and modules.',
                    },
                    {
                        name: 'Templates',
                        description:
                            'Applies, publishes, versions, and updates reusable mini app templates.',
                    },
                ],
            },
        ],
    },
    VersatileCalculator: {
        title: 'Versatile Calculator',
        description:
            'Readable calculation lines that recognize numbers, arithmetic, time, and money.',
        groups: [
            {
                title: 'Calculations',
                items: [
                    {
                        name: 'Arithmetic',
                        shortcut: '2 + 3 * 4',
                        description:
                            'Calculates expressions with +, -, *, /, and parentheses.',
                    },
                    {
                        name: 'Time',
                        shortcut: '1h 30m or 1:30',
                        description: 'Recognizes and totals hours and minutes.',
                    },
                    {
                        name: 'Money',
                        shortcut: '$10 / ₹500 / €12',
                        description:
                            'Recognizes and totals money separately by currency.',
                    },
                    {
                        name: 'Labels',
                        shortcut: 'Lunch ₹250',
                        description:
                            'Keeps descriptive text beside the calculated value.',
                    },
                    {
                        name: 'Separate totals',
                        shortcut: '+ Add section',
                        description:
                            'Creates another calculation section with its own totals.',
                    },
                ],
            },
            {
                title: 'Editing',
                items: [
                    {
                        name: 'New line',
                        shortcut: 'Enter',
                        description:
                            'Splits the current line and moves into the new one.',
                    },
                    {
                        name: 'Join lines',
                        shortcut: 'Backspace at line start',
                        description: 'Joins the line to the previous line.',
                    },
                    {
                        name: 'Move between lines',
                        shortcut: 'Arrow Up / Arrow Down',
                        description: 'Moves to the line above or below.',
                    },
                ],
            },
        ],
    },
    TaskList: {
        title: 'Task List',
        description:
            'An outline-style task page with nested branches and keyboard editing.',
        groups: [
            {
                title: 'Editing',
                items: [
                    {
                        name: 'New task',
                        shortcut: 'Enter',
                        description: 'Creates the next task.',
                    },
                    {
                        name: 'Line break',
                        shortcut: 'Shift+Enter',
                        description: 'Adds another line inside the same task.',
                    },
                    {
                        name: 'Nest or outdent',
                        shortcut: 'Tab / Shift+Tab',
                        description:
                            'Moves the current task in or out one level.',
                    },
                    {
                        name: 'Select task branch',
                        shortcut: 'Escape',
                        description:
                            'Selects the current task and all of its nested tasks.',
                    },
                    {
                        name: 'Complete selected task',
                        shortcut: 'Space',
                        description: 'Toggles the selected task branch.',
                    },
                    {
                        name: 'Duplicate selection',
                        shortcut: 'Ctrl+Shift+D',
                        description: 'Duplicates the selected task branch.',
                    },
                    {
                        name: 'Delete selection',
                        shortcut: 'Backspace / Delete',
                        description: 'Removes the selected task branch.',
                    },
                ],
            },
        ],
    },
}

const pageTools = [
    {
        name: 'History',
        description:
            'Browse saved versions, pin important versions, or restore an older version. Flat pages also show what changed.',
    },
    {
        name: 'Uploads',
        description:
            'View or remove files attached to this page. "Not Used" means the file remains uploaded but the current page no longer references it.',
    },
    {
        name: 'Backlinks',
        description:
            'Shows both directions: pages that reference this page, and pages this page references. Page links created with [[ appear here.',
    },
]

export const pageHelpTypes = Object.freeze(Object.keys(pageTypeHelp))

export function getPageHelp(activePage) {
    const type = activePage?.type || 'Page'
    const typeHelp = pageTypeHelp[type] || {
        title: type.replace(/([a-z])([A-Z])/g, '$1 $2'),
        description:
            'Use this guide to discover the tools available for the current page.',
        groups: [],
    }
    const capabilities = getPageCapabilities(type)
    const tools = capabilities.pageTools ? [...pageTools] : []

    if (capabilities.styles) {
        tools.push({
            name: 'Styles',
            description: 'Changes the page font and text size.',
        })
    }

    if (capabilities.export) {
        tools.push({
            name: 'Export',
            description:
                'Downloads the page as an HTML file and embeds its images in the export.',
        })
    }

    return {
        ...typeHelp,
        groups: [
            ...typeHelp.groups,
            ...(tools.length ? [{ title: 'Page tools', items: tools }] : []),
        ],
    }
}
