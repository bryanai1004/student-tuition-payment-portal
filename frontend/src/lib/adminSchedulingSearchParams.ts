/**
 * Shared admin Course Sections / Scheduling Timetable URL context (`term`, `course`, optional `q`).
 * Values are the query string without a leading `?`.
 */
export function adminSchedulingQueryString(params: {
  term: string
  course: string
  q?: string
}): string {
  const n = new URLSearchParams()
  const term = params.term.trim()
  const course = params.course.trim()
  const q = (params.q ?? '').trim()
  if (term) n.set('term', term)
  if (course) n.set('course', course)
  if (q) n.set('q', q)
  return n.toString()
}

export function applyAdminSchedulingToSearchParams(
  base: URLSearchParams,
  params: { term: string; course: string; q?: string },
  options?: { clearEdit?: boolean },
): URLSearchParams {
  const n = new URLSearchParams(base)
  const term = params.term.trim()
  const course = params.course.trim()
  const q = (params.q ?? '').trim()
  if (term) n.set('term', term)
  else n.delete('term')
  if (course) n.set('course', course)
  else n.delete('course')
  if (q) n.set('q', q)
  else n.delete('q')
  if (options?.clearEdit) n.delete('edit')
  return n
}
