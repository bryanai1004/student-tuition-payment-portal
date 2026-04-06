import type { ClinicTranscriptRow, CourseTranscriptLookupEntry } from "../repositories/studentTranscriptRepository.js";
import type { MarksRow } from "../repositories/studentAcademicsRepository.js";
import type { StudentAcademicCourseRecord, StudentAcademicCourseStatus, StudentAcademicsAvailableTerm, StudentAcademicsEnrollmentItem, StudentAcademicsScheduleItem, StudentAcademicsTranscriptItem } from "../types/studentAcademics.js";
import type { StudentTranscriptRow } from "../types/studentTranscript.js";
import type { ScheduleRow } from "../types/studentAccount.js";
/** Fall > Summer > Spring > Winter > other (matches legacy `marks` ORDER BY). */
export declare function termSortOrder(term: string): number;
export declare function termsMatch(a: string, b: string): boolean;
export declare function formatMysqlTime(v: unknown): string | null;
export declare function nullableStr(s: string): string | null;
export declare function numericGradeFromDb(v: unknown): number | null;
export declare function transcriptGrade(grade: string): string | null;
/**
 * Withdrawn only when legacy `marks.grade` / `clinic.grade` matches a known withdrawal token.
 * No separate dropped column in legacy schema — `dropped` is reserved and not emitted here.
 */
export declare function isLegacyWithdrawalGrade(gradeRaw: string): boolean;
export declare function inferAcademicCourseStatus(args: {
    term: string;
    year: number;
    activeTerm: {
        term: string;
        year: number;
    } | null;
    gradeDisplay: string | null;
    numericGrade: number | null;
}): StudentAcademicCourseStatus;
export declare function resolveActiveTermFromMarksOrder(rows: MarksRow[]): {
    term: string;
    year: number;
} | null;
/** Same “latest term” semantics as `resolveActiveTermFromMarksOrder` (records follow `marks` sort order). */
export declare function resolveActiveTermFromCourseRecords(records: Pick<StudentAcademicCourseRecord, "term" | "year">[]): {
    term: string;
    year: number;
} | null;
/** True when this legacy `marks` row has a final recorded outcome (grade) or a withdrawal. */
export declare function marksRowAcademicallyClosed(m: MarksRow): boolean;
/**
 * Academic “current” quarter: the legacy registration term only while it is not fully concluded on
 * `marks`. If there are no rows yet for that term, the term is still treated as active (schedule may
 * be empty). If every row for that term is closed, returns null (e.g. graduated / term complete).
 */
export declare function resolveRegistrationAnchoredAcademicTerm(registrationTerm: {
    term: string;
    year: number;
} | null, marks: MarksRow[]): {
    term: string;
    year: number;
} | null;
export declare function normalizeEnglishTitle(code: string, rawTitle: string, lookup: Map<string, CourseTranscriptLookupEntry>): string;
/** Prefer English catalog title; otherwise legacy `marks.course_title` / `clinic.course_title`. */
export declare function resolveCourseDisplayTitle(code: string, legacyTitle: string, lookup: Map<string, CourseTranscriptLookupEntry>): string;
export declare function isClinicalCourse(courseCode: string, courseTitle: string): boolean;
export declare function isClinicalMarksRow(r: MarksRow): boolean;
export declare function marksRowToAcademicCourseRecord(studentId: string, r: MarksRow, activeTerm: {
    term: string;
    year: number;
} | null, courseTitle: string): StudentAcademicCourseRecord;
export declare function clinicRowToAcademicCourseRecord(studentId: string, r: ClinicTranscriptRow, courseTitle: string, activeTerm: {
    term: string;
    year: number;
} | null): StudentAcademicCourseRecord;
export declare function buildAcademicCourseRecordsFromMarks(studentId: string, rows: MarksRow[], activeTerm?: {
    term: string;
    year: number;
} | null): StudentAcademicCourseRecord[];
/**
 * Same as `buildAcademicCourseRecordsFromMarks` but resolves display titles via `courses` lookup (transcript preview).
 */
export declare function buildAcademicCourseRecordsFromMarksWithLookup(studentId: string, rows: MarksRow[], lookup: Map<string, CourseTranscriptLookupEntry>, activeTerm?: {
    term: string;
    year: number;
} | null): StudentAcademicCourseRecord[];
/** When clinic rows are merged with marks, reuse marks-derived active term for status on both sources. */
export declare function buildAcademicCourseRecordsFromClinicWithLookupAndActiveTerm(studentId: string, rows: ClinicTranscriptRow[], lookup: Map<string, CourseTranscriptLookupEntry>, activeTerm: {
    term: string;
    year: number;
} | null): StudentAcademicCourseRecord[];
export declare function buildAvailableTermsFromCourseRecords(records: Pick<StudentAcademicCourseRecord, "term" | "year">[]): StudentAcademicsAvailableTerm[];
export declare function courseRecordToScheduleItem(r: StudentAcademicCourseRecord): StudentAcademicsScheduleItem;
export declare function courseRecordToTranscriptItem(r: StudentAcademicCourseRecord): StudentAcademicsTranscriptItem;
export declare function courseRecordToEnrollmentItem(r: StudentAcademicCourseRecord, feedback?: {
    submitted: boolean;
    submittedAt: string | null;
}): StudentAcademicsEnrollmentItem;
export declare function academicCourseRecordToTranscriptPreviewRow(r: StudentAcademicCourseRecord): StudentTranscriptRow;
export declare function sortTranscriptPreviewRecords(rows: StudentAcademicCourseRecord[]): void;
/** Prefer the newer of legacy registration vs latest portal enrollment (by year, then term). */
export declare function pickNewerRegistrationAnchor(legacy: {
    term: string;
    year: number;
} | null, portal: {
    term: string;
    year: number;
} | null): {
    term: string;
    year: number;
} | null;
export declare function portalEnrollmentRowToAcademicCourseRecord(studentId: string, row: {
    course_code: string;
    course_title_raw: string;
    term: string;
    year: number;
    units: number | null;
    weekday: string | null;
    start_time: unknown;
    end_time: unknown;
    instructor: string | null;
}, courseTitle: string, activeTerm: {
    term: string;
    year: number;
} | null): StudentAcademicCourseRecord;
/** Skip a portal row when legacy marks already show a completed grade for the same course/term. */
export declare function legacyCompletedBlocksPortalRow(legacyRecords: StudentAcademicCourseRecord[], courseCode: string, term: string, year: number): boolean;
/** Legacy account `scheduleRows` from normalized academic records (marks-sourced rows). */
export declare function scheduleRowFromAcademicCourseRecord(r: StudentAcademicCourseRecord): ScheduleRow;
export declare function scheduleRowsFromAcademicCourseRecords(records: StudentAcademicCourseRecord[]): ScheduleRow[];
//# sourceMappingURL=studentAcademicCourseRecords.d.ts.map