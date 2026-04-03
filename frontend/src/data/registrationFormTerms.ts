/** Quarters supported by the registration form UI (aligned with academic terms). */
export const REGISTRATION_QUARTERS = [
  'Winter',
  'Spring',
  'Summer',
  'Fall',
] as const

export type RegistrationQuarter = (typeof REGISTRATION_QUARTERS)[number]

export function normalizeQuarterLabel(raw: string): RegistrationQuarter | null {
  const t = raw.trim().toLowerCase()
  if (t === 'winter' || t.startsWith('win')) return 'Winter'
  if (t === 'spring' || t.startsWith('spr')) return 'Spring'
  if (t === 'summer' || t.startsWith('sum')) return 'Summer'
  if (t === 'fall' || t.startsWith('fal')) return 'Fall'
  return null
}

export function termsMatchQuarter(term: string, quarter: RegistrationQuarter): boolean {
  const n = normalizeQuarterLabel(term)
  return n === quarter
}

/** Calendar-ish default when transcript has no valid terms. */
export function defaultQuarterFromDate(d = new Date()): RegistrationQuarter {
  const m = d.getMonth() + 1
  if (m === 12 || m === 1 || m === 2) return 'Winter'
  if (m >= 3 && m <= 5) return 'Spring'
  if (m >= 6 && m <= 8) return 'Summer'
  return 'Fall'
}

export function buildRegistrationYearOptions(transcriptYears: number[]): number[] {
  const y = new Date().getFullYear()
  const set = new Set<number>()
  for (let i = y - 2; i <= y + 2; i += 1) set.add(i)
  for (const ty of transcriptYears) {
    if (Number.isFinite(ty)) set.add(Math.trunc(ty))
  }
  return Array.from(set).sort((a, b) => b - a)
}
