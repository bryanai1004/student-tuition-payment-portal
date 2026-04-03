import { pool } from "../lib/db.js";
import {
  createLegacyStudentMasterRow,
  createLegacyStudentPasswordRow,
  findLatestLegacyTermYear,
  getNextLegacyStudentId,
  legacyStudentMasterExists,
  legacyStudentPasswordRowExists,
  listLegacyAdminStudentRows,
  loadLegacyStudentProfileRow,
  updateLegacyStudentMasterRow,
} from "../repositories/studentLegacyAccountRepository.js";
import type {
  AdminDivision,
  AdminStudentCreateBody,
  AdminStudentDetail,
  AdminStudentListItem,
  AdminStudentUpdateBody,
} from "../types/adminStudent.js";
import {
  combineAddressLine,
  legacyDbDateToIso,
  resolveEnrollmentDate,
} from "./studentProfileService.js";

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function divisionFromStudentId(id: string): "Chinese" | "English" | "Unknown" {
  const c = id.trim().charAt(0).toUpperCase();
  if (c === "C") return "Chinese";
  if (c === "E") return "English";
  return "Unknown";
}

function readEnrollStart(row: Record<string, unknown>): unknown {
  return (
    row.EnrollStartDate ??
    row.enrollstartdate ??
    row.enroll_start_date ??
    row.enroll_start ??
    null
  );
}

/** e.g. `Fall 2025` from legacy `registration` term + year. */
function formatLatestRegistrationTerm(
  termRaw: unknown,
  yearRaw: unknown,
): string | null {
  const t = str(termRaw);
  const yearN = Number(yearRaw);
  if (t === "" || !Number.isFinite(yearN)) return null;
  const norm =
    t.length > 0
      ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
      : t;
  return `${norm} ${yearN}`;
}

function requirementsIdToApi(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function entryYearFromResolved(iso: string | null): number | null {
  if (iso == null || iso.length < 4) return null;
  const y = Number.parseInt(iso.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

function mapRowToListItem(r: Record<string, unknown>): AdminStudentListItem {
  const studentId = str(r.id);
  const nameRaw = str(r.name);
  const name = nameRaw.length > 0 ? nameRaw : studentId;
  const emailRaw = str(r.email);
  const email = emailRaw.length > 0 ? emailRaw : null;
  const signedDate = legacyDbDateToIso(r.signed_date);
  const enrollStartDate = legacyDbDateToIso(readEnrollStart(r));
  const resolvedEntryDate = resolveEnrollmentDate(
    r.signed_date,
    readEnrollStart(r),
  );
  const bg = str(r.background);
  const tertiary = str(r.tertiary);

  return {
    studentId,
    division: divisionFromStudentId(studentId),
    name,
    email,
    requirementsId: requirementsIdToApi(r.requirements_id),
    highestDegree: tertiary.length > 0 ? tertiary : null,
    backgroundSchool: bg.length > 0 ? bg : null,
    signedDate,
    enrollStartDate,
    resolvedEntryDate,
    entryYear: entryYearFromResolved(resolvedEntryDate),
    latestRegistrationTerm: formatLatestRegistrationTerm(
      r.latest_term,
      r.latest_year,
    ),
  };
}

export async function listAdminStudents(): Promise<AdminStudentListItem[]> {
  const rows = await listLegacyAdminStudentRows(pool);
  return rows.map((row) => mapRowToListItem(row as Record<string, unknown>));
}

function mapProfileRowToAdminDetail(
  row: Record<string, unknown>,
  latestRegistrationTerm: string | null,
): AdminStudentDetail {
  const studentId = str(row.id);
  const nameRaw = str(row.name);
  const name = nameRaw.length > 0 ? nameRaw : studentId;
  const emailRaw = str(row.email);
  const email = emailRaw.length > 0 ? emailRaw : null;
  const genderRaw = str(row.gender);
  const gender = genderRaw.length > 0 ? genderRaw : null;
  const signedDate = legacyDbDateToIso(row.signed_date);
  const enrollStartDate = legacyDbDateToIso(readEnrollStart(row));
  const resolvedEntryDate = resolveEnrollmentDate(
    row.signed_date,
    readEnrollStart(row),
  );
  const bg = str(row.background);
  const tertiary = str(row.tertiary);
  const address = combineAddressLine(row.address, row.address2);
  const cityRaw = str(row.city);
  const city = cityRaw.length > 0 ? cityRaw : null;
  const stateRaw = str(row.state);
  const state = stateRaw.length > 0 ? stateRaw : null;
  const zipRaw = row.zip;
  let zipStr: string | null = null;
  if (zipRaw != null && String(zipRaw).trim() !== "") {
    zipStr = String(zipRaw).trim();
  }

  return {
    studentId,
    division: divisionFromStudentId(studentId),
    name,
    email,
    requirementsId: requirementsIdToApi(row.requirements_id),
    highestDegree: tertiary.length > 0 ? tertiary : null,
    backgroundSchool: bg.length > 0 ? bg : null,
    gender,
    signedDate,
    enrollStartDate,
    resolvedEntryDate,
    entryYear: entryYearFromResolved(resolvedEntryDate),
    address,
    city,
    state,
    zip: zipStr,
    latestRegistrationTerm,
  };
}

export async function getAdminStudentDetail(
  studentIdRaw: string,
): Promise<AdminStudentDetail | null> {
  const studentId = studentIdRaw.trim();
  if (studentId === "") return null;
  const row = await loadLegacyStudentProfileRow(pool, studentId);
  if (!row) return null;
  const latest = await findLatestLegacyTermYear(pool, studentId);
  const latestRegistrationTerm = latest
    ? formatLatestRegistrationTerm(latest.term, latest.year)
    : null;
  return mapProfileRowToAdminDetail(row as Record<string, unknown>, latestRegistrationTerm);
}

const DATE_VALIDATION_PREFIX = "Validation:";

function sqlDateFromBodyField(
  label: string,
  raw: unknown,
): { kind: "sql"; value: string } | { kind: "error"; message: string } {
  if (raw == null) {
    return { kind: "sql", value: "0000-00-00" };
  }
  const s = String(raw).trim();
  if (s === "") {
    return { kind: "sql", value: "0000-00-00" };
  }
  const iso = legacyDbDateToIso(s);
  if (!iso) {
    return {
      kind: "error",
      message: `${DATE_VALIDATION_PREFIX} ${label} must be a valid calendar date (YYYY-MM-DD).`,
    };
  }
  return { kind: "sql", value: iso };
}

function parseRequirementsIdForDb(
  raw: unknown,
): { kind: "ok"; value: number | null } | { kind: "error"; message: string } {
  if (raw == null) return { kind: "ok", value: null };
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { kind: "ok", value: Math.trunc(raw) };
  }
  const s = String(raw).trim();
  if (s === "") return { kind: "ok", value: null };
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n)) {
    return {
      kind: "error",
      message: `${DATE_VALIDATION_PREFIX} requirementsId must be numeric or empty.`,
    };
  }
  return { kind: "ok", value: n };
}

function parseZipForDb(
  raw: unknown,
): { kind: "ok"; value: number } | { kind: "error"; message: string } {
  if (raw == null) return { kind: "ok", value: 0 };
  const s = String(raw).trim();
  if (s === "") return { kind: "ok", value: 0 };
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0) {
    return {
      kind: "error",
      message: `${DATE_VALIDATION_PREFIX} zip must be a non-negative integer or empty.`,
    };
  }
  return { kind: "ok", value: n };
}

export type AdminStudentUpdateResult =
  | { ok: true; detail: AdminStudentDetail }
  | { ok: false; status: 400 | 404; message: string };

export async function updateAdminStudent(
  studentIdRaw: string,
  body: AdminStudentUpdateBody,
): Promise<AdminStudentUpdateResult> {
  const studentId = studentIdRaw.trim();
  if (studentId === "") {
    return { ok: false, status: 400, message: "Missing student id." };
  }

  const existing = await loadLegacyStudentProfileRow(pool, studentId);
  if (!existing) {
    return { ok: false, status: 404, message: "Student not found." };
  }

  const name = str(body.name);
  if (name === "") {
    return {
      ok: false,
      status: 400,
      message: `${DATE_VALIDATION_PREFIX} name is required.`,
    };
  }

  const signed = sqlDateFromBodyField("signedDate", body.signedDate);
  if (signed.kind === "error") {
    return { ok: false, status: 400, message: signed.message };
  }
  const enroll = sqlDateFromBodyField("enrollStartDate", body.enrollStartDate);
  if (enroll.kind === "error") {
    return { ok: false, status: 400, message: enroll.message };
  }

  const req = parseRequirementsIdForDb(body.requirementsId);
  if (req.kind === "error") {
    return { ok: false, status: 400, message: req.message };
  }

  const zip = parseZipForDb(body.zip);
  if (zip.kind === "error") {
    return { ok: false, status: 400, message: zip.message };
  }

  const patch = {
    name,
    email: str(body.email),
    gender: str(body.gender),
    background: str(body.backgroundSchool),
    tertiary: str(body.highestDegree),
    requirements_id: req.value,
    address: str(body.address),
    address2: "",
    city: str(body.city),
    state: str(body.state),
    zip: zip.value,
    signed_date_sql: signed.value,
    enroll_start_sql: enroll.value,
  };

  const updated = await updateLegacyStudentMasterRow(pool, studentId, patch);
  if (!updated) {
    return { ok: false, status: 404, message: "Student not found." };
  }

  const detail = await getAdminStudentDetail(studentId);
  if (!detail) {
    return { ok: false, status: 404, message: "Student not found." };
  }
  return { ok: true, detail };
}

const ENTRY_YEAR_MIN = 1900;
const ENTRY_YEAR_MAX = 2100;

function parseDivisionParam(
  raw: unknown,
):
  | { ok: true; value: AdminDivision }
  | { ok: false; status: 400; message: string } {
  if (raw === "Chinese" || raw === "English") {
    return { ok: true, value: raw };
  }
  return {
    ok: false,
    status: 400,
    message: "division must be Chinese or English.",
  };
}

function parseEntryDateParam(
  raw: unknown,
):
  | { ok: true; year: number; month: number }
  | { ok: false; status: 400; message: string } {
  if (raw == null || String(raw).trim() === "") {
    return {
      ok: false,
      status: 400,
      message: "entryDate is required.",
    };
  }
  const iso = legacyDbDateToIso(raw);
  if (!iso) {
    return {
      ok: false,
      status: 400,
      message: "entryDate must be a valid calendar date (YYYY-MM-DD).",
    };
  }
  const y = Number.parseInt(iso.slice(0, 4), 10);
  const month = Number.parseInt(iso.slice(5, 7), 10);
  if (!Number.isFinite(y) || y < ENTRY_YEAR_MIN || y > ENTRY_YEAR_MAX) {
    return {
      ok: false,
      status: 400,
      message: "entry date year is out of range.",
    };
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return {
      ok: false,
      status: 400,
      message: "entry date month is invalid.",
    };
  }
  return { ok: true, year: y, month };
}

export async function previewNextAdminStudentId(
  divisionRaw: unknown,
  entryDateRaw: unknown,
): Promise<
  | { ok: true; studentId: string }
  | { ok: false; status: 400; message: string }
> {
  const div = parseDivisionParam(divisionRaw);
  if (!div.ok) return div;
  const dt = parseEntryDateParam(entryDateRaw);
  if (!dt.ok) return dt;
  try {
    const studentId = await getNextLegacyStudentId(
      pool,
      div.value,
      dt.year,
      dt.month,
    );
    return { ok: true, studentId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not compute next id.";
    return { ok: false, status: 400, message: msg };
  }
}

export type AdminStudentCreateResult =
  | { ok: true; studentId: string }
  | { ok: false; status: 400 | 409; message: string };

export async function createAdminStudent(
  body: AdminStudentCreateBody,
): Promise<AdminStudentCreateResult> {
  const div = parseDivisionParam(body.division);
  if (!div.ok) {
    return { ok: false, status: 400, message: div.message };
  }

  const dt = parseEntryDateParam(body.entryDate);
  if (!dt.ok) {
    return { ok: false, status: 400, message: dt.message };
  }

  const name = str(body.name);
  if (name === "") {
    return {
      ok: false,
      status: 400,
      message: `${DATE_VALIDATION_PREFIX} name is required.`,
    };
  }

  const initialPassword = str(body.initialPassword);
  if (initialPassword === "") {
    return {
      ok: false,
      status: 400,
      message: `${DATE_VALIDATION_PREFIX} initialPassword is required.`,
    };
  }

  const signed = sqlDateFromBodyField("signedDate", body.signedDate);
  if (signed.kind === "error") {
    return { ok: false, status: 400, message: signed.message };
  }
  const enroll = sqlDateFromBodyField("enrollStartDate", body.enrollStartDate);
  if (enroll.kind === "error") {
    return { ok: false, status: 400, message: enroll.message };
  }

  const req = parseRequirementsIdForDb(body.requirementsId);
  if (req.kind === "error") {
    return { ok: false, status: 400, message: req.message };
  }

  const zip = parseZipForDb(body.zip);
  if (zip.kind === "error") {
    return { ok: false, status: 400, message: zip.message };
  }

  const insertPayload = {
    name,
    email: str(body.email),
    gender: str(body.gender),
    background: str(body.backgroundSchool),
    tertiary: str(body.highestDegree),
    requirements_id: req.value,
    address: str(body.address),
    address2: str(body.address2),
    city: str(body.city),
    state: str(body.state),
    zip: zip.value,
    signed_date_sql: signed.value,
    enroll_start_sql: enroll.value,
  };

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const studentId = await getNextLegacyStudentId(
      connection,
      div.value,
      dt.year,
      dt.month,
    );

    if (await legacyStudentMasterExists(connection, studentId)) {
      await connection.rollback();
      return {
        ok: false,
        status: 409,
        message:
          "Generated student id already exists. Refresh and try again.",
      };
    }
    if (await legacyStudentPasswordRowExists(connection, studentId)) {
      await connection.rollback();
      return {
        ok: false,
        status: 409,
        message:
          "A password record already exists for the generated id. Refresh and try again.",
      };
    }

    await createLegacyStudentMasterRow(connection, {
      studentId,
      ...insertPayload,
    });
    await createLegacyStudentPasswordRow(
      connection,
      studentId,
      initialPassword,
    );

    await connection.commit();
    return { ok: true, studentId };
  } catch (e) {
    await connection.rollback();
    const err = e as NodeJS.ErrnoException & { code?: string };
    if (err.code === "ER_DUP_ENTRY") {
      return {
        ok: false,
        status: 409,
        message:
          "Student id or password row conflicts with existing data.",
      };
    }
    throw e;
  } finally {
    connection.release();
  }
}
