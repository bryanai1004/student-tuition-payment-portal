/**
 * Registration (portal) + academic attempts (`marks`) + clinic in one payload.
 * `transcript` and `courseRecords` share the same unified merge (see studentUnifiedAcademicRecordsService).
 */

import { DEMO_STUDENT_ID } from "../config/constants.js";
import { isMissingTable } from "../lib/dbErrors.js";
import type {
  CombinedAcademicHistoryItem,
  StudentAcademicsResponse,
  StudentAcademicsScheduleItem,
} from "../types/studentAcademics.js";
import {
  buildAvailableTermsFromCourseRecords,
  courseRecordToEnrollmentItem,
  courseRecordToTranscriptItem,
  resolveActiveEnrollmentTerm,
  sortTranscriptPreviewRecords,
} from "./studentAcademicCourseRecords.js";
import {
  courseFeedbackLookupKey,
  getFeedbackSubmittedAtMapForStudent,
} from "./studentCourseFeedbackService.js";
import { courseSectionDetailsToAcademicsScheduleItems } from "./portalEnrollmentSchedule.js";
import { listStudentEnrolledSectionsForTerm } from "../repositories/studentEnrollmentRepository.js";
import { loadUnifiedStudentAcademicContext } from "./studentUnifiedAcademicRecordsService.js";

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

async function loadCurrentScheduleForActiveTerm(
  studentId: string,
  currentTerm: { term: string; year: number } | null,
): Promise<StudentAcademicsScheduleItem[]> {
  if (currentTerm == null) return [];
  try {
    const { sections } = await listStudentEnrolledSectionsForTerm(
      studentId,
      currentTerm.term,
      currentTerm.year,
    );
    return courseSectionDetailsToAcademicsScheduleItems(sections);
  } catch (e) {
    console.warn(
      "[academics] enrolled-sections schedule for currentTerm failed",
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}

function buildAcademicsPayloadFromContext(
  ctx: NonNullable<Awaited<ReturnType<typeof loadUnifiedStudentAcademicContext>>>,
  currentSchedule: StudentAcademicsScheduleItem[],
): StudentAcademicsResponse {
  const courseRecords = ctx.courseRecords;
  const currentTerm = ctx.activeTerm;
  const transcript = courseRecords.map(courseRecordToTranscriptItem);
  const enrollmentHistory = courseRecords.map((r) => courseRecordToEnrollmentItem(r));

  return {
    studentId: ctx.studentId,
    studentName: ctx.studentName,
    currentTerm,
    availableTerms: buildAvailableTermsFromCourseRecords(courseRecords),
    currentSchedule,
    transcript,
    enrollmentHistory,
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

  const ctx = await loadUnifiedStudentAcademicContext(trimmed);
  if (ctx == null) {
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

  const hasAnySource =
    ctx.marksRows.length > 0 ||
    ctx.portalEnrollmentRows.length > 0 ||
    ctx.clinicRows.length > 0;

  if (!hasAnySource) {
    const resolvedActive = resolveActiveEnrollmentTerm(
      ctx.latestRegistration,
      [],
      ctx.portalEnrollmentRows,
    );
    return {
      studentId: trimmed,
      studentName: ctx.studentName,
      currentTerm: resolvedActive,
      availableTerms: [],
      currentSchedule: [],
      transcript: [],
      enrollmentHistory: [],
      courseRecords: [],
    };
  }

  console.debug("[academics] unified source rows loaded", {
    studentId: trimmed,
    marksRowCount: ctx.marksRows.length,
    portalEnrollmentRowCount: ctx.portalEnrollmentRows.length,
    clinicRowCount: ctx.clinicRows.length,
    courseRecordCount: ctx.courseRecords.length,
  });

  const currentSchedule = await loadCurrentScheduleForActiveTerm(
    trimmed,
    ctx.activeTerm,
  );
  const payload = buildAcademicsPayloadFromContext(ctx, currentSchedule);

  if (payload.courseRecords.length === 0) {
    return payload;
  }
  try {
    const submittedAtByKey = await getFeedbackSubmittedAtMapForStudent(trimmed);
    return mergeEnrollmentFeedbackIntoPayload(payload, submittedAtByKey);
  } catch (e) {
    if (isMissingTable(e)) {
      console.warn(
        "[academics] course_feedback missing; enrollment feedback flags omitted",
      );
      return payload;
    }
    throw e;
  }
}
