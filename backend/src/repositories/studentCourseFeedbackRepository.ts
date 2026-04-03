import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

export type CourseFeedbackDbRow = {
  id: number;
  student_id: string;
  course_code: string;
  term: string;
  year: number;
  rating: number;
  workload_rating: number;
  difficulty_rating: number;
  comments: string | null;
  submitted_at: Date;
};

function mapRow(r: RowDataPacket): CourseFeedbackDbRow {
  const row = r as Record<string, unknown>;
  return {
    id: Number(row.id),
    student_id: String(row.student_id ?? "").trim(),
    course_code: String(row.course_code ?? "").trim(),
    term: String(row.term ?? "").trim(),
    year: Number(row.year),
    rating: Number(row.rating),
    workload_rating: Number(row.workload_rating),
    difficulty_rating: Number(row.difficulty_rating),
    comments:
      row.comments == null ? null : String(row.comments).trim() || null,
    submitted_at:
      row.submitted_at instanceof Date
        ? row.submitted_at
        : new Date(String(row.submitted_at)),
  };
}

export async function listCourseFeedbackForStudent(
  pool: Pool,
  studentId: string,
): Promise<CourseFeedbackDbRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, student_id, course_code, term, year,
            rating, workload_rating, difficulty_rating, comments, submitted_at
     FROM student_course_feedback
     WHERE TRIM(student_id) = TRIM(?)
     ORDER BY year DESC, submitted_at DESC`,
    [studentId],
  );
  return rows.map(mapRow);
}

export async function findCourseFeedbackDuplicate(
  pool: Pool,
  args: {
    studentId: string;
    courseCode: string;
    term: string;
    year: number;
  },
): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id
     FROM student_course_feedback
     WHERE TRIM(student_id) = TRIM(?)
       AND TRIM(course_code) = TRIM(?)
       AND year = ?
       AND LOWER(TRIM(term)) = LOWER(TRIM(?))
     LIMIT 1`,
    [args.studentId, args.courseCode, args.year, args.term],
  );
  return rows.length > 0;
}

export type InsertCourseFeedbackInput = {
  studentId: string;
  courseCode: string;
  term: string;
  year: number;
  rating: number;
  workloadRating: number;
  difficultyRating: number;
  comments: string | null;
};

export async function insertCourseFeedback(
  pool: Pool,
  input: InsertCourseFeedbackInput,
): Promise<number> {
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO student_course_feedback
      (student_id, course_code, term, year, rating, workload_rating, difficulty_rating, comments)
     VALUES (TRIM(?), TRIM(?), TRIM(?), ?, ?, ?, ?, ?)`,
    [
      input.studentId,
      input.courseCode,
      input.term,
      input.year,
      input.rating,
      input.workloadRating,
      input.difficultyRating,
      input.comments,
    ],
  );
  return res.insertId;
}
