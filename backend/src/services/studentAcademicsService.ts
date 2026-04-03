import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool } from "../lib/db.js";
import {
  listMarksForStudent,
  type MarksRow,
} from "../repositories/studentAcademicsRepository.js";
import { findLatestLegacyTermYear } from "../repositories/studentLegacyAccountRepository.js";
import {
  loadCoursesTranscriptLookup,
  type CourseTranscriptLookupEntry,
} from "../repositories/studentTranscriptRepository.js";
import type { StudentAcademicsResponse } from "../types/studentAcademics.js";
import {
  buildAcademicCourseRecordsFromMarksWithLookup,
  buildAvailableTermsFromCourseRecords,
  courseRecordToEnrollmentItem,
  courseRecordToScheduleItem,
  courseRecordToTranscriptItem,
  resolveRegistrationAnchoredAcademicTerm,
  termsMatch,
} from "./studentAcademicCourseRecords.js";
import {
  courseFeedbackLookupKey,
  getFeedbackSubmittedAtMapForStudent,
} from "./studentCourseFeedbackService.js";

function mergeEnrollmentFeedbackIntoPayload(
  payload: StudentAcademicsResponse,
  submittedAtByKey: Map<string, string>,
): StudentAcademicsResponse {
  const enrollmentHistory = payload.courseRecords.map((r) => {
    const k = courseFeedbackLookupKey(r.courseCode, r.term, r.year);
    const at = submittedAtByKey.get(k) ?? null;
    return courseRecordToEnrollmentItem(r, {
      submitted: at != null,
      submittedAt: at,
    });
  });
  return { ...payload, enrollmentHistory };
}

function buildPayload(
  studentId: string,
  rows: MarksRow[],
  courseLookup: Map<string, CourseTranscriptLookupEntry>,
  latestRegistration: { term: string; year: number } | null,
): StudentAcademicsResponse {
  if (rows.length === 0) {
    const resolvedActive = resolveRegistrationAnchoredAcademicTerm(
      latestRegistration,
      [],
    );
    return {
      studentId,
      studentName: studentId,
      currentTerm: resolvedActive,
      availableTerms: [],
      currentSchedule: [],
      transcript: [],
      enrollmentHistory: [],
      courseRecords: [],
    };
  }

  const nameFromMarks = rows[0]!.name.trim();
  const studentName = nameFromMarks.length > 0 ? nameFromMarks : studentId;
  const resolvedActive = resolveRegistrationAnchoredAcademicTerm(
    latestRegistration,
    rows,
  );
  const courseRecords = buildAcademicCourseRecordsFromMarksWithLookup(
    studentId,
    rows,
    courseLookup,
    resolvedActive,
  );
  const currentTerm = resolvedActive;

  const currentSchedule =
    currentTerm == null
      ? []
      : courseRecords
          .filter(
            (r) =>
              r.year === currentTerm.year &&
              termsMatch(r.term, currentTerm.term),
          )
          .map(courseRecordToScheduleItem);

  return {
    studentId,
    studentName,
    currentTerm,
    availableTerms: buildAvailableTermsFromCourseRecords(courseRecords),
    currentSchedule,
    transcript: courseRecords.map(courseRecordToTranscriptItem),
    enrollmentHistory: courseRecords.map((r) => courseRecordToEnrollmentItem(r)),
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

  const [rows, latestRegistration, courseLookup] = await Promise.all([
    listMarksForStudent(pool, trimmed),
    findLatestLegacyTermYear(pool, trimmed),
    loadCoursesTranscriptLookup(pool),
  ]);
  const payload = buildPayload(trimmed, rows, courseLookup, latestRegistration);
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
        "[academics] student_course_feedback missing; enrollment feedback flags omitted",
      );
      return payload;
    }
    throw e;
  }
}
