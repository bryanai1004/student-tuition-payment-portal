import type {
  AcademicTermDetail,
  AcademicTermName,
  AcademicTermStatus,
  CreateAcademicTermInput,
  UpdateAcademicTermInput,
} from "../types/academicTerm.js";
import {
  academicTermSchemaCaps,
  getAcademicTermById,
  insertAcademicTerm,
  listAcademicTerms,
  listRecentVisibleAcademicTerms,
  listVisibleAcademicTerms,
  getCurrentRegistrationOpenTerm as repoGetCurrentRegistrationOpenTerm,
  updateAcademicTermRow,
  type AcademicTermInsertRow,
} from "../repositories/academicTermRepository.js";

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
    lock_registration_if_overdue: input.lock_registration_if_overdue === true,
    status: input.status,
    is_visible: input.is_visible !== false,
  });
  try {
    return await insertAcademicTerm(row);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "ER_DUP_ENTRY") {
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
    lock_registration_if_overdue:
      patch.lock_registration_if_overdue !== undefined
        ? patch.lock_registration_if_overdue
        : existing.lock_registration_if_overdue,
    status,
    is_visible,
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
    const err = e as { code?: string };
    if (err.code === "ER_DUP_ENTRY") {
      throw new Error("Duplicate year/quarter or sequence_no");
    }
    throw e;
  }
}
