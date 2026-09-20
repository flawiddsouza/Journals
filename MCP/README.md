# Journals MCP

MCP server for reading and editing Journals pages: Flat Page, Flat Page v2 and
Task List pages as numbered lines, Mini App code and stored data, and Table
pages, both their rows and the JavaScript behind them (computed columns,
totals, column and row styling, the startup script, shared helpers, stats
widget expressions).

## Running

```sh
bun install
JWT_SECRET=<same secret as the API> bun run index.ts
```

`bun test` covers the script sandbox, the column profiling, the line codecs,
table rows, columns and stats widgets, the text a search hit is shown as, and
the Mini App document. It needs no API and no environment.

This server repeats things the app decides: which page types exist, what a
saved table carries, how a computed column resolves. `src/uiContract.test.ts`
is the guard against the two drifting apart. It reads the app's source for the
copied constants, and runs the app's own `tableComputeEngine.js` and
`taskList.js` beside the code here to compare results. When it fails, the app
changed: bring the file it names in line.

`bun run e2e` covers the rest: OAuth, the nginx routes, every tool and what the
save tools refuse. It needs Docker. It builds the image and runs it
with a throwaway data volume, so it never touches `API/data`.

| Variable | Default | |
|---|---|---|
| `JWT_SECRET` | required | Must match `API/.env`. The sidecar mints short-lived JWTs with it. |
| `JOURNALS_API_URL` | `http://127.0.0.1:9900` | The Crystal API. |
| `MCP_PORT` | `9901` | |
| `JOURNALS_PUBLIC_API_URL` | none | The API's public URL, the same value as `baseURL` in the UI's `config.js`. Pages refer to an uploaded file by it. Without it `create_file_upload` refuses, and everything else works. |
| `MCP_DB` | `./data/mcp.db` | OAuth clients, codes and tokens. Nothing else. |

Connect a client:

```sh
# running it directly, as above
claude mcp add --scope user journals --transport http http://localhost:9901/mcp

# deployed, where it is served on the UI's origin, not the API's
claude mcp add --scope user journals --transport http https://journals.one/mcp
```

It runs the OAuth flow itself. The consent page asks for your Journals username
and password.

The app shows the same steps with its own address filled in, under "Connect AI
Apps" in the sidebar (`Web-UI/src/components/Modals/ConnectMcpModal.svelte`),
and lists the apps that were let in. It reads and revokes them through
`GET /oauth/connections` and `DELETE /oauth/connections/:id`, which take the
app's own login token in the `Token` header.

Both protocol eras are served: the 2025 `initialize` handshake and the
2026-07-28 stateless path with `server/discover`.

## What it does not touch

`store.db` is never opened here. Journal reads and writes go over HTTP so that
`PUT /pages/:page_id` keeps doing the page history, history pruning and
page-link syncing it already does.

## Saves that would undo each other

A page is saved whole, by the app and by this server alike, so a save made from
an older copy would undo whatever was saved in between. The API guards that
itself: `GET /pages/content/:page_id` returns a `revision` with the content,
`PUT /pages/:page_id` takes it back as `baseRevision`, and answers 409 when the
page has moved on. The app sends it from `Web-UI/src/helpers/pageRevisions.js`,
and a tab holding an older copy offers to reload instead of saving. The tools
send the revision the caller read. A save that names no revision is not
checked, and a page group is never checked: its content is only which page is
open in it.

## Tools

| Tool | |
|---|---|
| `search_pages` | The app's own search, by page name or by what pages say. Ten best matches, each with its type, and a snippet of the page as it reads. |
| `list_pages` | Pages narrowed by type, section or name, up to a limit. Walks page groups too, or nested pages go missing. |
| `list_sections` | Every section with its notebook and profile. The only way to find a section that has no pages yet. |
| `create_page` | A new, empty page of any type the app offers, in a section or inside a page group. |
| `rename_page` | A new name for a page. |
| `move_page` | To another section, into a page group or out of one. A page group takes the pages inside it along. |
| `delete_page` | To the recycle bin, like the app. Nothing here empties the bin or restores from it. |
| `list_page_files` | The files and images uploaded to a page, and whether the page still refers to each. |
| `create_file_upload` | A one-time link to PUT a file to. The response carries the markup that shows it on a page. |
| `create_file_download` | A one-time link to GET an uploaded file from. |
| `get_page` | A Flat Page, Flat Page v2 or Task List page as numbered lines, in windows for long pages. Marks the line ranges it can show but not rewrite. |
| `edit_page` | Replace lines `start` to `end`, or insert below `after`. Returns the new revision and the lines around the change. |
| `get_mini_app` | A Mini App's html, css, js and modules, the data it has stored, and whether it came from a template. |
| `set_mini_app_files` | Save any of the files. Syntax-checks the JavaScript first. Stored data is carried through. |
| `set_mini_app_data` | Set, remove or clear stored keys. The code is carried through. |
| `get_table_rows` | A Table's rows as text, in windows, with search. Computed columns come back as the values their scripts produce. |
| `edit_table_rows` | Update, remove and add rows in one batch, saved as one history entry. |
| `edit_table_columns` | Add, rename, remove and reorder columns, and set their options and widths. Lists the scripts a rename or removal leaves pointing at the old name. |
| `get_table_config` | Every script on a Table page, a profile per column, a chosen row sample, and how the app calls each kind of script. Never returns all rows. |
| `evaluate_table_script` | Dry run against the real rows. Reports output and cost. Saves nothing. |
| `set_table_script` | Save one script. Evaluates first, and re-checks dependents when the target is `customFns`. |
| `edit_table_stats` | The stat cards and charts under the Stats tab: add, retitle, retype, resize, reorder and remove. A widget has to exist before `set_table_script` can fill it. |

Every save takes the `revision` its get tool returned and is refused when the
page changed since, and every save refuses view-only pages. Renaming, moving
and deleting follow the app instead: it allows them on a view-only page and
offers none of them on a password protected one.

Tool descriptions are loaded by every client in every session, so reference
text a tool only sometimes needs is returned by a tool instead. The script
contracts are in `get_table_config` for that reason.

### Pages as lines

`get_page` and `edit_page` share one line form across the three document
types (`src/lines/`). A line is a paragraph, a list item or a task. Inline
markup is Markdown's, plus `[[Page name|id]]` for page links.

An edit re-parses only the blocks it touches. Everything else is written back
exactly as it was stored, so table column widths, alignment and pasted
formatting survive. Whether a block can be rewritten is decided by rendering it
and parsing the lines back: if that does not reproduce the block it is shown
read-only. Tables, styled pasted text and any node the app gains later are
protected that way without being listed anywhere.

`src/lines/testSchema.ts` is a copy of the two editor schemas, used by the
tests to check that every document written is one the app can load. When
`FlatPageV2.svelte` or `TaskList.svelte` gains a node or an attribute, add it
there too.

### Files

File bytes never pass through the conversation. A tool mints a one-time link
under `/mcp/files/`, the agent uses it once with `curl`, and the ticket, which
lives in memory for fifteen minutes, is gone. The sidecar forwards an upload to
`POST /upload-image/:page_id` and streams a download from the API, which
serves a file only to its owner.

- An upload shows nowhere until its markup is put into a page. The PUT response
  carries that markup.
- Files a browser runs when opened (`.html`, `.svg` and the like) are refused.
  The API serves an upload from its own origin, which is where the login cookie
  lives, and an agent can be talked into things a person would not do.
- A download is always sent as an attachment, because this origin also serves
  the app.
- There is no delete. The API's upload delete removes the file from disk, and
  every other delete in Journals is a soft one. An upload outlives the page
  being deleted and goes when the page is cleared from the recycle bin, which
  deletes the files its uploads point at.
- nginx allows 26 MB on `/mcp/files/` so that the sidecar's 25 MB limit is what
  answers an oversized upload, with a message the agent can read.

### Table rows

A cell holds the same HTML a Flat Page line does, so cells use the same line
form, and what is written is escaped the same way. A row number is a position:
it is only good at the revision it was read at, and every number in one
`edit_table_rows` batch means the table as it was read. A bad row or column
refuses the whole batch. Computed columns are evaluated only for the rows being
returned.

Column changes follow what the app does, with two differences: a rename
carries the column's total and width along, which the app drops, and a removal
takes them away, which the app leaves behind. Scripts are never rewritten. A
width is validated as a plain length, because the app writes it into a `style`
attribute as it is. Which values a filter shows is not saved anywhere, so only
whether a column is filterable can be set.

The app reads `totals` from a saved table with no fallback, so every table
document written here carries it, a never-saved page included.

### Table scripts

`evaluate_table_script` runs the candidate in `node:vm` with the same Proxy
instrumentation the app's compute engine uses, so an expression that is correct
but registers O(n squared) dependency entries gets flagged before it is saved.
The proxy stands in for an array, so `for..of`, spread and `Array.from` have to
reach it by index the way the app's engine does; `uiContract.test.ts` runs the
app's engine beside this one to keep the two agreeing on that.

A stats widget is the one script that has nowhere to live until something makes
it. `edit_table_stats` creates it, with or without its expression, and
`evaluate_table_script` will dry run a candidate with no `widgetId` at all, so
an expression can be checked before the widget exists.
