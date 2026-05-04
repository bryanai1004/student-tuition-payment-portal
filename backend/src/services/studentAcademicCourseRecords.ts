/**
 * AcademicAttempt = raw academic result row (`marks` + `clinic` when used for transcript-shaped data).
 * NOT equal to transcript (display read model in `studentTranscriptService`).
 * NOT equal to degree progress (`computeDegreeAudit` in `domain/studentDomainModels.ts`).
 *
 * **RegistrationRecord** (`source: "portal"` on {@link StudentAcademicCourseRecord}): `portal_enrollments` +
 * `course_sections` — not a `marks` outcome; grades stay null until posted in legacy marks.
 *
 * Clinic-sourced rows: transcript display only — do not fold into earned didactic units for degree audit.
 */

import type {
  ClinicTranscriptRow,
  CourseTranscriptLookupEntry,
} from "../repositories/studentTranscriptRepository.js";
import type { MarksRow } from "../repositories/studentAcademicsRepository.js";
import type {
  StudentAcademicCourseRecord,
  StudentAcademicCourseStatus,
  StudentAcademicsAvailableTerm,
  StudentAcademicsEnrollmentItem,
  StudentAcademicsScheduleItem,
  StudentAcademicsTranscriptItem,
} from "../types/studentAcademics.js";
import type { StudentTranscriptRow } from "../types/studentTranscript.js";
import type { ScheduleRow } from "../types/studentAccount.js";
import type { PortalEnrollmentAcademicRow } from "../repositories/studentEnrollmentRepository.js";

const MIN_TERM_YEAR = 1900;
const MAX_TERM_YEAR = 2100;

/** Fall > Summer > Spring > Winter > other (matches legacy `marks` ORDER BY). */
export function termSortOrder(term: string): number {
  switch (term.trim().toUpperCase()) {
    case "FALL":
      return 4;
    case "SUMMER":
      return 3;
    case "SPRING":
      return 2;
    case "WINTER":
      return 1;
    default:
      return 0;
  }
}

export function termsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function formatMysqlTime(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) return null;
    // mysql2 maps MySQL TIME to a Date; wall clock is in local components, not UTC ISO time.
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
  }
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export function nullableStr(s: string): string | null {
  return s.length > 0 ? s : null;
}

export function numericGradeFromDb(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function transcriptGrade(grade: string): string | null {
  return grade.length > 0 ? grade : null;
}

/**
 * Withdrawn only when legacy `marks.grade` / `clinic.grade` matches a known withdrawal token.
 * No separate dropped column in legacy schema — `dropped` is reserved and not emitted here.
 */
export function isLegacyWithdrawalGrade(gradeRaw: string): boolean {
  const g = gradeRaw.trim().toUpperCase();
  if (g === "") return false;
  if (g === "W" || g === "WD" || g === "W/D") return true;
  if (/^W[\s\-/]?D$/i.test(gradeRaw.trim())) return true;
  return false;
}

const NON_FINAL_LETTER_GRADES = new Set(["IP", "INC", "I"]);

function hasCompletedSignal(
  gradeDisplay: string | null,
  numericGrade: number | null,
): boolean {
  if (numericGrade != null) return true;
  if (gradeDisplay == null) return false;
  const u = gradeDisplay.trim().toUpperCase();
  if (u === "") return false;
  if (NON_FINAL_LETTER_GRADES.has(u)) return false;
  return true;
}

export function inferAcademicCourseStatus(args: {
  term: string;
  year: number;
  activeTerm: { term: string; year: number } | null;
  gradeDisplay: string | null;
  numericGrade: number | null;
}): StudentAcademicCourseStatus {
  const { term, year, activeTerm, gradeDisplay, numericGrade } = args;
  const letter = gradeDisplay?.trim() ?? "";
  if (isLegacyWithdrawalGrade(letter)) return "withdrawn";

  if (hasCompletedSignal(gradeDisplay, numericGrade)) return "completed";

  if (
    activeTerm != null &&
    year === activeTerm.year &&
    termsMatch(term, activeTerm.term)
  ) {
    return "active";
  }

  return "unknown";
}

export function resolveActiveTermFromMarksOrder(
  rows: MarksRow[],
): { term: string; year: number } | null {
  if (rows.length === 0) return null;
  const first = rows[0]!;
  const term = first.term.trim();
  const year = first.year;
  if (
    term.length === 0 ||
    !Number.isFinite(year) ||
    year < MIN_TERM_YEAR ||
    year > MAX_TERM_YEAR
  ) {
    return null;
  }
  return { term: first.term, year };
}

/** Same “latest term” semantics as `resolveActiveTermFromMarksOrder` (records follow `marks` sort order). */
export function resolveActiveTermFromCourseRecords(
  records: Pick<StudentAcademicCourseRecord, "term" | "year">[],
): { term: string; year: number } | null {
  if (records.length === 0) return null;
  const first = records[0]!;
  const term = first.term.trim();
  const year = first.year;
  if (
    term.length === 0 ||
    !Number.isFinite(year) ||
    year < MIN_TERM_YEAR ||
    year > MAX_TERM_YEAR
  ) {
    return null;
  }
  return { term: first.term, year };
}

/** True when this legacy `marks` row has a final recorded outcome (grade) or a withdrawal. */
export function marksRowAcademicallyClosed(m: MarksRow): boolean {
  const letter = m.grade?.trim() ?? "";
  if (isLegacyWithdrawalGrade(letter)) return true;
  const gradeDisplay = transcriptGrade(m.grade);
  const numericGrade = numericGradeFromDb(m.grade2);
  return hasCompletedSignal(gradeDisplay, numericGrade);
}

/**
 * Academic “current” quarter: the legacy registration term only while it is not fully concluded on
 * `marks`. If there are no rows yet for that term, the term is still treated as active (schedule may
 * be empty). If every row for that term is closed, returns null (e.g. graduated / term complete).
 */
export function resolveRegistrationAnchoredAcademicTerm(
  registrationTerm: { term: string; year: number } | null,
  marks: MarksRow[],
): { term: string; year: number } | null {
  if (registrationTerm == null) return null;
  const term = registrationTerm.term.trim();
  const year = Math.trunc(Number(registrationTerm.year));
  if (
    term.length === 0 ||
    !Number.isFinite(year) ||
    year < MIN_TERM_YEAR ||
    year > MAX_TERM_YEAR
  ) {
    return null;
  }
  const inTerm = marks.filter(
    (m) => m.year === year && termsMatch(m.term, term),
  );
  if (inTerm.length === 0) {
    return { term: registrationTerm.term, year };
  }
  const allClosed = inTerm.every((m) => marksRowAcademicallyClosed(m));
  if (allClosed) return null;
  return { term: registrationTerm.term, year };
}

/**
 * Same as {@link resolveRegistrationAnchoredAcademicTerm}, but if every `marks` row for the term is
 * academically closed while the student still has at least one **active** portal enrollment in that
 * term, keep the term active (timetable/dashboard use portal enrollments).
 */
export function resolveRegistrationAnchoredAcademicTermConsideringPortal(
  registrationTerm: { term: string; year: number } | null,
  marks: MarksRow[],
  portalEnrollments: Pick<PortalEnrollmentAcademicRow, "term" | "year" | "status">[],
): { term: string; year: number } | null {
  const base = resolveRegistrationAnchoredAcademicTerm(registrationTerm, marks);
  if (base != null) return base;
  if (registrationTerm == null) return null;
  const year = Math.trunc(Number(registrationTerm.year));
  if (
    !Number.isFinite(year) ||
    year < MIN_TERM_YEAR ||
    year > MAX_TERM_YEAR
  ) {
    return null;
  }
  const hasActivePortal = portalEnrollments.some(
    (p) =>
      p.year === year &&
      termsMatch(p.term, registrationTerm.term) &&
      p.status === "active",
  );
  return hasActivePortal
    ? { term: registrationTerm.term, year: registrationTerm.year }
    : null;
}

export function normalizeEnglishTitle(
  code: string,
  rawTitle: string,
  lookup: Map<string, CourseTranscriptLookupEntry>,
): string {
  const key = code.trim();
  if (key === "") return rawTitle.trim();
  const entry = lookup.get(key);
  const eng = entry?.eng_name?.trim();
  if (eng && eng.length > 0) return eng;
  return rawTitle.trim();
}

/** Prefer English catalog title; otherwise legacy `marks.course_title` / `clinic.course_title`. */
export function resolveCourseDisplayTitle(
  code: string,
  legacyTitle: string,
  lookup: Map<string, CourseTranscriptLookupEntry>,
): string {
  return normalizeEnglishTitle(code, legacyTitle, lookup);
}

export function isClinicalCourse(courseCode: string, courseTitle: string): boolean {
  return (
    /clinic|clinical|internship/i.test(courseTitle) || /^CLIN/i.test(courseCode)
  );
}

export function isClinicalMarksRow(r: MarksRow): boolean {
  return isClinicalCourse(r.code, r.course_title);
}

/** Source of truth: legacy `marks` → domain `AcademicAttempt` with `source: "marks"`. */
export function marksRowToAcademicCourseRecord(
  studentId: string,
  r: MarksRow,
  activeTerm: { term: string; year: number } | null,
  courseTitle: string,
): StudentAcademicCourseRecord {
  const gradeDisplay = transcriptGrade(r.grade);
  const numericGrade = numericGradeFromDb(r.grade2);
  const status = inferAcademicCourseStatus({
    term: r.term,
    year: r.year,
    activeTerm,
    gradeDisplay,
    numericGrade,
  });

  return {
    studentId,
    courseCode: r.code,
    courseTitle,
    term: r.term,
    year: r.year,
    credits: Number.isFinite(r.units) ? r.units : null,
    instructor: nullableStr(r.instructor),
    days: r.days,
    timeFrom: formatMysqlTime(r.time_from),
    timeTo: formatMysqlTime(r.time_to),
    grade: gradeDisplay,
    numericGrade,
    status,
    source: "marks",
  };
}

/**
 * Source of truth: legacy `clinic` table → attempt-shaped row for **transcript display** only (`source: "clinic"`).
 * Do not merge these rows into academic unit totals for degree audit.
 */
export function clinicRowToAcademicCourseRecord(
  studentId: string,
  r: ClinicTranscriptRow,
  courseTitle: string,
  activeTerm: { term: string; year: number } | null,
): StudentAcademicCourseRecord {
  const gradeDisplay = transcriptGrade(r.grade);
  const numericGrade = numericGradeFromDb(r.grade2);
  const status = inferAcademicCourseStatus({
    term: r.term,
    year: r.year,
    activeTerm,
    gradeDisplay,
    numericGrade,
  });

  return {
    studentId,
    courseCode: r.code,
    courseTitle,
    term: r.term,
    year: r.year,
    credits: Number.isFinite(r.units) ? r.units : null,
    instructor: null,
    days: null,
    timeFrom: null,
    timeTo: null,
    grade: gradeDisplay,
    numericGrade,
    status,
    source: "clinic",
  };
}

export function buildAcademicCourseRecordsFromMarks(
  studentId: string,
  rows: MarksRow[],
  activeTerm?: { term: string; year: number } | null,
): StudentAcademicCourseRecord[] {
  const resolved: { term: string; year: number } | null =
    activeTerm === undefined ? resolveActiveTermFromMarksOrder(rows) : activeTerm;
  return rows.map((r) =>
    marksRowToAcademicCourseRecord(studentId, r, resolved, r.course_title.trim()),
  );
}

/**
 * Same as `buildAcademicCourseRecordsFromMarks` but resolves display titles via `courses` lookup (transcript preview).
 */
export function buildAcademicCourseRecordsFromMarksWithLookup(
  studentId: string,
  rows: MarksRow[],
  lookup: Map<string, CourseTranscriptLookupEntry>,
  activeTerm?: { term: string; year: number } | null,
): StudentAcademicCourseRecord[] {
  const resolved: { term: string; year: number } | null =
    activeTerm === undefined ? resolveActiveTermFromMarksOrder(rows) : activeTerm;
  return rows.map((r) =>
    marksRowToAcademicCourseRecord(
      studentId,
      r,
      resolved,
      resolveCourseDisplayTitle(r.code, r.course_title, lookup),
    ),
  );
}

/** When clinic rows are merged with marks, reuse marks-derived active term for status on both sources. */
export function buildAcademicCourseRecordsFromClinicWithLookupAndActiveTerm(
  studentId: string,
  rows: ClinicTranscriptRow[],
  lookup: Map<string, CourseTranscriptLookupEntry>,
  activeTerm: { term: string; year: number } | null,
): StudentAcademicCourseRecord[] {
  return rows.map((r) =>
    clinicRowToAcademicCourseRecord(
      studentId,
      r,
      resolveCourseDisplayTitle(r.code, r.course_title, lookup),
      activeTerm,
    ),
  );
}

export function buildAvailableTermsFromCourseRecords(
  records: Pick<StudentAcademicCourseRecord, "term" | "year">[],
): StudentAcademicsAvailableTerm[] {
  const byKey = new Map<string, { term: string; year: number }>();
  for (const r of records) {
    const term = r.term.trim();
    const year = r.year;
    if (
      term.length === 0 ||
      !Number.isFinite(year) ||
      year < MIN_TERM_YEAR ||
      year > MAX_TERM_YEAR
    ) {
      continue;
    }
    const key = `${term.toLowerCase()}|${year}`;
    if (!byKey.has(key)) {
      byKey.set(key, { term, year });
    }
  }
  const list = [...byKey.values()];
  list.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return termSortOrder(b.term) - termSortOrder(a.term);
  });
  return list.map(({ term, year }) => ({
    term,
    year,
    label: `${term} ${year}`,
  }));
}

export function courseRecordToScheduleItem(
  r: StudentAcademicCourseRecord,
): StudentAcademicsScheduleItem {
  return {
    courseCode: r.courseCode,
    courseTitle: r.courseTitle,
    days: r.days,
    timeFrom: r.timeFrom,
    timeTo: r.timeTo,
    instructor: r.instructor,
    term: r.term,
    year: r.year,
    credits: r.credits,
    status: r.status,
  };
}

export function courseRecordToTranscriptItem(
  r: StudentAcademicCourseRecord,
): StudentAcademicsTranscriptItem {
  return {
    courseCode: r.courseCode,
    courseTitle: r.courseTitle,
    term: r.term,
    year: r.year,
    grade: r.grade,
    numericGrade: r.numericGrade,
    credits: r.credits,
  };
}

export function courseRecordToEnrollmentItem(
  r: StudentAcademicCourseRecord,
  feedback?: { submitted: boolean; submittedAt: string | null },
): StudentAcademicsEnrollmentItem {
  return {
    registrationId: r.registrationId,
    sectionId: r.sectionId ?? null,
    sectionCode: r.sectionCode ?? null,
    courseCode: r.courseCode,
    displayedCourseTitle: r.courseTitle,
    courseTitle: r.courseTitle,
    term: r.term,
    year: r.year,
    academicTermId: r.academicTermId ?? null,
    withdrawDeadline: r.withdrawDeadline ?? null,
    scheduleTrack: r.scheduleTrack ?? null,
    canWithdraw: r.canWithdraw ?? false,
    credits: r.credits,
    grade: r.grade,
    status: r.status,
    instructor: r.instructor,
    feedbackEligible: r.status === "completed",
    feedbackSubmitted: feedback?.submitted ?? false,
    feedbackSubmittedAt: feedback?.submittedAt ?? null,
  };
}

export function academicCourseRecordToTranscriptPreviewRow(
  r: StudentAcademicCourseRecord,
): StudentTranscriptRow {
  return {
    courseCode: r.courseCode,
    courseTitle: r.courseTitle,
    term: r.term,
    year: r.year,
    grade: r.grade,
    numericGrade: r.numericGrade,
    credits: r.credits,
    source: r.source,
    status: r.status,
    feedbackEligible: r.status === "completed",
  };
}

const SOURCE_SORT_RANK: Record<StudentAcademicCourseRecord["source"], number> =
  { marks: 0, portal: 1, clinic: 2 };

export function sortTranscriptPreviewRecords(
  rows: StudentAcademicCourseRecord[],
): void {
  rows.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    const td = termSortOrder(b.term) - termSortOrder(a.term);
    if (td !== 0) return td;
    const c = a.courseCode.localeCompare(b.courseCode, undefined, {
      sensitivity: "base",
    });
    if (c !== 0) return c;
    const secA = (a.sectionCode ?? "").trim().toLowerCase();
    const secB = (b.sectionCode ?? "").trim().toLowerCase();
    if (secA !== secB) return secA.localeCompare(secB);
    const trA = (a.scheduleTrack ?? "").trim().toLowerCase();
    const trB = (b.scheduleTrack ?? "").trim().toLowerCase();
    if (trA !== trB) return trA.localeCompare(trB);
    const idA = a.portalEnrollmentRowId ?? 0;
    const idB = b.portalEnrollmentRowId ?? 0;
    if (idA !== idB) return idA - idB;
    return SOURCE_SORT_RANK[a.source] - SOURCE_SORT_RANK[b.source];
  });
}

/** Prefer the newer of legacy registration vs latest portal enrollment (by year, then term). */
export function pickNewerRegistrationAnchor(
  legacy: { term: string; year: number } | null,
  portal: { term: string; year: number } | null,
): { term: string; year: number } | null {
  if (legacy == null) return portal;
  if (portal == null) return legacy;
  if (legacy.year !== portal.year) {
    return legacy.year > portal.year ? legacy : portal;
  }
  return termSortOrder(legacy.term) >= termSortOrder(portal.term)
    ? legacy
    : portal;
}

/**
 * Source of truth: `portal_enrollments` + `course_sections` slice → domain `RegistrationRecord` shape on
 * `StudentAcademicCourseRecord` (`source: "portal"`). Not a `marks` outcome — grades stay null.
 */
export function portalEnrollmentRowToAcademicCourseRecord(
  studentId: string,
  row: PortalEnrollmentAcademicRow,
  courseTitle: string,
  activeTerm: { term: string; year: number } | null,
): StudentAcademicCourseRecord {
  const sectionCode = row.section_code;
  const scheduleTrack = row.schedule_track;
  const portalEnrollmentRowId = row.portal_enrollment_id;

  /**
   * Withdrawn portal rows show grade **W** and do not contribute earned credits to program-progress
   * (only `status === "completed"` marks rows count). GPA helpers exclude **W** from grade-point averages.
   */
  if (row.status === "withdrawn") {
    return {
      studentId,
      registrationId: row.registration_id,
      sectionId: row.course_section_id,
      courseCode: row.course_code,
      courseTitle,
      term: row.term,
      year: row.year,
      academicTermId: row.academic_term_id,
      withdrawDeadline: row.withdraw_deadline,
      canWithdraw: false,
      credits: row.units,
      instructor: nullableStr(row.instructor ?? ""),
      days: row.weekday,
      timeFrom: formatMysqlTime(row.start_time),
      timeTo: formatMysqlTime(row.end_time),
      grade: "W",
      numericGrade: null,
      status: "withdrawn",
      source: "portal",
      sectionCode,
      scheduleTrack,
      portalEnrollmentRowId,
    };
  }

  const status = inferAcademicCourseStatus({
    term: row.term,
    year: row.year,
    activeTerm,
    gradeDisplay: null,
    numericGrade: null,
  });

  return {
    studentId,
    registrationId: row.registration_id,
    sectionId: row.course_section_id,
    courseCode: row.course_code,
    courseTitle,
    term: row.term,
    year: row.year,
    academicTermId: row.academic_term_id,
    withdrawDeadline: row.withdraw_deadline,
    canWithdraw: row.can_withdraw,
    credits: row.units,
    instructor: nullableStr(row.instructor ?? ""),
    days: row.weekday,
    timeFrom: formatMysqlTime(row.start_time),
    timeTo: formatMysqlTime(row.end_time),
    grade: null,
    numericGrade: null,
    status,
    source: "portal",
    sectionCode,
    scheduleTrack,
    portalEnrollmentRowId,
  };
}

/** Skip a portal row when legacy marks already show a completed grade for the same course/term. */
export function legacyCompletedBlocksPortalRow(
  legacyRecords: StudentAcademicCourseRecord[],
  courseCode: string,
  term: string,
  year: number,
): boolean {
  const c = courseCode.trim().toLowerCase();
  return legacyRecords.some(
    (r) =>
      r.year === year &&
      termsMatch(r.term, term) &&
      r.courseCode.trim().toLowerCase() === c &&
      r.status === "completed",
  );
}

/** Legacy account `scheduleRows` from normalized academic records (marks-sourced rows). */
export function scheduleRowFromAcademicCourseRecord(
  r: StudentAcademicCourseRecord,
): ScheduleRow {
  const clinical = isClinicalCourse(r.courseCode, r.courseTitle);
  const tf = r.timeFrom;
  const tt = r.timeTo;
  const dayPart = r.days?.trim() ?? "";
  let scheduleText = "";
  if (tf && tt) {
    scheduleText = dayPart ? `${dayPart}, ${tf}–${tt}` : `${tf}–${tt}`;
  } else {
    scheduleText = dayPart || "—";
  }
  const instructor = r.instructor?.trim() ?? "";
  const units = r.credits;
  return {
    courseCode: r.courseCode,
    title: r.courseTitle,
    type: clinical ? "clinical" : "didactic",
    units: clinical ? null : units != null && units > 0 ? units : null,
    hours: clinical ? (units != null && units > 0 ? units : null) : null,
    charge: 0,
    schedule: scheduleText || null,
    location: null,
    instructor: instructor.length > 0 ? instructor : null,
  };
}

export function scheduleRowsFromAcademicCourseRecords(
  records: StudentAcademicCourseRecord[],
): ScheduleRow[] {
  return records.map(scheduleRowFromAcademicCourseRecord);
}
