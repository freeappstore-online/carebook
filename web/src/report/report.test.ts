import { describe, expect, it } from 'vitest'
import { pdfPagesText, pdfText } from '../test/pdfText'
import { REPORT_DISCLAIMER, buildReportData, checkRange, reportFileName } from './data'
import { INPUT, MEDS } from './fixtures'
import { ADHERENCE_EXPLAINED, renderReportPdf } from './pdf'

describe('buildReportData', () => {
  const data = buildReportData(INPUT)

  it('lists medications that overlap the range, with their own adherence', () => {
    expect(data.medications.map((m) => m.name)).toEqual(['Medication Alpha', 'Medication Beta'])
    const alpha = data.medications[0]
    expect(alpha).toMatchObject({ strength: '10 mg', form: 'Tablet', schedule: 'Every day at 08:00 and 20:00', dates: 'From 2026-10-13' })
    expect(alpha.adherence).toMatchObject({ due: 7, taken: 4, skipped: 1, snoozed: 1, missed: 1, upcoming: 1, percent: 57 })
    expect(data.medications[1]).toMatchObject({ asNeeded: true, adherence: { due: 0, asNeededTaken: 1, percent: null } })
  })

  it('sums adherence over every scheduled medication', () => {
    expect(data.adherence).toMatchObject({ due: 7, taken: 4, percent: 57, asNeededTaken: 1, daysWithDoses: 4, daysAllTaken: 1 })
  })

  it('tabulates blood pressure in time order with neutral AHA labels, and other readings apart', () => {
    expect(data.bp.map((r) => [r.date, `${r.systolic}/${r.diastolic}`, r.category])).toEqual([
      ['2026-10-14', '118/76', 'Normal'],
      ['2026-10-15', '134/86', 'High blood pressure stage 1'],
      ['2026-10-16', '142/91', 'High blood pressure stage 2'],
    ])
    expect(data.bp[0]).toMatchObject({ pulse: 62, arm: 'Left arm', position: 'Sitting' })
    expect(data.other).toEqual([
      { date: '2026-10-15', time: '21:00', glucose: '5.8 mmol/L' },
      { date: '2026-10-16', time: '07:40', weight: '72.4 kg' },
    ])
    expect(data.averages.systolic).toMatchObject({ count: 3, min: 118, max: 142 })
  })

  it('checks the range', () => {
    expect(checkRange({ from: '2026-10-10', to: '2026-10-16' })).toBeNull()
    expect(checkRange({ from: '2026-10-16', to: '2026-10-10' })).toMatch(/before/)
    expect(checkRange({ from: '', to: '2026-10-10' })).toMatch(/Choose/)
    expect(checkRange({ from: '2010-01-01', to: '2026-10-10' })).toMatch(/shorter/)
    expect(() => buildReportData({ ...INPUT, range: { from: '2026-10-16', to: '2026-10-10' } })).toThrow(RangeError)
    expect(reportFileName(INPUT.range)).toBe('carebook-log-2026-10-10-to-2026-10-16.pdf')
  })
})

describe('renderReportPdf', () => {
  it('is a PDF', async () => {
    const bytes = await renderReportPdf(buildReportData(INPUT))
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(new TextDecoder().decode(bytes.slice(-6))).toMatch(/%%EOF/)
  })

  it('contains the header, medication list, adherence, BP table and guardrail copy', async () => {
    // Wrapped lines come back as separate strings; join them to compare sentences.
    const text = (await pdfText(await renderReportPdf(buildReportData(INPUT)))).replace(/\n/g, ' ')
    for (const expected of [
      'Carebook health log',
      'Log and share with your clinician',
      REPORT_DISCLAIMER,
      'Period: 2026-10-10 to 2026-10-16. Created 2026-10-16 12:00 (Europe/London).',
      // Medications.
      'Medications',
      'Medication Alpha',
      '10 mg · Tablet',
      'Every day at 08:00 and 20:00. From 2026-10-13.',
      'Adherence: 57% (4 of 7 due doses logged as taken; 1 skipped, 1 snoozed, 1 not logged)',
      'Notes: With breakfast and dinner',
      'Medication Beta',
      'As needed: 1 dose logged in this period.',
      // Adherence summary.
      'Adherence',
      '57%',
      'Every due dose taken on 1 of 4 days with doses due.',
      'As-needed doses logged: 1.',
      // Blood pressure: summary, chart legend and table.
      'Blood pressure',
      'Average 131/84 mmHg over 3 readings (systolic 118–142, diastolic 76–91). Average pulse 66 bpm over 2.',
      'Systolic',
      'Diastolic (mmHg)',
      'BP (mmHg)',
      'AHA category',
      '118/76',
      '134/86',
      '142/91',
      'High blood pressure stage 1',
      'Left arm',
      // Other readings.
      'Pulse, weight and glucose',
      '5.8 mmol/L',
      '72.4 kg',
    ]) {
      expect(text).toContain(expected)
    }
    // The notes say "not a diagnosis", cite the guideline and explain the %.
    expect(text).toContain('not a diagnosis')
    expect(text).toContain('2017 ACC/AHA guideline')
    expect(text).toContain(ADHERENCE_EXPLAINED)
    // Out-of-range data stays out.
    expect(text).not.toContain('Stopped Gamma')
    expect(text).not.toContain('200/130')
  })

  it('has no advice wording', async () => {
    const text = await pdfText(await renderReportPdf(buildReportData(INPUT)))
    expect(text).not.toMatch(/\b(should|must|recommend|diagnose|treat|cure|safe dose|seek|emergency|warning)\b/i)
  })

  it('numbers every page in its footer and paginates long tables', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      ...INPUT.readings[0],
      id: `bulk${i}`,
      takenAt: INPUT.readings[0].takenAt + i * 60_000,
      time: `07:${String(i % 60).padStart(2, '0')}`,
      systolic: 110 + (i % 30),
    }))
    const pages = await pdfPagesText(await renderReportPdf(buildReportData({ ...INPUT, readings: many })))
    expect(pages.length).toBeGreaterThan(2)
    pages.forEach((page, i) => {
      expect(page).toContain(`Carebook health log · Log and share with your clinician · Page ${i + 1} of ${pages.length}`)
    })
    // The table header repeats on continued pages.
    expect(pages[pages.length - 1]).toContain('AHA category')
  })

  it('handles an empty period and text the standard fonts can’t show', async () => {
    const data = buildReportData({
      ...INPUT,
      medications: [{ ...MEDS[0], name: 'Лекарство Ω test' }],
      logs: [],
      readings: [],
    })
    const text = await pdfText(await renderReportPdf(data))
    expect(text).toContain('????????? ? test')
    expect(text).toContain('No blood-pressure readings in this period.')
    expect(text).not.toContain('Pulse, weight and glucose')
  })
})
