import { getClinicTimetableById } from "../repositories/clinicalTimetableRepository.js";
import {
  createClinicalEnrollment,
  dropClinicalEnrollment,
  listAvailableClinicalEnrollmentSlots,
  listStudentClinicalEnrollments,
  totalClinicTimetableCapacityCaps,
  type ClinicalEnrollmentSlotRow,
  type ClinicalEnrollmentStudentRow,
} from "../repositories/clinicalEnrollmentRepository.js";
import { insertClinicalAssignment } from "../repositories/clinicalScheduleRepository.js";
import {
  buildTimetableClinicalAssignmentPayload,
  ClinicalScheduleValidationError,
} from "./clinicalScheduleService.js";

export type OpenClinicalSlotForStudentDto = ClinicalEnrollmentSlotRow & {
  alreadyEnrolled: boolean;
};

function normalizeQueryTerm(term: string | null | undefined): string | null {
  if (term == null) return null;
  const t = String(term).trim();
  return t === "" ? null : t.slice(0, 20);
}

function normalizeQueryYear(
  year: string | number | null | undefined,
): number | null {
  if (year == null || year === "") return null;
  const n = typeof year === "number" ? year : Number(String(year).trim());
  return Number.isFinite(n) ? n : null;
}

export async function listOpenClinicalSlotsForStudent(
  studentId: string,
  query?: { term?: string | null; year?: string | number | null },
): Promise<OpenClinicalSlotForStudentDto[]> {
  const sid = String(studentId ?? "").trim();
  if (sid === "") {
    throw new ClinicalScheduleValidationError("Student id is required");
  }
  const term = normalizeQueryTerm(query?.term ?? null);
  const year = normalizeQueryYear(query?.year ?? null);

  const [slots, mine] = await Promise.all([
    listAvailableClinicalEnrollmentSlots({
      year,
      term,
    }),
    listStudentClinicalEnrollments(sid, {
      term,
      year,
    }),
  ]);

  const activeTimetableIds = new Set(
    mine
      .filter((r) => r.status.trim().toLowerCase() === "enrolled")
      .map((r) => r.timetableId),
  );

  return slots.map((s) => ({
    ...s,
    alreadyEnrolled: activeTimetableIds.has(s.timetableId),
  }));
}

export async function listStudentClinicalEnrollmentRows(
  studentId: string,
  query?: { term?: string | null; year?: string | number | null },
): Promise<ClinicalEnrollmentStudentRow[]> {
  const sid = String(studentId ?? "").trim();
  if (sid === "") {
    throw new ClinicalScheduleValidationError("Student id is required");
  }
  const term = normalizeQueryTerm(query?.term ?? null);
  const year = normalizeQueryYear(query?.year ?? null);
  return listStudentClinicalEnrollments(sid, { term, year });
}

export async function enrollStudentInClinicalSlot(
  studentId: string,
  timetableId: number,
): Promise<
  | { ok: true; enrollmentId: number; assignmentId: number }
  | { ok: false; error: string; status: number }
> {
  const sid = String(studentId ?? "").trim();
  if (sid === "") {
    return { ok: false, error: "Student id is required", status: 400 };
  }
  if (!Number.isFinite(timetableId) || timetableId <= 0) {
    return { ok: false, error: "timetableId is required", status: 400 };
  }

  const tt = await getClinicTimetableById(timetableId);
  if (tt == null) {
    return { ok: false, error: "Clinic slot not found.", status: 400 };
  }

  const term = tt.term.trim().slice(0, 20);
  const year = tt.year;
  if (term === "" || !Number.isFinite(year)) {
    return {
      ok: false,
      error: "This timetable row is missing a valid term or year.",
      status: 400,
    };
  }

  const slotCapacity = totalClinicTimetableCapacityCaps(tt);

  const result = await createClinicalEnrollment(
    sid,
    timetableId,
    term,
    year,
    slotCapacity,
    async (conn) => {
      const payload = buildTimetableClinicalAssignmentPayload(sid, tt, null);
      return insertClinicalAssignment(payload, conn);
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.error, status: 400 };
  }
  return {
    ok: true,
    enrollmentId: result.enrollmentId,
    assignmentId: result.assignmentId,
  };
}

export async function dropStudentClinicalEnrollment(
  studentId: string,
  enrollmentId: number,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const sid = String(studentId ?? "").trim();
  if (sid === "") {
    return { ok: false, error: "Student id is required", status: 400 };
  }
  if (!Number.isFinite(enrollmentId) || enrollmentId <= 0) {
    return { ok: false, error: "enrollmentId is required", status: 400 };
  }

  const result = await dropClinicalEnrollment(sid, enrollmentId);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      status: 400,
    };
  }
  return { ok: true };
}
