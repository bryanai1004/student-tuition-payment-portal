import type { CourseBinItem } from './CourseBinContext'
import {
  clearStudentCourseBinForTerm,
  deleteStudentCourseBinItem,
  fetchStudentCourseBin,
  upsertStudentCourseBinItem,
  type CourseBinApiItem,
} from '../../lib/api'

function normalizeTrack(track: 'EN' | 'CN' | undefined): 'EN' | 'CN' {
  return track === 'CN' ? 'CN' : 'EN'
}

export function courseBinItemToUpsertBody(
  item: CourseBinItem,
  academicTermId: string,
): Record<string, unknown> {
  return {
    academic_term_id: academicTermId.trim(),
    course_code: item.course_code.trim(),
    section: item.section.trim(),
    schedule_track: normalizeTrack(item.schedule_track),
    session: item.session,
    type: item.type,
    units: item.units,
    registered: item.registered,
    time: item.time,
    days: item.days,
    instructor: item.instructor,
    location: item.location,
    eng_name: item.eng_name,
    chi_name: item.chi_name,
    prerequisite_course_id: item.prerequisite_course_id ?? null,
    prerequisite_course_code: item.prerequisite_course_code ?? null,
    prerequisite_course_title: item.prerequisite_course_title ?? null,
    schedule_weekday: item.schedule_weekday ?? null,
    schedule_start_time: item.schedule_start_time ?? null,
    schedule_end_time: item.schedule_end_time ?? null,
  }
}

export function apiItemToCourseBinItem(row: CourseBinApiItem): CourseBinItem {
  return {
    id: row.id,
    course_code: row.course_code,
    eng_name: row.eng_name ?? '',
    chi_name: row.chi_name ?? '',
    prerequisite_course_id: row.prerequisite_course_id,
    prerequisite_course_code: row.prerequisite_course_code,
    prerequisite_course_title: row.prerequisite_course_title,
    units: row.units ?? '',
    section: row.section,
    schedule_track: row.schedule_track === 'CN' ? 'CN' : 'EN',
    session: row.session ?? '',
    type: row.type ?? '',
    registered: row.registered_display ?? '',
    time: row.time_display ?? '',
    days: row.days_display ?? '',
    instructor: row.instructor ?? '',
    location: row.location ?? '',
    schedule_weekday: row.schedule_weekday,
    schedule_start_time: row.schedule_start_time,
    schedule_end_time: row.schedule_end_time,
  }
}

export async function loadCourseBinFromServer(
  studentId: string,
  academicTermId: string,
  options?: { signal?: AbortSignal },
): Promise<CourseBinItem[]> {
  const rows = await fetchStudentCourseBin(studentId, academicTermId, options)
  return rows.map(apiItemToCourseBinItem)
}

export async function saveCourseBinItemToServer(
  studentId: string,
  item: CourseBinItem,
  academicTermId: string,
  options?: { signal?: AbortSignal },
): Promise<CourseBinItem> {
  const saved = await upsertStudentCourseBinItem(
    studentId,
    courseBinItemToUpsertBody(item, academicTermId),
    options,
  )
  return apiItemToCourseBinItem(saved)
}

export async function removeCourseBinItemFromServer(
  studentId: string,
  itemId: number,
  options?: { signal?: AbortSignal },
): Promise<void> {
  await deleteStudentCourseBinItem(studentId, itemId, options)
}

export async function clearCourseBinOnServer(
  studentId: string,
  academicTermId: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  await clearStudentCourseBinForTerm(studentId, academicTermId, options)
}

/** One-time: push legacy localStorage rows to the server when DB is empty. */
export async function syncLocalCourseBinToServer(
  studentId: string,
  academicTermId: string,
  localItems: CourseBinItem[],
): Promise<CourseBinItem[]> {
  for (const item of localItems) {
    await saveCourseBinItemToServer(studentId, item, academicTermId)
  }
  return loadCourseBinFromServer(studentId, academicTermId)
}
