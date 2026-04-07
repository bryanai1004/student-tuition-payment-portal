import type { Pool, RowDataPacket } from "mysql2/promise";
import type { ClinicalProgress } from "../types/studentAccount.js";

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function normCode(code: string): string {
  return code.trim().toUpperCase();
}

/** True when legacy `clinic.code` represents the given clinical level (e.g. CL211-8 → CL211). */
function codeStartsWithClinicalPrefix(code: string, prefix: string): boolean {
  const u = normCode(code);
  const p = prefix.toUpperCase();
  return u === p || u.startsWith(`${p}-`) || u.startsWith(p);
}

function clinicalLevelFromCodes(codes: string[]): number {
  for (const c of codes) {
    if (codeStartsWithClinicalPrefix(c, "CL311")) return 3;
  }
  for (const c of codes) {
    if (codeStartsWithClinicalPrefix(c, "CL211")) return 2;
  }
  for (const c of codes) {
    if (codeStartsWithClinicalPrefix(c, "CL111")) return 1;
  }
  return 0;
}

function hasClinicalPrefix(codes: string[], prefix: string): boolean {
  return codes.some((c) => codeStartsWithClinicalPrefix(c, prefix));
}

function aggregateClinicCodesFromRows(
  rows: Array<Record<string, unknown>>,
): { completedHours: number; completedCourses: string[] } {
  const codeSet = new Set<string>();
  let completedHours = 0;
  for (const row of rows) {
    const code = str(row.code);
    if (code !== "") codeSet.add(code);
    const h = Number(row.hours);
    if (Number.isFinite(h)) completedHours += h;
  }
  const completedCourses = [...codeSet].sort((a, b) =>
    normCode(a).localeCompare(normCode(b)),
  );
  return { completedHours, completedCourses };
}

function assembleClinicalProgress(
  completedCourses: string[],
  completedHours: number,
  requiredHours: number,
): ClinicalProgress {
  const level = clinicalLevelFromCodes(completedCourses);
  const has211 = hasClinicalPrefix(completedCourses, "CL211");
  const has311 = hasClinicalPrefix(completedCourses, "CL311");
  const readiness: ClinicalProgress["readiness"] =
    completedHours >= requiredHours ? "ready" : "not_ready";
  const missing: string[] = [];
  if (!has211) missing.push("Complete CL211");
  if (!has311) missing.push("Complete CL311");
  if (requiredHours > 0 && completedHours < requiredHours) {
    missing.push(`Remaining ${requiredHours - completedHours} hours`);
  }
  return {
    level,
    completedHours,
    requiredHours,
    completedCourses,
    readiness,
    missing,
  };
}

/**
 * Two queries total: clinic rows for all ids, then required hours per student.
 * Same rules as {@link buildClinicalProgress}; map keys are trimmed student ids.
 */
export async function batchBuildClinicalProgressForStudentIds(
  pool: Pool,
  studentIds: string[],
): Promise<Map<string, ClinicalProgress>> {
  const normalized = [
    ...new Set(
      studentIds.map((s) => s.trim()).filter((s) => s.length > 0),
    ),
  ];
  const out = new Map<string, ClinicalProgress>();
  if (normalized.length === 0) return out;

  const placeholders = normalized.map(() => "?").join(",");

  const [clinicRows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(c.id) AS student_id, TRIM(c.code) AS code, c.hours AS hours
     FROM clinic c
     WHERE TRIM(c.id) IN (${placeholders})`,
    normalized,
  );

  const [reqRows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(s.id) AS student_id, r.clinic_hours AS clinic_hours
     FROM students s
     LEFT JOIN requirements r ON s.requirements_id = r.id
     WHERE TRIM(s.id) IN (${placeholders})`,
    normalized,
  );

  const requiredByStudent = new Map<string, number>();
  for (const row of reqRows) {
    const r = row as Record<string, unknown>;
    const sid = str(r.student_id);
    const rh = Number(r.clinic_hours);
    const requiredHours = Number.isFinite(rh) && rh >= 0 ? rh : 0;
    requiredByStudent.set(sid, requiredHours);
  }

  const clinicByStudent = new Map<string, Array<Record<string, unknown>>>();
  for (const row of clinicRows) {
    const r = row as Record<string, unknown>;
    const sid = str(r.student_id);
    if (sid === "") continue;
    let bucket = clinicByStudent.get(sid);
    if (!bucket) {
      bucket = [];
      clinicByStudent.set(sid, bucket);
    }
    bucket.push(r);
  }

  for (const sid of normalized) {
    const agg = aggregateClinicCodesFromRows(clinicByStudent.get(sid) ?? []);
    const requiredHours = requiredByStudent.get(sid) ?? 0;
    out.set(
      sid,
      assembleClinicalProgress(
        agg.completedCourses,
        agg.completedHours,
        requiredHours,
      ),
    );
  }

  return out;
}

/**
 * Legacy clinical progress from `clinic`, `students`, and `requirements` (real students only).
 */
export async function buildClinicalProgress(
  pool: Pool,
  studentId: string,
): Promise<ClinicalProgress> {
  const sid = studentId.trim();

  const [clinicRows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(code) AS code, hours
     FROM clinic
     WHERE TRIM(id) = TRIM(?)`,
    [sid],
  );

  const agg = aggregateClinicCodesFromRows(
    clinicRows as Array<Record<string, unknown>>,
  );

  const [reqRows] = await pool.query<RowDataPacket[]>(
    `SELECT requirements.clinic_hours AS clinic_hours
     FROM requirements
     INNER JOIN students ON students.requirements_id = requirements.id
     WHERE TRIM(students.id) = TRIM(?)`,
    [sid],
  );

  let requiredHours = 0;
  if (reqRows.length > 0) {
    const rh = Number((reqRows[0] as Record<string, unknown>).clinic_hours);
    requiredHours = Number.isFinite(rh) && rh >= 0 ? rh : 0;
  }

  return assembleClinicalProgress(
    agg.completedCourses,
    agg.completedHours,
    requiredHours,
  );
}
