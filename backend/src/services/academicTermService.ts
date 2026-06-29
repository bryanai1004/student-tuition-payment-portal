import type {
  AcademicTermDetail,
  AcademicTermName,
  AcademicTermStatus,
  CreateAcademicTermInput,
  UpdateAcademicTermInput,
} from "../types/academicTerm.js";
import {
  academicTermSchemaCaps,
  countAcademicTermDeleteDependencies,
  deleteAcademicTermById,
  getAcademicTermById,
  insertAcademicTerm,
  listAcademicTerms,
  listRecentVisibleAcademicTerms,
  listVisibleAcademicTerms,
  getCurrentRegistrationOpenTerm as repoGetCurrentRegistrationOpenTerm,
  getPostedToDashboardTerm as repoGetPostedToDashboardTerm,
  postAcademicTermToDashboard as repoPostAcademicTermToDashboard,
  updateAcademicTermRow,
  type AcademicTermDeleteDependencies,
  type AcademicTermInsertRow,
} from "../repositories/academicTermRepository.js";
import { isUniqueViolation } from "../lib/dbErrors.js";

const TERM_NAMES: AcademicTermName[] = [
  "Winter",
  "Spring",
  "Summer",
  "Fall",
];

const STATUSES: AcademicTermStatus[] = [
  "planned",
  "registration_open",
  "in_progress",
  "completed",
];

const TERM_SUFFIX: Record<AcademicTermName, string> = {
  Winter: "WIN",
  Spring: "SPR",
  Summer: "SUM",
  Fall: "FAL",
};

const QUARTER: Record<AcademicTermName, number> = {
  Winter: 1,
  Spring: 2,
  Summer: 3,
  Fall: 4,
};

export function isAcademicTermName(v: unknown): v is AcademicTermName {
  return typeof v === "string" && (TERM_NAMES as string[]).includes(v);
}

export function isAcademicTermStatus(v: unknown): v is AcademicTermStatus {
  return typeof v === "string" && (STATUSES as string[]).includes(v);
}

export function quarterIndexForTermName(name: AcademicTermName): number {
  return QUARTER[name];
}

export function canonicalAcademicTermId(
  year: number,
  termName: AcademicTermName,
): string {
  return `${year}-${TERM_SUFFIX[termName]}`;
}

export function defaultTermLabel(
  termName: AcademicTermName,
  year: number,
): string {
  return `${termName} ${year}`;
}

function assertValidYear(year: number): void {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error("Invalid year");
  }
}

function assertValidSequenceNo(n: number): void {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid sequence_no");
  }
}

function toDetailRow(
  input: Omit<AcademicTermInsertRow, "id" | "quarter_index"> & {
    id: string;
    term_name: AcademicTermName;
  },
): AcademicTermInsertRow {
  return {
    ...input,
    quarter_index: quarterIndexForTermName(input.term_name),
  };
}

export async function listAllAcademicTerms(): Promise<AcademicTermDetail[]> {
  return listAcademicTerms();
}

export async function listVisibleTermsForStudents(
  limit?: number,
): Promise<AcademicTermDetail[]> {
  return listVisibleAcademicTerms(limit);
}

export async function listRecentVisibleTerms(
  limit = 3,
): Promise<AcademicTermDetail[]> {
  return listRecentVisibleAcademicTerms(limit);
}

export async function getCurrentRegistrationOpenTerm(): Promise<AcademicTermDetail | null> {
  return repoGetCurrentRegistrationOpenTerm();
}

export async function getPostedToDashboardTerm(): Promise<AcademicTermDetail | null> {
  return repoGetPostedToDashboardTerm();
}

export async function postAcademicTermToDashboard(
  id: string,
): Promise<AcademicTermDetail | null> {
  return repoPostAcademicTermToDashboard(id);
}

/** For response headers: whether `academic_terms` persists payment DDL / overdue-lock fields. */
export async function academicTermPaymentPolicyColumnsAvailable(): Promise<boolean> {
  return (await academicTermSchemaCaps()).hasPaymentPolicyColumns;
}

export async function createAcademicTerm(
  input: CreateAcademicTermInput,
): Promise<AcademicTermDetail> {
  assertValidYear(input.year);
  assertValidSequenceNo(input.sequence_no);
  if (!isAcademicTermName(input.term_name)) {
    throw new Error("Invalid term_name");
  }
  if (!isAcademicTermStatus(input.status)) {
    throw new Error("Invalid status");
  }
  const id = canonicalAcademicTermId(input.year, input.term_name);
  const existingId = await getAcademicTermById(id);
  if (existingId) {
    throw new Error("Academic term id already exists for this year and quarter");
  }
  const term_label =
    input.term_label?.trim() ||
    defaultTermLabel(input.term_name, input.year);
  const row = toDetailRow({
    id,
    term_label,
    year: input.year,
    term_name: input.term_name,
    sequence_no: input.sequence_no,
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    registration_open: input.registration_open ?? null,
    registration_close: input.registration_close ?? null,
    withdraw_deadline: input.withdraw_deadline ?? null,
    payment_due_date: input.payment_due_date ?? null,
    clinic_appointment_deadline: input.clinic_appointment_deadline ?? null,
    lock_registration_if_overdue: input.lock_registration_if_overdue === true,
    status: input.status,
    is_visible: input.is_visible !== false,
    is_posted_to_dashboard: false,
  });
  try {
    return await insertAcademicTerm(row);
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new Error("Duplicate year/quarter or sequence_no");
    }
    throw e;
  }
}

export async function updateAcademicTerm(
  id: string,
  patch: UpdateAcademicTermInput,
): Promise<AcademicTermDetail | null> {
  const currentId = id.trim();
  const existing = await getAcademicTermById(currentId);
  if (!existing) return null;

  const year =
    patch.year !== undefined ? patch.year : existing.year;
  const term_name =
    patch.term_name !== undefined ? patch.term_name : existing.term_name;

  assertValidYear(year);
  if (!isAcademicTermName(term_name)) {
    throw new Error("Invalid term_name");
  }

  const status =
    patch.status !== undefined ? patch.status : existing.status;
  if (!isAcademicTermStatus(status)) {
    throw new Error("Invalid status");
  }

  const sequence_no =
    patch.sequence_no !== undefined
      ? patch.sequence_no
      : existing.sequence_no;
  assertValidSequenceNo(sequence_no);

  const nextId = canonicalAcademicTermId(year, term_name);

  let term_label = existing.term_label;
  if (patch.term_label !== undefined) {
    term_label = patch.term_label.trim();
    if (!term_label) {
      throw new Error("Invalid term_label");
    }
  } else if (
    patch.year !== undefined ||
    patch.term_name !== undefined
  ) {
    term_label = defaultTermLabel(term_name, year);
  }

  const is_visible =
    patch.is_visible !== undefined ? patch.is_visible : existing.is_visible;

  const row = toDetailRow({
    id: nextId,
    term_label,
    year,
    term_name,
    sequence_no,
    start_date:
      patch.start_date !== undefined
        ? patch.start_date
        : existing.start_date,
    end_date:
      patch.end_date !== undefined ? patch.end_date : existing.end_date,
    registration_open:
      patch.registration_open !== undefined
        ? patch.registration_open
        : existing.registration_open,
    registration_close:
      patch.registration_close !== undefined
        ? patch.registration_close
        : existing.registration_close,
    withdraw_deadline:
      patch.withdraw_deadline !== undefined
        ? patch.withdraw_deadline
        : existing.withdraw_deadline,
    payment_due_date:
      patch.payment_due_date !== undefined
        ? patch.payment_due_date
        : existing.payment_due_date,
    clinic_appointment_deadline:
      patch.clinic_appointment_deadline !== undefined
        ? patch.clinic_appointment_deadline
        : existing.clinic_appointment_deadline,
    lock_registration_if_overdue:
      patch.lock_registration_if_overdue !== undefined
        ? patch.lock_registration_if_overdue
        : existing.lock_registration_if_overdue,
    status,
    is_visible,
    is_posted_to_dashboard: existing.is_posted_to_dashboard,
  });

  if (nextId !== currentId) {
    const clash = await getAcademicTermById(nextId);
    if (clash) {
      throw new Error("Target id already exists for this year and quarter");
    }
  }

  try {
    return await updateAcademicTermRow(currentId, row);
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new Error("Duplicate year/quarter or sequence_no");
    }
    throw e;
  }
}

export type AcademicTermDeleteDependencyCategory = {
  label: string;
  count: number;
};

export type DeleteAcademicTermResult =
  | { ok: true }
  | { ok: false; code: "invalid_id" | "not_found" | "has_dependencies"; error: string };

function blockingDependencyCategories(
  counts: AcademicTermDeleteDependencies,
): AcademicTermDeleteDependencyCategory[] {
  return [
    { label: "course section(s)", count: counts.courseSections },
    { label: "enrollment record(s)", count: counts.portalEnrollments },
    { label: "clinical timetable slot(s)", count: counts.clinicalTimetableSlots },
    { label: "clinical enrollment(s)", count: counts.clinicalEnrollments },
    { label: "clinical assignment(s)", count: counts.clinicalAssignments },
    { label: "clinical request(s)", count: counts.clinicalRequests },
    { label: "document requirement assignment(s)", count: counts.portalDocumentRequirements },
    {
      label: "document requirement attempt(s)",
      count: counts.portalDocumentRequirementAttempts,
    },
    { label: "term finance setting row(s)", count: counts.portalTermFinanceSettings },
    { label: "payment record(s)", count: counts.portalPayments },
    { label: "billing adjustment record(s)", count: counts.portalBillingAdjustments },
    { label: "student term preference row(s)", count: counts.portalStudentTermPrefs },
  ].filter((entry) => entry.count > 0);
}

function formatDependencySummary(
  blocking: AcademicTermDeleteDependencyCategory[],
): string {
  const detail = blocking.map((entry) => `${entry.count} ${entry.label}`).join(", ");
  return `This term cannot be deleted because it is still referenced by ${detail}.`;
}

export async function deleteAcademicTerm(id: string): Promise<DeleteAcademicTermResult> {
  const trimmed = id.trim();
  if (!trimmed) {
    return { ok: false, code: "invalid_id", error: "Invalid term id." };
  }
  const term = await getAcademicTermById(trimmed);
  if (!term) {
    return { ok: false, code: "not_found", error: "Academic term not found." };
  }
  const dependencyCounts = await countAcademicTermDeleteDependencies(
    term.id,
    term.term_name,
    term.year,
  );
  const blocking = blockingDependencyCategories(dependencyCounts);
  if (blocking.length > 0) {
    return {
      ok: false,
      code: "has_dependencies",
      error: formatDependencySummary(blocking),
    };
  }
  const deleted = await deleteAcademicTermById(term.id);
  if (!deleted) {
    return { ok: false, code: "not_found", error: "Academic term not found." };
  }
  return { ok: true };
}
