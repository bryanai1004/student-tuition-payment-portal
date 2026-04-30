import { useState } from 'react'
import type { CourseCatalogItem } from '../../../lib/api'
import {
  catalogCategory,
  courseCatalogTitle,
  formatCatalogCredits,
} from './courseCatalogDisplay'
import { EditCatalogCourseModal } from './EditCatalogCourseModal'

type AllCoursesTableProps = {
  rows: CourseCatalogItem[]
  loading: boolean
  error: string | null
  onCourseSaved?: () => void
}

export function AllCoursesTable({
  rows,
  loading,
  error,
  onCourseSaved,
}: AllCoursesTableProps) {
  const [editing, setEditing] = useState<CourseCatalogItem | null>(null)

  if (error) {
    return (
      <p className="admin-courses-feedback admin-courses-feedback--error" role="alert">
        {error}
      </p>
    )
  }

  if (loading) {
    return (
      <p className="portal-text-muted admin-courses-feedback" aria-live="polite">
        Loading courses…
      </p>
    )
  }

  if (rows.length === 0) {
    return (
      <p className="portal-text-muted admin-courses-feedback" aria-live="polite">
        No courses match your search.
      </p>
    )
  }

  return (
    <>
      {editing != null ? (
        <EditCatalogCourseModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            onCourseSaved?.()
          }}
        />
      ) : null}
      <div className="portal-table-wrap admin-table-wrap">
        <table className="portal-table portal-data-table">
          <thead>
            <tr>
              <th scope="col">Course Code</th>
              <th scope="col">Course Title</th>
              <th scope="col">Credits</th>
              <th scope="col">Category</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.sequence_number ?? 'x'}-${r.code}`}>
                <td>{r.code}</td>
                <td>{courseCatalogTitle(r)}</td>
                <td>{formatCatalogCredits(r.units)}</td>
                <td>{catalogCategory(r)}</td>
                <td>—</td>
                <td>
                  <button
                    type="button"
                    className="portal-btn portal-btn--secondary portal-btn--compact"
                    onClick={() => setEditing(r)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
