import type { EnrollmentHistoryRow } from './CourseFeedbackModal'

export function CourseFeedbackCell({
  row,
  onOpenSubmit,
  onOpenView,
}: {
  row: EnrollmentHistoryRow
  onOpenSubmit: (row: EnrollmentHistoryRow) => void
  onOpenView: (row: EnrollmentHistoryRow) => void
}) {
  const submitted = row.feedbackSubmitted === true

  if (!row.feedbackEligible) {
    return <span className="portal-text-muted">—</span>
  }

  if (!submitted) {
    return (
      <button
        type="button"
        className="portal-btn portal-btn--secondary portal-btn--compact"
        onClick={() => onOpenSubmit(row)}
      >
        Submit
      </button>
    )
  }

  return (
    <button
      type="button"
      className="portal-btn portal-btn--secondary portal-btn--compact"
      onClick={() => onOpenView(row)}
    >
      View
    </button>
  )
}
