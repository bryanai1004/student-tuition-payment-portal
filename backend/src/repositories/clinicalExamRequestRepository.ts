import { type ResultSetHeader, type RowDataPacket, type Pool } from "../lib/db.js";

type DbExec = Pick<Pool, "execute">;
type DbQueryExec = Pick<Pool, "execute" | "query">;

export type ClinicalExamRequestDbRow = {
  id: number;
  student_id: string;
  student_name: string | null;
  exam_code: string;
  exam_name: string;
  term: string;
  year: number;
  status: string;
  assigned_exam_date: string | Date | null;
  assigned_exam_time: string | null;
  assigned_by: string | null;
  assigned_at: Date | string | null;
  notes: string | null;
  billing_adjustment_id: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function rowToPacket(r: RowDataPacket): ClinicalExamRequestDbRow {
  return {
    id: Math.trunc(Number(r.id)),
    student_id: String(r.student_id ?? "").trim(),
    student_name: r.student_name != null ? String(r.student_name).trim() : null,
    exam_code: String(r.exam_code ?? "").trim(),
    exam_name: String(r.exam_name ?? "").trim(),
    term: String(r.term ?? "").trim(),
    year: Math.trunc(Number(r.year)),
    status: String(r.status ?? "").trim(),
    assigned_exam_date: r.assigned_exam_date ?? null,
    assigned_exam_time: r.assigned_exam_time != null ? String(r.assigned_exam_time) : null,
    assigned_by: r.assigned_by != null ? String(r.assigned_by).trim() : null,
    assigned_at: r.assigned_at ?? null,
    notes: r.notes != null ? String(r.notes) : null,
    billing_adjustment_id:
      r.billing_adjustment_id != null ? Math.trunc(Number(r.billing_adjustment_id)) : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function clinicalExamRequestHasActiveDuplicate(
  exec: DbExec,
  studentId: string,
  examCode: string,
): Promise<boolean> {
  const [rows] = await exec.execute<RowDataPacket[]>(
    `SELECT id
       FROM clinical_exam_requests
      WHERE student_id = ?
        AND exam_code = ?
        AND status IN ('requested', 'scheduled')
      LIMIT 1`,
    [studentId.trim(), examCode.trim().toUpperCase()],
  );
  return rows.length > 0;
}

export async function insertClinicalExamRequest(
  exec: DbExec,
  params: {
    studentId: string;
    examCode: string;
    examName: string;
    term: string;
    year: number;
    billingAdjustmentId: number;
  },
): Promise<number> {
  const [res] = await exec.execute<ResultSetHeader>(
    `INSERT INTO clinical_exam_requests
      (student_id, exam_code, exam_name, term, year, status,
       billing_adjustment_id, assigned_exam_date, assigned_exam_time,
       assigned_by, assigned_at, notes)
     VALUES (?, ?, ?, ?, ?, 'requested', ?, NULL, NULL, NULL, NULL, NULL)`,
    [
      params.studentId.trim(),
      params.examCode.trim().toUpperCase(),
      params.examName.trim(),
      params.term.trim(),
      Math.trunc(params.year),
      Math.trunc(params.billingAdjustmentId),
    ],
  );
  return Math.trunc(Number(res.insertId));
}

export async function listClinicalExamRequestsForStudent(
  exec: DbExec,
  studentId: string,
): Promise<ClinicalExamRequestDbRow[]> {
  const [rows] = await exec.execute<RowDataPacket[]>(
    `SELECT r.id,
            r.student_id,
            NULL AS student_name,
            r.exam_code,
            r.exam_name,
            r.term,
            r.year,
            r.status,
            r.assigned_exam_date,
            r.assigned_exam_time,
            r.assigned_by,
            r.assigned_at,
            r.notes,
            r.billing_adjustment_id,
            r.created_at,
            r.updated_at
       FROM clinical_exam_requests r
      WHERE student_id = ?
      ORDER BY created_at DESC`,
    [studentId.trim()],
  );
  return rows.map(rowToPacket);
}

export async function listClinicalExamRequestsForAdmin(
  exec: DbExec,
): Promise<ClinicalExamRequestDbRow[]> {
  const [rows] = await exec.execute<RowDataPacket[]>(
    `SELECT r.id,
            r.student_id,
            COALESCE(
              NULLIF(TRIM(s.name), ''),
              NULLIF(TRIM(ps.full_name), ''),
              r.student_id
            ) AS student_name,
            r.exam_code,
            r.exam_name,
            r.term,
            r.year,
            r.status,
            r.assigned_exam_date,
            r.assigned_exam_time,
            r.assigned_by,
            r.assigned_at,
            r.notes,
            r.billing_adjustment_id,
            r.created_at,
            r.updated_at
       FROM clinical_exam_requests r
       LEFT JOIN students s
         ON TRIM(s.id) = TRIM(r.student_id)
       LEFT JOIN portal_students ps
         ON ps.student_external_id = TRIM(r.student_id)
      ORDER BY r.created_at DESC`,
  );
  return rows.map(rowToPacket);
}

export async function getClinicalExamRequestById(
  exec: DbExec,
  id: number,
): Promise<ClinicalExamRequestDbRow | null> {
  const [rows] = await exec.execute<RowDataPacket[]>(
    `SELECT r.id,
            r.student_id,
            COALESCE(
              NULLIF(TRIM(s.name), ''),
              NULLIF(TRIM(ps.full_name), ''),
              r.student_id
            ) AS student_name,
            r.exam_code,
            r.exam_name,
            r.term,
            r.year,
            r.status,
            r.assigned_exam_date,
            r.assigned_exam_time,
            r.assigned_by,
            r.assigned_at,
            r.notes,
            r.billing_adjustment_id,
            r.created_at,
            r.updated_at
       FROM clinical_exam_requests r
       LEFT JOIN students s
         ON TRIM(s.id) = TRIM(r.student_id)
       LEFT JOIN portal_students ps
         ON ps.student_external_id = TRIM(r.student_id)
      WHERE r.id = ?
      LIMIT 1`,
    [Math.trunc(id)],
  );
  if (rows.length === 0) return null;
  return rowToPacket(rows[0]!);
}

export async function updateClinicalExamRequestFields(
  exec: DbExec,
  id: number,
  fields: {
    assignedExamDate: string | null;
    assignedExamTime: string | null;
    notes: string | null;
    status: string;
    term: string;
    year: number;
    assignedBy: string | null;
  },
): Promise<boolean> {
  const [res] = await exec.execute<ResultSetHeader>(
    `UPDATE clinical_exam_requests
        SET assigned_exam_date = ?,
            assigned_exam_time = ?,
            notes = ?,
            status = ?,
            term = ?,
            year = ?,
            assigned_by = ?,
            assigned_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [
      fields.assignedExamDate,
      fields.assignedExamTime,
      fields.notes,
      fields.status,
      fields.term.trim(),
      Math.trunc(fields.year),
      fields.assignedBy,
      Math.trunc(id),
    ],
  );
  return res.affectedRows > 0;
}

async function resolveStudentNameForMarks(
  exec: DbQueryExec,
  studentId: string,
): Promise<string | null> {
  const sid = studentId.trim();
  const [legacyRows] = await exec.query<RowDataPacket[]>(
    `SELECT TRIM(name) AS name
       FROM students
      WHERE TRIM(id) = TRIM(?)
      LIMIT 1`,
    [sid],
  );
  if (legacyRows.length > 0) {
    const name = String((legacyRows[0] as { name?: unknown }).name ?? "").trim();
    if (name !== "") return name;
  }
  const [portalRows] = await exec.query<RowDataPacket[]>(
    `SELECT TRIM(full_name) AS name
       FROM portal_students
      WHERE student_external_id = TRIM(?)
      LIMIT 1`,
    [sid],
  );
  if (portalRows.length > 0) {
    const name = String((portalRows[0] as { name?: unknown }).name ?? "").trim();
    if (name !== "") return name;
  }
  return null;
}

export async function voidClinicalExamBillingAdjustmentById(
  exec: DbExec,
  params: {
    billingAdjustmentId: number;
    studentId: string;
    term: string;
    year: number;
  },
): Promise<boolean> {
  const [res] = await exec.execute<ResultSetHeader>(
    `UPDATE portal_billing_adjustments
        SET amount = 0,
            description = LEFT(
              CONCAT(TRIM(description), ' [voided: clinical exam request cancelled]'),
              255
            )
      WHERE id = ?
        AND adjustment_source = 'system_clinical'
        AND category = 'clinical'
        AND TRIM(student_external_id) = TRIM(?)
        AND LOWER(TRIM(term)) = LOWER(TRIM(?))
        AND year = ?
        AND amount <> 0`,
    [
      Math.trunc(params.billingAdjustmentId),
      params.studentId.trim(),
      params.term.trim(),
      Math.trunc(params.year),
    ],
  );
  return Math.trunc(Number(res.affectedRows ?? 0)) > 0;
}

async function findLatestMarksSeqByExamPrefix(
  exec: DbQueryExec,
  studentId: string,
  examCodePrefix: string,
): Promise<number | null> {
  const [rows] = await exec.query<RowDataPacket[]>(
    `SELECT seqNumber AS seq
       FROM marks
      WHERE TRIM(id) = TRIM(?)
        AND UPPER(TRIM(code)) LIKE CONCAT(UPPER(TRIM(?)), '%')
      ORDER BY seqNumber DESC
      LIMIT 1`,
    [studentId.trim(), examCodePrefix.trim()],
  );
  if (rows.length === 0) return null;
  const seq = Number((rows[0] as { seq?: unknown }).seq);
  return Number.isFinite(seq) ? Math.trunc(seq) : null;
}

function gradeToLegacyNumeric(grade: "P" | "F"): number {
  return grade === "P" ? 1 : 0;
}

export async function upsertClinicalExamMarkByPrefix(
  exec: DbQueryExec,
  params: {
    studentId: string;
    examCode: string;
    examName: string;
    grade: "P" | "F";
    term: string;
    year: number;
  },
): Promise<void> {
  const seq = await findLatestMarksSeqByExamPrefix(
    exec,
    params.studentId,
    params.examCode,
  );
  const grade2 = gradeToLegacyNumeric(params.grade);
  if (seq != null) {
    await exec.execute(
      `UPDATE marks
          SET code = ?,
              course_title = ?,
              grade = ?,
              grade2 = ?,
              term = ?,
              year = ?
        WHERE seqNumber = ?`,
      [
        params.examCode.trim().toUpperCase(),
        params.examName.trim(),
        params.grade,
        grade2,
        params.term.trim(),
        Math.trunc(params.year),
        seq,
      ],
    );
    return;
  }

  const studentName = await resolveStudentNameForMarks(exec, params.studentId);
  if (studentName == null) {
    throw new Error("Student not found for marks insert.");
  }

  await exec.execute(
    `INSERT INTO marks (
      name, id, regis, code, grade, grade2, course_title, units,
      days, time_from, time_to, instructor, term, year, language, indie_study
    ) VALUES (?, ?, 0, ?, ?, ?, ?, 0, '', '00:00:00', '00:00:00', '', ?, ?, 'English', '')`,
    [
      studentName,
      params.studentId.trim(),
      params.examCode.trim().toUpperCase(),
      params.grade,
      grade2,
      params.examName.trim(),
      params.term.trim(),
      Math.trunc(params.year),
    ],
  );
}
