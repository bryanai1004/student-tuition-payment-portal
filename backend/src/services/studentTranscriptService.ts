/**
 * TranscriptRecord = display-ready academic history (normalized titles, sorted). Derived from attempt-shaped rows;
 * not the system source of truth for registration or degree progress.
 *
 * Sources: `marks` + `clinic` (clinic lines for transcript narrative only — not didactic earned units here).
 * Do not compute degree audit or merge clinical hours into academic units in this service.
 */

import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool } from "../lib/db.js";
import { findLatestLegacyTermYear } from "../repositories/studentLegacyAccountRepository.js";
import {
  listClinicRowsForStudent,
  loadCoursesTranscriptLookup,
  type ClinicTranscriptRow,
} from "../repositories/studentTranscriptRepository.js";
import {
  listMarksForStudent,
  type MarksRow,
} from "../repositories/studentAcademicsRepository.js";
import type { StudentTranscriptPreviewResponse } from "../types/studentTranscript.js";
import {
  academicCourseRecordToTranscriptPreviewRow,
  buildAcademicCourseRecordsFromClinicWithLookupAndActiveTerm,
  buildAcademicCourseRecordsFromMarksWithLookup,
  buildAvailableTermsFromCourseRecords,
  resolveRegistrationAnchoredAcademicTerm,
  sortTranscriptPreviewRecords,
} from "./studentAcademicCourseRecords.js";

function resolveStudentName(
  studentId: string,
  marksRows: MarksRow[],
  clinicRows: ClinicTranscriptRow[],
): string {
  const fromMarks = marksRows[0]?.name.trim() ?? "";
  if (fromMarks.length > 0) return fromMarks;
  const fromClinic = clinicRows[0]?.name.trim() ?? "";
  if (fromClinic.length > 0) return fromClinic;
  return studentId;
}

export async function getStudentTranscriptPreviewPayload(
  studentId: string,
): Promise<StudentTranscriptPreviewResponse> {
  const trimmed = studentId.trim();
  if (trimmed === "") {
    return {
      studentId: "",
      studentName: "",
      availableTerms: [],
      transcript: [],
    };
  }

  if (trimmed === DEMO_STUDENT_ID) {
    return {
      studentId: trimmed,
      studentName: trimmed,
      availableTerms: [],
      transcript: [],
    };
  }

  const [marksRows, clinicRows, courseLookup, latestReg] = await Promise.all([
    listMarksForStudent(pool, trimmed),
    listClinicRowsForStudent(pool, trimmed),
    loadCoursesTranscriptLookup(pool),
    findLatestLegacyTermYear(pool, trimmed),
  ]);

  const activeTerm = resolveRegistrationAnchoredAcademicTerm(
    latestReg,
    marksRows,
  );
  const fromMarks = buildAcademicCourseRecordsFromMarksWithLookup(
    trimmed,
    marksRows,
    courseLookup,
    activeTerm,
  );
  const fromClinic = buildAcademicCourseRecordsFromClinicWithLookupAndActiveTerm(
    trimmed,
    clinicRows,
    courseLookup,
    activeTerm,
  );

  const merged = [...fromMarks, ...fromClinic];
  sortTranscriptPreviewRecords(merged);

  const transcript = merged.map(academicCourseRecordToTranscriptPreviewRow);

  return {
    studentId: trimmed,
    studentName: resolveStudentName(trimmed, marksRows, clinicRows),
    availableTerms: buildAvailableTermsFromCourseRecords(merged),
    transcript,
  };
}
