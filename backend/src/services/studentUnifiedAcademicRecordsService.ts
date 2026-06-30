/**
 * Single merge of marks + portal + clinic into {@link StudentAcademicCourseRecord}.
 * Consumed by academics, transcript-preview, program-progress, and graduation.
 */

import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool } from "../lib/db.js";
import {
  getLegacyStudentDisplayName,
  listMarksForStudent,
  type MarksRow,
} from "../repositories/studentAcademicsRepository.js";
import { findLatestLegacyTermYear } from "../repositories/studentLegacyAccountRepository.js";
import {
  findLatestPortalEnrollmentTermYear,
  getPortalStudentDisplayName,
  listPortalEnrollmentRowsForStudentAcademics,
  type PortalEnrollmentAcademicRow,
} from "../repositories/studentEnrollmentRepository.js";
import {
  listClinicRowsForStudent,
  loadCoursesTranscriptLookup,
  type ClinicTranscriptRow,
} from "../repositories/studentTranscriptRepository.js";
import type { StudentAcademicCourseRecord } from "../types/studentAcademics.js";
import {
  buildAcademicCourseRecordsFromClinicWithLookupAndActiveTerm,
  buildAcademicCourseRecordsFromMarksWithLookup,
  legacyCompletedBlocksPortalRow,
  pickNewerRegistrationAnchor,
  portalEnrollmentRowToAcademicCourseRecord,
  resolveActiveEnrollmentTerm,
  sortTranscriptPreviewRecords,
} from "./studentAcademicCourseRecords.js";
import { getCourseEquivalencyIndex } from "./courseEquivalencyService.js";

export type UnifiedStudentAcademicContext = {
  studentId: string;
  studentName: string;
  courseRecords: StudentAcademicCourseRecord[];
  latestRegistration: { term: string; year: number } | null;
  activeTerm: { term: string; year: number } | null;
  portalEnrollmentRows: PortalEnrollmentAcademicRow[];
  marksRows: MarksRow[];
  clinicRows: ClinicTranscriptRow[];
};

function resolveStudentDisplayName(
  studentId: string,
  marksRows: MarksRow[],
  clinicRows: ClinicTranscriptRow[],
): string {
  const fromMarks = marksRows[0]?.name?.trim() ?? "";
  if (fromMarks.length > 0) return fromMarks;
  const fromClinic = clinicRows[0]?.name?.trim() ?? "";
  if (fromClinic.length > 0) return fromClinic;
  return studentId;
}

export function buildUnifiedCourseRecordsFromSources(args: {
  studentId: string;
  marksRows: MarksRow[];
  clinicRows: ClinicTranscriptRow[];
  portalRows: PortalEnrollmentAcademicRow[];
  courseLookup: Map<string, import("../repositories/studentTranscriptRepository.js").CourseTranscriptLookupEntry>;
  activeTerm: { term: string; year: number } | null;
  equiv?: import("./courseEquivalencyService.js").CourseEquivalencyIndex | null;
}): StudentAcademicCourseRecord[] {
  const {
    studentId,
    marksRows,
    clinicRows,
    portalRows,
    courseLookup,
    activeTerm,
    equiv = null,
  } = args;

  const legacyCourseRecords =
    marksRows.length > 0
      ? buildAcademicCourseRecordsFromMarksWithLookup(
          studentId,
          marksRows,
          courseLookup,
          activeTerm,
        )
      : [];

  const portalCourseRecords = portalRows
    .filter(
      (p) =>
        !legacyCompletedBlocksPortalRow(
          legacyCourseRecords,
          p.course_code,
          p.term,
          p.year,
          equiv,
        ),
    )
    .map((p) =>
      portalEnrollmentRowToAcademicCourseRecord(
        studentId,
        p,
        p.display_course_title.length > 0
          ? p.display_course_title
          : p.course_title_raw.length > 0
            ? p.course_title_raw
            : p.course_code,
        activeTerm,
      ),
    );

  const clinicCourseRecords =
    clinicRows.length > 0
      ? buildAcademicCourseRecordsFromClinicWithLookupAndActiveTerm(
          studentId,
          clinicRows,
          courseLookup,
          activeTerm,
        )
      : [];

  const merged = [
    ...legacyCourseRecords,
    ...portalCourseRecords,
    ...clinicCourseRecords,
  ];
  sortTranscriptPreviewRecords(merged);
  return merged;
}

export async function loadUnifiedStudentAcademicContext(
  studentId: string,
): Promise<UnifiedStudentAcademicContext | null> {
  const trimmed = studentId.trim();
  if (trimmed === "" || trimmed === DEMO_STUDENT_ID) {
    return null;
  }

  const [marksRows, clinicRows, courseLookup, latestLegacy, latestPortal, portalRows, equiv] =
    await Promise.all([
      listMarksForStudent(pool, trimmed),
      listClinicRowsForStudent(pool, trimmed),
      loadCoursesTranscriptLookup(pool),
      findLatestLegacyTermYear(pool, trimmed),
      findLatestPortalEnrollmentTermYear(trimmed),
      listPortalEnrollmentRowsForStudentAcademics(trimmed),
      getCourseEquivalencyIndex(),
    ]);

  const latestRegistration = pickNewerRegistrationAnchor(latestLegacy, latestPortal);
  const activeTerm = resolveActiveEnrollmentTerm(
    latestRegistration,
    marksRows,
    portalRows,
  );

  let studentName = resolveStudentDisplayName(trimmed, marksRows, clinicRows);
  if (studentName === trimmed) {
    const legacyName = await getLegacyStudentDisplayName(pool, trimmed);
    if (legacyName != null) studentName = legacyName;
    else {
      const pn = await getPortalStudentDisplayName(trimmed);
      if (pn != null) studentName = pn;
    }
  }

  const courseRecords = buildUnifiedCourseRecordsFromSources({
    studentId: trimmed,
    marksRows,
    clinicRows,
    portalRows,
    courseLookup,
    activeTerm,
    equiv,
  });

  return {
    studentId: trimmed,
    studentName,
    courseRecords,
    latestRegistration,
    activeTerm,
    portalEnrollmentRows: portalRows,
    marksRows,
    clinicRows,
  };
}
