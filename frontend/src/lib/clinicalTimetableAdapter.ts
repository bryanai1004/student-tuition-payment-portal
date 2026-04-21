import type { ClinicalOfferedTimetableSlot } from './api'
import type { TimetableLayoutSource } from './timetableBlockLayout'

/**
 * One row per `clinic_timetable` slot, shaped for {@link buildPlacedBlocksByDayForLayout}
 * plus display-only fields for clinical blocks (clinic name, faculty, seats line).
 */
export type ClinicalTimetableLayoutRow = TimetableLayoutSource & {
  id: number
  timetableId: number
  clinicDisplayName: string
  facultyDisplay: string | null
  seatsDisplay: string | null
}

function withSecondsHm(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (s === '') return null
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return null
  return `${m[1]!.padStart(2, '0')}:${m[2]}:00`
}

function formatSeatsLine(slot: ClinicalOfferedTimetableSlot): string | null {
  if (slot.capacity != null && slot.capacity > 0) {
    return `${slot.enrolledCount} / ${slot.capacity}`
  }
  return null
}

function clinicNameFromSlot(slot: ClinicalOfferedTimetableSlot): string {
  const site = slot.site?.trim()
  if (site) return site
  const code = slot.slotCode?.trim()
  if (code) return code
  const label = slot.slotLabel?.trim()
  return label !== '' ? label : 'Clinic'
}

/**
 * Maps API clinical offered slots into layout rows for the shared week timetable grid.
 * Drops rows without parsable times or empty weekday (same rules as course placement).
 */
export function clinicalOfferedSlotsToLayoutRows(
  slots: readonly ClinicalOfferedTimetableSlot[],
): ClinicalTimetableLayoutRow[] {
  const out: ClinicalTimetableLayoutRow[] = []
  for (const s of slots) {
    const weekday = String(s.weekday ?? '').trim()
    if (weekday === '') continue
    const start_time = withSecondsHm(s.startTime)
    const end_time = withSecondsHm(s.endTime)
    if (start_time == null || end_time == null) continue
    out.push({
      id: s.id,
      timetableId: s.id,
      weekday,
      start_time,
      end_time,
      clinicDisplayName: clinicNameFromSlot(s),
      facultyDisplay: s.instructor?.trim() ? s.instructor.trim() : null,
      seatsDisplay: formatSeatsLine(s),
    })
  }
  return out
}
