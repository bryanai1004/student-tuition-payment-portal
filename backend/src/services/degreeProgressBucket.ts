import { MAHM_COURSES } from "../data/mahmCatalog.js";
import type { CourseRecord } from "../types/studentAccount.js";
import { isClinicalCourse } from "./studentAcademicCourseRecords.js";

/** Degree progress reporting buckets (replaces legacy didactic / lab split in the UI). */
export type DegreeProgressBucketId = "core" | "elective" | "clinical";

export type DegreeBucketQuarterTotals = {
  core: number;
  elective: number;
  clinicalHours: number;
};

function normalizeCourseCode(courseCode: string): string {
  return courseCode.replace(/[\s-]+/g, "").trim().toUpperCase();
}

function buildMahmByCode(): Map<string, CourseRecord> {
  const byCode = new Map<string, CourseRecord>();
  for (const c of MAHM_COURSES) {
    byCode.set(normalizeCourseCode(c.courseCode), c);
  }
  return byCode;
}

const MAHM_BY_CODE = buildMahmByCode();

/**
 * Heuristic: `school.courses.category` stores `course_category.category_id` (opaque string).
 * Match common tokens so staff can drive **Elective** / **Clinical** without code changes.
 */
export function catalogCategoryIdToBucketHint(categoryId: string | null | undefined): {
  elective: boolean;
  clinical: boolean;
} {
  const raw = categoryId?.trim().toLowerCase() ?? "";
  if (raw === "") return { elective: false, clinical: false };
  const elective =
    raw.includes("elect") ||
    raw.includes("optional") ||
    raw === "el" ||
    raw.startsWith("el_");
  const clinical =
    raw.includes("clinic") ||
    raw.includes("intern") ||
    raw.includes("rotation") ||
    raw === "clinical";
  return { elective, clinical };
}

/**
 * Resolve the progress bucket for one course code using the static MAHM map plus the live
 * school catalog category when present.
 */
export function resolveDegreeProgressBucket(
  courseCode: string,
  courseTitle: string | null | undefined,
  catalogCategoryId: string | null | undefined,
): DegreeProgressBucketId {
  const codeNorm = normalizeCourseCode(courseCode);
  const mahm = MAHM_BY_CODE.get(codeNorm);
  const hints = catalogCategoryIdToBucketHint(catalogCategoryId);

  if (mahm?.type === "clinical") {
    return "clinical";
  }
  if (hints.clinical || isClinicalCourse(courseCode, courseTitle ?? "")) {
    return "clinical";
  }
  if (hints.elective) {
    return "elective";
  }
  if (mahm != null) {
    return "core";
  }
  return "core";
}

/** Required totals from the static MAHM catalog plus configured elective quarter-unit floor. */
export function catalogDegreeRequirementTotals(electiveQuarterUnitsRequired: number): {
  coreQuarterUnits: number;
  electiveQuarterUnits: number;
  clinicalHoursRequired: number;
} {
  let coreQuarterUnits = 0;
  let clinicalHoursRequired = 0;
  for (const c of MAHM_COURSES) {
    if (c.type === "clinical") {
      if (typeof c.hours === "number" && Number.isFinite(c.hours)) {
        clinicalHoursRequired += c.hours;
      }
      continue;
    }
    if (typeof c.units === "number" && Number.isFinite(c.units)) {
      coreQuarterUnits += c.units;
    }
  }
  const electiveQuarterUnits = Math.max(
    0,
    Number.isFinite(electiveQuarterUnitsRequired) ? electiveQuarterUnitsRequired : 0,
  );
  return { coreQuarterUnits, electiveQuarterUnits, clinicalHoursRequired };
}
