import { pool, type RowDataPacket } from "../lib/db.js";
import { MAHM_COURSES } from "../data/mahmCatalog.js";
import type { CourseRecord } from "../types/studentAccount.js";
import type { GraduationRequirements } from "../config/graduationRequirements.js";
import { getGraduationRequirementsForProgram } from "../config/graduationRequirements.js";
import type { StudentProgram } from "../types/studentProgram.js";
import {
  collapseCatalogToCanonicalMap,
  getCourseEquivalencyIndex,
  normalizeCourseCode,
  requiredCourseCodesFromCanonicalCatalog,
  sumRequiredQuarterUnitsFromCatalog,
  type CourseEquivalencyIndex,
} from "./courseEquivalencyService.js";

function portalTypeFromRow(raw: unknown): CourseRecord["type"] {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "lab") return "lab";
  if (s === "clinical") return "clinical";
  if (s === "other") return "other";
  return "didactic";
}

function toCourseRecord(row: RowDataPacket): CourseRecord | null {
  const courseCode = String(row.course_code ?? "").trim();
  if (courseCode === "") return null;
  const courseId = String(row.course_id ?? courseCode).trim() || courseCode;
  const title = String(row.title ?? "").trim() || courseCode;
  const type = portalTypeFromRow(row.type);
  const unitsRaw = row.units;
  let units: number | undefined;
  if (unitsRaw != null && unitsRaw !== "") {
    const n = Number(unitsRaw);
    if (Number.isFinite(n)) units = n;
  }
  const hoursRaw = row.hours;
  let hours: number | undefined;
  if (hoursRaw != null && hoursRaw !== "") {
    const n = Number(hoursRaw);
    if (Number.isFinite(n)) hours = n;
  }
  return { courseId, courseCode, title, type, units, hours };
}

/** Raw portal catalog keyed by normalized course code; MAHM static list fills gaps. */
export async function loadProgramCatalogByCode(): Promise<Map<string, CourseRecord>> {
  const equiv = await getCourseEquivalencyIndex();
  return loadProgramCatalogByCodeWithEquivalency(equiv);
}

export async function loadProgramCatalogByCodeWithEquivalency(
  equiv: CourseEquivalencyIndex,
): Promise<Map<string, CourseRecord>> {
  const byCode = new Map<string, CourseRecord>();

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT course_id, TRIM(course_code) AS course_code, TRIM(title) AS title,
              type, units, hours
       FROM portal_courses
       ORDER BY TRIM(course_code) ASC`,
    );
    for (const row of rows) {
      const rec = toCourseRecord(row);
      if (rec == null) continue;
      byCode.set(normalizeCourseCode(rec.courseCode), rec);
    }
  } catch (e) {
    console.warn("[program-catalog] portal_courses load failed; using static fallback only", e);
  }

  for (const c of MAHM_COURSES) {
    const key = normalizeCourseCode(c.courseCode);
    if (byCode.has(key)) continue;
    const canonical = equiv.resolveCanonical(key);
    const canonicalAlreadyListed = [...byCode.keys()].some(
      (listed) => equiv.resolveCanonical(listed) === canonical,
    );
    if (canonicalAlreadyListed) continue;
    byCode.set(key, c);
  }

  return byCode;
}

/** Canonical catalog — one row per equivalence class (#16–#18). */
export async function loadCanonicalProgramCatalogByCode(): Promise<Map<string, CourseRecord>> {
  const [raw, equiv] = await Promise.all([
    loadProgramCatalogByCode(),
    getCourseEquivalencyIndex(),
  ]);
  return collapseCatalogToCanonicalMap(raw, equiv);
}

/**
 * Graduation rules prefer live `portal_courses` (+ static MAHM fallback), collapsed by equivalency.
 */
export async function getGraduationRequirementsForProgramAsync(
  program: StudentProgram | null | undefined,
): Promise<GraduationRequirements> {
  const base = getGraduationRequirementsForProgram(program);
  const equiv = await getCourseEquivalencyIndex();
  const rawCatalog = await loadProgramCatalogByCodeWithEquivalency(equiv);
  const catalog = collapseCatalogToCanonicalMap(rawCatalog, equiv);
  if (catalog.size === 0) {
    return base;
  }

  const requiredCourses = requiredCourseCodesFromCanonicalCatalog(catalog);
  const totalCreditsRequired = sumRequiredQuarterUnitsFromCatalog(catalog);
  if (requiredCourses.length === 0 || totalCreditsRequired <= 0) {
    return base;
  }

  const merged: GraduationRequirements = {
    ...base,
    totalCreditsRequired,
    requiredCourses,
    ruleSetId: `${base.ruleSetId}_portal_catalog`,
    sourceLabel: "portal_courses with MAHM static fallback (equivalency-collapsed)",
    notes: [
      ...base.notes,
      "Required course codes and credit totals use portal_courses with courses_equivalency collapse.",
      "Legacy (BS101), PDF (BS110), and static placeholder codes count as one requirement when equivalent.",
    ],
  };
  return merged;
}

export function catalogRequirementTotalsFromMap(catalog: Map<string, CourseRecord>): {
  didacticRequired: number;
  labRequired: number;
  clinicalHoursRequired: number;
} {
  let didacticRequired = 0;
  let labRequired = 0;
  let clinicalHoursRequired = 0;
  for (const c of catalog.values()) {
    if (c.type === "didactic" && typeof c.units === "number" && Number.isFinite(c.units)) {
      didacticRequired += c.units;
    } else if (c.type === "lab" && typeof c.units === "number" && Number.isFinite(c.units)) {
      labRequired += c.units;
    } else if (
      c.type === "clinical" &&
      typeof c.hours === "number" &&
      Number.isFinite(c.hours)
    ) {
      clinicalHoursRequired += c.hours;
    }
  }
  return {
    didacticRequired: Math.round(didacticRequired * 100) / 100,
    labRequired: Math.round(labRequired * 100) / 100,
    clinicalHoursRequired: Math.round(clinicalHoursRequired * 100) / 100,
  };
}

export function resolveProgressCatalogEntry(
  codeNorm: string,
  byCode: Map<string, CourseRecord>,
  equiv?: CourseEquivalencyIndex | null,
): CourseRecord {
  const listed = byCode.get(codeNorm);
  if (listed != null) return listed;

  if (equiv != null) {
    for (const eq of equiv.equivalentCodes(codeNorm)) {
      const hit = byCode.get(eq);
      if (hit != null) return hit;
    }
    const viaCanonical = byCode.get(equiv.resolveCanonical(codeNorm));
    if (viaCanonical != null) return viaCanonical;
  }

  return {
    courseId: `unlisted:${codeNorm}`,
    courseCode: codeNorm,
    title: "",
    type: "didactic",
  };
}

export { normalizeCourseCode as normalizeProgramCourseCode };
