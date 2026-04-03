import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool } from "../lib/db.js";
import { listMarksForStudent } from "../repositories/studentAcademicsRepository.js";
import {
  findCourseFeedbackDuplicate,
  insertCourseFeedback,
  listCourseFeedbackForStudent,
  type CourseFeedbackDbRow,
} from "../repositories/studentCourseFeedbackRepository.js";
import {
  buildAcademicCourseRecordsFromMarks,
  termsMatch,
} from "./studentAcademicCourseRecords.js";
import type { StudentAcademicCourseRecord } from "../types/studentAcademics.js";

/** Map key aligned with `enrichEnrollmentWithFeedback` in studentAcademicsService. */
export function courseFeedbackLookupKey(
  courseCode: string,
  term: string,
  year: number,
): string {
  return `${courseCode.trim()}\t${term.trim().toLowerCase()}\t${year}`;
}

export function feedbackSubmittedAtMapFromDbRows(
  rows: CourseFeedbackDbRow[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const k = courseFeedbackLookupKey(r.course_code, r.term, r.year);
    const iso =
      r.submitted_at instanceof Date
        ? r.submitted_at.toISOString()
        : new Date(r.submitted_at).toISOString();
    if (!m.has(k)) m.set(k, iso);
  }
  return m;
}

/** For merging into GET /academics `enrollmentHistory` (skips DB for demo / empty id). */
export async function getFeedbackSubmittedAtMapForStudent(
  studentId: string,
): Promise<Map<string, string>> {
  const sid = studentId.trim();
  if (sid === "" || sid === DEMO_STUDENT_ID) return new Map();
  const rows = await listCourseFeedbackForStudent(pool, sid);
  return feedbackSubmittedAtMapFromDbRows(rows);
}

export type CourseFeedbackApiItem = {
  id: number;
  courseCode: string;
  term: string;
  year: number;
  rating: number;
  workloadRating: number;
  difficultyRating: number;
  comments: string | null;
  submittedAt: string;
};

function rowToApi(r: CourseFeedbackDbRow): CourseFeedbackApiItem {
  return {
    id: r.id,
    courseCode: r.course_code,
    term: r.term,
    year: r.year,
    rating: r.rating,
    workloadRating: r.workload_rating,
    difficultyRating: r.difficulty_rating,
    comments: r.comments,
    submittedAt:
      r.submitted_at instanceof Date
        ? r.submitted_at.toISOString()
        : new Date(r.submitted_at).toISOString(),
  };
}

export async function getCourseFeedbackForStudentApi(
  studentId: string,
): Promise<{ studentId: string; items: CourseFeedbackApiItem[] }> {
  const sid = studentId.trim();
  if (sid === "" || sid === DEMO_STUDENT_ID) {
    return { studentId: sid, items: [] };
  }
  const rows = await listCourseFeedbackForStudent(pool, sid);
  return { studentId: sid, items: rows.map(rowToApi) };
}

function findMatchingCourseRecord(
  records: StudentAcademicCourseRecord[],
  courseCode: string,
  term: string,
  year: number,
): StudentAcademicCourseRecord | null {
  const code = courseCode.trim();
  for (const r of records) {
    if (r.courseCode.trim() !== code) continue;
    if (r.year !== year) continue;
    if (!termsMatch(r.term, term)) continue;
    return r;
  }
  return null;
}

function isRating1to5(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;
}

export type SubmitCourseFeedbackBody = {
  courseCode: string;
  term: string;
  year: number;
  rating: number;
  workloadRating: number;
  difficultyRating: number;
  comments: string | null;
};

export function parseSubmitCourseFeedbackBody(
  body: unknown,
): SubmitCourseFeedbackBody | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const courseCode =
    typeof o.courseCode === "string" ? o.courseCode.trim() : "";
  const term = typeof o.term === "string" ? o.term.trim() : "";
  const yearRaw = o.year;
  const year = typeof yearRaw === "number" ? yearRaw : Number(yearRaw);
  if (!courseCode || !term || !Number.isFinite(year) || Math.floor(year) !== year) {
    return null;
  }
  const rating = o.rating;
  const workloadRating = o.workloadRating ?? o.workload_rating;
  const difficultyRating = o.difficultyRating ?? o.difficulty_rating;
  if (!isRating1to5(rating)) return null;
  if (!isRating1to5(workloadRating)) return null;
  if (!isRating1to5(difficultyRating)) return null;
  let comments: string | null = null;
  if (o.comments != null) {
    const c = typeof o.comments === "string" ? o.comments.trim() : String(o.comments).trim();
    comments = c.length > 0 ? c.slice(0, 8000) : null;
  }
  return {
    courseCode,
    term,
    year,
    rating,
    workloadRating,
    difficultyRating,
    comments,
  };
}

export type SubmitCourseFeedbackResult =
  | { ok: true; id: number }
  | {
      ok: false;
      status: 400 | 403 | 404 | 409;
      message: string;
    };

export async function submitCourseFeedback(
  studentId: string,
  body: SubmitCourseFeedbackBody,
): Promise<SubmitCourseFeedbackResult> {
  const sid = studentId.trim();
  if (sid === "" || sid === DEMO_STUDENT_ID) {
    return { ok: false, status: 403, message: "Feedback is not available for this account." };
  }

  const marks = await listMarksForStudent(pool, sid);
  const records = buildAcademicCourseRecordsFromMarks(sid, marks);
  const match = findMatchingCourseRecord(
    records,
    body.courseCode,
    body.term,
    body.year,
  );
  if (match == null) {
    return {
      ok: false,
      status: 404,
      message: "No matching enrollment was found for this course and term.",
    };
  }

  if (match.status !== "completed") {
    return {
      ok: false,
      status: 403,
      message: "Feedback can only be submitted for completed courses.",
    };
  }

  const dup = await findCourseFeedbackDuplicate(pool, {
    studentId: sid,
    courseCode: match.courseCode,
    term: match.term,
    year: match.year,
  });
  if (dup) {
    return {
      ok: false,
      status: 409,
      message: "Feedback has already been submitted for this course.",
    };
  }

  try {
    const id = await insertCourseFeedback(pool, {
      studentId: sid,
      courseCode: match.courseCode,
      term: match.term,
      year: match.year,
      rating: body.rating,
      workloadRating: body.workloadRating,
      difficultyRating: body.difficultyRating,
      comments: body.comments,
    });
    return { ok: true, id };
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "ER_DUP_ENTRY") {
      return {
        ok: false,
        status: 409,
        message: "Feedback has already been submitted for this course.",
      };
    }
    throw e;
  }
}
