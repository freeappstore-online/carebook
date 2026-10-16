// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canSharePdf, shareOrDownloadPdf } from './share'

const BYTES = new TextEncoder().encode('%PDF-1.7 test')
const NAME = 'carebook-log.pdf'

let clicked: HTMLAnchorElement[] = []

beforeEach(() => {
  clicked = []
  URL.createObjectURL = vi.fn(() => 'blob:report')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shareOrDownloadPdf', () => {
  it('shares the PDF as a file when the browser can', async () => {
    const share = vi.fn(async () => {})
    const nav = { canShare: () => true, share }
    expect(await shareOrDownloadPdf(BYTES, NAME, { nav })).toBe('shared')
    const data = share.mock.calls[0] as unknown as [ShareData]
    const file = data[0].files![0]
    expect(file.name).toBe(NAME)
    expect(file.type).toBe('application/pdf')
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual(Array.from(BYTES))
    expect(data[0].text).toMatch(/share with your clinician/)
    expect(clicked).toHaveLength(0)
  })

  it('does nothing more when the user cancels the share sheet', async () => {
    const nav = { canShare: () => true, share: vi.fn(async () => Promise.reject(new DOMException('no', 'AbortError'))) }
    expect(await shareOrDownloadPdf(BYTES, NAME, { nav })).toBe('cancelled')
    expect(clicked).toHaveLength(0)
  })

  it('downloads when files can’t be shared or sharing fails', async () => {
    expect(await shareOrDownloadPdf(BYTES, NAME, { nav: {} })).toBe('downloaded')
    expect(await shareOrDownloadPdf(BYTES, NAME, { nav: { canShare: () => false, share: vi.fn() } })).toBe('downloaded')
    const failing = { canShare: () => true, share: vi.fn(async () => Promise.reject(new DOMException('no', 'NotAllowedError'))) }
    expect(await shareOrDownloadPdf(BYTES, NAME, { nav: failing })).toBe('downloaded')

    expect(clicked).toHaveLength(3)
    expect(clicked[0].download).toBe(NAME)
    expect(clicked[0].href).toBe('blob:report')
    // The link is removed again after the click.
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('reports whether PDF sharing is available', () => {
    expect(canSharePdf({})).toBe(false)
    expect(canSharePdf({ canShare: () => true, share: vi.fn() })).toBe(true)
    expect(canSharePdf({ canShare: () => false, share: vi.fn() })).toBe(false)
  })
})
