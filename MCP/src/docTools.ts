import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { LINE_CODECS, LINE_TYPES } from './lines/codecs'
import { type Unit, applyLineEdit, linesOf } from './lines/edit'
import { isTaskLine } from './lines/prose'
import { ToolError, assertLinksExist, assertWritable, loadPage, mutates, pageSchema, readOnly, revisionSchema, run, savePage, writeDenied } from './toolkit'

/**
 * get_page and edit_page: Flat Page, Flat Page v2 and Task List pages as
 * numbered lines. One pair of tools serves all three because the line model is
 * the same; only the codec underneath differs.
 */

const DEFAULT_LIMIT = 400

const LINE_FORM = [
  'The line form, per page type:',
  '- FlatPage: every line is a line of text. Inline markup only.',
  '- FlatPageV2: a line is a paragraph, and a blank line is an empty paragraph, so do not add blank lines between paragraphs unless the page should show a gap. Also "# " to "###### " headings, "- " bullets, "1. " numbered items, "- [ ] " and "- [x] " tasks, and code blocks between ``` lines. Indent a list line by two spaces per level to nest it.',
  '- TaskList: every line is a task, "- [ ] " or "- [x] ", nested by two spaces per level. Only bold, italic, strike and code work in a task; links and images do not exist there.',
  'Inline markup: **bold**, *italic*, ~~strike~~, `code`, [label](https://address), ![alt](https://image-address), [[Page name|id]] for a link to another page with its id from list_pages, and <br> for a line break inside one block.',
  'Put a backslash before a character to keep it literal: \\* \\` \\[ \\# \\-. Lines come back escaped that way where needed, so text copied from get_page can be sent back unchanged.',
].join('\n')

const numbered = (lines: string[], first: number) => lines.map((l, i) => `${first + i}\t${l}`).join('\n')

/** A Task List is one list of tasks, so it takes a line with no marker as an
 *  unchecked task and keeps no blank lines (prose.ts, parseBlocks). Both are
 *  what the app does with a pasted list, and both mean the page does not say
 *  quite what was sent, so the edit reports them. */
function taskListChanges(lines: string[]): string | null {
  const untasked = lines.filter((line) => line.trim() && !isTaskLine(line)).length
  const blank = lines.filter((line) => !line.trim()).length
  const said = [
    untasked
      ? untasked > 1
        ? `${untasked} lines had no "- [ ] " marker and were saved as unchecked tasks`
        : '1 line had no "- [ ] " marker and was saved as an unchecked task'
      : '',
    blank ? `${blank} blank line${blank > 1 ? 's were' : ' was'} dropped` : '',
  ].filter(Boolean)
  return said.length ? `${said.join(', and ')}. Every line of a Task List is a task.` : null
}

/** Read-only stretches that overlap the lines being returned. */
function readOnlyRanges(units: Unit<unknown>[], from: number, to: number) {
  const ranges: { start: number; end: number; why: string }[] = []
  let line = 1
  for (const unit of units) {
    const end = line + unit.lines.length - 1
    if (unit.readOnly && unit.lines.length && line <= to && end >= from) ranges.push({ start: line, end, why: unit.readOnly })
    line = end + 1
  }
  return ranges
}

export function registerDocTools(server: McpServer, { username, canWrite }: { username: string; canWrite: boolean }) {
  server.registerTool(
    'get_page',
    {
      title: 'Read a page as numbered lines',
      description: [
        'The text of a FlatPage, FlatPageV2 or TaskList page, one numbered line per paragraph, list item or task. The number and a tab come before each line and are not part of it.',
        'Long pages come back in windows: pass start and limit, or a negative start to read from the end (-40 is the last 40 lines), which is what appending to a journal page needs.',
        'readOnly lists line ranges that are shown as plain text but cannot be rewritten: tables, and formatting the line form has no spelling for. They can be edited around, or removed whole.',
        '',
        LINE_FORM,
      ].join('\n'),
      inputSchema: z.object({
        page: pageSchema,
        start: z.number().int().optional().describe('First line to return, 1-based. Negative counts from the end. Default 1'),
        limit: z.number().int().min(1).max(2000).optional().describe(`How many lines to return. Default ${DEFAULT_LIMIT}`),
      }),
      annotations: readOnly,
    },
    async ({ page, start, limit }) =>
      run(async () => {
        const { info, content, revision } = await loadPage(username, page, LINE_TYPES)
        const units = LINE_CODECS[info.type]!.read(content)
        const lines = linesOf(units)
        const from = Math.min(Math.max(1, start === undefined ? 1 : start < 0 ? lines.length + start + 1 : start), Math.max(1, lines.length))
        const to = Math.min(lines.length, from + (limit ?? DEFAULT_LIMIT) - 1)
        return {
          page: { id: info.id, name: info.name, type: info.type },
          revision,
          lineCount: lines.length,
          start: from,
          end: to,
          text: numbered(lines.slice(from - 1, to), from),
          readOnly: readOnlyRanges(units, from, to),
          viewOnly: Boolean(info.view_only || info.parent_view_only),
        }
      }),
  )

  server.registerTool(
    'edit_page',
    {
      title: 'Replace or insert lines on a page',
      description: [
        'One edit to a FlatPage, FlatPageV2 or TaskList page. Either replace lines start to end (inclusive) with text, or insert text below line after (0 for the top, lineCount for the bottom). Empty text with start and end deletes those lines.',
        'text holds whole lines separated by newlines, without line numbers. One trailing newline is ignored.',
        'Everything outside the edited lines is written back exactly as it was stored. Ticking a task is replacing its line with the same text and [x].',
        'An indented first line nests under the list item above it.',
        'The result carries the new revision and the lines around the change with their new numbers, so a second edit does not need another get_page.',
        '',
        LINE_FORM,
      ].join('\n'),
      inputSchema: z.object({
        page: pageSchema,
        revision: revisionSchema,
        text: z.string().describe('The new lines. Empty to delete'),
        start: z.number().int().optional().describe('First line to replace, 1-based. Use with end'),
        end: z.number().int().optional().describe('Last line to replace, inclusive'),
        after: z.number().int().optional().describe('Insert below this line instead of replacing. 0 is the top of the page'),
      }),
      annotations: mutates,
    },
    async ({ page, revision, text, start, end, after }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        const replacing = start !== undefined || end !== undefined
        if (replacing === (after !== undefined) || (replacing && (start === undefined || end === undefined))) {
          throw new ToolError('Pass either start and end to replace lines, or after to insert. Not both, and not neither.')
        }
        const loaded = await loadPage(username, page, LINE_TYPES)
        assertWritable(loaded, revision)

        const codec = LINE_CODECS[loaded.info.type]!
        const lines = text === '' ? [] : text.replace(/\r/g, '').replace(/\n$/, '').split('\n')
        if (!replacing && !lines.length) throw new ToolError('Nothing to insert: text is empty')
        const result = applyLineEdit(codec, codec.read(loaded.content), replacing ? { start: start!, end: end!, lines } : { after: after!, lines })

        await assertLinksExist(username, loaded.content, result.content)

        const saved = await savePage(username, loaded, result.content)
        const from = Math.max(1, result.changed.start - 2)
        const to = Math.min(result.lines.length, result.changed.end + 2)
        const note = loaded.info.type === 'TaskList' ? taskListChanges(lines) : null
        return {
          saved: true,
          revision: saved,
          lineCount: result.lines.length,
          changed: result.changed.end < result.changed.start ? null : result.changed,
          context: numbered(result.lines.slice(from - 1, to), from),
          ...(note ? { note } : {}),
        }
      })
    },
  )
}
