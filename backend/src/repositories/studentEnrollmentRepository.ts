import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "../lib/db.js";
import { listMarksForStudent } from "./studentAcademicsRepository.js";
import {
  type CourseSectionDetail,
  mapCourseSectionRow,
} from "./courseSectionRepository.js";
import { resolvePortalCourseIdByCourseCode } from "./portalCourseRepository.js";

export type EnrollSectionInput = {
  course_code: string;
  section_code: string;
  /** Disambiguates duplicate section_code across EN vs CN offered timetables. */
  schedule_track?: "EN" | "CN";
};

export type ResolvedEnrollmentSection = {
  course_section_id: number;
  course_code: string;
  section_code: string;
  schedule_track: "EN" | "CN";
  prerequisite_course_id: string | null;
  prerequisite_course_code: string | null;
  prerequisite_course_title: string | null;
};

export type StudentHistoricalCourseReference = {
  course_id: string | null;
  course_code: string | null;
  source: "marks" | "portal";
};

type MysqlQueryable = Pool | PoolConnection;

function trimNullableString(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeScheduleTrackForEnrollment(raw: unknown): "EN" | "CN" {
  return String(raw ?? "").trim().toUpperCase() === "CN" ? "CN" : "EN";
}

/**
 * Resolves `portal_courses.course_id` for enrollment: exact `course_code` first, else one row
 * from legacy `courses` plus a deterministic `LEGACY{sequenceNumber}` insert (idempotent on PK).
 */
async function resolvePortalCourseIdForEnrollment(
  conn: PoolConnection,
  courseCode: string,
): Promise<{ ok: true; courseId: string } | { ok: false; error: string }> {
  return resolvePortalCourseIdByCourseCode(conn, courseCode);
}

function normalizeEnrollmentStatusForCompare(raw: unknown): string {
  if (raw == null) return "active";
  return String(raw).trim().toLowerCase();
}

async function resolveRequestedEnrollmentSectionsForTermWithQueryable(
  db: MysqlQueryable,
  term: string,
  year: number,
  sections: EnrollSectionInput[],
): Promise<
  { ok: true; sections: ResolvedEnrollmentSection[] } | { ok: false; error: string }
> {
  const trimmedTerm = term.trim();
  const resolvedSections: ResolvedEnrollmentSection[] = [];

  for (const raw of sections) {
    const courseCode = raw.course_code.trim();
    const sectionCode = raw.section_code.trim();
    if (!courseCode || !sectionCode) {
      return {
        ok: false,
        error: "Each section must include course_code and section_code.",
      };
    }

    let secRows: RowDataPacket[];
    if (raw.schedule_track === "EN" || raw.schedule_track === "CN") {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT
           cs.id,
           TRIM(cs.course_code) AS course_code,
           TRIM(cs.section_code) AS section_code,
           cs.schedule_track,
           cs.prerequisite_course_id,
           pc.course_code AS prerequisite_course_code,
           pc.title AS prerequisite_course_title
         FROM course_sections cs
         LEFT JOIN portal_courses pc
           ON CONVERT(TRIM(pc.course_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
              CONVERT(TRIM(cs.prerequisite_course_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE cs.course_code = ?
           AND cs.section_code = ?
           AND cs.term = ?
           AND cs.year = ?
           AND cs.schedule_track = ?`,
        [courseCode, sectionCode, trimmedTerm, year, raw.schedule_track],
      );
      secRows = rows;
    } else {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT
           cs.id,
           TRIM(cs.course_code) AS course_code,
           TRIM(cs.section_code) AS section_code,
           cs.schedule_track,
           cs.prerequisite_course_id,
           pc.course_code AS prerequisite_course_code,
           pc.title AS prerequisite_course_title
         FROM course_sections cs
         LEFT JOIN portal_courses pc
           ON CONVERT(TRIM(pc.course_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
              CONVERT(TRIM(cs.prerequisite_course_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE cs.course_code = ?
           AND cs.section_code = ?
           AND cs.term = ?
           AND cs.year = ?
         ORDER BY
           CASE cs.schedule_track WHEN 'EN' THEN 0 WHEN 'CN' THEN 1 ELSE 2 END,
           cs.id ASC`,
        [courseCode, sectionCode, trimmedTerm, year],
      );
      secRows = rows;
    }

    if (secRows.length === 0) {
      return {
        ok: false,
        error: `No section ${sectionCode} for course ${courseCode} in this term.`,
      };
    }
    if (secRows.length > 1) {
      return {
        ok: false,
        error: `Multiple timetable sections match ${courseCode} ${sectionCode} for this term. Specify schedule_track EN or CN.`,
      };
    }

    const secRow = secRows[0]!;
    const courseSectionId = Number(secRow.id);
    if (!Number.isFinite(courseSectionId) || courseSectionId <= 0) {
      return {
        ok: false,
        error: `Invalid section id for ${courseCode} ${sectionCode}.`,
      };
    }

    resolvedSections.push({
      course_section_id: courseSectionId,
      course_code: trimNullableString(secRow.course_code) ?? courseCode,
      section_code: trimNullableString(secRow.section_code) ?? sectionCode,
      schedule_track: normalizeScheduleTrackForEnrollment(secRow.schedule_track),
      prerequisite_course_id: trimNullableString(secRow.prerequisite_course_id),
      prerequisite_course_code: trimNullableString(secRow.prerequisite_course_code),
      prerequisite_course_title: trimNullableString(secRow.prerequisite_course_title),
    });
  }

  return { ok: true, sections: resolvedSections };
}

export async function resolveRequestedEnrollmentSectionsForTerm(
  term: string,
  year: number,
  sections: EnrollSectionInput[],
): Promise<
  { ok: true; sections: ResolvedEnrollmentSection[] } | { ok: false; error: string }
> {
  return resolveRequestedEnrollmentSectionsForTermWithQueryable(
    pool,
    term,
    year,
    sections,
  );
}

export async function listStudentHistoricalCourseReferences(
  studentExternalId: string,
): Promise<StudentHistoricalCourseReference[]> {
  const sid = studentExternalId.trim();
  const refs: StudentHistoricalCourseReference[] = [];
  const seen = new Set<string>();

  const pushRef = (ref: StudentHistoricalCourseReference): void => {
    const courseId = trimNullableString(ref.course_id);
    const courseCode = trimNullableString(ref.course_code);
    if (courseId == null && courseCode == null) return;
    const key = `${ref.source}:${(courseId ?? "").toLowerCase()}:${(courseCode ?? "").toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({
      course_id: courseId,
      course_code: courseCode,
      source: ref.source,
    });
  };

  const [[portalRows], marksRows] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT DISTINCT
         TRIM(e.course_id) AS course_id,
         TRIM(pc.course_code) AS course_code
       FROM portal_enrollments e
       INNER JOIN portal_courses pc
         ON pc.course_id COLLATE utf8mb4_unicode_ci =
            e.course_id COLLATE utf8mb4_unicode_ci
       WHERE CONVERT(TRIM(e.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci`,
      [sid],
    ),
    listMarksForStudent(pool, sid),
  ]);

  for (const row of portalRows) {
    pushRef({
      course_id: trimNullableString(row.course_id),
      course_code: trimNullableString(row.course_code),
      source: "portal",
    });
  }

  const uniqueMarksCodes = Array.from(
    new Set(
      marksRows
        .map((row) => row.code.trim())
        .filter((code) => code !== ""),
    ),
  );
  if (uniqueMarksCodes.length === 0) {
    return refs;
  }

  const placeholders = uniqueMarksCodes.map(() => "?").join(", ");
  const [catalogRows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(course_id) AS course_id, TRIM(course_code) AS course_code
     FROM portal_courses
     WHERE TRIM(course_code) COLLATE utf8mb4_unicode_ci IN (${placeholders})`,
    uniqueMarksCodes,
  );
  const catalogByCode = new Map(
    catalogRows.map((row) => [
      String(row.course_code ?? "").trim().toLowerCase(),
      trimNullableString(row.course_id),
    ]),
  );

  for (const courseCode of uniqueMarksCodes) {
    pushRef({
      course_id: catalogByCode.get(courseCode.toLowerCase()) ?? null,
      course_code: courseCode,
      source: "marks",
    });
  }

  return refs;
}

/**
 * Validates each section against `course_sections` and `portal_courses`, then inserts or reactivates
 * `portal_enrollments` rows. Duplicate / idempotency: same student + `course_section_id` + term + year
 * (active rows skipped; withdrawn rows reactivated). Legacy course-only rows are not used for new writes.
 */
export async function enrollStudentInSections(
  studentExternalId: string,
  term: string,
  year: number,
  sections: EnrollSectionInput[],
  options?: { resolvedSections?: ResolvedEnrollmentSection[] },
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
    const resolvedSections =
      options?.resolvedSections != null
        ? { ok: true as const, sections: options.resolvedSections }
        : await resolveRequestedEnrollmentSectionsForTermWithQueryable(
            conn,
            trimmedTerm,
            year,
            sections,
          );
    if (!resolvedSections.ok) {
      await conn.rollback();
      return resolvedSections;
    }

    for (const section of resolvedSections.sections) {
      const courseCode = section.course_code.trim();
      const courseSectionId = section.course_section_id;
      const secCodeStored = section.section_code.trim();
      const scheduleTrackStored = section.schedule_track;
      const resolved = await resolvePortalCourseIdForEnrollment(conn, courseCode);
      if (!resolved.ok) {
        await conn.rollback();
        return resolved;
      }
      const courseId = resolved.courseId;

      const [[existing]] = await conn.query<RowDataPacket[]>(
        `SELECT id, status FROM portal_enrollments
         WHERE CONVERT(TRIM(student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
               CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci
           AND course_section_id = ?
           AND term COLLATE utf8mb4_unicode_ci =
               CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
           AND year = ?
         LIMIT 2`,
        [sid, courseSectionId, trimmedTerm, year],
      );
      if (existing != null) {
        const st = normalizeEnrollmentStatusForCompare(existing.status);
        if (
          st === "active" ||
          st === "" ||
          st === "enrolled" ||
          st === "registered"
        ) {
          continue;
        }
        if (st === "withdrawn") {
          await conn.query<ResultSetHeader>(
            `UPDATE portal_enrollments
             SET status = 'active',
                 withdrawn_at = NULL,
                 course_id = ?,
                 section_code = ?,
                 schedule_track = ?
             WHERE id = ?`,
            [
              courseId,
              secCodeStored,
              scheduleTrackStored,
              Number(existing.id),
            ],
          );
          insertedCount += 1;
        }
        continue;
      }

      await conn.query<ResultSetHeader>(
        `INSERT INTO portal_enrollments (
           student_external_id, course_id, course_section_id, section_code, schedule_track, term, year, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          sid,
          courseId,
          courseSectionId,
          secCodeStored,
          scheduleTrackStored,
          trimmedTerm,
          year,
        ],
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
 * Active portal enrollment: legacy rows may omit `status` (treated as active).
 * Includes enrolled/registered so timetable and withdraw match Academics `can_withdraw` rules.
 */
const SQL_ACTIVE_PORTAL_ENROLLMENT_E = `(
  e.status IS NULL
  OR LOWER(TRIM(CONVERT(IFNULL(e.status, '') USING utf8mb4))) COLLATE utf8mb4_unicode_ci IN (
    CONVERT('active' USING utf8mb4) COLLATE utf8mb4_unicode_ci,
    CONVERT('enrolled' USING utf8mb4) COLLATE utf8mb4_unicode_ci,
    CONVERT('registered' USING utf8mb4) COLLATE utf8mb4_unicode_ci
  )
)`;

/** Same statuses as {@link SQL_ACTIVE_PORTAL_ENROLLMENT_E} — rows eligible for soft-withdraw UPDATE. */
const SQL_WITHDRAWABLE_PORTAL_ENROLLMENT_E = SQL_ACTIVE_PORTAL_ENROLLMENT_E;

export type StudentEnrolledSectionsQueryMeta = {
  activePortalEnrollmentCount: number;
  matchedSectionCount: number;
};

export type StudentEnrolledSectionsQueryResult = {
  sections: CourseSectionDetail[];
  meta: StudentEnrolledSectionsQueryMeta;
};

/**
 * Scheduled section rows for a student's **active** `portal_enrollments` in one calendar term/year.
 *
 * When `portal_enrollments.course_section_id` is set, the timetable row is that exact section.
 * Legacy rows with `course_section_id` NULL still resolve via `portal_courses.course_code` and a single
 * deterministic `course_sections` pick (`MIN(id)`) per enrollment row.
 */
export async function listStudentEnrolledSectionsForTerm(
  studentExternalId: string,
  term: string,
  year: number,
): Promise<StudentEnrolledSectionsQueryResult> {
  const sid = studentExternalId.trim();
  const t = term.trim();

  const countSql = `
    SELECT COUNT(*) AS cnt
    FROM portal_enrollments e
    WHERE CONVERT(TRIM(e.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.term COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.year = ?
      AND ${SQL_ACTIVE_PORTAL_ENROLLMENT_E}
  `;

  const sectionsSql = `
    SELECT
      COALESCE(cs_direct.id, cs_leg.id) AS id,
      COALESCE(cs_direct.course_code, cs_leg.course_code) AS course_code,
      COALESCE(cs_direct.term, cs_leg.term) AS term,
      COALESCE(cs_direct.year, cs_leg.year) AS year,
      COALESCE(cs_direct.section_code, cs_leg.section_code) AS section_code,
      COALESCE(cs_direct.schedule_track, cs_leg.schedule_track) AS schedule_track,
      COALESCE(cs_direct.weekday, cs_leg.weekday) AS weekday,
      COALESCE(cs_direct.start_time, cs_leg.start_time) AS start_time,
      COALESCE(cs_direct.end_time, cs_leg.end_time) AS end_time,
      COALESCE(cs_direct.delivery_mode, cs_leg.delivery_mode) AS delivery_mode,
      COALESCE(cs_direct.room, cs_leg.room) AS room,
      COALESCE(cs_direct.instructor, cs_leg.instructor) AS instructor,
      COALESCE(cs_direct.notes, cs_leg.notes) AS notes,
      COALESCE(
        NULLIF(TRIM(cat.eng_name), ''),
        NULLIF(TRIM(pc.title), '')
      ) AS course_title,
      0 AS enrolled_count,
      CAST(NULL AS JSON) AS enrolled_students_json
    FROM portal_enrollments e
    INNER JOIN portal_courses pc
      ON pc.course_id COLLATE utf8mb4_unicode_ci =
         e.course_id COLLATE utf8mb4_unicode_ci
    LEFT JOIN course_sections cs_direct
      ON e.course_section_id IS NOT NULL
      AND cs_direct.id = e.course_section_id
      AND cs_direct.term COLLATE utf8mb4_unicode_ci =
          e.term COLLATE utf8mb4_unicode_ci
      AND cs_direct.year = e.year
    LEFT JOIN course_sections cs_leg
      ON e.course_section_id IS NULL
      AND TRIM(cs_leg.course_code) COLLATE utf8mb4_unicode_ci =
          TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
      AND TRIM(cs_leg.term) COLLATE utf8mb4_unicode_ci =
          TRIM(e.term) COLLATE utf8mb4_unicode_ci
      AND cs_leg.year = e.year
      AND cs_leg.id = (
        SELECT MIN(cs2.id)
        FROM course_sections cs2
        WHERE TRIM(cs2.course_code) COLLATE utf8mb4_unicode_ci =
              TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
          AND TRIM(cs2.term) COLLATE utf8mb4_unicode_ci =
              TRIM(e.term) COLLATE utf8mb4_unicode_ci
          AND cs2.year = e.year
      )
    LEFT JOIN courses cat
      ON TRIM(cat.code) COLLATE utf8mb4_unicode_ci =
         TRIM(COALESCE(cs_direct.course_code, cs_leg.course_code)) COLLATE utf8mb4_unicode_ci
    WHERE CONVERT(TRIM(e.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.term COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.year = ?
      AND ${SQL_ACTIVE_PORTAL_ENROLLMENT_E}
      AND (cs_direct.id IS NOT NULL OR cs_leg.id IS NOT NULL)
    ORDER BY course_code ASC, weekday ASC, start_time ASC
  `;

  const countParams = [sid, t, year];
  const sectionParams = [sid, t, year];

  const [[countRows], [sectionRows]] = await Promise.all([
    pool.query<RowDataPacket[]>(countSql, countParams),
    pool.query<RowDataPacket[]>(sectionsSql, sectionParams),
  ]);

  const cntRaw = countRows[0]?.cnt;
  const activePortalEnrollmentCount =
    cntRaw == null ? 0 : Math.trunc(Number(cntRaw)) || 0;

  const sections = sectionRows.map((r) => mapCourseSectionRow(r));

  return {
    sections,
    meta: {
      activePortalEnrollmentCount,
      matchedSectionCount: sections.length,
    },
  };
}

/** @deprecated Prefer {@link listStudentEnrolledSectionsForTerm} for schedule metadata. */
export async function listStudentEnrolledSectionRows(
  studentExternalId: string,
  term: string,
  year: number,
): Promise<CourseSectionDetail[]> {
  const { sections } = await listStudentEnrolledSectionsForTerm(
    studentExternalId,
    term,
    year,
  );
  return sections;
}

export type PortalEnrollmentAcademicStatus =
  | "active"
  | "withdrawn"
  | "completed"
  | "dropped"
  | "unknown";

function normalizeNullableYear(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function normalizePortalEnrollmentAcademicStatus(
  raw: unknown,
): PortalEnrollmentAcademicStatus {
  if (raw == null) return "active";
  const s = String(raw).trim().toLowerCase();
  if (s === "") return "active";
  if (s === "withdrawn") return "withdrawn";
  if (s === "active") return "active";
  if (s === "completed") return "completed";
  if (s === "dropped") return "dropped";
  return "unknown";
}

/** Admin section roster: same `portal_enrollments` + joins as student Academics, all statuses. */
export type AdminSectionEnrollmentRepositoryRow = {
  studentId: string;
  name: string | null;
  status: PortalEnrollmentAcademicStatus;
  grade: string | null;
  withdrawn_at: string | null;
};

export type PortalEnrollmentSectionRosterRepositoryRow = {
  studentId: string;
  studentName: string | null;
  enrollmentStatus: string | null;
  term: string | null;
  year: number | null;
  courseCode: string | null;
  sectionCode: string | null;
  program: string | null;
  email: string | null;
};

/**
 * Current section roster sourced from `portal_enrollments` keyed by `course_section_id`.
 * Includes all current statuses exactly as stored on `portal_enrollments.status`.
 */
export async function listPortalEnrollmentRosterBySectionId(
  sectionId: number,
): Promise<PortalEnrollmentSectionRosterRepositoryRow[]> {
  const sid = Math.trunc(Number(sectionId));
  if (!Number.isFinite(sid) || sid <= 0) return [];

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       TRIM(e.student_external_id) AS student_id,
       NULLIF(TRIM(s.name), '') AS student_name,
       NULLIF(TRIM(e.status), '') AS enrollment_status,
       NULLIF(TRIM(e.term), '') AS term,
       e.year AS year,
       NULLIF(TRIM(cs.course_code), '') AS course_code,
       NULLIF(TRIM(cs.section_code), '') AS section_code,
       NULLIF(TRIM(s.program), '') AS program,
       NULLIF(TRIM(s.email), '') AS email
     FROM portal_enrollments e
     INNER JOIN course_sections cs
       ON e.course_section_id = cs.id
    LEFT JOIN students s
      -- Legacy student identifiers are latin1 in this database; avoid forcing utf8mb4 collation here.
      ON TRIM(s.id) = TRIM(e.student_external_id)
     WHERE e.course_section_id = ?
     ORDER BY
       CASE WHEN s.name IS NULL OR TRIM(s.name) = '' THEN 1 ELSE 0 END ASC,
       TRIM(s.name) ASC,
       TRIM(e.student_external_id) ASC`,
    [sid],
  );

  return rows
    .map((row) => ({
      studentId: String(row.student_id ?? "").trim(),
      studentName: trimNullableString(row.student_name),
      enrollmentStatus: trimNullableString(row.enrollment_status),
      term: trimNullableString(row.term),
      year: normalizeNullableYear(row.year),
      courseCode: trimNullableString(row.course_code),
      sectionCode: trimNullableString(row.section_code),
      program: trimNullableString(row.program),
      email: trimNullableString(row.email),
    }))
    .filter((row) => row.studentId !== "");
}

export async function listAdminEnrollmentRowsForSection(
  courseCode: string,
  term: string,
  year: number,
  options?: { courseSectionId?: number | null },
): Promise<AdminSectionEnrollmentRepositoryRow[]> {
  const code = courseCode.trim();
  const t = term.trim();
  const sid = options?.courseSectionId;
  const sectionFilter =
    sid != null && Number.isFinite(sid) && sid > 0
      ? `AND (
          e.course_section_id = ?
          OR (
            e.course_section_id IS NULL
            AND ? = (
              SELECT MIN(cs2.id)
              FROM course_sections cs2
              WHERE TRIM(cs2.course_code) COLLATE utf8mb4_unicode_ci =
                    TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
                AND TRIM(cs2.term) COLLATE utf8mb4_unicode_ci =
                    TRIM(e.term) COLLATE utf8mb4_unicode_ci
                AND cs2.year = e.year
            )
          )
        )`
      : "";
  const sql = `
    SELECT
      TRIM(e.student_external_id) AS student_external_id,
      TRIM(ps.full_name) AS full_name,
      e.status AS enrollment_status,
      e.withdrawn_at AS withdrawn_at,
      (
        SELECT TRIM(m.grade)
        FROM marks m
        WHERE CONVERT(TRIM(m.id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
              CONVERT(TRIM(e.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci
          AND CONVERT(TRIM(m.code) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
              CONVERT(TRIM(pc.course_code) USING utf8mb4) COLLATE utf8mb4_unicode_ci
          AND LOWER(CONVERT(TRIM(m.term) USING utf8mb4)) COLLATE utf8mb4_unicode_ci =
              LOWER(CONVERT(TRIM(e.term) USING utf8mb4)) COLLATE utf8mb4_unicode_ci
          AND m.year = e.year
        ORDER BY m.seqNumber DESC
        LIMIT 1
      ) AS marks_grade
    FROM portal_enrollments e
    INNER JOIN portal_courses pc ON pc.course_id = e.course_id
    LEFT JOIN portal_students ps
      ON CONVERT(TRIM(ps.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
         CONVERT(TRIM(e.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci
    WHERE CONVERT(TRIM(pc.course_code) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
            CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND CONVERT(TRIM(e.term) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
            CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.year = ?
      ${sectionFilter}
    ORDER BY
      CASE WHEN ps.full_name IS NULL OR TRIM(ps.full_name) = '' THEN 1 ELSE 0 END,
      TRIM(ps.full_name) ASC,
      TRIM(e.student_external_id) ASC
  `;
  const params: unknown[] =
    sid != null && Number.isFinite(sid) && sid > 0
      ? [code, t, year, sid, sid]
      : [code, t, year];
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows.map((r) => {
    const w = r.withdrawn_at;
    let withdrawnAt: string | null = null;
    if (w != null && w !== "") {
      withdrawnAt =
        w instanceof Date ? w.toISOString() : String(w).trim() || null;
    }
    const status = normalizePortalEnrollmentAcademicStatus(r.enrollment_status);
    const marksG = r.marks_grade;
    const marksGrade =
      marksG == null
        ? null
        : (() => {
            const s = String(marksG).trim();
            return s === "" ? null : s;
          })();
    return {
      studentId: String(r.student_external_id ?? "").trim(),
      name: (() => {
        const fn = r.full_name;
        if (fn == null) return null;
        const s = String(fn).trim();
        return s === "" ? null : s;
      })(),
      status,
      grade:
        status === "withdrawn"
          ? "W"
          : marksGrade,
      withdrawn_at: withdrawnAt,
    };
  });
}

export type PortalEnrollmentAcademicRow = {
  /** Stable row id for ordering when the same course appears in multiple sections. */
  portal_enrollment_id: number;
  registration_id: number;
  course_section_id: number | null;
  course_code: string;
  course_title_raw: string;
  display_course_title: string;
  term: string;
  year: number;
  academic_term_id: string | null;
  withdraw_deadline: string | null;
  units: number | null;
  weekday: string | null;
  start_time: unknown;
  end_time: unknown;
  instructor: string | null;
  status: PortalEnrollmentAcademicStatus;
  withdrawn_at: string | null;
  section_code: string | null;
  schedule_track: string | null;
  can_withdraw: boolean;
};

let courseSectionsColumnsPromise: Promise<Set<string>> | null = null;
async function listCourseSectionsColumns(): Promise<Set<string>> {
  if (courseSectionsColumnsPromise != null) return courseSectionsColumnsPromise;
  courseSectionsColumnsPromise = (async () => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME AS column_name
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'course_sections'`,
    );
    const out = new Set<string>();
    for (const row of rows) {
      const name = String(row.column_name ?? "").trim().toLowerCase();
      if (name !== "") out.add(name);
    }
    return out;
  })();
  return courseSectionsColumnsPromise;
}

/** Prime INFORMATION_SCHEMA cache once at API boot so cold requests do not stack on it. */
export async function warmCourseSectionsColumnMetadataCache(): Promise<void> {
  await listCourseSectionsColumns();
}

/** Non-empty trimmed text as utf8mb4 (avoids latin1 vs utf8mb4 in outer COALESCE). */
function utf8mb4TrimNonEmpty(columnRef: string): string {
  return `NULLIF(TRIM(CONVERT(IFNULL(${columnRef}, '') USING utf8mb4)), CONVERT('' USING utf8mb4))`;
}

function titleExpr(alias: "cs_direct" | "cs_leg", columns: Set<string>): string {
  const candidates: string[] = [];
  if (columns.has("chinese_title")) candidates.push(utf8mb4TrimNonEmpty(`${alias}.chinese_title`));
  if (columns.has("course_title_zh")) candidates.push(utf8mb4TrimNonEmpty(`${alias}.course_title_zh`));
  if (columns.has("course_title")) candidates.push(utf8mb4TrimNonEmpty(`${alias}.course_title`));
  if (columns.has("title_zh")) candidates.push(utf8mb4TrimNonEmpty(`${alias}.title_zh`));
  if (columns.has("title")) candidates.push(utf8mb4TrimNonEmpty(`${alias}.title`));
  if (candidates.length === 0) return "NULL";
  return `COALESCE(${candidates.join(", ")})`;
}

export type AdminStudentRegistrationTermRow = {
  term: string;
  year: number;
};

export type AdminStudentRegistrationHistoryRow = {
  courseCode: string;
  courseTitle: string | null;
  section: string | null;
  units: number | null;
  status: string | null;
  term: string;
  year: number;
};

function portalQuarterOrderSql(termColumnRef: string): string {
  const t = `CONVERT(TRIM(IFNULL(${termColumnRef}, '')) USING utf8mb4)`;
  return `CASE
    WHEN UPPER(${t}) = CONVERT('FALL' USING utf8mb4) THEN 4
    WHEN UPPER(${t}) = CONVERT('SUMMER' USING utf8mb4) THEN 3
    WHEN UPPER(${t}) = CONVERT('SPRING' USING utf8mb4) THEN 2
    WHEN UPPER(${t}) = CONVERT('WINTER' USING utf8mb4) THEN 1
    ELSE 0
  END`;
}

/** Distinct portal enrollment term/year options for one student; newest first. */
export async function listPortalEnrollmentTermsForStudent(
  studentExternalId: string,
): Promise<AdminStudentRegistrationTermRow[]> {
  const sid = studentExternalId.trim();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       TRIM(e.term) AS term,
       e.year AS year
     FROM portal_enrollments e
     WHERE CONVERT(TRIM(e.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci
     GROUP BY TRIM(e.term), e.year
     ORDER BY e.year DESC,
       ${portalQuarterOrderSql("e.term")} DESC`,
    [sid],
  );
  return rows
    .map((row) => ({
      term: String(row.term ?? "").trim(),
      year: Number(row.year),
    }))
    .filter((row) => row.term !== "" && Number.isFinite(row.year));
}

/** One row per portal enrollment course for one student + term/year. */
export async function listPortalEnrollmentHistoryForStudentTerm(
  studentExternalId: string,
  term: string,
  year: number,
): Promise<AdminStudentRegistrationHistoryRow[]> {
  const sid = studentExternalId.trim();
  const trimmedTerm = term.trim();
  const sql = `
    SELECT
      TRIM(pc.course_code) AS course_code,
      NULLIF(TRIM(pc.title), '') AS course_title,
      COALESCE(
        NULLIF(TRIM(e.section_code), ''),
        NULLIF(TRIM(cs_direct.section_code), ''),
        NULLIF(TRIM(cs_leg.section_code), '')
      ) AS section_code,
      pc.units AS units,
      NULLIF(TRIM(e.status), '') AS enrollment_status,
      TRIM(e.term) AS term,
      e.year AS year
    FROM portal_enrollments e
    INNER JOIN portal_courses pc
      ON pc.course_id COLLATE utf8mb4_unicode_ci =
         e.course_id COLLATE utf8mb4_unicode_ci
    LEFT JOIN course_sections cs_direct
      ON e.course_section_id IS NOT NULL
      AND cs_direct.id = e.course_section_id
      AND TRIM(cs_direct.term) COLLATE utf8mb4_unicode_ci =
          TRIM(e.term) COLLATE utf8mb4_unicode_ci
      AND cs_direct.year = e.year
    LEFT JOIN course_sections cs_leg
      ON e.course_section_id IS NULL
      AND TRIM(cs_leg.course_code) COLLATE utf8mb4_unicode_ci =
          TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
      AND TRIM(cs_leg.term) COLLATE utf8mb4_unicode_ci =
          TRIM(e.term) COLLATE utf8mb4_unicode_ci
      AND cs_leg.year = e.year
      AND cs_leg.id = (
        SELECT MIN(cs2.id)
        FROM course_sections cs2
        WHERE TRIM(cs2.course_code) COLLATE utf8mb4_unicode_ci =
              TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
          AND TRIM(cs2.term) COLLATE utf8mb4_unicode_ci =
              TRIM(e.term) COLLATE utf8mb4_unicode_ci
          AND cs2.year = e.year
      )
    WHERE CONVERT(TRIM(e.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND TRIM(e.term) COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.year = ?
    ORDER BY
      TRIM(pc.course_code) ASC,
      section_code ASC,
      e.id ASC
  `;
  const [rows] = await pool.query<RowDataPacket[]>(sql, [sid, trimmedTerm, year]);
  return rows.map((row) => {
    const unitsRaw = row.units;
    return {
      courseCode: String(row.course_code ?? "").trim(),
      courseTitle:
        row.course_title == null ? null : String(row.course_title).trim() || null,
      section:
        row.section_code == null ? null : String(row.section_code).trim() || null,
      units:
        unitsRaw == null || unitsRaw === ""
          ? null
          : Number.isFinite(Number(unitsRaw))
            ? Number(unitsRaw)
            : null,
      status:
        row.enrollment_status == null
          ? null
          : String(row.enrollment_status).trim() || null,
      term: String(row.term ?? "").trim(),
      year: Number(row.year),
    };
  });
}

/**
 * Latest portal enrollment term/year for a student (same ordering as legacy registration “latest”).
 */
export async function findLatestPortalEnrollmentTermYear(
  studentExternalId: string,
): Promise<{ term: string; year: number } | null> {
  const sid = studentExternalId.trim();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(e.term) AS term, e.year
     FROM portal_enrollments e
     WHERE CONVERT(TRIM(e.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci
     ORDER BY e.year DESC,
       CASE
         WHEN UPPER(CONVERT(TRIM(IFNULL(e.term, '')) USING utf8mb4)) COLLATE utf8mb4_unicode_ci =
              CONVERT('FALL' USING utf8mb4) COLLATE utf8mb4_unicode_ci
           THEN 4
         WHEN UPPER(CONVERT(TRIM(IFNULL(e.term, '')) USING utf8mb4)) COLLATE utf8mb4_unicode_ci =
              CONVERT('SUMMER' USING utf8mb4) COLLATE utf8mb4_unicode_ci
           THEN 3
         WHEN UPPER(CONVERT(TRIM(IFNULL(e.term, '')) USING utf8mb4)) COLLATE utf8mb4_unicode_ci =
              CONVERT('SPRING' USING utf8mb4) COLLATE utf8mb4_unicode_ci
           THEN 2
         WHEN UPPER(CONVERT(TRIM(IFNULL(e.term, '')) USING utf8mb4)) COLLATE utf8mb4_unicode_ci =
              CONVERT('WINTER' USING utf8mb4) COLLATE utf8mb4_unicode_ci
           THEN 1
         ELSE 0
       END DESC
     LIMIT 1`,
    [sid],
  );
  if (rows.length === 0) return null;
  const r = rows[0]!;
  const term = String(r.term ?? "").trim();
  const year = Number(r.year);
  if (term === "" || !Number.isFinite(year)) return null;
  return { term, year };
}

/**
 * All `portal_enrollments` for a student with catalog title/units and timetable fields from
 * `course_sections`: exact `course_section_id` when present, else legacy `MIN(id)` pick per row.
 */
export async function listPortalEnrollmentRowsForStudentAcademics(
  studentExternalId: string,
): Promise<PortalEnrollmentAcademicRow[]> {
  const sid = studentExternalId.trim();
  const sectionColumns = await listCourseSectionsColumns();
  const directTitleExpr = titleExpr("cs_direct", sectionColumns);
  const legacyTitleExpr = titleExpr("cs_leg", sectionColumns);
  const sql = `
    SELECT
      e.id AS portal_enrollment_id,
      e.id AS registration_id,
      e.course_section_id AS course_section_id,
      TRIM(pc.course_code) AS course_code,
      TRIM(pc.title) AS course_title_raw,
      COALESCE(
        ${directTitleExpr},
        ${legacyTitleExpr},
        CASE
          WHEN UPPER(TRIM(CONVERT(COALESCE(e.schedule_track, cs_direct.schedule_track, cs_leg.schedule_track) USING utf8mb4))) =
               CONVERT('CN' USING utf8mb4)
            THEN ${utf8mb4TrimNonEmpty("cat.chi_name")}
          ELSE NULL
        END,
        ${utf8mb4TrimNonEmpty("cat.eng_name")},
        ${utf8mb4TrimNonEmpty("pc.title")}
      ) AS display_course_title,
      TRIM(e.term) AS term,
      e.year,
      at.id AS academic_term_id,
      at.withdraw_deadline AS withdraw_deadline,
      pc.units,
      NULLIF(TRIM(e.section_code), '') AS enrollment_section_code,
      NULLIF(TRIM(e.schedule_track), '') AS enrollment_schedule_track,
      COALESCE(cs_direct.weekday, cs_leg.weekday) AS weekday,
      COALESCE(cs_direct.start_time, cs_leg.start_time) AS start_time,
      COALESCE(cs_direct.end_time, cs_leg.end_time) AS end_time,
      COALESCE(cs_direct.instructor, cs_leg.instructor) AS instructor,
      e.status AS enrollment_status,
      e.withdrawn_at AS withdrawn_at,
      CASE
        WHEN (
          e.status IS NULL
          OR LOWER(TRIM(CONVERT(IFNULL(e.status, '') USING utf8mb4))) COLLATE utf8mb4_unicode_ci IN (
            CONVERT('active' USING utf8mb4) COLLATE utf8mb4_unicode_ci,
            CONVERT('enrolled' USING utf8mb4) COLLATE utf8mb4_unicode_ci,
            CONVERT('registered' USING utf8mb4) COLLATE utf8mb4_unicode_ci
          )
        )
        AND e.withdrawn_at IS NULL
        AND e.course_section_id IS NOT NULL
        AND (
          at.withdraw_deadline IS NULL
          OR DATE(at.withdraw_deadline) >= CURRENT_DATE()
        )
        THEN 1
        ELSE 0
      END AS can_withdraw
    FROM portal_enrollments e
    INNER JOIN portal_courses pc
      ON CONVERT(pc.course_id USING utf8mb4) COLLATE utf8mb4_unicode_ci =
         CONVERT(e.course_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
    LEFT JOIN course_sections cs_direct
      ON e.course_section_id IS NOT NULL
      AND cs_direct.id = e.course_section_id
      AND CONVERT(TRIM(cs_direct.term) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(TRIM(e.term) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND cs_direct.year = e.year
    LEFT JOIN course_sections cs_leg
      ON e.course_section_id IS NULL
      AND CONVERT(TRIM(cs_leg.course_code) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(TRIM(pc.course_code) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND CONVERT(TRIM(cs_leg.term) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(TRIM(e.term) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND cs_leg.year = e.year
      AND cs_leg.id = (
        SELECT cs2.id
        FROM course_sections cs2
        WHERE CONVERT(TRIM(cs2.course_code) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
              CONVERT(TRIM(pc.course_code) USING utf8mb4) COLLATE utf8mb4_unicode_ci
          AND CONVERT(TRIM(cs2.term) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
              CONVERT(TRIM(e.term) USING utf8mb4) COLLATE utf8mb4_unicode_ci
          AND cs2.year = e.year
        ORDER BY
          (
            cs2.weekday IS NULL
            OR LENGTH(TRIM(CONVERT(IFNULL(cs2.weekday, '') USING utf8mb4))) = 0
            OR cs2.start_time IS NULL
            OR cs2.end_time IS NULL
          ) ASC,
          cs2.id ASC
        LIMIT 1
      )
    LEFT JOIN courses cat
      ON CONVERT(TRIM(cat.code) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
         CONVERT(TRIM(pc.course_code) USING utf8mb4) COLLATE utf8mb4_unicode_ci
    LEFT JOIN academic_terms at
      ON CONVERT(TRIM(at.term_name) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
         CONVERT(TRIM(e.term) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND at.year = e.year
    WHERE CONVERT(TRIM(e.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci
    ORDER BY e.year DESC,
      CASE
        WHEN UPPER(CONVERT(TRIM(IFNULL(e.term, '')) USING utf8mb4)) COLLATE utf8mb4_unicode_ci =
             CONVERT('FALL' USING utf8mb4) COLLATE utf8mb4_unicode_ci
          THEN 4
        WHEN UPPER(CONVERT(TRIM(IFNULL(e.term, '')) USING utf8mb4)) COLLATE utf8mb4_unicode_ci =
             CONVERT('SUMMER' USING utf8mb4) COLLATE utf8mb4_unicode_ci
          THEN 3
        WHEN UPPER(CONVERT(TRIM(IFNULL(e.term, '')) USING utf8mb4)) COLLATE utf8mb4_unicode_ci =
             CONVERT('SPRING' USING utf8mb4) COLLATE utf8mb4_unicode_ci
          THEN 2
        WHEN UPPER(CONVERT(TRIM(IFNULL(e.term, '')) USING utf8mb4)) COLLATE utf8mb4_unicode_ci =
             CONVERT('WINTER' USING utf8mb4) COLLATE utf8mb4_unicode_ci
          THEN 1
        ELSE 0
      END DESC,
      CONVERT(TRIM(pc.course_code) USING utf8mb4) COLLATE utf8mb4_unicode_ci ASC,
      e.id ASC
  `;
  const [rows] = await pool.query<RowDataPacket[]>(sql, [sid]);
  return rows.map((r) => {
    const w = r.withdrawn_at;
    let withdrawnAt: string | null = null;
    if (w != null && w !== "") {
      withdrawnAt =
        w instanceof Date
          ? w.toISOString()
          : String(w).trim() || null;
    }
    const sec =
      r.enrollment_section_code == null
        ? null
        : String(r.enrollment_section_code).trim() || null;
    const tr =
      r.enrollment_schedule_track == null
        ? null
        : String(r.enrollment_schedule_track).trim() || null;
    const wd = r.withdraw_deadline;
    let withdrawDeadline: string | null = null;
    if (wd != null && wd !== "") {
      withdrawDeadline =
        wd instanceof Date
          ? wd.toISOString().slice(0, 10)
          : String(wd).trim().slice(0, 10) || null;
    }
    return {
      portal_enrollment_id: Number(r.portal_enrollment_id ?? 0),
      registration_id: Number(r.registration_id ?? 0),
      course_section_id:
        r.course_section_id == null
          ? null
          : Number.isFinite(Number(r.course_section_id))
            ? Number(r.course_section_id)
            : null,
      course_code: String(r.course_code ?? "").trim(),
      course_title_raw: String(r.course_title_raw ?? "").trim(),
      display_course_title:
        String(r.display_course_title ?? "").trim() ||
        String(r.course_title_raw ?? "").trim() ||
        String(r.course_code ?? "").trim(),
      term: String(r.term ?? "").trim(),
      year: Number(r.year),
      academic_term_id:
        r.academic_term_id == null
          ? null
          : String(r.academic_term_id).trim() || null,
      withdraw_deadline: withdrawDeadline,
      units:
        r.units == null || r.units === ""
          ? null
          : Number.isFinite(Number(r.units))
            ? Number(r.units)
            : null,
      weekday: r.weekday == null ? null : String(r.weekday).trim() || null,
      start_time: r.start_time,
      end_time: r.end_time,
      instructor:
        r.instructor == null ? null : String(r.instructor).trim() || null,
      status: normalizePortalEnrollmentAcademicStatus(r.enrollment_status),
      withdrawn_at: withdrawnAt,
      section_code: sec,
      schedule_track: tr,
      can_withdraw:
        Number.isFinite(Number(r.can_withdraw)) &&
        Number(r.can_withdraw) > 0,
    };
  });
}

/** Result of {@link precheckPortalWithdrawalByCourseSection} / legacy course-only precheck. */
export type PortalWithdrawalPrecheckCode =
  | "allowed"
  | "not_found"
  | "deadline_passed"
  | "already_withdrawn"
  | "completed"
  | "not_withdrawable_status";

/**
 * Server-side withdrawal rules aligned with Academics listing: matching enrollment row,
 * withdrawable status (active/enrolled/registered), and academic term `withdraw_deadline`.
 */
export async function precheckPortalWithdrawalByCourseSection(
  studentExternalId: string,
  term: string,
  year: number,
  courseSectionId: number,
): Promise<PortalWithdrawalPrecheckCode> {
  const sid = studentExternalId.trim();
  const t = term.trim();
  const csid = Math.trunc(Number(courseSectionId));
  if (!Number.isFinite(csid) || csid <= 0) return "not_found";

  const sql = `
    SELECT
      LOWER(TRIM(CONVERT(IFNULL(e.status, '') USING utf8mb4))) COLLATE utf8mb4_unicode_ci AS st,
      e.withdrawn_at AS withdrawn_at,
      CASE
        WHEN at.withdraw_deadline IS NOT NULL
          AND DATE(at.withdraw_deadline) < CURRENT_DATE()
        THEN 1
        ELSE 0
      END AS deadline_passed,
      CASE WHEN ${SQL_WITHDRAWABLE_PORTAL_ENROLLMENT_E} THEN 1 ELSE 0 END AS withdrawable
    FROM portal_enrollments e
    INNER JOIN portal_courses pc ON pc.course_id = e.course_id
    LEFT JOIN academic_terms at
      ON CONVERT(TRIM(at.term_name) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
         CONVERT(TRIM(e.term) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND at.year = e.year
    WHERE CONVERT(TRIM(e.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.term COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.year = ?
      AND (
        e.course_section_id = ?
        OR (
          e.course_section_id IS NULL
          AND EXISTS (
            SELECT 1 FROM course_sections cs0
            WHERE cs0.id = ?
              AND TRIM(cs0.course_code) COLLATE utf8mb4_unicode_ci =
                  TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
              AND TRIM(cs0.term) COLLATE utf8mb4_unicode_ci =
                  TRIM(e.term) COLLATE utf8mb4_unicode_ci
              AND cs0.year = e.year
          )
          AND ? = (
            SELECT MIN(cs2.id)
            FROM course_sections cs2
            WHERE TRIM(cs2.course_code) COLLATE utf8mb4_unicode_ci =
                  TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
              AND TRIM(cs2.term) COLLATE utf8mb4_unicode_ci =
                  TRIM(e.term) COLLATE utf8mb4_unicode_ci
              AND cs2.year = e.year
          )
        )
      )
    LIMIT 1
  `;
  const [rows] = await pool.query<RowDataPacket[]>(sql, [
    sid,
    t,
    year,
    csid,
    csid,
    csid,
  ]);
  const r = rows[0];
  if (r == null) return "not_found";

  const withdrawnAt = r.withdrawn_at;
  if (withdrawnAt != null && String(withdrawnAt).trim() !== "") {
    return "already_withdrawn";
  }
  const st = String(r.st ?? "").trim().toLowerCase();
  if (st === "withdrawn") return "already_withdrawn";
  if (st === "completed") return "completed";

  if (Number(r.deadline_passed) === 1) return "deadline_passed";

  if (Number(r.withdrawable) !== 1) return "not_withdrawable_status";

  return "allowed";
}

export async function precheckPortalWithdrawalLegacyCourseOnly(
  studentExternalId: string,
  courseCode: string,
  term: string,
  year: number,
): Promise<PortalWithdrawalPrecheckCode> {
  const sid = studentExternalId.trim();
  const code = courseCode.trim();
  const t = term.trim();

  const sql = `
    SELECT
      LOWER(TRIM(CONVERT(IFNULL(e.status, '') USING utf8mb4))) COLLATE utf8mb4_unicode_ci AS st,
      e.withdrawn_at AS withdrawn_at,
      CASE
        WHEN at.withdraw_deadline IS NOT NULL
          AND DATE(at.withdraw_deadline) < CURRENT_DATE()
        THEN 1
        ELSE 0
      END AS deadline_passed,
      CASE WHEN ${SQL_WITHDRAWABLE_PORTAL_ENROLLMENT_E} THEN 1 ELSE 0 END AS withdrawable
    FROM portal_enrollments e
    INNER JOIN portal_courses pc ON pc.course_id = e.course_id
    LEFT JOIN academic_terms at
      ON CONVERT(TRIM(at.term_name) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
         CONVERT(TRIM(e.term) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND at.year = e.year
    WHERE CONVERT(TRIM(e.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND pc.course_code COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.term COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.year = ?
      AND e.course_section_id IS NULL
    LIMIT 1
  `;
  const [rows] = await pool.query<RowDataPacket[]>(sql, [sid, code, t, year]);
  const r = rows[0];
  if (r == null) return "not_found";

  const withdrawnAt = r.withdrawn_at;
  if (withdrawnAt != null && String(withdrawnAt).trim() !== "") {
    return "already_withdrawn";
  }
  const st = String(r.st ?? "").trim().toLowerCase();
  if (st === "withdrawn") return "already_withdrawn";
  if (st === "completed") return "completed";

  if (Number(r.deadline_passed) === 1) return "deadline_passed";

  if (Number(r.withdrawable) !== 1) return "not_withdrawable_status";

  return "allowed";
}

/**
 * Soft-withdraws the enrollment row for one `course_sections.id` (and matching calendar term/year).
 * Only `portal_enrollments` is updated.
 */
export async function softWithdrawPortalEnrollmentByCourseSection(
  studentExternalId: string,
  term: string,
  year: number,
  courseSectionId: number,
): Promise<number> {
  const sid = studentExternalId.trim();
  const t = term.trim();
  const csid = Math.trunc(Number(courseSectionId));
  if (!Number.isFinite(csid) || csid <= 0) return 0;
  /**
   * Section-keyed rows match `course_section_id` directly.
   * Legacy rows (`course_section_id` NULL) match when the withdraw target is the canonical
   * `MIN(course_sections.id)` for that catalog course + term/year (same pick as timetable reads).
   */
  const sql = `
    UPDATE portal_enrollments e
    INNER JOIN portal_courses pc ON pc.course_id = e.course_id
    SET
      e.status = 'withdrawn',
      e.withdrawn_at = NOW()
    WHERE CONVERT(TRIM(e.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.term COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.year = ?
      AND ${SQL_WITHDRAWABLE_PORTAL_ENROLLMENT_E}
      AND (
        e.course_section_id = ?
        OR (
          e.course_section_id IS NULL
          AND EXISTS (
            SELECT 1 FROM course_sections cs0
            WHERE cs0.id = ?
              AND TRIM(cs0.course_code) COLLATE utf8mb4_unicode_ci =
                  TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
              AND TRIM(cs0.term) COLLATE utf8mb4_unicode_ci =
                  TRIM(e.term) COLLATE utf8mb4_unicode_ci
              AND cs0.year = e.year
          )
          AND ? = (
            SELECT MIN(cs2.id)
            FROM course_sections cs2
            WHERE TRIM(cs2.course_code) COLLATE utf8mb4_unicode_ci =
                  TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
              AND TRIM(cs2.term) COLLATE utf8mb4_unicode_ci =
                  TRIM(e.term) COLLATE utf8mb4_unicode_ci
              AND cs2.year = e.year
          )
        )
      )
  `;
  const [result] = await pool.query<ResultSetHeader>(sql, [
    sid,
    t,
    year,
    csid,
    csid,
    csid,
  ]);
  return result.affectedRows;
}

/**
 * Legacy: soft-withdraws a **course-level** portal row (`course_section_id` IS NULL) only.
 * Does not affect section-keyed enrollments for the same course code.
 */
export async function deletePortalEnrollmentByStudentCourseTermYear(
  studentExternalId: string,
  courseCode: string,
  term: string,
  year: number,
): Promise<number> {
  const sid = studentExternalId.trim();
  const code = courseCode.trim();
  const t = term.trim();
  const sql = `
    UPDATE portal_enrollments e
    INNER JOIN portal_courses pc ON pc.course_id = e.course_id
    SET
      e.status = 'withdrawn',
      e.withdrawn_at = NOW()
    WHERE CONVERT(TRIM(e.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND pc.course_code COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.term COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.year = ?
      AND e.course_section_id IS NULL
      AND ${SQL_WITHDRAWABLE_PORTAL_ENROLLMENT_E}
  `;
  const [result] = await pool.query<ResultSetHeader>(sql, [sid, code, t, year]);
  return result.affectedRows;
}

export async function getPortalStudentDisplayName(
  studentExternalId: string,
): Promise<string | null> {
  const sid = studentExternalId.trim();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(ps.full_name) AS full_name
     FROM portal_students ps
     WHERE CONVERT(TRIM(ps.student_external_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
           CONVERT(TRIM(?) USING utf8mb4) COLLATE utf8mb4_unicode_ci
     LIMIT 1`,
    [sid],
  );
  const row = rows[0];
  if (row == null) return null;
  const n = String(row.full_name ?? "").trim();
  return n.length > 0 ? n : null;
}
