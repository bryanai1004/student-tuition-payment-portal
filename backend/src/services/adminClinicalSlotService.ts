import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import {
  countClinicTimetableReferences,
  createClinicTimetableSlot,
  deleteClinicTimetableSlot,
  getClinicTimetableById,
  listClinicTimetableSlotsForAdmin,
  updateClinicTimetableSlot,
  type ClinicTimetableAdminRow,
  type ClinicTimetableWritePayload,
} from "../repositories/clinicalTimetableRepository.js";
import { formatClinicTimeHm } from "./clinicalScheduleService.js";

const WEEKDAYS = new Set([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

export class AdminClinicalSlotError extends Error {
  override readonly name = "AdminClinicalSlotError";

  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export type AdminClinicalSlotDto = {
  id: number;
  academicTermId: string | null;
  year: number;
  term: string;
  weekday: string;
  timeFrom: string;
  timeTo: string;
  slot: string;
  instructorId: string;
  instructor: string;
  cap100: number;
  cap200: number;
  cap300: number;
  cap123: number;
  /** Non-dropped `clinical_enrollments` for this slot (admin list + roster index). */
  activeEnrolledCount: number;
};

export type AdminClinicalSlotCreateInput = {
  academicTermId: string;
  weekday: string;
  timeFrom: string;
  timeTo: string;
  slot: string;
  instructorId?: string | null;
  instructor: string;
  cap100?: unknown;
  cap200?: unknown;
  cap300?: unknown;
  cap123?: unknown;
};

export type AdminClinicalSlotPatchInput = Partial<{
  academicTermId: string;
  weekday: string;
  timeFrom: string;
  timeTo: string;
  slot: string;
  instructorId: string | null;
  instructor: string;
  cap100: unknown;
  cap200: unknown;
  cap300: unknown;
  cap123: unknown;
}>;

function rowToDto(row: ClinicTimetableAdminRow): AdminClinicalSlotDto {
  const tf = formatClinicTimeHm(row.time_from) ?? "";
  const tt = formatClinicTimeHm(row.time_to) ?? "";
  return {
    id: row.id,
    academicTermId: row.academic_term_id,
    year: row.year,
    term: row.term,
    weekday: row.weekday,
    timeFrom: tf,
    timeTo: tt,
    slot: row.slot,
    instructorId: row.instructor_id,
    instructor: row.instructor,
    cap100: row.cap_100,
    cap200: row.cap_200,
    cap300: row.cap_300,
    cap123: row.cap_123,
    activeEnrolledCount: row.active_enrolled_count,
  };
}

function trimStr(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  return String(v).trim();
}

/**
 * Parse a cap from admin JSON: empty → 0; otherwise must be a non‑negative integer.
 */
function parseAdminCap(v: unknown, label: string): number {
  if (v === undefined || v === null || v === "") {
    return 0;
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
      throw new AdminClinicalSlotError(`${label} must be a non-negative integer.`);
    }
    return v;
  }
  const s = String(v).trim();
  if (s === "") {
    return 0;
  }
  if (!/^\d+$/.test(s)) {
    throw new AdminClinicalSlotError(`${label} must be a non-negative integer.`);
  }
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new AdminClinicalSlotError(`${label} must be a non-negative integer.`);
  }
  return n;
}

function requireNonNegativeCap(n: number, label: string): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new AdminClinicalSlotError(`${label} must be a non-negative integer.`);
  }
}

/**
 * Parse admin time input to MySQL TIME `HH:MM:SS`.
 */
function normalizeClinicalTimeToSql(v: unknown): string | null {
  const s = trimStr(v);
  if (s === "") {
    return null;
  }
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) {
    return null;
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = m[3] != null ? Number(m[3]) : 0;
  if (
    !Number.isInteger(h) ||
    h < 0 ||
    h > 23 ||
    !Number.isInteger(min) ||
    min < 0 ||
    min > 59 ||
    !Number.isInteger(sec) ||
    sec < 0 ||
    sec > 59
  ) {
    return null;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function assertValidTimeRange(timeFromSql: string, timeToSql: string): void {
  if (timeFromSql === "00:00:00" && timeToSql === "00:00:00") {
    return;
  }
  if (timeFromSql >= timeToSql) {
    throw new AdminClinicalSlotError(
      "Time From must be before Time To (or use 00:00–00:00 only for a legacy placeholder row).",
    );
  }
}

function normalizeWeekday(v: unknown): string {
  const d = trimStr(v);
  if (d === "") {
    throw new AdminClinicalSlotError("Weekday is required.");
  }
  if (!WEEKDAYS.has(d)) {
    throw new AdminClinicalSlotError(
      "Weekday must be a full English name (Monday … Sunday).",
    );
  }
  return d;
}

function normalizeSlot(v: unknown): string {
  const s = trimStr(v);
  if (s === "") {
    throw new AdminClinicalSlotError("Slot is required.");
  }
  return s;
}

function normalizeInstructor(v: unknown): string {
  const s = trimStr(v);
  if (s === "") {
    return "TBA";
  }
  return s;
}

function normalizeInstructorId(v: unknown): string {
  if (v === undefined || v === null) {
    return "";
  }
  return trimStr(v);
}

async function resolveTermYear(
  academicTermId: string,
): Promise<{ year: number; term: string }> {
  const id = trimStr(academicTermId);
  if (id === "") {
    throw new AdminClinicalSlotError("academicTermId is required.");
  }
  const row = await getAcademicTermById(id);
  if (!row) {
    throw new AdminClinicalSlotError(
      "The selected academic term is not valid or no longer exists.",
    );
  }
  return { year: row.year, term: row.term_name };
}

function buildWritePayload(input: {
  year: number;
  term: string;
  weekday: string;
  timeFromSql: string;
  timeToSql: string;
  slot: string;
  instructorId: string;
  instructor: string;
  cap100: number;
  cap200: number;
  cap300: number;
  cap123: number;
}): ClinicTimetableWritePayload {
  return {
    year: input.year,
    term: input.term.trim(),
    day: input.weekday,
    time_from: input.timeFromSql,
    time_to: input.timeToSql,
    slot: input.slot,
    instructor_id: input.instructorId,
    instructor: input.instructor,
    cap_100: input.cap100,
    cap_200: input.cap200,
    cap_300: input.cap300,
    cap_123: input.cap123,
  };
}

export async function listAdminClinicalSlots(options?: {
  academicTermId?: string | null;
}): Promise<AdminClinicalSlotDto[]> {
  const rawId = options?.academicTermId;
  if (rawId != null && String(rawId).trim() !== "") {
    const { year, term } = await resolveTermYear(String(rawId));
    const rows = await listClinicTimetableSlotsForAdmin({ year, term });
    const totalActiveEnrolled = rows.reduce(
      (sum, row) => sum + row.active_enrolled_count,
      0,
    );
    console.info("[clinical-trace] admin active enrolled count query", {
      studentId: null,
      termYear: `${term} ${year}`,
      sourceTable:
        "clinic_timetable LEFT JOIN (clinical_enrollments aggregate by timetable_id)",
      sourceQuery: "clinicalTimetableRepository.listClinicTimetableSlotsForAdmin",
      returnedRowCount: rows.length,
      activeEnrolledTotal: totalActiveEnrolled,
    });
    return rows.map(rowToDto);
  }
  const rows = await listClinicTimetableSlotsForAdmin({});
  const totalActiveEnrolled = rows.reduce(
    (sum, row) => sum + row.active_enrolled_count,
    0,
  );
  console.info("[clinical-trace] admin active enrolled count query", {
    studentId: null,
    termYear: "all",
    sourceTable:
      "clinic_timetable LEFT JOIN (clinical_enrollments aggregate by timetable_id)",
    sourceQuery: "clinicalTimetableRepository.listClinicTimetableSlotsForAdmin",
    returnedRowCount: rows.length,
    activeEnrolledTotal: totalActiveEnrolled,
  });
  return rows.map(rowToDto);
}

export async function createAdminClinicalSlot(
  input: AdminClinicalSlotCreateInput,
): Promise<AdminClinicalSlotDto> {
  const { year, term } = await resolveTermYear(input.academicTermId);
  const weekday = normalizeWeekday(input.weekday);
  const timeFromSql = normalizeClinicalTimeToSql(input.timeFrom);
  const timeToSql = normalizeClinicalTimeToSql(input.timeTo);
  if (timeFromSql == null || timeToSql == null) {
    throw new AdminClinicalSlotError(
      "Time From and Time To are required (use HH:MM or HH:MM:SS).",
    );
  }
  assertValidTimeRange(timeFromSql, timeToSql);
  const slot = normalizeSlot(input.slot);
  const instructor = normalizeInstructor(input.instructor);
  const instructorId = normalizeInstructorId(input.instructorId);

  const cap100 = parseAdminCap(input.cap100, "100 level cap");
  const cap200 = parseAdminCap(input.cap200, "200 level cap");
  const cap300 = parseAdminCap(input.cap300, "300 level cap");
  const cap123 = parseAdminCap(input.cap123, "All levels cap");
  requireNonNegativeCap(cap100, "100 level cap");
  requireNonNegativeCap(cap200, "200 level cap");
  requireNonNegativeCap(cap300, "300 level cap");
  requireNonNegativeCap(cap123, "All levels cap");

  const payload = buildWritePayload({
    year,
    term,
    weekday,
    timeFromSql,
    timeToSql,
    slot,
    instructorId,
    instructor,
    cap100,
    cap200,
    cap300,
    cap123,
  });

  const id = await createClinicTimetableSlot(payload);
  const created = await getClinicTimetableById(id);
  if (!created) {
    throw new AdminClinicalSlotError("Failed to load slot after create.", 500);
  }
  const adminRows = await listClinicTimetableSlotsForAdmin({
    year: created.year,
    term: created.term,
  });
  const withJoin = adminRows.find((r) => r.id === id);
  return rowToDto(
    withJoin ?? {
      ...created,
      academic_term_id: null,
      active_enrolled_count: 0,
    },
  );
}

export async function updateAdminClinicalSlot(
  seqNum: number,
  patch: AdminClinicalSlotPatchInput,
): Promise<AdminClinicalSlotDto | null> {
  if (!Number.isFinite(seqNum) || seqNum <= 0) {
    throw new AdminClinicalSlotError("Invalid slot id.");
  }
  const existing = await getClinicTimetableById(seqNum);
  if (!existing) {
    return null;
  }

  const keys = Object.keys(patch);
  if (keys.length === 0) {
    throw new AdminClinicalSlotError("No updatable fields provided.");
  }

  let year = existing.year;
  let term = existing.term.trim();

  if (patch.academicTermId !== undefined) {
    const resolved = await resolveTermYear(patch.academicTermId);
    year = resolved.year;
    term = resolved.term;
  }

  const weekday =
    patch.weekday !== undefined
      ? normalizeWeekday(patch.weekday)
      : existing.weekday;

  let timeFromSql: string;
  let timeToSql: string;
  if (patch.timeFrom !== undefined || patch.timeTo !== undefined) {
    const tfRaw = patch.timeFrom !== undefined ? patch.timeFrom : existing.time_from;
    const ttRaw = patch.timeTo !== undefined ? patch.timeTo : existing.time_to;
    const tf = normalizeClinicalTimeToSql(tfRaw);
    const tt = normalizeClinicalTimeToSql(ttRaw);
    if (tf == null || tt == null) {
      throw new AdminClinicalSlotError(
        "Time From and Time To are required (use HH:MM or HH:MM:SS).",
      );
    }
    timeFromSql = tf;
    timeToSql = tt;
  } else {
    timeFromSql = normalizeClinicalTimeToSql(existing.time_from) ?? existing.time_from;
    timeToSql = normalizeClinicalTimeToSql(existing.time_to) ?? existing.time_to;
  }
  assertValidTimeRange(timeFromSql, timeToSql);

  const slot =
    patch.slot !== undefined ? normalizeSlot(patch.slot) : existing.slot;

  const instructor =
    patch.instructor !== undefined
      ? normalizeInstructor(patch.instructor)
      : existing.instructor.trim() === ""
        ? "TBA"
        : existing.instructor;

  const instructorId =
    patch.instructorId !== undefined
      ? normalizeInstructorId(patch.instructorId)
      : existing.instructor_id;

  const cap100 =
    patch.cap100 !== undefined
      ? parseAdminCap(patch.cap100, "100 level cap")
      : existing.cap_100;
  const cap200 =
    patch.cap200 !== undefined
      ? parseAdminCap(patch.cap200, "200 level cap")
      : existing.cap_200;
  const cap300 =
    patch.cap300 !== undefined
      ? parseAdminCap(patch.cap300, "300 level cap")
      : existing.cap_300;
  const cap123 =
    patch.cap123 !== undefined
      ? parseAdminCap(patch.cap123, "All levels cap")
      : existing.cap_123;

  requireNonNegativeCap(cap100, "100 level cap");
  requireNonNegativeCap(cap200, "200 level cap");
  requireNonNegativeCap(cap300, "300 level cap");
  requireNonNegativeCap(cap123, "All levels cap");

  const payload = buildWritePayload({
    year,
    term,
    weekday,
    timeFromSql,
    timeToSql,
    slot,
    instructorId,
    instructor,
    cap100,
    cap200,
    cap300,
    cap123,
  });

  const ok = await updateClinicTimetableSlot(seqNum, payload);
  if (!ok) {
    return null;
  }

  const updated = await getClinicTimetableById(seqNum);
  if (!updated) {
    return null;
  }
  const adminRows = await listClinicTimetableSlotsForAdmin({
    year: updated.year,
    term: updated.term,
  });
  const withJoin = adminRows.find((r) => r.id === seqNum);
  return rowToDto(
    withJoin ?? {
      ...updated,
      academic_term_id: null,
      active_enrolled_count: 0,
    },
  );
}

export async function deleteAdminClinicalSlot(
  seqNum: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(seqNum) || seqNum <= 0) {
    return { ok: false, error: "Invalid slot id." };
  }
  const existing = await getClinicTimetableById(seqNum);
  if (!existing) {
    return { ok: false, error: "Clinical slot not found." };
  }
  const refs = await countClinicTimetableReferences(seqNum);
  const activeTotal =
    refs.activeEnrollments + refs.activePendingRequests + refs.activeAssignments;
  if (activeTotal > 0) {
    return {
      ok: false,
      // Keep delete guard aligned with operational "active" semantics used in roster/list views.
      error: `This slot cannot be deleted because it still has active references (${refs.activeEnrollments} active enrollment(s), ${refs.activePendingRequests} pending clinical request(s), ${refs.activeAssignments} active assignment(s)). Remove or reassign those records first.`,
    };
  }
  const historicalTotal =
    refs.historicalDroppedEnrollments +
    refs.historicalDecidedRequests +
    refs.historicalDroppedAssignments;
  if (historicalTotal > 0) {
    return {
      ok: false,
      // Historical rows are retained for audit/history, so hard delete stays blocked even when active counts are zero.
      error: `This slot cannot be deleted because it has historical references (${refs.historicalDroppedEnrollments} dropped enrollment(s), ${refs.historicalDecidedRequests} decided clinical request(s), ${refs.historicalDroppedAssignments} dropped/cancelled assignment(s)).`,
    };
  }
  const deleted = await deleteClinicTimetableSlot(seqNum);
  if (!deleted) {
    return { ok: false, error: "Clinical slot not found." };
  }
  return { ok: true };
}
