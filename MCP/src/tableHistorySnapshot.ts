import { evaluateTableHistory } from './evaluate'
import type { TableDocument } from './tableDoc'

type Row = Record<string, string>
type HistoryCell = { html: string; style: string }

// The same five-second comparison budget as the UI's history worker. Each
// snapshot receives only the remaining time.
export const TABLE_HISTORY_TIMEOUT_MS = 5000
export class TableHistoryCalculationError extends Error {}

export function createTableHistorySnapshot(doc: TableDocument, deadline: number) {
  const timeoutMs = deadline - Date.now()
  if (timeoutMs <= 0) throw new TableHistoryCalculationError('The calculations took too long to compare.')
  const result = evaluateTableHistory(doc, timeoutMs)
  if (result.timedOut) throw new TableHistoryCalculationError('The calculations took too long to compare.')
  if (!result.history) throw new TableHistoryCalculationError('Could not compare the calculations in these versions.')
  return {
    cells: new Map<Row, Record<string, HistoryCell>>(doc.items.map((row, index) => [row, result.history!.cells[index]!])),
    totals: result.history.totals,
  }
}
