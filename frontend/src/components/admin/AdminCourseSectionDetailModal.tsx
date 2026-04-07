import { Link } from 'react-router-dom'
import type { AdminCourseSection } from '../../lib/api'
import {
  getPreferredCourseTitle,
  getSecondaryCourseTitle,
  type CourseTitleFields,
} from '../../lib/courseDisplayName'
import { scheduleTrackDetailLabel } from '../../lib/scheduleTrack'
import { formatDeliveryModeForDisplay } from '../../lib/deliveryMode'
import { formatTimeRangeHmsForDisplay } from '../../lib/formatScheduleTime'
import { formatWeekdaysLongFromStored } from '../../lib/weekdaySchedule'

type Props = {
  section: AdminCourseSection | null
  /** Catalog names for `section.course_code`, when available */
  courseCatalog?: CourseTitleFields | null
  /** e.g. timetable column day, for context */
  dayColumnLabel?: string | null
  /** Resolved catalog label for selected term, if available */
  termCatalogLabel?: string | null
  /** Current timetable term filter — enables deep link to edit on Course Sections */
  academicTermId?: string | null
  /** Current page query string (no `?`) — preserved on links back to Course Sections */
  returnSearch?: string
  onClose: () => void
}

function row(dt: string, dd: string) {
  return (
    <div>
      <dt>{dt}</dt>
      <dd>{dd}</dd>
    </div>
  )
}

export function AdminCourseSectionDetailModal({
  section,
  courseCatalog = null,
  dayColumnLabel,
  termCatalogLabel,
  academicTermId,
  returnSearch = '',
  onClose,
}: Props) {
  if (section == null) return null

  const titleFields: CourseTitleFields = {
    code: section.course_code,
    eng_name: courseCatalog?.eng_name ?? null,
    chi_name: courseCatalog?.chi_name ?? null,
  }
  const courseTitlePrimary = getPreferredCourseTitle(
    titleFields,
    section.schedule_track,
  )
  const courseTitleAlternate = getSecondaryCourseTitle(
    titleFields,
    section.schedule_track,
  )

  const termLine =
    termCatalogLabel?.trim() ||
    [section.term, section.year].filter(Boolean).join(' ') ||
    '—'

  return (
    <div
      className="admin-section-detail-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="admin-section-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-section-detail-title"
      >
        <h2 id="admin-section-detail-title" className="admin-section-detail-modal__title">
          {section.course_code} · {section.section_code}
        </h2>
        {dayColumnLabel != null && dayColumnLabel !== '' && (
          <p className="admin-section-detail-modal__meta">
            Column: {dayColumnLabel}
          </p>
        )}
        <dl className="admin-section-detail-modal__dl">
          {row('Course code', section.course_code)}
          {row('Course title', courseTitlePrimary)}
          {courseTitleAlternate !== ''
            ? row('Alternate title', courseTitleAlternate)
            : null}
          {row('Timetable track', scheduleTrackDetailLabel(section.schedule_track))}
          {row('Section code', section.section_code)}
          {row('Academic term', termLine)}
          {row('Weekdays', formatWeekdaysLongFromStored(section.weekday))}
          {row(
            'Time',
            formatTimeRangeHmsForDisplay(section.start_time, section.end_time),
          )}
          {row('Delivery mode', formatDeliveryModeForDisplay(section.delivery_mode))}
          {row('Room', section.room?.trim() ? section.room : '—')}
          {row('Instructor', section.instructor?.trim() ? section.instructor : '—')}
          {row('Notes', section.notes?.trim() ? section.notes : '—')}
        </dl>
        <div className="admin-section-detail-modal__actions">
          {academicTermId != null &&
            academicTermId !== '' &&
            section.course_code.trim() !== '' && (
              <Link
                to={{
                  pathname: '/admin/course-sections',
                  search: (() => {
                    const n = new URLSearchParams(returnSearch)
                    n.set('term', academicTermId)
                    n.set('course', section.course_code.trim())
                    n.set('edit', String(section.id))
                    const s = n.toString()
                    return s ? `?${s}` : ''
                  })(),
                }}
                className="portal-btn portal-btn--secondary portal-btn--compact"
                onClick={onClose}
              >
                Edit section
              </Link>
            )}
          <Link
            to={{
              pathname: '/admin/course-sections',
              search: returnSearch.trim() ? `?${returnSearch.trim()}` : '',
            }}
            className="portal-btn portal-btn--secondary portal-btn--compact"
            onClick={onClose}
          >
            Course Sections
          </Link>
          <button
            type="button"
            className="portal-btn portal-btn--primary portal-btn--compact"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
