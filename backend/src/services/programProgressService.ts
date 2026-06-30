import { DEMO_STUDENT_ID } from "../config/constants.js";
import type { StudentAcademicCourseRecord } from "../types/studentAcademics.js";
import { evaluateGraduation } from "./graduationEvaluationService.js";
import {
  catalogRequirementTotalsFromMap,
  loadCanonicalProgramCatalogByCode,
  normalizeProgramCourseCode,
  resolveProgressCatalogEntry,
} from "./programCatalogService.js";
import {
  getCourseEquivalencyIndex,
  type CourseEquivalencyIndex,
} from "./courseEquivalencyService.js";
import { loadUnifiedStudentAcademicContext } from "./studentUnifiedAcademicRecordsService.js";

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function portalInProgressDedupeKey(
  r: StudentAcademicCourseRecord,
  equiv: CourseEquivalencyIndex,
): string {
  if (r.portalEnrollmentRowId != null && Number.isFinite(r.portalEnrollmentRowId)) {
    return `portal:${r.portalEnrollmentRowId}`;
  }
  const code = equiv.resolveCanonical(normalizeProgramCourseCode(r.courseCode));
  return `portal:${code}|${r.term}|${r.year}|${(r.sectionCode ?? "").trim().toLowerCase()}|${(r.scheduleTrack ?? "").trim().toLowerCase()}`;
}

function sumCatalogEarnedFromCourseRecords(
  records: StudentAcademicCourseRecord[],
  byCode: Map<string, import("../types/studentAccount.js").CourseRecord>,
  equiv: CourseEquivalencyIndex,
): { didactic: number; lab: number; clinicalHours: number } {
  const seenMarks = new Set<string>();
  const seenClinic = new Set<string>();
  const seenPortal = new Set<string>();
  let didactic = 0;
  let lab = 0;
  let clinicalHours = 0;

  for (const row of records) {
    if (row.status !== "completed") continue;
    const code = equiv.resolveCanonical(normalizeProgramCourseCode(row.courseCode));
    const credits = row.credits;
    const crOk = credits != null && Number.isFinite(credits) && credits > 0;

    if (row.source === "marks") {
      if (seenMarks.has(code)) continue;
      seenMarks.add(code);
      if (!crOk) continue;
      const cat = resolveProgressCatalogEntry(code, byCode, equiv);
      if (cat.type === "didactic") didactic += credits;
      else if (cat.type === "lab") lab += credits;
      else if (cat.type === "clinical") clinicalHours += credits;
    } else if (row.source === "clinic") {
      if (seenClinic.has(code)) continue;
      seenClinic.add(code);
      const cat = byCode.get(code);
      if (cat == null || cat.type !== "clinical") continue;
      if (crOk) clinicalHours += credits;
    } else if (row.source === "portal") {
      if (seenPortal.has(code)) continue;
      seenPortal.add(code);
      if (!crOk) continue;
      const cat = resolveProgressCatalogEntry(code, byCode, equiv);
      if (cat.type === "didactic") didactic += credits;
      else if (cat.type === "lab") lab += credits;
      else if (cat.type === "clinical") clinicalHours += credits;
    }
  }

  return {
    didactic: roundTwo(didactic),
    lab: roundTwo(lab),
    clinicalHours: roundTwo(clinicalHours),
  };
}

function sumActiveDegreeQuarterUnits(
  records: StudentAcademicCourseRecord[],
  equiv: CourseEquivalencyIndex,
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const r of records) {
    if (r.status !== "active") continue;
    if (r.source === "clinic") continue;
    const cr = r.credits;
    if (cr == null || !Number.isFinite(cr) || cr <= 0) continue;
    const key =
      r.source === "portal"
        ? portalInProgressDedupeKey(r, equiv)
        : `marks:${equiv.resolveCanonical(normalizeProgramCourseCode(r.courseCode))}|${r.term}|${r.year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += cr;
  }
  return roundTwo(total);
}

function sumCatalogInProgressFromCourseRecords(
  records: StudentAcademicCourseRecord[],
  byCode: Map<string, import("../types/studentAccount.js").CourseRecord>,
  equiv: CourseEquivalencyIndex,
): { didactic: number; lab: number; clinicalHours: number } {
  const seen = new Set<string>();
  let didactic = 0;
  let lab = 0;
  let clinicalHours = 0;

  for (const r of records) {
    if (r.status !== "active") continue;
    if (r.source === "clinic") continue;
    const code = equiv.resolveCanonical(normalizeProgramCourseCode(r.courseCode));
    const cr = r.credits;
    if (cr == null || !Number.isFinite(cr) || cr <= 0) continue;
    const dedupe =
      r.source === "portal"
        ? portalInProgressDedupeKey(r, equiv)
        : `marks:${code}|${r.term}|${r.year}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const cat = resolveProgressCatalogEntry(code, byCode, equiv);
    if (cat.type === "didactic") didactic += cr;
    else if (cat.type === "lab") lab += cr;
    else if (cat.type === "clinical") clinicalHours += cr;
  }

  return {
    didactic: roundTwo(didactic),
    lab: roundTwo(lab),
    clinicalHours: roundTwo(clinicalHours),
  };
}

export type ProgramProgressBucketDto = {
  id: "didactic" | "lab" | "clinical";
  unitKind: "quarter_units" | "clinical_hours";
  required: number;
  completed: number;
  inProgress: number;
  remaining: number;
};

export type StudentProgramProgressResponse = {
  studentId: string;
  program: string | null;
  ruleSetId: string;
  quarterUnitsRequired: number;
  quarterUnitsEarned: number;
  quarterUnitsInProgress: number;
  quarterUnitsRemaining: number;
  buckets: ProgramProgressBucketDto[];
  notes: string[];
};

function emptyResponse(studentId: string): StudentProgramProgressResponse {
  return {
    studentId,
    program: null,
    ruleSetId: "none",
    quarterUnitsRequired: 0,
    quarterUnitsEarned: 0,
    quarterUnitsInProgress: 0,
    quarterUnitsRemaining: 0,
    buckets: [
      {
        id: "didactic",
        unitKind: "quarter_units",
        required: 0,
        completed: 0,
        inProgress: 0,
        remaining: 0,
      },
      {
        id: "lab",
        unitKind: "quarter_units",
        required: 0,
        completed: 0,
        inProgress: 0,
        remaining: 0,
      },
      {
        id: "clinical",
        unitKind: "clinical_hours",
        required: 0,
        completed: 0,
        inProgress: 0,
        remaining: 0,
      },
    ],
    notes: [],
  };
}

export async function getStudentProgramProgressPayload(
  studentId: string,
): Promise<StudentProgramProgressResponse> {
  const trimmed = studentId.trim();
  if (trimmed === "" || trimmed === DEMO_STUDENT_ID) {
    return emptyResponse(trimmed);
  }

  const [ctx, catalog, evaluation, equiv] = await Promise.all([
    loadUnifiedStudentAcademicContext(trimmed),
    loadCanonicalProgramCatalogByCode(),
    evaluateGraduation(trimmed),
    getCourseEquivalencyIndex(),
  ]);

  if (ctx == null) {
    return emptyResponse(trimmed);
  }

  const { didacticRequired, labRequired, clinicalHoursRequired } =
    catalogRequirementTotalsFromMap(catalog);
  const earned = sumCatalogEarnedFromCourseRecords(ctx.courseRecords, catalog, equiv);
  const inProgBuckets = sumCatalogInProgressFromCourseRecords(ctx.courseRecords, catalog, equiv);
  const quarterUnitsInProgress = sumActiveDegreeQuarterUnits(ctx.courseRecords, equiv);
  const quarterUnitsRemaining = Math.max(
    0,
    roundTwo(evaluation.requiredCredits - evaluation.earnedCredits - quarterUnitsInProgress),
  );

  const buckets: ProgramProgressBucketDto[] = [
    {
      id: "didactic",
      unitKind: "quarter_units",
      required: roundTwo(didacticRequired),
      completed: earned.didactic,
      inProgress: inProgBuckets.didactic,
      remaining: Math.max(
        0,
        roundTwo(didacticRequired - earned.didactic - inProgBuckets.didactic),
      ),
    },
    {
      id: "lab",
      unitKind: "quarter_units",
      required: roundTwo(labRequired),
      completed: earned.lab,
      inProgress: inProgBuckets.lab,
      remaining: Math.max(0, roundTwo(labRequired - earned.lab - inProgBuckets.lab)),
    },
    {
      id: "clinical",
      unitKind: "clinical_hours",
      required: clinicalHoursRequired,
      completed: earned.clinicalHours,
      inProgress: inProgBuckets.clinicalHours,
      remaining: Math.max(
        0,
        roundTwo(clinicalHoursRequired - earned.clinicalHours - inProgBuckets.clinicalHours),
      ),
    },
  ];

  const notes = [
    ...evaluation.notes,
    "Completed and in-progress buckets use the same unified academic record merge as Academics and transcript preview.",
    "Catalog types come from portal_courses when available, with static MAHM fallback for unlisted codes.",
    "Parallel legacy, PDF, and placeholder course codes collapse via courses_equivalency.",
    "Graduation earned quarter units still follow completed marks attempts plus transfer credits.",
  ];

  return {
    studentId: trimmed,
    program: evaluation.program,
    ruleSetId: evaluation.ruleSetId,
    quarterUnitsRequired: evaluation.requiredCredits,
    quarterUnitsEarned: evaluation.earnedCredits,
    quarterUnitsInProgress,
    quarterUnitsRemaining,
    buckets,
    notes,
  };
}
