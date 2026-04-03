export const ADMIN_GENDER_SELECT_VALUES = [
  'Male',
  'Female',
  'Other',
] as const

export const ADMIN_HIGHEST_DEGREE_VALUES = [
  'High School',
  'Associate',
  'Bachelor',
  'Master',
  'Doctor',
] as const

const GENDER_SET = new Set<string>(ADMIN_GENDER_SELECT_VALUES)
const DEGREE_LOWER = new Map(
  ADMIN_HIGHEST_DEGREE_VALUES.map((v) => [v.toLowerCase(), v]),
)

/** Map legacy / free-text values to a canonical select value, or "" for blank / unknown. */
export function genderToSelectValue(raw: string | null | undefined): string {
  if (raw == null) return ''
  const t = raw.trim()
  if (t === '') return ''
  if (GENDER_SET.has(t)) return t
  const l = t.toLowerCase()
  if (l === 'm' || l === 'male') return 'Male'
  if (l === 'f' || l === 'female') return 'Female'
  if (l === 'other' || l === 'o') return 'Other'
  return ''
}

export function highestDegreeToSelectValue(
  raw: string | null | undefined,
): string {
  if (raw == null) return ''
  const t = raw.trim()
  if (t === '') return ''
  const canon = DEGREE_LOWER.get(t.toLowerCase())
  if (canon) return canon
  for (const v of ADMIN_HIGHEST_DEGREE_VALUES) {
    if (v === t) return v
  }
  return ''
}
