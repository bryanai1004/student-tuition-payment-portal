import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "../lib/db.js";
import {
  type CourseSectionDetail,
  mapCourseSectionRow,
} from "./courseSectionRepository.js";

export type EnrollSectionInput = {
  course_code: string;
  section_code: string;
};

function isMysqlDupEntry(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "ER_DUP_ENTRY"
  );
}

function inferPortalTypeFromLegacy(engName: string): "didactic" | "lab" | "clinical" | "other" {
  const n = engName.toLowerCase();
  if (/\blab(oratory)?\b/i.test(engName) || /\blab\b/.test(n)) return "lab";
  if (n.includes("clinic") || n.includes("internship")) return "clinical";
  return "didactic";
}

/**
 * Resolves `portal_courses.course_id` for enrollment: exact `course_code` first, else one row
 * from legacy `courses` plus a deterministic `LEGACY{sequenceNumber}` insert (idempotent on PK).
 */
async function resolvePortalCourseIdForEnrollment(
  conn: PoolConnection,
  courseCode: string,
): Promise<{ ok: true; courseId: string } | { ok: false; error: string }> {
  const code = courseCode.trim();

  const [existing] = await conn.query<RowDataPacket[]>(
    `SELECT course_id FROM portal_courses WHERE course_code = ? LIMIT 2`,
    [code],
  );
  if (existing.length === 1) {
    return { ok: true, courseId: String(existing[0]!.course_id) };
  }
  if (existing.length > 1) {
    return {
      ok: false,
      error: `Course code ${code} matches multiple portal courses.`,
    };
  }

  const [legacyRows] = await conn.query<RowDataPacket[]>(
    `SELECT \`sequenceNumber\`, TRIM(code) AS legacy_code, eng_name, units
     FROM courses
     WHERE CONVERT(TRIM(code) USING utf8mb4) COLLATE utf8mb4_unicode_ci = ?
     LIMIT 2`,
    [code],
  );
  if (legacyRows.length === 0) {
    return {
      ok: false,
      error: `Course ${code} is not in the portal catalog (portal_courses).`,
    };
  }
  if (legacyRows.length > 1) {
    return {
      ok: false,
      error: `Course code ${code} matches multiple legacy catalog entries.`,
    };
  }

  const leg = legacyRows[0]!;
  const seq = Number(leg.sequenceNumber);
  const courseId = `LEGACY${seq}`;
  const titleRaw = leg.eng_name != null ? String(leg.eng_name).trim() : "";
  const title = titleRaw !== "" ? titleRaw : code;
  const units = leg.units != null ? leg.units : null;
  const type = inferPortalTypeFromLegacy(titleRaw);

  try {
    await conn.query<ResultSetHeader>(
      `INSERT INTO portal_courses (course_id, course_code, title, type, units, hours)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [courseId, code, title, type, units],
    );
  } catch (e: unknown) {
    if (!isMysqlDupEntry(e)) throw e;
  }

  const [again] = await conn.query<RowDataPacket[]>(
    `SELECT course_id FROM portal_courses WHERE course_code = ? LIMIT 2`,
    [code],
  );
  if (again.length === 1) {
    return { ok: true, courseId: String(again[0]!.course_id) };
  }
  if (again.length > 1) {
    return {
      ok: false,
      error: `Course code ${code} matches multiple portal courses.`,
    };
  }

  return {
    ok: false,
    error: `Could not resolve portal catalog row for ${code}.`,
  };
}

/**
 * Validates each section against `course_sections` and `portal_courses`, then inserts
 * `portal_enrollments` rows. Skips duplicates (same student + course_id + term + year).
 */
export async function enrollStudentInSections(
  studentExternalId: string,
  term: string,
  year: number,
  sections: EnrollSectionInput[],
): Promise<
  { ok: true; insertedCount: number } | { ok: false; error: string }
> {
  const sid = studentExternalId.trim();
  const trimmedTerm = term.trim();
  if (sections.length === 0) {
    return { ok: false, error: "At least one section is required." };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let insertedCount = 0;

    for (const raw of sections) {
      const courseCode = raw.course_code.trim();
      const sectionCode = raw.section_code.trim();
      if (!courseCode || !sectionCode) {
        await conn.rollback();
        return {
          ok: false,
          error: "Each section must include course_code and section_code.",
        };
      }

      const [[secRow]] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM course_sections
         WHERE course_code = ? AND section_code = ? AND term = ? AND year = ?
         LIMIT 1`,
        [courseCode, sectionCode, trimmedTerm, year],
      );
      if (!secRow) {
        await conn.rollback();
        return {
          ok: false,
          error: `No section ${sectionCode} for course ${courseCode} in this term.`,
        };
      }

      const resolved = await resolvePortalCourseIdForEnrollment(conn, courseCode);
      if (!resolved.ok) {
        await conn.rollback();
        return resolved;
      }
      const courseId = resolved.courseId;

      const [[exists]] = await conn.query<RowDataPacket[]>(
        `SELECT 1 AS ok FROM portal_enrollments
         WHERE student_external_id COLLATE utf8mb4_unicode_ci =
               CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
           AND course_id = ?
           AND term COLLATE utf8mb4_unicode_ci =
               CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
           AND year = ?
         LIMIT 1`,
        [sid, courseId, trimmedTerm, year],
      );
      if (exists) continue;

      await conn.query<ResultSetHeader>(
        `INSERT INTO portal_enrollments (student_external_id, course_id, term, year)
         VALUES (?, ?, ?, ?)`,
        [sid, courseId, trimmedTerm, year],
      );
      insertedCount += 1;
    }

    await conn.commit();
    return { ok: true, insertedCount };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * One `course_sections` row per enrolled course (same term/year), chosen deterministically when
 * multiple sections exist for a course (lowest `id`). Timetable display for course-only portal enrollments.
 */
export async function listStudentEnrolledSectionRows(
  studentExternalId: string,
  term: string,
  year: number,
): Promise<CourseSectionDetail[]> {
  const sql = `
    SELECT
      cs.id,
      cs.course_code,
      cs.term,
      cs.year,
      cs.section_code,
      cs.weekday,
      cs.start_time,
      cs.end_time,
      cs.delivery_mode,
      cs.room,
      cs.instructor,
      cs.notes,
      0 AS enrolled_count,
      CAST(NULL AS JSON) AS enrolled_students_json
    FROM (
      SELECT
        cs_inner.id,
        cs_inner.course_code,
        cs_inner.term,
        cs_inner.year,
        cs_inner.section_code,
        cs_inner.weekday,
        cs_inner.start_time,
        cs_inner.end_time,
        cs_inner.delivery_mode,
        cs_inner.room,
        cs_inner.instructor,
        cs_inner.notes,
        ROW_NUMBER() OVER (PARTITION BY cs_inner.course_code ORDER BY cs_inner.id) AS rn
      FROM course_sections cs_inner
      INNER JOIN portal_courses pc
        ON pc.course_code COLLATE utf8mb4_unicode_ci =
           cs_inner.course_code COLLATE utf8mb4_unicode_ci
      INNER JOIN portal_enrollments e
        ON e.course_id = pc.course_id
        AND e.student_external_id COLLATE utf8mb4_unicode_ci =
            CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        AND e.term COLLATE utf8mb4_unicode_ci =
            cs_inner.term COLLATE utf8mb4_unicode_ci
        AND e.year = cs_inner.year
      WHERE cs_inner.term = ? AND cs_inner.year = ?
    ) cs
    WHERE cs.rn = 1
    ORDER BY cs.course_code ASC, cs.weekday ASC, cs.start_time ASC
  `;
  const [rows] = await pool.query<RowDataPacket[]>(sql, [
    studentExternalId.trim(),
    term.trim(),
    year,
  ]);
  return rows.map((r) => mapCourseSectionRow(r));
}
