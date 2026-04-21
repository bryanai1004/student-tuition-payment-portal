import type { CSSProperties, ReactNode } from 'react'
import {
  TIMETABLE_ROW_HEIGHT_PX,
  type PlacedTimetableBlock,
  type TimetableLayoutSource,
} from '../../lib/timetableBlockLayout'
import { WEEKDAYS_FULL_ORDERED, type WeekdayFull } from '../../lib/weekdaySchedule'

export type TimetableWeekGridProps<T extends TimetableLayoutSource> = {
  placedWeekdays: PlacedTimetableBlock<T>[][]
  hourRows: number[]
  bodyHeightPx: number
  /** Column header for each weekday (i18n or plain). */
  weekdayLabel: (day: WeekdayFull) => string
  /** Left time-axis label for each hour row (e.g. 8 AM). */
  hourLabel: (hour: number) => string
  renderBlock: (block: PlacedTimetableBlock<T>, day: WeekdayFull) => ReactNode
  /** Extra class on root `.admin-timetable-v2` (e.g. portal-my-timetable-v2). */
  rootClassName?: string
}

/**
 * Shared Mon–Sun + time-axis shell and absolute-positioned day columns.
 * Callers supply `renderBlock` for course vs clinical (or admin) cell content.
 */
export function TimetableWeekGrid<T extends TimetableLayoutSource>({
  placedWeekdays,
  hourRows,
  bodyHeightPx,
  weekdayLabel,
  hourLabel,
  renderBlock,
  rootClassName,
}: TimetableWeekGridProps<T>) {
  const rootClass = ['admin-timetable-v2', rootClassName].filter(Boolean).join(' ')
  return (
    <div
      className={rootClass}
      style={
        {
          '--admin-tt-slot': `${TIMETABLE_ROW_HEIGHT_PX}px`,
        } as CSSProperties
      }
    >
      <div className="admin-timetable-v2__head">
        <div className="admin-timetable-v2__corner" aria-hidden />
        {WEEKDAYS_FULL_ORDERED.map((d) => (
          <div key={d} className="admin-timetable-v2__day-head">
            {weekdayLabel(d)}
          </div>
        ))}
      </div>
      <div className="admin-timetable-v2__main">
        <div
          className="admin-timetable-v2__times"
          style={{ height: bodyHeightPx }}
        >
          {hourRows.map((h) => (
            <div key={h} className="admin-timetable-v2__time-cell">
              {hourLabel(h)}
            </div>
          ))}
        </div>
        {WEEKDAYS_FULL_ORDERED.map((d, di) => (
          <div key={d} className="admin-timetable-v2__day-col">
            <div
              className="admin-timetable-v2__day-track"
              style={{ height: bodyHeightPx }}
            >
              {placedWeekdays[di]!.map((b) => renderBlock(b, d))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
