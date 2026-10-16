/** Saves a blob as a file through a temporary download link. */
export function downloadBlob(blob: Blob, name: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob)
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
