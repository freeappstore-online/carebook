// Health-guardrail checks for Carebook's own copy (freeappstore-online/platform#256):
// no medical advice, diagnosis or dosing suggestions. Used by the
// banned-phrase test; kept separate so the rules can be tested themselves.

/** Words and phrases that read as diagnosis, treatment or dosing advice. */
export const BANNED: { phrase: string; pattern: RegExp }[] = [
  { phrase: 'diagnose / diagnosis', pattern: /\bdiagnos\w*/i },
  { phrase: 'treat / treatment', pattern: /\btreat(s|ed|ing|ment|ments)?\b/i },
  { phrase: 'cure', pattern: /\bcur(e|es|ed|ing|ative)\b/i },
  { phrase: 'safe dose', pattern: /\bsafe\s+(dose|dosage|amount)/i },
  { phrase: 'medical advice', pattern: /\bmedical\s+advice\b/i },
  { phrase: 'prescription', pattern: /\bprescri(be|bed|bes|bing|ption|ptions)\b/i },
  { phrase: 'recommended dose', pattern: /\brecommended\s+(dose|dosage)/i },
  { phrase: 'you should take / stop', pattern: /\bshould\s+(take|stop|increase|decrease|skip)\b/i },
  { phrase: 'increase / reduce your dose', pattern: /\b(increase|decrease|reduce|double)\s+(your|the)\s+(dose|dosage)/i },
]

/**
 * The guardrail disclaimers themselves, which must say what Carebook is not.
 * They're removed before checking, and only in these exact negated forms.
 */
export const ALLOWED_DISCLAIMERS: RegExp[] = [
  /doesn[’']t give medical advice, a diagnosis or dosing suggestions/gi,
  /doesn[’']t give medical advice/gi,
  /\bnot medical advice(,? or a diagnosis)?/gi,
  /\b(is|are) not a diagnosis/gi,
  /\baren[’']t a diagnosis/gi,
]

export interface Finding {
  phrase: string
  match: string
  text: string
}

/** Banned phrases in one piece of copy, after allowing the disclaimers. */
export function findBanned(text: string): Finding[] {
  let rest = text
  for (const allowed of ALLOWED_DISCLAIMERS) rest = rest.replace(allowed, ' ')
  const findings: Finding[] = []
  for (const { phrase, pattern } of BANNED) {
    const m = pattern.exec(rest)
    if (m) findings.push({ phrase, match: m[0], text })
  }
  return findings
}
