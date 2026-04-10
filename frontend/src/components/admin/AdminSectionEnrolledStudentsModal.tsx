import { useEffect, useState } from 'react'
import {
  deleteAdminPortalEnrollment,
  fetchAdminCourseSectionEnrollments,
  type AdminCourseSection,
  type AdminCourseSectionEnrollmentRow,
} from '../../lib/api'

type Props = {
  section: AdminCourseSection
  academicTermId: string
  /** Called after a successful removal so the parent can refresh section data. */
  onEnrollmentRemoved: () => void
  onClose: () => void
}

function academicStatusLabel(status: string): string {
  const s = status.trim().toLowerCase()
  if (s === 'withdrawn') return 'Withdrawn'
  if (s === 'active') return 'Active'
  if (s === 'completed') return 'Completed'
  if (s === 'dropped') return 'Dropped'
  if (s === 'unknown' || s === '') return '—'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

/**
 * Lists students enrolled via `portal_enrollments` for this course + term (all statuses),
 * using the same enrollment source as student Academics.
 */
export function AdminSectionEnrolledStudentsModal({
  section,
  academicTermId,
  onEnrollmentRemoved,
  onClose,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<AdminCourseSectionEnrollmentRow[]>(
    [],
  )

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setLoadError(null)
    void (async () => {
      try {
        const rows = await fetchAdminCourseSectionEnrollments({
          academicTermId: academicTermId.trim(),
          courseCode: section.course_code.trim(),
          courseSectionId: section.id,
          signal: ac.signal,
        })
        if (!ac.signal.aborted) setStudents(rows)
      } catch (e) {
        if (ac.signal.aborted) return
        setLoadError(
          e instanceof Error ? e.message : 'Could not load enrollments.',
        )
        setStudents([])
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [academicTermId, section.course_code, section.id])

  const onRemove = async (studentId: string) => {
    setError(null)
    setBusyId(studentId)
    try {
      const res = await deleteAdminPortalEnrollment({
        studentId,
        academic_term_id: academicTermId.trim(),
        course_section_id: section.id,
      })
      if (res.removedCount < 1) {
        setError('No enrollment row was removed (already removed or not found).')
        return
      }
      onEnrollmentRemoved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed.')
    } finally {
      setBusyId(null)
    }
  }

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
        aria-labelledby="admin-enrolled-students-title"
      >
        <h2
          id="admin-enrolled-students-title"
          className="admin-section-detail-modal__title"
        >
          Enrolled students · {section.course_code}
        </h2>
        <p className="portal-text-muted admin-form-hint" style={{ marginTop: 0 }}>
          Registrations are stored per course and term in{' '}
          <code className="admin-code">portal_enrollments</code>, not per section. Removing a student
          drops their course enrollment for this term; counts on all sections for this course will
          update together.
        </p>
        {error != null && (
          <p className="admin-form-message" role="alert">
            {error}
          </p>
        )}
        {loadError != null && (
          <p className="admin-form-message" role="alert">
            {loadError}
          </p>
        )}
        {loading ? (
          <p className="portal-text-muted">Loading enrollments…</p>
        ) : students.length === 0 && loadError == null ? (
          <p className="portal-text-muted">No students listed for this course in this term.</p>
        ) : loadError == null ? (
          <div className="portal-table-wrap admin-table-wrap" style={{ marginTop: '0.75rem' }}>
            <table className="portal-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Student ID</th>
                  <th scope="col">Status</th>
                  <th scope="col">Grade</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.studentId}>
                    <td>{s.name?.trim() ? s.name.trim() : '—'}</td>
                    <td>
                      <code className="admin-code">{s.studentId}</code>
                    </td>
                    <td>{academicStatusLabel(s.status)}</td>
                    <td>{s.grade ?? '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="portal-btn portal-btn--secondary portal-btn--compact"
                        disabled={
                          busyId != null || s.status.trim().toLowerCase() === 'withdrawn'
                        }
                        onClick={() => void onRemove(s.studentId)}
                      >
                        {busyId === s.studentId ? 'Removing…' : 'Remove registration'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="admin-section-detail-modal__actions">
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
