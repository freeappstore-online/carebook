// Draws the clinician report with pdf-lib, entirely on the device. Uses the
// PDF standard fonts (no font files to embed or fetch); characters they can't
// show are replaced with "?".

import { type PDFFont, type PDFPage, PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { addDays, dateAt, timeAt, zonedToEpoch } from '../meds/zoned'
import type { PeriodAdherence } from '../today/adherence'
import { BP_NOTE, BP_SOURCE } from '../vitals/bp'
import { niceTicks } from '../vitals/chart'
import { fmt } from '../vitals/stats'
import { REPORT_DISCLAIMER, REPORT_SUBTITLE, REPORT_TITLE, type ReportData } from './data'

const PAGE = { width: 595.28, height: 841.89 } // A4 portrait, points
const MARGIN = 48
const CONTENT_W = PAGE.width - 2 * MARGIN
const FOOTER_H = 28

const INK = rgb(0.07, 0.07, 0.07)
const MUTED = rgb(0.4, 0.4, 0.4)
const LINE = rgb(0.85, 0.85, 0.85)
const SYS = rgb(0.62, 0.27, 0.15)
const DIA = rgb(0.14, 0.36, 0.45)

export const ADHERENCE_EXPLAINED =
  'Adherence % is doses logged as taken divided by scheduled doses that were due. Skipped, snoozed and unlogged doses count as not taken; as-needed medications are not included.'

class Layout {
  readonly doc: PDFDocument
  readonly regular: PDFFont
  readonly bold: PDFFont
  page!: PDFPage
  y = 0
  private readonly encodable = new Map<string, boolean>()

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont) {
    this.doc = doc
    this.regular = regular
    this.bold = bold
    this.newPage()
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height])
    this.y = PAGE.height - MARGIN
  }

  /** Starts a new page unless `height` more points fit above the footer. */
  ensure(height: number) {
    if (this.y - height < MARGIN + FOOTER_H) this.newPage()
  }

  /** Replaces characters the standard fonts can't encode, and flattens whitespace. */
  safe(text: string): string {
    let out = ''
    for (const ch of text.replace(/\s+/g, ' ')) {
      let ok = this.encodable.get(ch)
      if (ok === undefined) {
        try {
          this.regular.widthOfTextAtSize(ch, 10)
          ok = true
        } catch {
          ok = false
        }
        this.encodable.set(ch, ok)
      }
      out += ok ? ch : '?'
    }
    return out
  }

  width(text: string, size: number, font = this.regular) {
    return font.widthOfTextAtSize(text, size)
  }

  /** Cuts `text` to fit `max` points, ending with an ellipsis. */
  fit(text: string, max: number, size: number, font = this.regular): string {
    const s = this.safe(text)
    if (this.width(s, size, font) <= max) return s
    let lo = 0
    let hi = s.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (this.width(`${s.slice(0, mid)}…`, size, font) <= max) lo = mid
      else hi = mid - 1
    }
    return `${s.slice(0, lo).trimEnd()}…`
  }

  /** Splits `text` into lines no wider than `max`. */
  wrap(text: string, max: number, size: number, font = this.regular): string[] {
    const words = this.safe(text).split(' ').filter(Boolean)
    const lines: string[] = []
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (this.width(next, size, font) <= max) line = next
      else {
        if (line) lines.push(line)
        line = this.width(word, size, font) <= max ? word : this.fit(word, max, size, font)
      }
    }
    if (line) lines.push(line)
    return lines
  }

  text(text: string, x: number, size: number, { font = this.regular, color = INK } = {}) {
    this.page.drawText(this.safe(text), { x, y: this.y - size, size, font, color })
  }

  /** Writes a wrapped paragraph and moves down. */
  paragraph(text: string, { size = 10, font = this.regular, color = INK, maxLines = Infinity, gap = 4 } = {}) {
    const lines = this.wrap(text, CONTENT_W, size, font)
    const shown = lines.slice(0, maxLines)
    if (lines.length > shown.length) shown[shown.length - 1] = this.fit(`${shown[shown.length - 1]}…`, CONTENT_W, size, font)
    for (const line of shown) {
      this.ensure(size * 1.35)
      this.text(line, MARGIN, size, { font, color })
      this.y -= size * 1.35
    }
    this.y -= gap
  }

  heading(text: string) {
    this.ensure(48)
    this.y -= 10
    this.text(text, MARGIN, 14, { font: this.bold })
    this.y -= 20
  }

  rule() {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE.width - MARGIN, y: this.y },
      thickness: 0.5,
      color: LINE,
    })
  }
}

const pct = (p: number | null) => (p === null ? 'n/a' : `${p}%`)

export function adherenceLine(a: PeriodAdherence): string {
  if (a.due === 0) return 'No scheduled doses were due in this period.'
  return `${pct(a.percent)} (${a.taken} of ${a.due} due doses logged as taken; ${a.skipped} skipped, ${a.snoozed} snoozed, ${a.missed} not logged)`
}

function header(l: Layout, data: ReportData) {
  l.text(REPORT_TITLE, MARGIN, 20, { font: l.bold })
  l.y -= 26
  l.text(REPORT_SUBTITLE, MARGIN, 12, { color: MUTED })
  l.y -= 22
  const created = `${dateAt(data.generatedAt, data.timeZone)} ${timeAt(data.generatedAt, data.timeZone)}`
  l.paragraph(`Period: ${data.range.from} to ${data.range.to}. Created ${created} (${data.timeZone}).`, { gap: 2 })
  l.paragraph(REPORT_DISCLAIMER, { color: MUTED, gap: 6 })
  l.rule()
  l.y -= 4
}

function medications(l: Layout, data: ReportData) {
  l.heading('Medications')
  if (data.medications.length === 0) {
    l.paragraph('No medications on the list for this period.', { color: MUTED })
    return
  }
  for (const m of data.medications) {
    l.ensure(56)
    const detail = [m.strength, m.form].filter(Boolean).join(' · ')
    const name = l.fit(m.name, CONTENT_W * 0.6, 11, l.bold)
    l.text(name, MARGIN, 11, { font: l.bold })
    if (detail) l.text(l.fit(detail, CONTENT_W - l.width(name, 11, l.bold) - 12, 10), MARGIN + l.width(name, 11, l.bold) + 10, 10, { color: MUTED })
    l.y -= 15
    l.paragraph(`${m.schedule}. ${m.dates}.`, { gap: 0 })
    if (m.asNeeded) {
      const n = m.adherence.asNeededTaken
      l.paragraph(`As needed: ${n} ${n === 1 ? 'dose' : 'doses'} logged in this period.`, { gap: 0 })
    } else {
      l.paragraph(`Adherence: ${adherenceLine(m.adherence)}`, { gap: 0 })
    }
    if (m.notes) l.paragraph(`Notes: ${m.notes}`, { color: MUTED, maxLines: 3, gap: 0 })
    l.y -= 8
  }
}

function adherence(l: Layout, data: ReportData) {
  l.heading('Adherence')
  const a = data.adherence
  if (a.due > 0) {
    l.ensure(30)
    l.text(pct(a.percent), MARGIN, 20, { font: l.bold })
    l.y -= 26
  }
  l.paragraph(adherenceLine(a), { gap: 2 })
  if (a.daysWithDoses > 0) {
    l.paragraph(`Every due dose taken on ${a.daysAllTaken} of ${a.daysWithDoses} days with doses due.`, { gap: 2 })
  }
  if (a.asNeededTaken > 0) l.paragraph(`As-needed doses logged: ${a.asNeededTaken}.`, { gap: 2 })
  l.paragraph(ADHERENCE_EXPLAINED, { size: 9, color: MUTED })
}

function chart(l: Layout, data: ReportData) {
  const height = 150
  const left = MARGIN + 30
  const right = PAGE.width - MARGIN
  l.ensure(height + 50)
  const top = l.y - 26
  const bottom = top - height
  const start = zonedToEpoch(data.range.from, '00:00', data.timeZone)
  const end = zonedToEpoch(addDays(data.range.to, 1), '00:00', data.timeZone)
  const values = data.bp.flatMap((r) => [r.systolic, r.diastolic])
  const ticks = niceTicks(Math.min(...values), Math.max(...values))
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const x = (at: number) => left + ((at - start) / Math.max(1, end - start)) * (right - left)
  const y = (v: number) => bottom + ((v - lo) / (hi - lo || 1)) * height

  // Legend.
  l.page.drawLine({ start: { x: left, y: top + 14 }, end: { x: left + 16, y: top + 14 }, thickness: 1.5, color: SYS })
  l.page.drawText('Systolic', { x: left + 20, y: top + 11, size: 8, font: l.regular, color: MUTED })
  l.page.drawLine({ start: { x: left + 64, y: top + 14 }, end: { x: left + 80, y: top + 14 }, thickness: 1.5, color: DIA, dashArray: [3, 2] })
  l.page.drawText('Diastolic (mmHg)', { x: left + 84, y: top + 11, size: 8, font: l.regular, color: MUTED })

  for (const t of ticks) {
    l.page.drawLine({ start: { x: left, y: y(t) }, end: { x: right, y: y(t) }, thickness: 0.5, color: LINE })
    const label = String(t)
    l.page.drawText(label, { x: left - 4 - l.width(label, 8), y: y(t) - 3, size: 8, font: l.regular, color: MUTED })
  }
  for (const [at, label, align] of [
    [start, data.range.from, 'start'],
    [end, data.range.to, 'end'],
  ] as const) {
    const w = l.width(label, 8)
    l.page.drawText(label, { x: align === 'start' ? x(at) : x(at) - w, y: bottom - 12, size: 8, font: l.regular, color: MUTED })
  }

  const line = (pick: (r: (typeof data.bp)[number]) => number, color: typeof SYS, dashed: boolean) => {
    const pts = data.bp.map((r) => ({ x: x(r.takenAt), y: y(pick(r)) }))
    for (let i = 1; i < pts.length; i++) {
      l.page.drawLine({ start: pts[i - 1], end: pts[i], thickness: 1.5, color, ...(dashed ? { dashArray: [3, 2] } : {}) })
    }
    for (const p of pts) l.page.drawCircle({ x: p.x, y: p.y, size: 2, color })
  }
  line((r) => r.systolic, SYS, false)
  line((r) => r.diastolic, DIA, true)

  l.y = bottom - 24
}

interface Column {
  title: string
  width: number
}

function table(l: Layout, columns: Column[], rows: string[][]) {
  const size = 9
  const rowH = 14
  const drawHeader = () => {
    let x = MARGIN
    for (const c of columns) {
      l.text(c.title, x, size, { font: l.bold, color: MUTED })
      x += c.width
    }
    l.y -= rowH
    l.rule()
    l.y -= 3
  }
  l.ensure(rowH * 3)
  drawHeader()
  for (const row of rows) {
    if (l.y - rowH < MARGIN + FOOTER_H) {
      l.newPage()
      drawHeader()
    }
    let x = MARGIN
    row.forEach((cell, i) => {
      l.text(l.fit(cell, columns[i].width - 6, size), x, size)
      x += columns[i].width
    })
    l.y -= rowH
  }
  l.y -= 6
}

function bloodPressure(l: Layout, data: ReportData) {
  l.heading('Blood pressure')
  const { systolic, diastolic, pulse } = data.averages
  if (data.bp.length === 0 || !systolic || !diastolic) {
    l.paragraph('No blood-pressure readings in this period.', { color: MUTED })
    return
  }
  l.paragraph(
    `Average ${fmt(systolic.mean)}/${fmt(diastolic.mean)} mmHg over ${systolic.count} ${systolic.count === 1 ? 'reading' : 'readings'} ` +
      `(systolic ${systolic.min}–${systolic.max}, diastolic ${diastolic.min}–${diastolic.max})` +
      (pulse ? `. Average pulse ${fmt(pulse.mean)} bpm over ${pulse.count}.` : '.'),
  )
  chart(l, data)
  const w = CONTENT_W
  table(
    l,
    [
      { title: 'Date', width: w * 0.15 },
      { title: 'Time', width: w * 0.09 },
      { title: 'BP (mmHg)', width: w * 0.13 },
      { title: 'Pulse', width: w * 0.08 },
      { title: 'Arm', width: w * 0.12 },
      { title: 'Position', width: w * 0.13 },
      { title: 'AHA category', width: w * 0.3 },
    ],
    data.bp.map((r) => [
      r.date,
      r.time,
      `${r.systolic}/${r.diastolic}`,
      r.pulse === undefined ? '' : String(r.pulse),
      r.arm,
      r.position,
      r.category,
    ]),
  )
  l.paragraph(`${BP_NOTE} Source: ${BP_SOURCE.title}, ${BP_SOURCE.url}`, { size: 8, color: MUTED })
}

function otherReadings(l: Layout, data: ReportData) {
  if (data.other.length === 0) return
  l.heading('Pulse, weight and glucose')
  const w = CONTENT_W
  table(
    l,
    [
      { title: 'Date', width: w * 0.18 },
      { title: 'Time', width: w * 0.12 },
      { title: 'Pulse (bpm)', width: w * 0.18 },
      { title: 'Weight', width: w * 0.24 },
      { title: 'Glucose', width: w * 0.28 },
    ],
    data.other.map((r) => [r.date, r.time, r.pulse === undefined ? '' : String(r.pulse), r.weight ?? '', r.glucose ?? '']),
  )
}

function footers(l: Layout) {
  const pages = l.doc.getPages()
  pages.forEach((page, i) => {
    const text = `${REPORT_TITLE} · ${REPORT_SUBTITLE} · Page ${i + 1} of ${pages.length}`
    page.drawText(text, { x: MARGIN, y: MARGIN - 12, size: 8, font: l.regular, color: MUTED })
  })
}

/** Builds the report as PDF bytes. */
export async function renderReportPdf(data: ReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`${REPORT_TITLE}, ${data.range.from} to ${data.range.to}`)
  doc.setSubject(REPORT_SUBTITLE)
  doc.setCreator('Carebook (freeappstore.online)')
  doc.setProducer('Carebook with pdf-lib')
  doc.setCreationDate(new Date(data.generatedAt))
  doc.setModificationDate(new Date(data.generatedAt))
  const l = new Layout(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold))
  header(l, data)
  medications(l, data)
  adherence(l, data)
  bloodPressure(l, data)
  otherReadings(l, data)
  footers(l)
  return doc.save()
}
