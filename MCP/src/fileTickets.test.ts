import { describe, expect, test } from 'bun:test'
import { TICKET_TTL_MS, checkFilename, createTicket, isImage, markupFor, redeemTicket, storedName } from './fileTickets'

describe('tickets', () => {
  const upload = { kind: 'upload', username: 'flo', pageId: 7, filename: 'a.png' } as const

  test('a link works once', () => {
    const { token } = createTicket(upload)
    expect(redeemTicket(token, 'upload')).toEqual(upload)
    expect(redeemTicket(token, 'upload')).toBeNull()
  })

  test('a link is good for its own purpose only, and trying the wrong one does not spend it', () => {
    const { token } = createTicket(upload)
    expect(redeemTicket(token, 'download')).toBeNull()
    expect(redeemTicket(token, 'upload')).toEqual(upload)
  })

  test('a link expires', () => {
    const { token, expiresAt } = createTicket(upload, 1_000)
    expect(expiresAt).toBe(1_000 + TICKET_TTL_MS)
    expect(redeemTicket(token, 'upload', expiresAt + 1)).toBeNull()
  })

  test('an unknown token is nothing', () => {
    expect(redeemTicket('not-a-token', 'upload')).toBeNull()
  })
})

describe('file names', () => {
  test('ordinary files are fine', () => {
    for (const name of ['photo.png', 'Receipt 2026.pdf', 'notes.txt', 'data.csv', 'archive.tar.gz', 'clip.MP4']) expect(checkFilename(name)).toBe('')
  })

  test('files a browser runs from the API origin are refused, whatever the case', () => {
    for (const name of ['page.html', 'x.HTM', 'drawing.svg', 'feed.xml', 'a.xhtml', 'saved.mhtml']) expect(checkFilename(name)).toMatch(/not accepted/)
  })

  test('a path, or no extension, is refused', () => {
    expect(checkFilename('../etc/passwd.txt')).toMatch(/without a path/)
    expect(checkFilename('dir\\x.png')).toMatch(/without a path/)
    expect(checkFilename('README')).toMatch(/needs an extension/)
    expect(checkFilename('  ')).toMatch(/plain name/)
  })
})

test('markup shows an image and links anything else', () => {
  expect(isImage('1712_tmp.PNG')).toBe(true)
  expect(markupFor('https://api.example/uploads/images/1_tmp.png', 'photo.png')).toBe('![](https://api.example/uploads/images/1_tmp.png)')
  expect(markupFor('https://api.example/uploads/images/1_tmp.pdf', 'Q1 [draft].pdf')).toBe('[Q1 [draft\\].pdf](https://api.example/uploads/images/1_tmp.pdf)')
})

test('the stored name comes out of a bare name, a path or a full address, and nothing else', () => {
  expect(storedName('1712_tmpAb3.png')).toBe('1712_tmpAb3.png')
  expect(storedName('uploads/images/1712_tmpAb3.png')).toBe('1712_tmpAb3.png')
  expect(storedName('https://api.example/uploads/images/1712_tmpAb3.png?v=2#x')).toBe('1712_tmpAb3.png')
  expect(storedName('https://api.example/uploads/images/..')).toBeNull()
  expect(storedName('a b.png')).toBeNull()
  expect(storedName('')).toBeNull()
})
