import { getDocumentQuizDefinition } from "../data/documentQuizDefinitions.js";
import { pool } from "../lib/db.js";
import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import {
  getNextDocumentAttemptNumber,
  getStudentDocumentRequirement,
  createStudentDocumentRequirementAttempt,
  listStudentDocumentRequirements,
  portalStudentExists,
  resetAllStudentDocumentRequirementsForTerm,
  resetStudentDocumentRequirement,
  seedMissingPortalDocumentRequirements,
  upsertStudentDocumentRequirement,
  type StudentDocumentsDbClient,
} from "../repositories/studentDocumentRepository.js";
import { InvalidAcademicTermError } from "./courseSectionService.js";
import {
  DOCUMENT_REQUIREMENT_TYPES,
  isDocumentQuizRequirementType,
  type DocumentQuizRequirementType,
  type DocumentRequirementStatus,
  type DocumentRequirementType,
  type StudentDocumentRequirement,
  type UpsertDocumentRequirementInput,
} from "../types/studentDocuments.js";

export class StudentDocumentsValidationError extends Error {
  override readonly name = "StudentDocumentsValidationError";
  constructor(message: string) {
    super(message);
  }
}

export class StudentDocumentsNotFoundError extends Error {
  override readonly name = "StudentDocumentsNotFoundError";
  constructor(message: string) {
    super(message);
  }
}

export type DocumentRequirementListItem = {
  requirementType: DocumentRequirementType;
  status: DocumentRequirementStatus;
  isPassed: boolean;
  scoreCorrect: number | null;
  totalQuestions: number | null;
  submittedAt: string | null;
  lastReassignedAt: string | null;
};

export type DocumentRequirementsListPayload = {
  studentId: string;
  academicTermId: string;
  requirements: DocumentRequirementListItem[];
};

export type AgreementSubmitPayload = {
  requirementType: "copyright_release_agreement";
  status: "completed";
  submittedAt: string;
};

export type QuizSubmitPayload = {
  requirementType: DocumentQuizRequirementType;
  scoreCorrect: number;
  totalQuestions: number;
  isPassed: boolean;
  status: DocumentRequirementStatus;
  submittedAt: string | null;
};

export type RequirementResetPayload = {
  ok: true;
  requirementType: DocumentRequirementType;
  status: "assigned";
};

export type RequirementsResetAllPayload = {
  ok: true;
};

function normId(s: string): string {
  return s.trim();
}

function requirementOrderIndex(t: DocumentRequirementType): number {
  const i = DOCUMENT_REQUIREMENT_TYPES.indexOf(t);
  return i === -1 ? 99 : i;
}

function sortByRequirementType(
  rows: StudentDocumentRequirement[],
): StudentDocumentRequirement[] {
  return [...rows].sort(
    (a, b) =>
      requirementOrderIndex(a.requirementType) -
      requirementOrderIndex(b.requirementType),
  );
}

function toListItem(r: StudentDocumentRequirement): DocumentRequirementListItem {
  return {
    requirementType: r.requirementType,
    status: r.status,
    isPassed: r.isPassed,
    scoreCorrect: r.scoreCorrect,
    totalQuestions: r.totalQuestions,
    submittedAt: r.submittedAt,
    lastReassignedAt: r.lastReassignedAt,
  };
}

async function assertAcademicTermExists(academicTermId: string): Promise<void> {
  const row = await getAcademicTermById(normId(academicTermId));
  if (!row) throw new InvalidAcademicTermError();
}

async function assertPortalStudentExists(studentExternalId: string): Promise<void> {
  const ok = await portalStudentExists(pool, normId(studentExternalId));
  if (!ok) throw new StudentDocumentsNotFoundError("Student not found");
}

function assignmentFieldsFromExisting(
  existing: StudentDocumentRequirement | null,
): Pick<
  UpsertDocumentRequirementInput,
  "assignedBy" | "lastReassignedAt" | "reassignedBy"
> {
  if (!existing) {
    return {
      assignedBy: null,
      lastReassignedAt: null,
      reassignedBy: null,
    };
  }
  return {
    assignedBy: existing.assignedBy,
    lastReassignedAt: existing.lastReassignedAt,
    reassignedBy: existing.reassignedBy,
  };
}

function gradeQuizAnswers(
  quizId: DocumentQuizRequirementType,
  answers: Record<string, string>,
): { scoreCorrect: number; totalQuestions: number; isPassed: boolean } {
  const def = getDocumentQuizDefinition(quizId);
  let scoreCorrect = 0;
  for (const questionId of Object.keys(def.correctAnswers)) {
    const expected = def.correctAnswers[questionId];
    if (expected === undefined) continue;
    const raw = answers[questionId];
    const given = typeof raw === "string" ? raw.trim() : "";
    if (given === expected.trim()) scoreCorrect += 1;
  }
  const totalQuestions = def.totalQuestions;
  const isPassed =
    scoreCorrect === totalQuestions && totalQuestions > 0;
  return { scoreCorrect, totalQuestions, isPassed };
}

async function runInTransaction<T>(
  fn: (db: StudentDocumentsDbClient) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function listStudentDocumentRequirementsForTerm(
  studentExternalId: string,
  academicTermId: string,
): Promise<DocumentRequirementsListPayload> {
  const sid = normId(studentExternalId);
  const tid = normId(academicTermId);
  if (!sid) {
    throw new StudentDocumentsValidationError("Missing student id");
  }
  if (!tid) {
    throw new StudentDocumentsValidationError("Missing academicTermId");
  }
  await assertAcademicTermExists(tid);
  await assertPortalStudentExists(sid);
  await seedMissingPortalDocumentRequirements(pool, sid, tid);
  const rows = sortByRequirementType(
    await listStudentDocumentRequirements(pool, sid, tid),
  );
  return {
    studentId: sid,
    academicTermId: tid,
    requirements: rows.map(toListItem),
  };
}

export async function getAdminStudentDocumentRequirements(
  studentExternalId: string,
  academicTermId: string,
): Promise<DocumentRequirementsListPayload> {
  return listStudentDocumentRequirementsForTerm(studentExternalId, academicTermId);
}

export async function submitStudentAgreement(
  studentExternalId: string,
  academicTermId: string,
): Promise<AgreementSubmitPayload> {
  const sid = normId(studentExternalId);
  const tid = normId(academicTermId);
  if (!sid) {
    throw new StudentDocumentsValidationError("Missing student id");
  }
  if (!tid) {
    throw new StudentDocumentsValidationError("Missing academicTermId");
  }
  await assertAcademicTermExists(tid);
  await assertPortalStudentExists(sid);

  const existing = await getStudentDocumentRequirement(
    pool,
    sid,
    tid,
    "copyright_release_agreement",
  );
  if (existing?.status === "completed") {
    throw new StudentDocumentsValidationError(
      "Copyright release agreement is already completed for this term.",
    );
  }

  const submittedAt = new Date().toISOString();
  const assignPreserve = assignmentFieldsFromExisting(existing);

  await runInTransaction(async (db) => {
    await seedMissingPortalDocumentRequirements(db, sid, tid);
    const attemptNo = await getNextDocumentAttemptNumber(
      db,
      sid,
      tid,
      "copyright_release_agreement",
    );
    await createStudentDocumentRequirementAttempt(db, {
      studentExternalId: sid,
      academicTermId: tid,
      requirementType: "copyright_release_agreement",
      attemptNo,
      submittedAnswersJson: { copyrightReleaseAgreement: true },
      scoreCorrect: null,
      totalQuestions: null,
      isPassed: true,
    });
    await upsertStudentDocumentRequirement(db, {
      studentExternalId: sid,
      academicTermId: tid,
      requirementType: "copyright_release_agreement",
      status: "completed",
      scoreCorrect: null,
      totalQuestions: null,
      isPassed: false,
      submittedAt,
      ...assignPreserve,
    });
  });

  return {
    requirementType: "copyright_release_agreement",
    status: "completed",
    submittedAt,
  };
}

export async function submitStudentQuizAttempt(
  studentExternalId: string,
  academicTermId: string,
  quizId: string,
  answers: Record<string, string>,
): Promise<QuizSubmitPayload> {
  const sid = normId(studentExternalId);
  const tid = normId(academicTermId);
  if (!sid) {
    throw new StudentDocumentsValidationError("Missing student id");
  }
  if (!tid) {
    throw new StudentDocumentsValidationError("Missing academicTermId");
  }
  if (!isDocumentQuizRequirementType(quizId)) {
    throw new StudentDocumentsValidationError("Invalid quiz id");
  }
  const qid = quizId;

  await assertAcademicTermExists(tid);
  await assertPortalStudentExists(sid);

  const existing = await getStudentDocumentRequirement(pool, sid, tid, qid);
  if (existing?.status === "completed") {
    throw new StudentDocumentsValidationError(
      "This training is already marked complete for this term.",
    );
  }

  const { scoreCorrect, totalQuestions, isPassed } = gradeQuizAnswers(qid, answers);
  const assignPreserve = assignmentFieldsFromExisting(existing);
  const status: DocumentRequirementStatus = isPassed ? "completed" : "assigned";
  const submittedAt = isPassed ? new Date().toISOString() : null;

  await runInTransaction(async (db) => {
    await seedMissingPortalDocumentRequirements(db, sid, tid);
    const attemptNo = await getNextDocumentAttemptNumber(db, sid, tid, qid);
    await createStudentDocumentRequirementAttempt(db, {
      studentExternalId: sid,
      academicTermId: tid,
      requirementType: qid,
      attemptNo,
      submittedAnswersJson: answers,
      scoreCorrect,
      totalQuestions,
      isPassed,
    });
    await upsertStudentDocumentRequirement(db, {
      studentExternalId: sid,
      academicTermId: tid,
      requirementType: qid,
      status,
      scoreCorrect,
      totalQuestions,
      isPassed,
      submittedAt,
      ...assignPreserve,
    });
  });

  return {
    requirementType: qid,
    scoreCorrect,
    totalQuestions,
    isPassed,
    status,
    submittedAt,
  };
}

export async function resetAdminStudentDocumentRequirement(
  studentExternalId: string,
  academicTermId: string,
  requirementType: DocumentRequirementType,
  reassignedBy: string | null,
): Promise<RequirementResetPayload> {
  const sid = normId(studentExternalId);
  const tid = normId(academicTermId);
  if (!sid) {
    throw new StudentDocumentsValidationError("Missing student id");
  }
  if (!tid) {
    throw new StudentDocumentsValidationError("Missing academicTermId");
  }
  await assertAcademicTermExists(tid);
  await assertPortalStudentExists(sid);
  await seedMissingPortalDocumentRequirements(pool, sid, tid);
  await resetStudentDocumentRequirement(
    pool,
    sid,
    tid,
    requirementType,
    reassignedBy,
  );
  return {
    ok: true,
    requirementType,
    status: "assigned",
  };
}

export async function resetAdminStudentDocumentRequirementsForTerm(
  studentExternalId: string,
  academicTermId: string,
  reassignedBy: string | null,
): Promise<RequirementsResetAllPayload> {
  const sid = normId(studentExternalId);
  const tid = normId(academicTermId);
  if (!sid) {
    throw new StudentDocumentsValidationError("Missing student id");
  }
  if (!tid) {
    throw new StudentDocumentsValidationError("Missing academicTermId");
  }
  await assertAcademicTermExists(tid);
  await assertPortalStudentExists(sid);
  await seedMissingPortalDocumentRequirements(pool, sid, tid);
  await resetAllStudentDocumentRequirementsForTerm(
    pool,
    sid,
    tid,
    reassignedBy,
  );
  return { ok: true };
}
