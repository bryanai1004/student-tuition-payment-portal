/**
 * Canonical delivery modes for admin course sections (display + form select).
 * Legacy DB strings that do not match are shown as-is where needed.
 */

export const DELIVERY_MODE_OPTIONS = [
  'In Person',
  'Hybrid',
  'Online',
  'Clinical',
  'Lab',
] as const

export type DeliveryModeOption = (typeof DELIVERY_MODE_OPTIONS)[number]

const LOWER_TO_CANONICAL: Record<string, DeliveryModeOption> = {
  'in person': 'In Person',
  'in-person': 'In Person',
  inperson: 'In Person',
  onsite: 'In Person',
  'on-site': 'In Person',
  'face to face': 'In Person',
  f2f: 'In Person',
  hybrid: 'Hybrid',
  online: 'Online',
  remote: 'Online',
  zoom: 'Online',
  clinical: 'Clinical',
  lab: 'Lab',
}

/** Map stored value to canonical option, or null if unknown / empty. */
export function canonicalDeliveryMode(
  raw: string | null | undefined,
): DeliveryModeOption | null {
  if (raw == null || String(raw).trim() === '') return null
  const key = String(raw).trim().toLowerCase()
  return LOWER_TO_CANONICAL[key] ?? null
}

/** Table / timetable: unified label; unknown non-empty → trimmed original. */
export function formatDeliveryModeForDisplay(
  raw: string | null | undefined,
): string {
  if (raw == null || String(raw).trim() === '') return '—'
  return canonicalDeliveryMode(raw) ?? String(raw).trim()
}

/** True if value matches a known option (case-insensitive). */
export function isKnownDeliveryMode(raw: string | null | undefined): boolean {
  return canonicalDeliveryMode(raw) != null
}
