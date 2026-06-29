import { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "../lib/db.js";
import {
  DOCUMENT_REQUIREMENT_TYPES,
  isDocumentRequirementType,
  type CreateDocumentRequirementAttemptInput,
  type DocumentRequirementStatus,
  type DocumentRequirementType,
  type StudentDocumentRequirement,
  type StudentDocumentRequirementAttempt,
  type UpsertDocumentRequirementInput,
} from "../types/studentDocuments.js";

/** Pool or transaction connection — both implement `.query`. */
export type StudentDocumentsDbClient = Pool | PoolConnection;

/**
 * Portal documents compliance persistence (quizzes + copyright release agreement).
 *
 * `portal_document_requirements` — latest state per student + term + requirement.
 * `portal_document_requirement_attempts` — submission history (retries preserved; resets do not delete rows).
 */

const REQ_SELECT = `
  id,
  student_external_id,
  academic_term_id,
  requirement_type,
  status,
  score_correct,
  total_questions,
  is_passed,
  assigned_at,
  submitted_at,
  last_reassigned_at,
  assigned_by,
  reassigned_by,
  created_at,
  updated_at
`;

const ATTEMPT_SELECT = `
  id,
  student_external_id,
  academic_term_id,
  requirement_type,
  attempt_no,
  submitted_answers_json,
  score_correct,
  total_questions,
  is_passed,
  submitted_at
`;

function ts(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && v) return v;
  return new Date(0).toISOString();
}

function nullableTs(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return ts(v);
}

function asBool(v: unknown): boolean {
  if (v === true || v === 1 || v === "1") return true;
  return false;
}

function asRequirementType(raw: unknown): DocumentRequirementType {
  const s = String(raw ?? "");
  if (isDocumentRequirementType(s)) return s;
  throw new Error(`Invalid portal requirement_type in row: ${s}`);
}

function asRequirementStatus(raw: unknown): DocumentRequirementStatus {
  const s = String(raw ?? "");
  if (s === "completed") return "completed";
  if (s === "assigned") return "assigned";
  throw new Error(`Invalid portal document requirement status in row: ${s}`);
}

function mapRequirementRow(row: RowDataPacket): StudentDocumentRequirement {
  return {
    id: Number(row.id),
    studentExternalId: String(row.student_external_id ?? ""),
    academicTermId: String(row.academic_term_id ?? ""),
    requirementType: asRequirementType(row.requirement_type),
    status: asRequirementStatus(row.status),
    scoreCorrect:
      row.score_correct === undefined || row.score_correct === null
        ? null
        : Number(row.score_correct),
    totalQuestions:
      row.total_questions === undefined || row.total_questions === null
        ? null
        : Number(row.total_questions),
    isPassed: asBool(row.is_passed),
    assignedAt: ts(row.assigned_at),
    submittedAt: nullableTs(row.submitted_at),
    lastReassignedAt: nullableTs(row.last_reassigned_at),
    assignedBy: row.assigned_by == null ? null : String(row.assigned_by),
    reassignedBy: row.reassigned_by == null ? null : String(row.reassigned_by),
    createdAt: ts(row.created_at),
    updatedAt: ts(row.updated_at),
  };
}

function mapAttemptRow(row: RowDataPacket): StudentDocumentRequirementAttempt {
  let answers: unknown | null = null;
  const raw = row.submitted_answers_json;
  if (raw !== undefined && raw !== null) {
    if (typeof raw === "string") {
      try {
        answers = JSON.parse(raw) as unknown;
      } catch {
        answers = raw;
      }
    } else {
      answers = raw;
    }
  }
  return {
    id: Number(row.id),
    studentExternalId: String(row.student_external_id ?? ""),
    academicTermId: String(row.academic_term_id ?? ""),
    requirementType: asRequirementType(row.requirement_type),
    attemptNo: Number(row.attempt_no),
    submittedAnswersJson: answers,
    scoreCorrect:
      row.score_correct === undefined || row.score_correct === null
        ? null
        : Number(row.score_correct),
    totalQuestions:
      row.total_questions === undefined || row.total_questions === null
        ? null
        : Number(row.total_questions),
    isPassed: asBool(row.is_passed),
    submittedAt: ts(row.submitted_at),
  };
}

export async function portalStudentExists(
  db: StudentDocumentsDbClient,
  studentExternalId: string,
): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT 1 AS ok
     FROM portal_students
     WHERE student_external_id = ?
     LIMIT 1`,
    [studentExternalId],
  );
  return rows.length > 0;
}

/**
 * Document requirement rows FK to `portal_students`. Login/profile use legacy `students.id`.
 * Ensure a portal row exists whenever the legacy master row exists so GET/POST documents can run.
 */
export async function ensurePortalStudentRowFromLegacyStudents(
  db: StudentDocumentsDbClient,
  studentExternalId: string,
): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT TRIM(id) AS id, TRIM(name) AS name
     FROM students
     WHERE id = ?
     LIMIT 1`,
    [studentExternalId],
  );
  if (rows.length === 0) return false;
  const nameRaw = rows[0]?.name;
  const fullName =
    typeof nameRaw === "string" && nameRaw.trim() !== ""
      ? nameRaw.trim()
      : studentExternalId;
  await db.query<ResultSetHeader>(
    `INSERT INTO portal_students (student_external_id, full_name)
     VALUES (?, ?)
     ON CONFLICT (student_external_id) DO UPDATE SET student_external_id = EXCLUDED.student_external_id`,
    [studentExternalId, fullName],
  );
  return true;
}

/**
 * Inserts missing current-state rows for all requirement types (assigned, no scores).
 * Rows that already exist are left unchanged (ON CONFLICT DO NOTHING).
 */
export async function seedMissingPortalDocumentRequirements(
  db: StudentDocumentsDbClient,
  studentExternalId: string,
  academicTermId: string,
): Promise<void> {
  const values: unknown[] = [];
  const placeholders: string[] = [];
  for (const rt of DOCUMENT_REQUIREMENT_TYPES) {
    placeholders.push("(?, ?, ?, 'assigned', NULL, NULL, false, NULL, NULL, NULL, NULL)");
    values.push(studentExternalId, academicTermId, rt);
  }
  await db.query<ResultSetHeader>(
    `INSERT INTO portal_document_requirements (
      student_external_id,
      academic_term_id,
      requirement_type,
      status,
      score_correct,
      total_questions,
      is_passed,
      submitted_at,
      assigned_by,
      last_reassigned_at,
      reassigned_by
    ) VALUES ${placeholders.join(", ")}
    ON CONFLICT (student_external_id, academic_term_id, requirement_type) DO NOTHING`,
    values,
  );
}

export async function getNextDocumentAttemptNumber(
  db: StudentDocumentsDbClient,
  studentExternalId: string,
  academicTermId: string,
  requirementType: DocumentRequirementType,
): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COALESCE(MAX(attempt_no), 0) AS max_no
     FROM portal_document_requirement_attempts
     WHERE student_external_id = ?
       AND academic_term_id = ?
       AND requirement_type = ?`,
    [studentExternalId, academicTermId, requirementType],
  );
  const maxNo = Number(rows[0]?.max_no ?? 0);
  return maxNo + 1;
}

export async function listStudentDocumentRequirements(
  db: StudentDocumentsDbClient,
  studentExternalId: string,
  academicTermId: string,
): Promise<StudentDocumentRequirement[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${REQ_SELECT}
     FROM portal_document_requirements
     WHERE student_external_id = ?
       AND academic_term_id = ?
     ORDER BY requirement_type ASC`,
    [studentExternalId, academicTermId],
  );
  return rows.map(mapRequirementRow);
}

export async function getStudentDocumentRequirement(
  db: StudentDocumentsDbClient,
  studentExternalId: string,
  academicTermId: string,
  requirementType: DocumentRequirementType,
): Promise<StudentDocumentRequirement | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${REQ_SELECT}
     FROM portal_document_requirements
     WHERE student_external_id = ?
       AND academic_term_id = ?
       AND requirement_type = ?
     LIMIT 1`,
    [studentExternalId, academicTermId, requirementType],
  );
  const row = rows[0];
  return row ? mapRequirementRow(row) : null;
}

export async function upsertStudentDocumentRequirement(
  db: StudentDocumentsDbClient,
  input: UpsertDocumentRequirementInput,
): Promise<StudentDocumentRequirement> {
  await db.query<ResultSetHeader>(
    `INSERT INTO portal_document_requirements (
      student_external_id,
      academic_term_id,
      requirement_type,
      status,
      score_correct,
      total_questions,
      is_passed,
      submitted_at,
      assigned_by,
      last_reassigned_at,
      reassigned_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (student_external_id, academic_term_id, requirement_type) DO UPDATE SET
      status = EXCLUDED.status,
      score_correct = EXCLUDED.score_correct,
      total_questions = EXCLUDED.total_questions,
      is_passed = EXCLUDED.is_passed,
      submitted_at = EXCLUDED.submitted_at,
      assigned_by = COALESCE(EXCLUDED.assigned_by, portal_document_requirements.assigned_by),
      last_reassigned_at = EXCLUDED.last_reassigned_at,
      reassigned_by = EXCLUDED.reassigned_by)`,
    [
      input.studentExternalId,
      input.academicTermId,
      input.requirementType,
      input.status,
      input.scoreCorrect,
      input.totalQuestions,
      input.isPassed,
      input.submittedAt,
      input.assignedBy,
      input.lastReassignedAt,
      input.reassignedBy,
    ],
  );

  const row = await getStudentDocumentRequirement(
    db,
    input.studentExternalId,
    input.academicTermId,
    input.requirementType,
  );
  if (!row) {
    throw new Error("upsertStudentDocumentRequirement: row missing after upsert");
  }
  return row;
}

export async function createStudentDocumentRequirementAttempt(
  db: StudentDocumentsDbClient,
  input: CreateDocumentRequirementAttemptInput,
): Promise<StudentDocumentRequirementAttempt> {
  const jsonArg =
    input.submittedAnswersJson === undefined || input.submittedAnswersJson === null
      ? null
      : JSON.stringify(input.submittedAnswersJson);

  const [res] = await db.query<ResultSetHeader>(
    `INSERT INTO portal_document_requirement_attempts (
      student_external_id,
      academic_term_id,
      requirement_type,
      attempt_no,
      submitted_answers_json,
      score_correct,
      total_questions,
      is_passed
    ) VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?)`,
    [
      input.studentExternalId,
      input.academicTermId,
      input.requirementType,
      input.attemptNo,
      jsonArg,
      input.scoreCorrect,
      input.totalQuestions,
      input.isPassed,
    ],
  );

  const id = res.insertId;
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${ATTEMPT_SELECT}
     FROM portal_document_requirement_attempts
     WHERE id = ?
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("createStudentDocumentRequirementAttempt: row missing after insert");
  }
  return mapAttemptRow(row);
}

export async function listStudentDocumentRequirementAttempts(
  db: StudentDocumentsDbClient,
  studentExternalId: string,
  academicTermId: string,
  requirementType: DocumentRequirementType,
): Promise<StudentDocumentRequirementAttempt[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${ATTEMPT_SELECT}
     FROM portal_document_requirement_attempts
     WHERE student_external_id = ?
       AND academic_term_id = ?
       AND requirement_type = ?
     ORDER BY attempt_no ASC`,
    [studentExternalId, academicTermId, requirementType],
  );
  return rows.map(mapAttemptRow);
}

export async function resetStudentDocumentRequirement(
  db: StudentDocumentsDbClient,
  studentExternalId: string,
  academicTermId: string,
  requirementType: DocumentRequirementType,
  reassignedBy: string | null,
): Promise<ResultSetHeader> {
  const [res] = await db.query<ResultSetHeader>(
    `UPDATE portal_document_requirements
     SET status = 'assigned',
         score_correct = NULL,
         total_questions = NULL,
         is_passed = false,
         submitted_at = NULL,
         last_reassigned_at = CURRENT_TIMESTAMP,
         reassigned_by = ?
     WHERE student_external_id = ?
       AND academic_term_id = ?
       AND requirement_type = ?`,
    [reassignedBy, studentExternalId, academicTermId, requirementType],
  );
  return res;
}

export async function resetAllStudentDocumentRequirementsForTerm(
  db: StudentDocumentsDbClient,
  studentExternalId: string,
  academicTermId: string,
  reassignedBy: string | null,
): Promise<ResultSetHeader> {
  const [res] = await db.query<ResultSetHeader>(
    `UPDATE portal_document_requirements
     SET status = 'assigned',
         score_correct = NULL,
         total_questions = NULL,
         is_passed = false,
         submitted_at = NULL,
         last_reassigned_at = CURRENT_TIMESTAMP,
         reassigned_by = ?
     WHERE student_external_id = ?
       AND academic_term_id = ?`,
    [reassignedBy, studentExternalId, academicTermId],
  );
  return res;
}
