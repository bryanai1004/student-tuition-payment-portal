import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

export type CourseFeedbackDbRow = {
  id: number;
  student_id: string;
  course_code: string;
  term: string;
  year: number;
  q1_rating: number;
  q2_rating: number;
  q3_rating: number;
  q4_rating: number;
  q5_rating: number;
  overall_rating: number;
  comment: string | null;
  submitted_at: Date;
};

/** Minimal row for academics “feedback submitted” map. */
export type CourseFeedbackSubmittedKeyRow = Pick<
  CourseFeedbackDbRow,
  "course_code" | "term" | "year" | "submitted_at"
>;

function mapFullRow(r: RowDataPacket): CourseFeedbackDbRow {
  const row = r as Record<string, unknown>;
  const sidRaw = row.student_id ?? row.student_external_id;
  return {
    id: Number(row.id),
    student_id: String(sidRaw ?? "").trim(),
    course_code: String(row.course_code ?? "").trim(),
    term: String(row.term ?? "").trim(),
    year: Number(row.year),
    q1_rating: Number(row.q1_rating),
    q2_rating: Number(row.q2_rating),
    q3_rating: Number(row.q3_rating),
    q4_rating: Number(row.q4_rating),
    q5_rating: Number(row.q5_rating),
    overall_rating: Number(row.overall_rating),
    comment:
      row.comment == null ? null : String(row.comment).trim() || null,
    submitted_at:
      row.submitted_at instanceof Date
        ? row.submitted_at
        : new Date(String(row.submitted_at)),
  };
}

function mapKeyRow(r: RowDataPacket): CourseFeedbackSubmittedKeyRow {
  const row = r as Record<string, unknown>;
  return {
    course_code: String(row.course_code ?? "").trim(),
    term: String(row.term ?? "").trim(),
    year: Number(row.year),
    submitted_at:
      row.submitted_at instanceof Date
        ? row.submitted_at
        : new Date(String(row.submitted_at)),
  };
}

export type CreateCourseFeedbackInput = {
  studentExternalId: string;
  courseCode: string;
  term: string;
  year: number;
  q1Rating: number;
  q2Rating: number;
  q3Rating: number;
  q4Rating: number;
  q5Rating: number;
  overallRating: number;
  comment: string | null;
};

export async function createCourseFeedback(
  pool: Pool,
  input: CreateCourseFeedbackInput,
): Promise<number> {
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO course_feedback (
      student_id, course_code, term, year,
      q1_rating, q2_rating, q3_rating, q4_rating, q5_rating,
      overall_rating, comment
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.studentExternalId.trim(),
      input.courseCode.trim(),
      input.term.trim(),
      input.year,
      input.q1Rating,
      input.q2Rating,
      input.q3Rating,
      input.q4Rating,
      input.q5Rating,
      input.overallRating,
      input.comment,
    ],
  );
  return res.insertId;
}

export async function findCourseFeedbackByStudentCourseTerm(
  pool: Pool,
  args: {
    studentExternalId: string;
    courseCode: string;
    term: string;
    year: number;
  },
): Promise<CourseFeedbackDbRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, student_id, course_code, term, year,
            q1_rating, q2_rating, q3_rating, q4_rating, q5_rating,
            overall_rating, comment, submitted_at
     FROM course_feedback
     WHERE student_id = ?
       AND course_code = ?
       AND term = ?
       AND year = ?
     LIMIT 1`,
    [
      args.studentExternalId.trim(),
      args.courseCode.trim(),
      args.term.trim(),
      args.year,
    ],
  );
  if (rows.length === 0) return null;
  return mapFullRow(rows[0]!);
}

/** For merging feedback flags into GET /academics. */
export async function listCourseFeedbackSubmittedKeysForStudent(
  pool: Pool,
  studentExternalId: string,
): Promise<CourseFeedbackSubmittedKeyRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT course_code, term, year, submitted_at
     FROM course_feedback
     WHERE student_id = ?
     ORDER BY year DESC, submitted_at DESC`,
    [studentExternalId.trim()],
  );
  return rows.map(mapKeyRow);
}

/** One row per student for a course / calendar term / year (matches UNIQUE uniq_feedback). */
export type CourseFeedbackExportSlice = {
  student_id: string;
  q1_rating: number | null;
  q2_rating: number | null;
  q3_rating: number | null;
  q4_rating: number | null;
  q5_rating: number | null;
  overall_rating: number | null;
  comment: string | null;
};

/** Integer 1–5 only; anything else becomes null (empty CSV cell). */
export function parseStoredFeedbackRating1to5(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

/**
 * Batch-load `course_feedback` for many students in one course + term + year.
 * Map key: trimmed `student_id` (legacy login id, same as `portal_enrollments.student_external_id`).
 */
export async function mapCourseFeedbackByStudentForCourseTermYear(
  pool: Pool,
  args: {
    courseCode: string;
    term: string;
    year: number;
    studentIds: string[];
  },
): Promise<Map<string, CourseFeedbackExportSlice>> {
  const code = args.courseCode.trim();
  const term = args.term.trim();
  const year = Math.trunc(args.year);
  const ids = [
    ...new Set(
      args.studentIds.map((s) => String(s ?? "").trim()).filter((s) => s !== ""),
    ),
  ];
  const out = new Map<string, CourseFeedbackExportSlice>();
  if (ids.length === 0 || code === "" || term === "" || !Number.isFinite(year)) {
    return out;
  }
  const ph = ids.map(() => "?").join(", ");
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT student_id,
            q1_rating, q2_rating, q3_rating, q4_rating, q5_rating,
            overall_rating, comment
     FROM course_feedback
     WHERE course_code = ?
       AND term = ?
       AND year = ?
       AND student_id IN (${ph})`,
    [code, term, year, ...ids],
  );
  for (const r of rows) {
    const sid = String(r.student_id ?? "").trim();
    if (sid === "") continue;
    const commentRaw = r.comment;
    const comment =
      commentRaw == null ? null : String(commentRaw).trim() || null;
    out.set(sid, {
      student_id: sid,
      q1_rating: parseStoredFeedbackRating1to5(r.q1_rating),
      q2_rating: parseStoredFeedbackRating1to5(r.q2_rating),
      q3_rating: parseStoredFeedbackRating1to5(r.q3_rating),
      q4_rating: parseStoredFeedbackRating1to5(r.q4_rating),
      q5_rating: parseStoredFeedbackRating1to5(r.q5_rating),
      overall_rating: parseStoredFeedbackRating1to5(r.overall_rating),
      comment,
    });
  }
  return out;
}
