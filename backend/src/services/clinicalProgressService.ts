import { type Pool, type RowDataPacket } from "../lib/db.js";
/**
 * ClinicalProgress = clinic ladder + completed hours vs `requirements.clinic_hours`.
 * Not an academic course attempt (marks/clinic grade rows); not transcript UI rows; do not merge into didactic unit totals.
 */

import type { ClinicalProgress } from "../domain/studentDomainModels.js";

/** When `requirements.clinic_hours` is missing, null, or non-positive, avoid implying 0 required / "ready". */
const DEFAULT_CLINIC_REQUIRED_HOURS = 960;

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
    if (
      codeStartsWithClinicalPrefix(c, "CL111") ||
      codeStartsWithClinicalPrefix(c, "CL113")
    ) {
      return 1;
    }
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

/**
 * Resolves program clinic hour requirement from DB. Any missing or unusable value falls back to
 * {@link DEFAULT_CLINIC_REQUIRED_HOURS} so progress UI does not show 0 required or spurious readiness.
 */
function resolveRequiredClinicHoursFromRaw(
  hasRequirementJoinRow: boolean,
  clinicHoursRaw: unknown,
): number {
  if (!hasRequirementJoinRow) {
    return DEFAULT_CLINIC_REQUIRED_HOURS;
  }
  if (clinicHoursRaw == null) {
    return DEFAULT_CLINIC_REQUIRED_HOURS;
  }
  const rh = Number(clinicHoursRaw);
  if (!Number.isFinite(rh) || rh <= 0) {
    return DEFAULT_CLINIC_REQUIRED_HOURS;
  }
  return rh;
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
    requiredHours > 0 && completedHours >= requiredHours ? "ready" : "not_ready";
  const missing: string[] = [];
  if (!has211) missing.push("Complete CL211");
  if (!has311) missing.push("Complete CL311");
  if (completedHours < requiredHours) {
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
 * Maps {@link ClinicalProgress}.level (CL111→1, CL211→2, CL311→3; 0 = no ladder row yet)
 * to `clinic_timetable` capacity bucket keys used for booking (`100` / `200` / `300`).
 */
export type ClinicalBookingLevelKey = "100" | "200" | "300";

export function clinicalProgressToBookingLevelKey(
  cp: ClinicalProgress,
): ClinicalBookingLevelKey {
  const raw = Math.trunc(Number(cp.level));
  const tier =
    !Number.isFinite(raw) || raw <= 0
      ? 1
      : Math.min(3, Math.max(1, raw));
  if (tier === 1) return "100";
  if (tier === 2) return "200";
  return "300";
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
    if (sid === "") continue;
    requiredByStudent.set(
      sid,
      resolveRequiredClinicHoursFromRaw(true, r.clinic_hours),
    );
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
    const requiredHours =
      requiredByStudent.get(sid) ??
      resolveRequiredClinicHoursFromRaw(false, undefined);
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

  const requiredHours =
    reqRows.length > 0
      ? resolveRequiredClinicHoursFromRaw(
          true,
          (reqRows[0] as Record<string, unknown>).clinic_hours,
        )
      : resolveRequiredClinicHoursFromRaw(false, undefined);

  return assembleClinicalProgress(
    agg.completedCourses,
    agg.completedHours,
    requiredHours,
  );
}
