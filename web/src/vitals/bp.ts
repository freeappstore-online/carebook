// Blood-pressure categories, as neutral labels for a single reading.
//
// Source: the American Heart Association's "Understanding Blood Pressure
// Readings" chart, which follows the 2017 ACC/AHA guideline (Whelton PK et al.,
// Hypertension. 2018;71:e13–e115). The names are the AHA's own. They describe
// one reading only, are shown in plain text with no colours or alerts, and are
// not a diagnosis.
//
// A reading takes the higher category of its two numbers, as the chart does
// ("and" for normal and elevated, "or" above that).

export const BP_CATEGORIES = ['normal', 'elevated', 'stage1', 'stage2', 'crisis'] as const
export type BpCategory = (typeof BP_CATEGORIES)[number]

export const BP_CATEGORY_LABELS: Record<BpCategory, string> = {
  normal: 'Normal',
  elevated: 'Elevated',
  stage1: 'High blood pressure stage 1',
  stage2: 'High blood pressure stage 2',
  crisis: 'Hypertensive crisis',
}

/** The chart's ranges, for the About page. */
export const BP_CATEGORY_RANGES: Record<BpCategory, string> = {
  normal: 'Systolic below 120 and diastolic below 80',
  elevated: 'Systolic 120–129 and diastolic below 80',
  stage1: 'Systolic 130–139 or diastolic 80–89',
  stage2: 'Systolic 140 or higher or diastolic 90 or higher',
  crisis: 'Systolic higher than 180 and/or diastolic higher than 120',
}

export const BP_SOURCE = {
  title: 'American Heart Association, “Understanding Blood Pressure Readings”',
  guideline: '2017 ACC/AHA guideline (Whelton PK et al., Hypertension. 2018;71:e13–e115)',
  url: 'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings',
} as const

export const BP_NOTE =
  'Category names are from the American Heart Association chart (2017 ACC/AHA guideline). They describe a single reading and are not a diagnosis. Log and share with your clinician.'

function systolicCategory(sys: number): BpCategory {
  if (sys > 180) return 'crisis'
  if (sys >= 140) return 'stage2'
  if (sys >= 130) return 'stage1'
  if (sys >= 120) return 'elevated'
  return 'normal'
}

function diastolicCategory(dia: number): BpCategory {
  if (dia > 120) return 'crisis'
  if (dia >= 90) return 'stage2'
  if (dia >= 80) return 'stage1'
  // Diastolic alone never makes a reading "elevated".
  return 'normal'
}

/** The category of one reading (whole mmHg), or undefined without both numbers. */
export function bpCategory(systolic: number | undefined, diastolic: number | undefined): BpCategory | undefined {
  if (systolic === undefined || diastolic === undefined) return undefined
  const s = systolicCategory(systolic)
  const d = diastolicCategory(diastolic)
  return BP_CATEGORIES.indexOf(s) >= BP_CATEGORIES.indexOf(d) ? s : d
}
