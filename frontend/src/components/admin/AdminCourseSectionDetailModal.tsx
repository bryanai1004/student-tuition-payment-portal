import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  downloadAdminRegisteredStudentsCsv,
  type AdminCourseSection,
} from '../../lib/api'
import { adminSchedulingQueryString } from '../../lib/adminSchedulingSearchParams'
import {
  getPreferredCourseTitle,
  getSecondaryCourseTitle,
  type CourseTitleFields,
} from '../../lib/courseDisplayName'
import { scheduleTrackDetailLabel } from '../../lib/scheduleTrack'
import { formatDeliveryModeForDisplay } from '../../lib/deliveryMode'
import { formatTimeRangeHmsForDisplay } from '../../lib/formatScheduleTime'
import { formatPrerequisiteCourseDisplay } from '../../lib/prerequisiteCourse'
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
  const [csvExporting, setCsvExporting] = useState(false)
  const [csvExportError, setCsvExportError] = useState<string | null>(null)

  useEffect(() => {
    setCsvExportError(null)
    setCsvExporting(false)
  }, [section?.id])

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
  const prerequisiteDisplay = formatPrerequisiteCourseDisplay({
    courseCode: section.prerequisite_course_code,
    courseTitle: section.prerequisite_course_title,
  })
  const selectedCourseCode = section.course_code.trim()
  const selectedAcademicTermId = academicTermId?.trim() ?? ''
  const courseSectionsSearch = (() => {
    if (selectedCourseCode === '' || selectedAcademicTermId === '') return null
    const query = adminSchedulingQueryString({
      term: selectedAcademicTermId,
      course: selectedCourseCode,
    })
    return query === '' ? null : `?${query}`
  })()

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
          {row('Prerequisite', prerequisiteDisplay ?? '—')}
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
        {csvExportError != null ? (
          <p
            className="portal-card-note portal-profile-state--error"
            role="alert"
          >
            {csvExportError}
          </p>
        ) : null}
        <div className="admin-section-detail-modal__actions">
          <button
            type="button"
            className="portal-btn portal-btn--secondary portal-btn--compact"
            disabled={csvExporting}
            onClick={() => {
              setCsvExportError(null)
              setCsvExporting(true)
              void (async () => {
                try {
                  await downloadAdminRegisteredStudentsCsv(section.id)
                } catch (e) {
                  setCsvExportError(
                    e instanceof Error ? e.message : 'CSV export failed.',
                  )
                } finally {
                  setCsvExporting(false)
                }
              })()
            }}
          >
            {csvExporting ? 'Exporting…' : 'Export CSV'}
          </button>
          {academicTermId != null &&
            academicTermId !== '' &&
            selectedCourseCode !== '' && (
              <Link
                to={{
                  pathname: '/admin/course-sections',
                  search: (() => {
                    const n = new URLSearchParams(returnSearch)
                    n.set('term', selectedAcademicTermId)
                    n.set('course', selectedCourseCode)
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
          {courseSectionsSearch != null ? (
            <Link
              to={{
                pathname: '/admin/course-sections',
                search: courseSectionsSearch,
              }}
              className="portal-btn portal-btn--secondary portal-btn--compact"
              onClick={onClose}
            >
              Course Sections
            </Link>
          ) : (
            <button
              type="button"
              className="portal-btn portal-btn--secondary portal-btn--compact"
              disabled
            >
              Course Sections
            </button>
          )}
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
