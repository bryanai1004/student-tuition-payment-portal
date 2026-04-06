/**
 * Timetable geometry: one absolute-positioned block per section × weekday.
 * `topPx` / `heightPx` are linear in minutes from `TIMETABLE_START_HOUR`, so a single
 * class (e.g. 12:00–15:30) is one vertical span, not one cell per clock hour.
 * Overlaps on the same day get greedy column packing (`colIndex` / `colCount`).
 */
import type { AdminCourseSection } from './api'
import {
  parseStoredWeekdaysToFullNames,
  weekdayFullToGridIndex,
} from './weekdaySchedule'

export const TIMETABLE_START_HOUR = 8
export const TIMETABLE_END_HOUR = 21
/** One row = one hour [H, H+1); height drives block geometry. */
export const TIMETABLE_ROW_HEIGHT_PX = 52

function timeToMinutes(t: string | null | undefined): number | null {
  if (t == null || String(t).trim() === '') return null
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(String(t).trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) {
    return null
  }
  return h * 60 + min
}

export function timetableGridBoundsMinutes(): {
  gridStartMin: number
  gridEndMin: number
  totalMin: number
} {
  const gridStartMin = TIMETABLE_START_HOUR * 60
  const gridEndMin = (TIMETABLE_END_HOUR + 1) * 60
  return {
    gridStartMin,
    gridEndMin,
    totalMin: gridEndMin - gridStartMin,
  }
}

export type TimetableDayInstance = {
  section: AdminCourseSection
  dayIndex: number
  /** Clipped to grid, absolute minutes from midnight */
  startMin: number
  endMin: number
}

export type PlacedTimetableBlock = TimetableDayInstance & {
  topPx: number
  heightPx: number
  colIndex: number
  colCount: number
}

/**
 * One row per section × weekday with times clipped to the visible grid.
 */
export function expandSectionsToDayInstances(
  sections: readonly AdminCourseSection[],
): TimetableDayInstance[] {
  const { gridStartMin, gridEndMin } = timetableGridBoundsMinutes()
  const out: TimetableDayInstance[] = []
  for (const sec of sections) {
    const s = timeToMinutes(sec.start_time)
    const e = timeToMinutes(sec.end_time)
    if (s == null || e == null || e <= s) continue
    const cs = Math.max(s, gridStartMin)
    const ce = Math.min(e, gridEndMin)
    if (ce <= cs) continue
    const days = parseStoredWeekdaysToFullNames(sec.weekday)
    for (const d of days) {
      const di = weekdayFullToGridIndex(d)
      out.push({ section: sec, dayIndex: di, startMin: cs, endMin: ce })
    }
  }
  return out
}

/**
 * Greedy column assignment per day; overlapping intervals sit in different columns.
 * All blocks for the day share colCount = number of columns used that day.
 */
function placeInstancesForDay(
  instances: TimetableDayInstance[],
): PlacedTimetableBlock[] {
  if (instances.length === 0) return []
  const sorted = [...instances].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin,
  )
  const colLastEnd: number[] = []
  const withCol: (TimetableDayInstance & { colIndex: number })[] = []
  for (const inst of sorted) {
    let col = colLastEnd.findIndex((end) => end <= inst.startMin)
    if (col === -1) {
      col = colLastEnd.length
      colLastEnd.push(inst.endMin)
    } else {
      colLastEnd[col] = inst.endMin
    }
    withCol.push({ ...inst, colIndex: col })
  }
  const colCount = Math.max(1, colLastEnd.length)
  const { gridStartMin } = timetableGridBoundsMinutes()
  return withCol.map((inst) => {
    const offsetMin = inst.startMin - gridStartMin
    const durMin = inst.endMin - inst.startMin
    const topPx = (offsetMin / 60) * TIMETABLE_ROW_HEIGHT_PX
    const heightPx = Math.max(
      (durMin / 60) * TIMETABLE_ROW_HEIGHT_PX,
      4,
    )
    return {
      ...inst,
      topPx,
      heightPx,
      colIndex: inst.colIndex,
      colCount,
    }
  })
}

/** Blocks grouped by weekday column index 0–6, with geometry + overlap columns. */
export function buildTimetablePlacedBlocksByDay(
  sections: readonly AdminCourseSection[],
): PlacedTimetableBlock[][] {
  const byDay: TimetableDayInstance[][] = Array.from({ length: 7 }, () => [])
  for (const inst of expandSectionsToDayInstances(sections)) {
    byDay[inst.dayIndex]!.push(inst)
  }
  return byDay.map((list) => placeInstancesForDay(list))
}

export function timetableBodyHeightPx(): number {
  const n = TIMETABLE_END_HOUR - TIMETABLE_START_HOUR + 1
  return n * TIMETABLE_ROW_HEIGHT_PX
}
