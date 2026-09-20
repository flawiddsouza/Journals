import type { LineCodec } from './edit'
import { flatCodec } from './flat'
import { proseCodec } from './prose'

/** The page types that read as numbered lines, and the codec each one uses.
 *  get_page and edit_page work from this; search_pages borrows it to show
 *  what a page says rather than how it is stored. */
export const LINE_CODECS: Record<string, LineCodec<unknown>> = {
  FlatPage: flatCodec as LineCodec<unknown>,
  FlatPageV2: proseCodec('FlatPageV2') as LineCodec<unknown>,
  TaskList: proseCodec('TaskList') as LineCodec<unknown>,
}

export const LINE_TYPES = Object.keys(LINE_CODECS)
