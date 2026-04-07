import {
  insertClinicalAssignment,
  listStudentClinicalAssignments,
  type ClinicalAssignmentDbRow,
  type InsertClinicalAssignmentPayload,
} from "../repositories/clinicalScheduleRepository.js";

export type ClinicalScheduleSessionDto = {
  id: number;
  studentId: string;
  courseCode: string;
  sessionDate: string;
  sessionName: string | null;
  site: string | null;
  faculty: string | null;
  status: string;
};

function rowToDto(r: ClinicalAssignmentDbRow): ClinicalScheduleSessionDto {
  return {
    id: r.id,
    studentId: r.student_id,
    courseCode: r.course_code,
    sessionDate: r.session_date,
    sessionName: r.session_name,
    site: r.site,
    faculty: r.faculty,
    status: r.status,
  };
}

export async function getStudentClinicalSchedule(
  studentId: string,
): Promise<ClinicalScheduleSessionDto[]> {
  const rows = await listStudentClinicalAssignments(studentId);
  return rows.map(rowToDto);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(ymd: string): boolean {
  if (!ISO_DATE.test(ymd)) return false;
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

export type AssignClinicalSessionBody = {
  studentId: string;
  courseCode: string;
  sessionDate: string;
  sessionName?: string;
  site?: string;
  faculty?: string;
};

export type AssignClinicalSessionResult =
  | { ok: true; id: number }
  | { ok: false; error: string; status: number };

export async function assignClinicalSession(
  body: AssignClinicalSessionBody,
): Promise<AssignClinicalSessionResult> {
  const studentId = String(body.studentId ?? "").trim();
  const courseCode = String(body.courseCode ?? "").trim();
  const sessionDate = String(body.sessionDate ?? "").trim();
  if (studentId === "") {
    return { ok: false, error: "studentId is required", status: 400 };
  }
  if (courseCode === "") {
    return { ok: false, error: "courseCode is required", status: 400 };
  }
  if (sessionDate === "") {
    return { ok: false, error: "sessionDate is required", status: 400 };
  }
  if (!isValidCalendarDate(sessionDate)) {
    return {
      ok: false,
      error: "sessionDate must be a valid YYYY-MM-DD date",
      status: 400,
    };
  }

  const opt = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  const payload: InsertClinicalAssignmentPayload = {
    studentId,
    courseCode,
    sessionDate,
    sessionName: opt(body.sessionName),
    site: opt(body.site),
    faculty: opt(body.faculty),
  };

  try {
    const id = await insertClinicalAssignment(payload);
    return { ok: true, id };
  } catch (e) {
    console.error(e);
    return {
      ok: false,
      error: "Failed to create clinical assignment",
      status: 500,
    };
  }
}
