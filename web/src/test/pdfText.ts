// Reads back the text a pdf-lib document draws, for content tests. pdf-lib
// deflates page streams and writes standard-font text as hex strings
// (`<48656C6C6F> Tj`), so the raw bytes can't simply be searched.

import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'

// WinAnsi bytes 0x80–0x9F that differ from Latin-1 (enough for the report's punctuation).
const WIN_ANSI: Record<number, string> = { 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x96: '–', 0x97: '—' }

function decodeHex(hex: string): string {
  let out = ''
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16)
    out += WIN_ANSI[byte] ?? String.fromCharCode(byte)
  }
  return out
}

/** The text of each page, one drawn string per line, in drawing order. */
export async function pdfPagesText(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((page) => {
    const contents = page.node.get(PDFName.of('Contents'))
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents]
    let ops = ''
    for (const ref of refs) {
      const stream = doc.context.lookup(ref)
      if (stream instanceof PDFRawStream) {
        const decoded = decodePDFRawStream(stream).decode()
        ops += Array.from(decoded, (b) => String.fromCharCode(b)).join('')
      }
    }
    return [...ops.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)].map((m) => decodeHex(m[1])).join('\n')
  })
}

export async function pdfText(bytes: Uint8Array): Promise<string> {
  return (await pdfPagesText(bytes)).join('\n')
}
