/**
 * Registration (portal) + academic attempts (`marks`) in one payload. `transcript` = marks-only slice for this API.
 * `enrollmentHistory` (JSON key) = **combinedAcademicHistory**: sorted union of registration rows + attempts — not
 * “registration-only” naming; see {@link CombinedAcademicHistoryItem}.
 *
 * Does not compute degree audit or clinical progress; merge those only at the account layer when needed.
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
} from "../repositories/studentEnrollmentRepository.js";
import { loadCoursesTranscriptLookup } from "../repositories/studentTranscriptRepository.js";
import type {
  CombinedAcademicHistoryItem,
  StudentAcademicsResponse,
} from "../types/studentAcademics.js";
import {
  buildAcademicCourseRecordsFromMarksWithLookup,
  buildAvailableTermsFromCourseRecords,
  courseRecordToEnrollmentItem,
  courseRecordToScheduleItem,
  courseRecordToTranscriptItem,
  legacyCompletedBlocksPortalRow,
  pickNewerRegistrationAnchor,
  portalEnrollmentRowToAcademicCourseRecord,
  resolveRegistrationAnchoredAcademicTerm,
  sortTranscriptPreviewRecords,
  termsMatch,
} from "./studentAcademicCourseRecords.js";
import {
  courseFeedbackLookupKey,
  getFeedbackSubmittedAtMapForStudent,
} from "./studentCourseFeedbackService.js";

/** Attaches course feedback flags to the combined timeline; response field stays `enrollmentHistory` for clients. */
function mergeEnrollmentFeedbackIntoPayload(
  payload: StudentAcademicsResponse,
  submittedAtByKey: Map<string, string>,
): StudentAcademicsResponse {
  const combinedAcademicHistory: CombinedAcademicHistoryItem[] =
    payload.courseRecords.map((r) => {
      const k = courseFeedbackLookupKey(r.courseCode, r.term, r.year);
      const at = submittedAtByKey.get(k) ?? null;
      return courseRecordToEnrollmentItem(r, {
        submitted: at != null,
        submittedAt: at,
      });
    });
  return { ...payload, enrollmentHistory: combinedAcademicHistory };
}

function buildMergedPayload(
  studentId: string,
  studentName: string,
  marksRows: MarksRow[],
  legacyCourseRecords: import("../types/studentAcademics.js").StudentAcademicCourseRecord[],
  portalCourseRecords: import("../types/studentAcademics.js").StudentAcademicCourseRecord[],
  latestRegistration: { term: string; year: number } | null,
): StudentAcademicsResponse {
  const academicAttemptsFromMarks = legacyCourseRecords;
  const registrationHistoryFromPortal = portalCourseRecords;
  const combinedSortedCourseRecords = [
    ...academicAttemptsFromMarks,
    ...registrationHistoryFromPortal,
  ];
  sortTranscriptPreviewRecords(combinedSortedCourseRecords);
  const courseRecords = combinedSortedCourseRecords;

  const resolvedActive = resolveRegistrationAnchoredAcademicTerm(
    latestRegistration,
    marksRows,
  );
  const currentTerm = resolvedActive;

  const currentSchedule =
    currentTerm == null
      ? []
      : courseRecords
          .filter(
            (r) =>
              r.status !== "withdrawn" &&
              r.year === currentTerm.year &&
              termsMatch(r.term, currentTerm.term),
          )
          .map(courseRecordToScheduleItem);

  const combinedAcademicHistory: CombinedAcademicHistoryItem[] =
    courseRecords.map((r) => courseRecordToEnrollmentItem(r));

  return {
    studentId,
    studentName,
    currentTerm,
    availableTerms: buildAvailableTermsFromCourseRecords(courseRecords),
    currentSchedule,
    transcript: academicAttemptsFromMarks.map(courseRecordToTranscriptItem),
    enrollmentHistory: combinedAcademicHistory,
    courseRecords,
  };
}

export async function getStudentAcademicsPayload(
  studentId: string,
): Promise<StudentAcademicsResponse> {
  const trimmed = studentId.trim();
  if (trimmed === "") {
    return {
      studentId: "",
      studentName: "",
      currentTerm: null,
      availableTerms: [],
      currentSchedule: [],
      transcript: [],
      enrollmentHistory: [],
      courseRecords: [],
    };
  }

  if (trimmed === DEMO_STUDENT_ID) {
    return {
      studentId: trimmed,
      studentName: trimmed,
      currentTerm: null,
      availableTerms: [],
      currentSchedule: [],
      transcript: [],
      enrollmentHistory: [],
      courseRecords: [],
    };
  }

  const marksRows = await listMarksForStudent(pool, trimmed);
  const courseLookup = await loadCoursesTranscriptLookup(pool);
  const latestLegacy = await findLatestLegacyTermYear(pool, trimmed);
  const latestPortal = await findLatestPortalEnrollmentTermYear(trimmed);
  const portalRows = await listPortalEnrollmentRowsForStudentAcademics(trimmed);

  const latestRegistration = pickNewerRegistrationAnchor(
    latestLegacy,
    latestPortal,
  );
  console.debug("[academics] source rows loaded", {
    studentId: trimmed,
    marksRowCount: marksRows.length,
    portalEnrollmentRowCount: portalRows.length,
    latestLegacy,
    latestPortal,
    latestRegistration,
  });

  const nameFromMarks = marksRows[0]?.name?.trim() ?? "";
  let studentName =
    nameFromMarks.length > 0 ? nameFromMarks : trimmed;
  if (nameFromMarks.length === 0) {
    const legacyName = await getLegacyStudentDisplayName(pool, trimmed);
    if (legacyName != null) studentName = legacyName;
    else {
      const pn = await getPortalStudentDisplayName(trimmed);
      if (pn != null) studentName = pn;
    }
  }

  if (marksRows.length === 0 && portalRows.length === 0) {
    console.error("[academics] no verified academic source rows found", {
      studentId: trimmed,
      latestLegacy,
      latestPortal,
      latestRegistration,
    });
    const resolvedActive = resolveRegistrationAnchoredAcademicTerm(
      latestRegistration,
      [],
    );
    return {
      studentId: trimmed,
      studentName,
      currentTerm: resolvedActive,
      availableTerms: [],
      currentSchedule: [],
      transcript: [],
      enrollmentHistory: [],
      courseRecords: [],
    };
  }

  const resolvedActiveForRecords = resolveRegistrationAnchoredAcademicTerm(
    latestRegistration,
    marksRows,
  );

  const legacyCourseRecords =
    marksRows.length > 0
      ? buildAcademicCourseRecordsFromMarksWithLookup(
          trimmed,
          marksRows,
          courseLookup,
          resolvedActiveForRecords,
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
        ),
    )
    .map((p) =>
      portalEnrollmentRowToAcademicCourseRecord(
        trimmed,
        p,
        p.display_course_title.length > 0
          ? p.display_course_title
          : p.course_title_raw.length > 0
            ? p.course_title_raw
            : p.course_code,
        resolvedActiveForRecords,
      ),
    );

  const payload = buildMergedPayload(
    trimmed,
    studentName,
    marksRows,
    legacyCourseRecords,
    portalCourseRecords,
    latestRegistration,
  );
  console.debug("[academics] merged payload summary", {
    studentId: trimmed,
    currentTerm: payload.currentTerm,
    availableTerms: payload.availableTerms.length,
    currentScheduleCount: payload.currentSchedule.length,
    transcriptCount: payload.transcript.length,
    enrollmentHistoryCount: payload.enrollmentHistory.length,
    courseRecordCount: payload.courseRecords.length,
  });

  if (payload.courseRecords.length === 0) {
    return payload;
  }
  try {
    const submittedAtByKey = await getFeedbackSubmittedAtMapForStudent(trimmed);
    return mergeEnrollmentFeedbackIntoPayload(payload, submittedAtByKey);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ER_NO_SUCH_TABLE") {
      console.warn(
        "[academics] course_feedback missing; enrollment feedback flags omitted",
      );
      return payload;
    }
    throw e;
  }
}
