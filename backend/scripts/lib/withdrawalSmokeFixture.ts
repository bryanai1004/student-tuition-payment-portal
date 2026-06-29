/**
 * Prepares a repeatable portal-withdrawal smoke fixture on Supabase Postgres.
 * Extends withdraw_deadline and reactivates a known enrollment row when needed.
 */
import { pool } from "../../src/lib/db.js";

export type WithdrawalSmokeFixture = {
  studentId: string;
  academicTermId: string;
  courseSectionId: number;
  term: string;
  year: number;
  previousWithdrawDeadline: string | null;
};

const FIXTURE_WITHDRAW_DEADLINE = "2099-12-31";

/** Default fixture: C17403 / Fall 2026 / section 7 (seeded in portal_enrollments). */
export async function prepareWithdrawalSmokeFixture(options?: {
  studentId?: string;
  academicTermId?: string;
  courseSectionId?: number;
}): Promise<WithdrawalSmokeFixture> {
  const studentId = options?.studentId?.trim() ?? "C17403";
  const academicTermId = options?.academicTermId?.trim() ?? "2026-FAL";
  const courseSectionId = options?.courseSectionId ?? 7;

  const [termRows] = await pool.query<{ withdraw_deadline: string | null }[]>(
    `SELECT to_char(withdraw_deadline, 'YYYY-MM-DD') AS withdraw_deadline
     FROM academic_terms WHERE id = ? LIMIT 1`,
    [academicTermId],
  );
  const termRow = termRows[0];
  if (termRow == null) {
    throw new Error(`academic_terms row not found: ${academicTermId}`);
  }
  const previousWithdrawDeadline = termRow.withdraw_deadline?.trim() || null;

  await pool.query(
    `UPDATE academic_terms SET withdraw_deadline = ? WHERE id = ?`,
    [FIXTURE_WITHDRAW_DEADLINE, academicTermId],
  );

  const [sectionRows] = await pool.query<{ term: string; year: number }[]>(
    `SELECT TRIM(term) AS term, year FROM course_sections WHERE id = ? LIMIT 1`,
    [courseSectionId],
  );
  const section = sectionRows[0];
  if (section == null) {
    throw new Error(`course_sections row not found: ${courseSectionId}`);
  }

  await pool.query(
    `UPDATE portal_enrollments
     SET status = 'active', withdrawn_at = NULL
     WHERE TRIM(student_external_id) = TRIM(?)
       AND course_section_id = ?
       AND TRIM(term) = TRIM(?)
       AND year = ?`,
    [studentId, courseSectionId, section.term, section.year],
  );

  return {
    studentId,
    academicTermId,
    courseSectionId,
    term: section.term,
    year: section.year,
    previousWithdrawDeadline,
  };
}

export async function restoreWithdrawalSmokeFixtureDeadline(
  fixture: WithdrawalSmokeFixture,
): Promise<void> {
  await pool.query(
    `UPDATE academic_terms SET withdraw_deadline = ? WHERE id = ?`,
    [fixture.previousWithdrawDeadline, fixture.academicTermId],
  );
}
