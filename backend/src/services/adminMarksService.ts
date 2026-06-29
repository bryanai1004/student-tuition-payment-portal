import { pool, type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "../lib/db.js";
import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import { upsertMarkGrade } from "../repositories/adminMarksRepository.js";

/** Same letter → numeric mapping as admin roster UI; server is source of truth for `grade2`. */
const GRADE_TO_NUMERIC: Record<string, number | null> = {
  A: 4,
  "A-": 3.75,
  "B+": 3.5,
  B: 3,
  "B-": 2.75,
  "C+": 2.5,
  C: 2,
  "C-": 1.75,
  D: 1,
  F: 0,
  P: null,
  NP: null,
  INC: null,
};

export type SetAdminMarkGradeInput = {
  studentId: string;
  courseCode: string;
  /** Portal `academic_terms.id` (UUID). */
  academicTermId: string;
  grade: string;
};

export type SetAdminMarkGradeResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

export type AdminClinicalEnrollmentGradeSnapshot = {
  enrollmentId: number;
  studentId: string;
  clinicalBaseCode: string | null;
  clinicalCode: string | null;
  grade: string;
  grade2: number | null;
};

export type SetAdminClinicalEnrollmentGradeInput = {
  timetableId: number;
  enrollmentId: number;
  studentId: string;
  grade: string;
  grade2?: number | null;
};

export type SetAdminClinicalEnrollmentGradeResult =
  | { ok: true; clinicalCode: string; clinicalBaseCode: string }
  | { ok: false; error: string; status: number };

function isClinicalAttemptCourseCode(code: string): boolean {
  return /^(CL111|CL113|CL211|CL311)(-\d+)?$/i.test(code.trim());
}

type ClinicalEnrollmentGradeContext = {
  enrollmentId: number;
  studentId: string;
  term: string;
  year: number;
  status: string;
  seatBucket: "100" | "200" | "300" | "all" | null;
  weekday: string;
  timeFrom: string;
  timeTo: string;
  instructor: string;
  cap100: number;
  cap200: number;
  cap300: number;
};

type ClinicalAttemptRow = {
  code: string;
  courseTitle: string;
  grade: string;
  grade2: number | null;
  units: number;
  days: string;
  timeFrom: string;
  timeTo: string;
  instructor: string;
};

function normalizeSqlTimeHms(v: unknown): string {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return "00:00:00";
  const hh = String(Math.max(0, Math.min(23, Number(m[1])))).padStart(2, "0");
  const mm = String(Math.max(0, Math.min(59, Number(m[2])))).padStart(2, "0");
  const ss = String(
    Math.max(0, Math.min(59, m[3] != null ? Number(m[3]) : 0)),
  ).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function normalizeSeatBucket(
  v: unknown,
): "100" | "200" | "300" | "all" | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "100" || s === "200" || s === "300" || s === "all") return s;
  return null;
}

function preferredClinicalAttemptBaseCode(args: {
  requestedSeatBucket: "100" | "200" | "300" | "all" | null;
  caps: { c100: number; c200: number; c300: number };
}): string {
  const requested = args.requestedSeatBucket;
  if (requested === "100") return "CL111";
  if (requested === "200") return "CL211";
  if (requested === "300") return "CL311";
  const available: Array<"100" | "200" | "300"> = [];
  if (args.caps.c100 > 0) available.push("100");
  if (args.caps.c200 > 0) available.push("200");
  if (args.caps.c300 > 0) available.push("300");
  const bucket = available.length === 1 ? available[0] : "100";
  if (bucket === "200") return "CL211";
  if (bucket === "300") return "CL311";
  return "CL111";
}

function parseAttemptSuffix(code: string, baseCode: string): number {
  const m = code.trim().toUpperCase().match(new RegExp(`^${baseCode}-(\\d+)$`));
  if (!m) return -1;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : -1;
}

function pickBestClinicalAttemptRow(
  rows: ClinicalAttemptRow[],
  baseCode: string,
): ClinicalAttemptRow | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort(
    (a, b) => parseAttemptSuffix(b.code, baseCode) - parseAttemptSuffix(a.code, baseCode),
  );
  const ungraded = sorted.find((r) => r.grade.trim() === "");
  return ungraded ?? sorted[0] ?? null;
}

async function loadClinicalEnrollmentGradeContext(
  conn: PoolConnection,
  args: { timetableId: number; enrollmentId: number; studentId: string; lock: boolean },
): Promise<ClinicalEnrollmentGradeContext | null> {
  const sid = args.studentId.trim();
  if (sid === "") return null;
  const lockSuffix = args.lock ? "FOR UPDATE" : "";
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT
        ce.id AS enrollment_id,
        TRIM(ce.student_id) AS student_id,
        TRIM(ce.term) AS term,
        ce.year AS year,
        LOWER(TRIM(ce.status)) AS status,
        LOWER(TRIM(COALESCE(NULLIF(TRIM(ce.seat_bucket), ''), 'all'))) AS seat_bucket,
        TRIM(ct.day) AS weekday,
        ct.time_from AS time_from,
        ct.time_to AS time_to,
        TRIM(COALESCE(ct.instructor, '')) AS instructor,
        ct.\`100Max\` AS cap_100,
        ct.\`200Max\` AS cap_200,
        ct.\`300Max\` AS cap_300
     FROM clinical_enrollments ce
     INNER JOIN clinic_timetable ct ON ct.seqNum = ce.timetable_id
     WHERE ce.timetable_id = ?
       AND ce.id = ?
       AND TRIM(ce.student_id) = TRIM(?)
     LIMIT 1
     ${lockSuffix}`,
    [args.timetableId, args.enrollmentId, sid],
  );
  if (rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;
  return {
    enrollmentId: Number(r.enrollment_id),
    studentId: String(r.student_id ?? "").trim(),
    term: String(r.term ?? "").trim(),
    year: Number(r.year),
    status: String(r.status ?? "").trim().toLowerCase(),
    seatBucket: normalizeSeatBucket(r.seat_bucket),
    weekday: String(r.weekday ?? "").trim(),
    timeFrom: normalizeSqlTimeHms(r.time_from),
    timeTo: normalizeSqlTimeHms(r.time_to),
    instructor: String(r.instructor ?? "").trim(),
    cap100: Math.max(0, Math.trunc(Number(r.cap_100))),
    cap200: Math.max(0, Math.trunc(Number(r.cap_200))),
    cap300: Math.max(0, Math.trunc(Number(r.cap_300))),
  };
}

async function loadMatchingClinicalAttemptRows(
  conn: PoolConnection,
  args: {
    studentId: string;
    term: string;
    year: number;
    baseCode: string;
    weekday: string;
    timeFrom: string;
    timeTo: string;
    instructor: string;
    lock: boolean;
  },
): Promise<ClinicalAttemptRow[]> {
  const lockSuffix = args.lock ? "FOR UPDATE" : "";
  const [strictRows] = await conn.query<RowDataPacket[]>(
    `SELECT
        TRIM(code) AS code,
        TRIM(COALESCE(course_title, '')) AS course_title,
        TRIM(COALESCE(grade, '')) AS grade,
        grade2,
        units,
        TRIM(COALESCE(days, '')) AS days,
        time_from,
        time_to,
        TRIM(COALESCE(instructor, '')) AS instructor
     FROM clinic
     WHERE TRIM(id) = TRIM(?)
       AND TRIM(term) = TRIM(?)
       AND year = ?
       AND UPPER(TRIM(code)) LIKE CONCAT(?, '-%')
       AND TRIM(COALESCE(days, '')) = TRIM(?)
       AND time_from = ?
       AND time_to = ?
       AND TRIM(COALESCE(instructor, '')) = TRIM(?)
     ${lockSuffix}`,
    [
      args.studentId.trim(),
      args.term.trim(),
      args.year,
      args.baseCode,
      args.weekday.trim(),
      args.timeFrom,
      args.timeTo,
      args.instructor.trim(),
    ],
  );
  const fromStrict = strictRows.map((row) => {
    const r = row as Record<string, unknown>;
    const unitsRaw = Number(r.units);
    const grade2Raw = Number(r.grade2);
    return {
      code: String(r.code ?? "").trim().toUpperCase(),
      courseTitle: String(r.course_title ?? "").trim(),
      grade: String(r.grade ?? "").trim(),
      grade2: Number.isFinite(grade2Raw) ? grade2Raw : null,
      units: Number.isFinite(unitsRaw) ? unitsRaw : 2,
      days: String(r.days ?? "").trim(),
      timeFrom: normalizeSqlTimeHms(r.time_from),
      timeTo: normalizeSqlTimeHms(r.time_to),
      instructor: String(r.instructor ?? "").trim(),
    } satisfies ClinicalAttemptRow;
  });
  if (fromStrict.length > 0) return fromStrict;

  const [fallbackRows] = await conn.query<RowDataPacket[]>(
    `SELECT
        TRIM(code) AS code,
        TRIM(COALESCE(course_title, '')) AS course_title,
        TRIM(COALESCE(grade, '')) AS grade,
        grade2,
        units,
        TRIM(COALESCE(days, '')) AS days,
        time_from,
        time_to,
        TRIM(COALESCE(instructor, '')) AS instructor
     FROM clinic
     WHERE TRIM(id) = TRIM(?)
       AND TRIM(term) = TRIM(?)
       AND year = ?
       AND UPPER(TRIM(code)) LIKE CONCAT(?, '-%')
     ${lockSuffix}`,
    [args.studentId.trim(), args.term.trim(), args.year, args.baseCode],
  );
  return fallbackRows.map((row) => {
    const r = row as Record<string, unknown>;
    const unitsRaw = Number(r.units);
    const grade2Raw = Number(r.grade2);
    return {
      code: String(r.code ?? "").trim().toUpperCase(),
      courseTitle: String(r.course_title ?? "").trim(),
      grade: String(r.grade ?? "").trim(),
      grade2: Number.isFinite(grade2Raw) ? grade2Raw : null,
      units: Number.isFinite(unitsRaw) ? unitsRaw : 2,
      days: String(r.days ?? "").trim(),
      timeFrom: normalizeSqlTimeHms(r.time_from),
      timeTo: normalizeSqlTimeHms(r.time_to),
      instructor: String(r.instructor ?? "").trim(),
    } satisfies ClinicalAttemptRow;
  });
}

async function assertEnrollmentAllowsMarkGrade(
  db: Pool,
  studentId: string,
  courseCode: string,
  legacyTerm: string,
  year: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = studentId.trim();
  const code = courseCode.trim();
  const term = legacyTerm.trim();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT 1 AS ok
     FROM portal_enrollments e
     INNER JOIN portal_courses pc ON pc.course_id = e.course_id
     WHERE TRIM(e.student_external_id) = TRIM(?)
       AND TRIM(pc.course_code) = TRIM(?)
       AND TRIM(e.term) = TRIM(?)
       AND e.year = ?
       AND (e.status IS NULL OR LOWER(TRIM(e.status)) = 'active')
     LIMIT 1`,
    [sid, code, term, year],
  );
  if (rows.length === 0) {
    return {
      ok: false,
      error:
        "Student has no active portal enrollment in this course for this term.",
    };
  }
  return { ok: true };
}

async function resolveStudentNameForMarks(
  conn: PoolConnection,
  studentId: string,
): Promise<string> {
  const sid = studentId.trim();
  const [legacyRows] = await conn.query<RowDataPacket[]>(
    `SELECT TRIM(name) AS name
       FROM students
      WHERE TRIM(id) = TRIM(?)
      LIMIT 1`,
    [sid],
  );
  if (legacyRows.length > 0) {
    const n = String((legacyRows[0] as { name?: unknown }).name ?? "").trim();
    if (n !== "") return n;
  }
  const [portalRows] = await conn.query<RowDataPacket[]>(
    `SELECT TRIM(full_name) AS name
       FROM portal_students
      WHERE TRIM(student_external_id) = TRIM(?)
      LIMIT 1`,
    [sid],
  );
  if (portalRows.length > 0) {
    const n = String((portalRows[0] as { name?: unknown }).name ?? "").trim();
    if (n !== "") return n;
  }
  return sid;
}

async function updateClinicAndUpsertMarksForClinicalAttempt(
  args: {
    studentId: string;
    courseCode: string;
    term: string;
    year: number;
    grade: string;
    grade2Numeric: number | null;
  },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sid = args.studentId.trim();
    const code = args.courseCode.trim().toUpperCase();
    const term = args.term.trim();
    const year = Math.trunc(args.year);
    const grade = args.grade.trim();
    const grade2 =
      args.grade2Numeric != null && Number.isFinite(args.grade2Numeric)
        ? args.grade2Numeric
        : 0;

    const [clinicRows] = await conn.query<RowDataPacket[]>(
      `SELECT course_title, units, days, time_from, time_to, instructor
         FROM clinic
        WHERE TRIM(id) = TRIM(?)
          AND UPPER(TRIM(code)) = UPPER(TRIM(?))
          AND LOWER(TRIM(term)) = LOWER(TRIM(?))
          AND year = ?
        ORDER BY year DESC
        LIMIT 1
        FOR UPDATE`,
      [sid, code, term, year],
    );
    if (clinicRows.length === 0) {
      await conn.rollback();
      return {
        ok: false,
        status: 404,
        error: "Clinical attempt row not found in clinic for this term.",
      };
    }
    const clinic = clinicRows[0] as Record<string, unknown>;
    const courseTitle = String(clinic.course_title ?? "").trim();
    const unitsRaw = Number(clinic.units);
    const units = Number.isFinite(unitsRaw) ? unitsRaw : 2;
    const days = String(clinic.days ?? "").trim();
    const timeFrom = String(clinic.time_from ?? "00:00:00");
    const timeTo = String(clinic.time_to ?? "00:00:00");
    const instructor = String(clinic.instructor ?? "").trim();

    const [clinicUpdate] = await conn.query<ResultSetHeader>(
      `UPDATE clinic
          SET grade = ?, grade2 = ?
        WHERE TRIM(id) = TRIM(?)
          AND UPPER(TRIM(code)) = UPPER(TRIM(?))
          AND LOWER(TRIM(term)) = LOWER(TRIM(?))
          AND year = ?`,
      [grade, grade2, sid, code, term, year],
    );
    if (Number(clinicUpdate.affectedRows ?? 0) <= 0) {
      await conn.rollback();
      return {
        ok: false,
        status: 404,
        error: "Clinical attempt row could not be updated.",
      };
    }

    const [marksSeqRows] = await conn.query<RowDataPacket[]>(
      `SELECT seqNumber AS seq
         FROM marks
        WHERE TRIM(id) = TRIM(?)
          AND UPPER(TRIM(code)) = UPPER(TRIM(?))
          AND LOWER(TRIM(term)) = LOWER(TRIM(?))
          AND year = ?
        ORDER BY seqNumber DESC
        LIMIT 1
        FOR UPDATE`,
      [sid, code, term, year],
    );
    if (marksSeqRows.length > 0) {
      const seq = Number((marksSeqRows[0] as { seq?: unknown }).seq);
      if (Number.isFinite(seq)) {
        await conn.query<ResultSetHeader>(
          `UPDATE marks
              SET course_title = ?,
                  grade = ?,
                  grade2 = ?
            WHERE seqNumber = ?`,
          [courseTitle, grade, grade2, Math.trunc(seq)],
        );
      }
    } else {
      const studentName = await resolveStudentNameForMarks(conn, sid);
      await conn.query<ResultSetHeader>(
        `INSERT INTO marks (
          name, id, regis, code, grade, grade2, course_title, units,
          days, time_from, time_to, instructor, term, year, language, indie_study
        ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'English', '')`,
        [
          studentName,
          sid,
          code,
          grade,
          grade2,
          courseTitle,
          units,
          days,
          timeFrom,
          timeTo,
          instructor,
          term,
          year,
        ],
      );
    }

    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    const o = e as { sqlMessage?: string; message?: string };
    const dbOrMsg = o?.sqlMessage ?? (e instanceof Error ? e.message : String(e));
    console.error(
      "[admin-marks] clinical attempt grade update failed:",
      dbOrMsg,
    );
    return {
      ok: false,
      status: 500,
      error: "Failed to save clinical attempt grade.",
    };
  } finally {
    conn.release();
  }
}

export async function setAdminStudentMarkGrade(
  input: SetAdminMarkGradeInput,
): Promise<SetAdminMarkGradeResult> {
  const studentId = input.studentId.trim();
  const courseCode = input.courseCode.trim();
  const academicTermId = input.academicTermId.trim();
  const grade = input.grade.trim();
  if (studentId === "" || courseCode === "" || academicTermId === "") {
    return { ok: false, status: 400, error: "Missing studentId, courseCode, or term." };
  }
  if (grade === "") {
    return { ok: false, status: 400, error: "Grade is required." };
  }
  if (!(grade in GRADE_TO_NUMERIC)) {
    return { ok: false, status: 400, error: "Invalid grade." };
  }
  const termRow = await getAcademicTermById(academicTermId);
  if (!termRow) {
    return {
      ok: false,
      status: 400,
      error: "The selected academic term is not valid or no longer exists.",
    };
  }
  const grade2Numeric = GRADE_TO_NUMERIC[grade] ?? null;
  if (isClinicalAttemptCourseCode(courseCode)) {
    return updateClinicAndUpsertMarksForClinicalAttempt({
      studentId,
      courseCode,
      term: termRow.term_name,
      year: termRow.year,
      grade,
      grade2Numeric,
    });
  }
  const gate = await assertEnrollmentAllowsMarkGrade(
    pool,
    studentId,
    courseCode,
    termRow.term_name,
    termRow.year,
  );
  if (!gate.ok) {
    return { ok: false, status: 400, error: gate.error };
  }
  try {
    await upsertMarkGrade(pool, {
      studentId,
      courseCode,
      legacyTerm: termRow.term_name,
      year: termRow.year,
      grade,
      grade2Numeric,
    });
  } catch (e) {
    const o = e as { sqlMessage?: string; message?: string };
    const dbOrMsg = o?.sqlMessage ?? (e instanceof Error ? e.message : String(e));
    console.error("[admin-marks] upsertMarkGrade failed (see staged logs above if DB):", dbOrMsg);
    return {
      ok: false,
      status: 500,
      error: "Failed to save grade.",
    };
  }
  return { ok: true };
}

export async function getAdminClinicalEnrollmentGradeSnapshot(args: {
  timetableId: number;
  enrollmentId: number;
  studentId: string;
}): Promise<AdminClinicalEnrollmentGradeSnapshot | null> {
  if (
    !Number.isInteger(args.timetableId) ||
    args.timetableId <= 0 ||
    !Number.isInteger(args.enrollmentId) ||
    args.enrollmentId <= 0
  ) {
    return null;
  }
  const studentId = args.studentId.trim();
  if (studentId === "") return null;
  const conn = await pool.getConnection();
  try {
    const context = await loadClinicalEnrollmentGradeContext(conn, {
      timetableId: args.timetableId,
      enrollmentId: args.enrollmentId,
      studentId,
      lock: false,
    });
    if (context == null) return null;
    const baseCode = preferredClinicalAttemptBaseCode({
      requestedSeatBucket: context.seatBucket,
      caps: { c100: context.cap100, c200: context.cap200, c300: context.cap300 },
    });
    const matched = pickBestClinicalAttemptRow(
      await loadMatchingClinicalAttemptRows(conn, {
        studentId: context.studentId,
        term: context.term,
        year: context.year,
        baseCode,
        weekday: context.weekday,
        timeFrom: context.timeFrom,
        timeTo: context.timeTo,
        instructor: context.instructor,
        lock: false,
      }),
      baseCode,
    );
    return {
      enrollmentId: context.enrollmentId,
      studentId: context.studentId,
      clinicalBaseCode: baseCode,
      clinicalCode: matched?.code ?? null,
      grade: matched?.grade ?? "",
      grade2: matched?.grade2 ?? null,
    };
  } finally {
    conn.release();
  }
}

export async function setAdminClinicalEnrollmentGrade(
  input: SetAdminClinicalEnrollmentGradeInput,
): Promise<SetAdminClinicalEnrollmentGradeResult> {
  if (!Number.isInteger(input.timetableId) || input.timetableId <= 0) {
    return { ok: false, status: 400, error: "Invalid timetable id." };
  }
  if (!Number.isInteger(input.enrollmentId) || input.enrollmentId <= 0) {
    return { ok: false, status: 400, error: "Invalid enrollment id." };
  }
  const studentId = input.studentId.trim();
  if (studentId === "") {
    return { ok: false, status: 400, error: "studentId is required." };
  }
  const grade = input.grade.trim().toUpperCase();
  if (grade === "") {
    return { ok: false, status: 400, error: "Grade is required." };
  }
  if (!(grade in GRADE_TO_NUMERIC)) {
    return { ok: false, status: 400, error: "Invalid grade." };
  }
  const explicitGrade2 =
    input.grade2 != null && Number.isFinite(input.grade2) ? Number(input.grade2) : null;
  const grade2Numeric =
    explicitGrade2 != null ? explicitGrade2 : (GRADE_TO_NUMERIC[grade] ?? null);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const context = await loadClinicalEnrollmentGradeContext(conn, {
      timetableId: input.timetableId,
      enrollmentId: input.enrollmentId,
      studentId,
      lock: true,
    });
    if (context == null) {
      await conn.rollback();
      return {
        ok: false,
        status: 404,
        error: "Clinical enrollment was not found for this slot/student.",
      };
    }
    if (context.status === "dropped") {
      await conn.rollback();
      return { ok: false, status: 400, error: "Dropped enrollments cannot be graded." };
    }
    const baseCode = preferredClinicalAttemptBaseCode({
      requestedSeatBucket: context.seatBucket,
      caps: { c100: context.cap100, c200: context.cap200, c300: context.cap300 },
    });
    const matched = pickBestClinicalAttemptRow(
      await loadMatchingClinicalAttemptRows(conn, {
        studentId: context.studentId,
        term: context.term,
        year: context.year,
        baseCode,
        weekday: context.weekday,
        timeFrom: context.timeFrom,
        timeTo: context.timeTo,
        instructor: context.instructor,
        lock: true,
      }),
      baseCode,
    );
    if (matched == null) {
      await conn.rollback();
      return {
        ok: false,
        status: 404,
        error: `No matching ${baseCode}-* clinical attempt row was found for this enrollment.`,
      };
    }

    const grade2Write =
      grade2Numeric != null && Number.isFinite(grade2Numeric) ? grade2Numeric : 0;
    const [clinicUpdate] = await conn.query<ResultSetHeader>(
      `UPDATE clinic
          SET grade = ?, grade2 = ?
        WHERE TRIM(id) = TRIM(?)
          AND TRIM(term) = TRIM(?)
          AND year = ?
          AND UPPER(TRIM(code)) = UPPER(TRIM(?))
        LIMIT 1`,
      [grade, grade2Write, context.studentId, context.term, context.year, matched.code],
    );
    if (Number(clinicUpdate.affectedRows ?? 0) <= 0) {
      await conn.rollback();
      return {
        ok: false,
        status: 404,
        error: "The matching clinical attempt row could not be updated.",
      };
    }

    const [marksSeqRows] = await conn.query<RowDataPacket[]>(
      `SELECT seqNumber AS seq
         FROM marks
        WHERE TRIM(id) = TRIM(?)
          AND UPPER(TRIM(code)) = UPPER(TRIM(?))
          AND LOWER(TRIM(term)) = LOWER(TRIM(?))
          AND year = ?
        ORDER BY seqNumber DESC
        LIMIT 1
        FOR UPDATE`,
      [context.studentId, matched.code, context.term, context.year],
    );
    const courseTitle = matched.courseTitle.trim() !== "" ? matched.courseTitle : matched.code;
    if (marksSeqRows.length > 0) {
      const seq = Number((marksSeqRows[0] as { seq?: unknown }).seq);
      if (Number.isFinite(seq)) {
        await conn.query<ResultSetHeader>(
          `UPDATE marks
              SET course_title = ?,
                  grade = ?,
                  grade2 = ?
            WHERE seqNumber = ?`,
          [courseTitle, grade, grade2Write, Math.trunc(seq)],
        );
      }
    } else {
      const studentName = await resolveStudentNameForMarks(conn, context.studentId);
      await conn.query<ResultSetHeader>(
        `INSERT INTO marks (
          name, id, regis, code, grade, grade2, course_title, units,
          days, time_from, time_to, instructor, term, year, language, indie_study
        ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'English', '')`,
        [
          studentName,
          context.studentId,
          matched.code,
          grade,
          grade2Write,
          courseTitle,
          Number.isFinite(matched.units) ? matched.units : 2,
          matched.days,
          matched.timeFrom,
          matched.timeTo,
          matched.instructor,
          context.term,
          context.year,
        ],
      );
    }

    await conn.commit();
    return {
      ok: true,
      clinicalCode: matched.code,
      clinicalBaseCode: baseCode,
    };
  } catch (e) {
    await conn.rollback();
    const o = e as { sqlMessage?: string; message?: string };
    const dbOrMsg = o?.sqlMessage ?? (e instanceof Error ? e.message : String(e));
    console.error("[admin-marks] clinical roster grade update failed:", dbOrMsg);
    return {
      ok: false,
      status: 500,
      error: "Failed to save clinical roster grade.",
    };
  } finally {
    conn.release();
  }
}
