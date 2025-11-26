import { render } from 'vitest-browser-svelte'
import { page } from 'vitest/browser'
import { expect } from 'vitest'
import Table from '../../../Web-UI/src/components/PageTypes/Table.svelte'

export interface TableConfig {
  columns: Array<{ name: string; label: string; type: string; wrap: string; align: string }>
  items: Array<Record<string, string>>
  totals: Record<string, any>
  widths: Record<string, any>
  rowStyle: string
  startupScript: string
  customFunctions: string
  note: string
}

/**
 * Sets up a table component with mock fetch and global functions
 */
export async function setupTable(config: TableConfig) {
  globalThis.confirm = () => true
  globalThis.alert = () => {}

  globalThis.fetch = async (url: any) => {
    const urlStr = String(url)
    if (urlStr.includes('/pages/content/')) {
      return {
        ok: true,
        json: async () => ({ content: JSON.stringify(config) }),
      } as Response
    }
    // Return ok: true for any other requests to avoid unhandled rejections
    return {
      ok: true,
      json: async () => ({}),
    } as Response
  }

  const result = render(Table as any, {
    pageId: 'test-page-1',
    viewOnly: false,
    style: '',
  } as any)

  await expect.element(page.getByRole('table')).toBeInTheDocument()
  await new Promise((resolve) => setTimeout(resolve, 100))

  return result
}

/**
 * Gets the text content of a specific cell
 */
export async function getCellText(row: number, col: number): Promise<string | null> {
  const tbody = document.querySelector('tbody')
  if (!tbody) return null
  const rows = tbody.querySelectorAll('tr')
  if (row >= rows.length) return null
  const cells = rows[row].querySelectorAll('td div[contenteditable]')
  if (col >= cells.length) return null
  return cells[col].textContent
}

/**
 * Gets the innerHTML of a cell at the specified position
 */
export async function getCellHTML(row: number, col: number): Promise<string | null> {
  const tbody = document.querySelector('tbody')
  if (!tbody) return null
  const rows = tbody.querySelectorAll('tr')
  if (row >= rows.length) return null
  const cells = rows[row].querySelectorAll('td div[contenteditable]')
  if (col >= cells.length) return null
  return cells[col].innerHTML
}

/**
 * Gets the current row count in the table
 */
export async function getRowCount(): Promise<number> {
  const tbody = document.querySelector('tbody')
  if (!tbody) return 0
  return tbody.querySelectorAll('tr').length
}

/**
 * Creates a basic table configuration with customizable columns and items
 */
export function createTableConfig(
  columns: Array<{ name: string; label: string; type?: string }>,
  items: Array<Record<string, string>>
): TableConfig {
  return {
    columns: columns.map(col => ({
      name: col.name,
      label: col.label,
      type: col.type || '',
      wrap: 'Yes',
      align: 'Left',
    })),
    items,
    totals: {},
    widths: {},
    rowStyle: '',
    startupScript: '',
    customFunctions: '',
    note: '',
  }
}

/**
 * Pre-configured basic 2-column table
 */
export function createBasicTableConfig(): TableConfig {
  return createTableConfig(
    [
      { name: 'Task', label: 'Task' },
      { name: 'Status', label: 'Status' },
    ],
    [
      { Task: 'Item 1', Status: 'Open' },
      { Task: 'Item 2', Status: 'Closed' },
    ]
  )
}
