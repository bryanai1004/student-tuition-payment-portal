import { MAHM_COURSES } from "../data/mahmCatalog.js";
import type { StudentProgram } from "../types/studentProgram.js";

export type GraduationRequirements = {
  ruleSetId: string;
  sourceLabel: string;
  totalCreditsRequired: number;
  requiredCourses: string[];
  minimumGpa: number | null;
  maximumWithdrawals: number | null;
  notes: string[];
};

function uniqueCourseCodes(courseCodes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of courseCodes) {
    const courseCode = raw.trim().toUpperCase();
    if (courseCode === "" || seen.has(courseCode)) continue;
    seen.add(courseCode);
    out.push(courseCode);
  }
  return out;
}

/** Minimum elective quarter units (beyond MAHM core list). Registrar may raise this. */
export const DEGREE_ELECTIVE_QUARTER_UNITS_REQUIRED = 0;

function sumMahmNonClinicalCredits(): number {
  let total = 0;
  for (const course of MAHM_COURSES) {
    if (course.type === "clinical") continue;
    if (typeof course.units === "number" && Number.isFinite(course.units)) {
      total += course.units;
    }
  }
  return total;
}

/** Total quarter units required for graduation (MAHM didactic+lab + configured elective floor). */
function sumRequiredCredits(): number {
  return sumMahmNonClinicalCredits() + DEGREE_ELECTIVE_QUARTER_UNITS_REQUIRED;
}

const DEFAULT_REQUIRED_COURSES = uniqueCourseCodes(
  MAHM_COURSES.filter((course) => course.type !== "clinical").map(
    (course) => course.courseCode,
  ),
);

const DEFAULT_GRADUATION_REQUIREMENTS: GraduationRequirements = {
  ruleSetId: "shared_catalog_v1",
  sourceLabel: "backend MAHM catalog configuration",
  totalCreditsRequired: sumRequiredCredits(),
  requiredCourses: DEFAULT_REQUIRED_COURSES,
  minimumGpa: null,
  maximumWithdrawals: null,
  notes: [
    "Graduation eligibility is computed from the backend's structured catalog-backed rule set.",
    "Clinical hour and exception workflows are not yet enforced in this evaluator.",
  ],
};

export const PROGRAM_GRADUATION_REQUIREMENTS: Record<
  StudentProgram,
  GraduationRequirements
> = {
  MAHM: {
    ...DEFAULT_GRADUATION_REQUIREMENTS,
    ruleSetId: "mahm_catalog_v1",
  },
  DAHM: {
    ...DEFAULT_GRADUATION_REQUIREMENTS,
    ruleSetId: "dahm_shared_catalog_v1",
    notes: [
      ...DEFAULT_GRADUATION_REQUIREMENTS.notes,
      "DAHM currently uses the shared configured portal curriculum until a DAHM-specific structured rule set is added.",
    ],
  },
};

export function getGraduationRequirementsForProgram(
  program: StudentProgram | null | undefined,
): GraduationRequirements {
  if (program === "DAHM") {
    return PROGRAM_GRADUATION_REQUIREMENTS.DAHM;
  }
  return PROGRAM_GRADUATION_REQUIREMENTS.MAHM;
}
