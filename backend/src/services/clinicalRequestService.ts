import { pool } from "../lib/db.js";
import { getClinicTimetableById } from "../repositories/clinicalTimetableRepository.js";
import { insertClinicalAssignment } from "../repositories/clinicalScheduleRepository.js";
import {
  getClinicalRequestById,
  getClinicalRequestByIdForUpdate,
  insertClinicalRequestRow,
  listClinicalRequestsForStudent,
  listPendingClinicalRequestsForAdmin,
  studentHasPendingClinicalRequestForTimetable,
  updateClinicalRequestDecision,
  type ClinicalRequestDbRow,
} from "../repositories/clinicalRequestRepository.js";
import {
  buildClinicTimetableSlotLabel,
  buildTimetableClinicalAssignmentPayload,
  ClinicalScheduleValidationError,
  formatClinicTimeHm,
} from "./clinicalScheduleService.js";

export type ClinicalRequestApiItem = {
  id: number;
  studentId: string;
  timetableId: number;
  term: string;
  year: number;
  status: string;
  slotLabel: string;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
};

export type AdminPendingClinicalRequestApiItem = {
  id: number;
  studentId: string;
  timetableId: number;
  term: string;
  year: number;
  slotLabel: string;
  createdAt: string;
};

function rowSlotLabel(row: ClinicalRequestDbRow): string {
  if (row.tt_day == null) {
    return `Timetable #${row.timetable_id}`;
  }
  return buildClinicTimetableSlotLabel({
    weekday: row.tt_day,
    timeFrom: formatClinicTimeHm(row.tt_time_from),
    timeTo: formatClinicTimeHm(row.tt_time_to),
    slot: row.tt_slot ?? "",
    instructor: row.tt_instructor,
  });
}

function toIsoTimestamp(d: Date): string {
  return d.toISOString();
}

function mapStudentRequestRow(row: ClinicalRequestDbRow): ClinicalRequestApiItem {
  return {
    id: row.id,
    studentId: row.student_id,
    timetableId: row.timetable_id,
    term: row.term,
    year: row.year,
    status: row.status,
    slotLabel: rowSlotLabel(row),
    createdAt: toIsoTimestamp(row.created_at),
    decidedAt: row.decided_at ? toIsoTimestamp(row.decided_at) : null,
    decidedBy: row.decided_by,
  };
}

function mapAdminPendingRow(
  row: ClinicalRequestDbRow,
): AdminPendingClinicalRequestApiItem {
  return {
    id: row.id,
    studentId: row.student_id,
    timetableId: row.timetable_id,
    term: row.term,
    year: row.year,
    slotLabel: rowSlotLabel(row),
    createdAt: toIsoTimestamp(row.created_at),
  };
}

export type CreateClinicalRequestResult =
  | { ok: true; id: number }
  | { ok: false; error: string; status: number };

export async function createStudentClinicalRequest(
  studentId: string,
  timetableId: number,
): Promise<CreateClinicalRequestResult> {
  const sid = String(studentId ?? "").trim();
  if (sid === "") {
    return { ok: false, error: "Student id is required", status: 400 };
  }
  if (!Number.isFinite(timetableId) || timetableId <= 0) {
    return { ok: false, error: "timetableId is required", status: 400 };
  }

  const tt = await getClinicTimetableById(timetableId);
  if (tt == null) {
    return { ok: false, error: "timetableId not found", status: 404 };
  }

  const hasPending = await studentHasPendingClinicalRequestForTimetable(
    sid,
    timetableId,
  );
  if (hasPending) {
    return {
      ok: false,
      error: "You already have a pending request for this slot",
      status: 409,
    };
  }

  try {
    const id = await insertClinicalRequestRow({
      studentId: sid,
      timetableId,
      term: tt.term,
      year: tt.year,
    });
    return { ok: true, id };
  } catch (e) {
    console.error(e);
    return {
      ok: false,
      error: "Failed to create clinical request",
      status: 500,
    };
  }
}

export async function listStudentClinicalRequestsApi(
  studentId: string,
): Promise<ClinicalRequestApiItem[]> {
  const sid = String(studentId ?? "").trim();
  if (sid === "") {
    throw new ClinicalScheduleValidationError("Student id is required");
  }
  const rows = await listClinicalRequestsForStudent(sid);
  return rows.map(mapStudentRequestRow);
}

export async function listAdminPendingClinicalRequestsApi(): Promise<
  AdminPendingClinicalRequestApiItem[]
> {
  const rows = await listPendingClinicalRequestsForAdmin();
  return rows.map(mapAdminPendingRow);
}

export type DecideClinicalRequestResult =
  | { ok: true; assignmentId?: number }
  | { ok: false; error: string; status: number };

export async function approveClinicalRequestById(
  requestId: number,
  decidedBy: string | null,
): Promise<DecideClinicalRequestResult> {
  if (!Number.isFinite(requestId) || requestId <= 0) {
    return { ok: false, error: "Invalid request id", status: 400 };
  }

  const snapshot = await getClinicalRequestById(requestId);
  if (snapshot == null) {
    return { ok: false, error: "Request not found", status: 404 };
  }
  if (snapshot.status !== "pending") {
    return { ok: false, error: "Request is not pending", status: 409 };
  }

  const tt = await getClinicTimetableById(snapshot.timetable_id);
  if (tt == null) {
    return { ok: false, error: "timetableId not found", status: 404 };
  }

  const payload = buildTimetableClinicalAssignmentPayload(
    snapshot.student_id,
    tt,
    "Scheduled",
  );

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const locked = await getClinicalRequestByIdForUpdate(connection, requestId);
    if (locked == null) {
      await connection.rollback();
      return { ok: false, error: "Request not found", status: 404 };
    }
    if (locked.status !== "pending") {
      await connection.rollback();
      return { ok: false, error: "Request is not pending", status: 409 };
    }

    const assignmentId = await insertClinicalAssignment(payload, connection);
    const n = await updateClinicalRequestDecision(
      connection,
      requestId,
      "approved",
      decidedBy,
    );
    if (n === 0) {
      await connection.rollback();
      return { ok: false, error: "Request is not pending", status: 409 };
    }

    await connection.commit();
    return { ok: true, assignmentId };
  } catch (e) {
    await connection.rollback();
    console.error(e);
    return {
      ok: false,
      error: "Failed to approve clinical request",
      status: 500,
    };
  } finally {
    connection.release();
  }
}

export async function rejectClinicalRequestById(
  requestId: number,
  decidedBy: string | null,
): Promise<DecideClinicalRequestResult> {
  if (!Number.isFinite(requestId) || requestId <= 0) {
    return { ok: false, error: "Invalid request id", status: 400 };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const locked = await getClinicalRequestByIdForUpdate(connection, requestId);
    if (locked == null) {
      await connection.rollback();
      return { ok: false, error: "Request not found", status: 404 };
    }
    if (locked.status !== "pending") {
      await connection.rollback();
      return { ok: false, error: "Request is not pending", status: 409 };
    }

    const n = await updateClinicalRequestDecision(
      connection,
      requestId,
      "rejected",
      decidedBy,
    );
    if (n === 0) {
      await connection.rollback();
      return { ok: false, error: "Request is not pending", status: 409 };
    }

    await connection.commit();
    return { ok: true };
  } catch (e) {
    await connection.rollback();
    console.error(e);
    return {
      ok: false,
      error: "Failed to reject clinical request",
      status: 500,
    };
  } finally {
    connection.release();
  }
}
