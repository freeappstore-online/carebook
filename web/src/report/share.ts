// Hands the finished PDF to the user: the system share sheet where the browser
// can share files, otherwise a download. Nothing is uploaded by Carebook.

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded'

interface ShareNavigator {
  canShare?: (data: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
}

export function pdfFile(bytes: Uint8Array, name: string): File {
  return new File([bytes as BlobPart], name, { type: 'application/pdf' })
}

/** Whether this browser can put a PDF file in the share sheet. */
export function canSharePdf(nav: ShareNavigator = navigator): boolean {
  try {
    const probe = new File([new Uint8Array()], 'probe.pdf', { type: 'application/pdf' })
    return typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [probe] })
  } catch {
    return false
  }
}

export function downloadPdf(bytes: Uint8Array, name: string, doc: Document = document): void {
  const url = URL.createObjectURL(pdfFile(bytes, name))
  const a = doc.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  doc.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before freeing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Shares the PDF if the browser can, else downloads it. */
export async function shareOrDownloadPdf(
  bytes: Uint8Array,
  name: string,
  { nav = navigator as ShareNavigator, doc = document, title = 'Carebook health log' } = {},
): Promise<ShareOutcome> {
  const file = pdfFile(bytes, name)
  if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title, text: 'Log and share with your clinician.' })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Share failed for another reason (e.g. not allowed): fall back to a download.
    }
  }
  downloadPdf(bytes, name, doc)
  return 'downloaded'
}
