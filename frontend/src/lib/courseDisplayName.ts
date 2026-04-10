/** Minimal course fields for bilingual display (catalog or CourseBin). */
export type CourseTitleFields = {
  code?: string | number | null | undefined
  eng_name?: string | number | null | undefined
  chi_name?: string | number | null | undefined
}

function trimStr(v: string | number | null | undefined): string {
  if (v == null) return ''
  return String(v).trim()
}

/** Legacy items without `schedule_track` behave as English timetable (EN). */
export function normalizeScheduleTrack(
  track: 'EN' | 'CN' | undefined | null,
): 'EN' | 'CN' {
  return track === 'CN' ? 'CN' : 'EN'
}

/**
 * Preferred visible course title for a section’s timetable track.
 * CN: chi_name → eng_name → course_code
 * EN: eng_name → chi_name → course_code
 */
export function getPreferredCourseTitle(
  course: CourseTitleFields,
  scheduleTrack: 'EN' | 'CN' | undefined | null,
): string {
  const code = trimStr(course.code)
  const eng = trimStr(course.eng_name)
  const chi = trimStr(course.chi_name)
  const track = normalizeScheduleTrack(scheduleTrack)
  if (track === 'CN') {
    if (chi !== '') return chi
    if (eng !== '') return eng
    return code !== '' ? code : '—'
  }
  if (eng !== '') return eng
  if (chi !== '') return chi
  return code !== '' ? code : '—'
}

/** The other-language title when it differs from the preferred title. */
export function getSecondaryCourseTitle(
  course: CourseTitleFields,
  scheduleTrack: 'EN' | 'CN' | undefined | null,
): string {
  const track = normalizeScheduleTrack(scheduleTrack)
  const eng = trimStr(course.eng_name)
  const chi = trimStr(course.chi_name)
  const primary = getPreferredCourseTitle(course, scheduleTrack)
  if (track === 'CN') {
    if (eng !== '' && eng !== primary) return eng
    return ''
  }
  if (chi !== '' && chi !== primary) return chi
  return ''
}

/**
 * Deterministic catalog title: Chinese first, then English, then course code.
 * Use when the UI must match legacy `courses` admin resolution (not timetable track).
 */
export function chineseFirstCourseTitle(
  course: CourseTitleFields,
): string {
  const code = trimStr(course.code)
  const eng = trimStr(course.eng_name)
  const chi = trimStr(course.chi_name)
  if (chi !== '') return chi
  if (eng !== '') return eng
  return code !== '' ? code : '—'
}

/** Course picker: `CODE — English / 中文`. */
export function formatCourseCatalogSelectLabel(course: CourseTitleFields): string {
  const code = trimStr(course.code)
  const eng = trimStr(course.eng_name)
  const chi = trimStr(course.chi_name)
  if (eng !== '' && chi !== '' && eng !== chi) {
    return `${code} — ${eng} / ${chi}`
  }
  if (eng !== '') return `${code} — ${eng}`
  if (chi !== '') return `${code} — ${chi}`
  return code !== '' ? code : '—'
}
