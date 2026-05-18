import { DEMO_STUDENT_ID } from "../config/constants.js";
import { DEGREE_ELECTIVE_QUARTER_UNITS_REQUIRED } from "../config/graduationRequirements.js";
import { pool } from "../lib/db.js";
import {
  loadCoursesTranscriptLookup,
  type CourseTranscriptLookupEntry,
} from "../repositories/studentTranscriptRepository.js";
import type { StudentAcademicCourseRecord } from "../types/studentAcademics.js";
import type { StudentTranscriptRow } from "../types/studentTranscript.js";
import { DEGREE_CREDIT_POLICY_SUMMARY } from "./degreeCreditPolicy.js";
import {
  catalogDegreeRequirementTotals,
  resolveDegreeProgressBucket,
  type DegreeProgressBucketId,
} from "./degreeProgressBucket.js";
import { evaluateGraduation } from "./graduationEvaluationService.js";
import { getStudentAcademicsPayload } from "./studentAcademicsService.js";
import { getStudentTranscriptPreviewPayload } from "./studentTranscriptService.js";

function normalizeCourseCode(courseCode: string): string {
  return courseCode.replace(/[\s-]+/g, "").trim().toUpperCase();
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function lookupCatalogEntry(
  lookup: Map<string, CourseTranscriptLookupEntry>,
  courseCode: string,
): CourseTranscriptLookupEntry | undefined {
  const t = courseCode.trim();
  if (t !== "") {
    const direct = lookup.get(t);
    if (direct) return direct;
  }
  const norm = normalizeCourseCode(courseCode);
  if (norm !== "") return lookup.get(norm);
  return undefined;
}

function addToBucket(
  totals: Record<DegreeProgressBucketId, number>,
  bucket: DegreeProgressBucketId,
  credits: number,
): void {
  totals[bucket] += credits;
}

/**
 * Transcript preview rows are newest-first; first completed row per (source, code) is the latest attempt.
 * Buckets use Core / Elective / Clinical via {@link resolveDegreeProgressBucket} and live `courses.category`.
 */
function sumCatalogEarnedFromTranscript(
  transcript: StudentTranscriptRow[],
  lookup: Map<string, CourseTranscriptLookupEntry>,
): Record<DegreeProgressBucketId, number> {
  const seenMarks = new Set<string>();
  const seenClinic = new Set<string>();
  const totals: Record<DegreeProgressBucketId, number> = {
    core: 0,
    elective: 0,
    clinical: 0,
  };

  for (const row of transcript) {
    if (row.status !== "completed") continue;
    const code = normalizeCourseCode(row.courseCode);
    const credits = row.credits;
    const crOk = credits != null && Number.isFinite(credits) && credits > 0;
    const catEntry = lookupCatalogEntry(lookup, row.courseCode);
    const bucket = resolveDegreeProgressBucket(
      row.courseCode,
      row.courseTitle,
      catEntry?.category ?? null,
    );

    if (row.source === "marks") {
      if (seenMarks.has(code)) continue;
      seenMarks.add(code);
      if (!crOk) continue;
      addToBucket(totals, bucket, credits);
    } else if (row.source === "clinic") {
      if (seenClinic.has(code)) continue;
      seenClinic.add(code);
      if (bucket !== "clinical") continue;
      if (!crOk) continue;
      totals.clinical += credits;
    } else if (row.source === "portal") {
      if (seenMarks.has(code)) continue;
      seenMarks.add(code);
      if (!crOk) continue;
      addToBucket(totals, bucket, credits);
    }
  }

  return {
    core: roundTwo(totals.core),
    elective: roundTwo(totals.elective),
    clinical: roundTwo(totals.clinical),
  };
}

function portalInProgressDedupeKey(r: StudentAcademicCourseRecord): string {
  if (r.portalEnrollmentRowId != null && Number.isFinite(r.portalEnrollmentRowId)) {
    return `portal:${r.portalEnrollmentRowId}`;
  }
  const code = normalizeCourseCode(r.courseCode);
  return `portal:${code}|${r.term}|${r.year}|${(r.sectionCode ?? "").trim().toLowerCase()}|${(r.scheduleTrack ?? "").trim().toLowerCase()}`;
}

function sumActiveDegreeQuarterUnits(records: StudentAcademicCourseRecord[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const r of records) {
    if (r.status !== "active") continue;
    if (r.source === "clinic") continue;
    const cr = r.credits;
    if (cr == null || !Number.isFinite(cr) || cr <= 0) continue;
    const key =
      r.source === "portal"
        ? portalInProgressDedupeKey(r)
        : `marks:${normalizeCourseCode(r.courseCode)}|${r.term}|${r.year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += cr;
  }
  return roundTwo(total);
}

function sumCatalogInProgressFromCourseRecords(
  records: StudentAcademicCourseRecord[],
  lookup: Map<string, CourseTranscriptLookupEntry>,
): Record<DegreeProgressBucketId, number> {
  const seen = new Set<string>();
  const totals: Record<DegreeProgressBucketId, number> = {
    core: 0,
    elective: 0,
    clinical: 0,
  };

  for (const r of records) {
    if (r.status !== "active") continue;
    if (r.source === "clinic") continue;
    const code = normalizeCourseCode(r.courseCode);
    const cr = r.credits;
    if (cr == null || !Number.isFinite(cr) || cr <= 0) continue;
    const dedupe =
      r.source === "portal"
        ? portalInProgressDedupeKey(r)
        : `marks:${code}|${r.term}|${r.year}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const catEntry = lookupCatalogEntry(lookup, r.courseCode);
    const bucket = resolveDegreeProgressBucket(
      r.courseCode,
      r.courseTitle,
      catEntry?.category ?? null,
    );
    addToBucket(totals, bucket, cr);
  }

  return {
    core: roundTwo(totals.core),
    elective: roundTwo(totals.elective),
    clinical: roundTwo(totals.clinical),
  };
}

export type ProgramProgressBucketDto = {
  id: DegreeProgressBucketId;
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
  /** Core + elective quarter units required (clinical hours excluded). */
  quarterUnitsRequired: number;
  quarterUnitsEarned: number;
  quarterUnitsInProgress: number;
  quarterUnitsRemaining: number;
  buckets: ProgramProgressBucketDto[];
  notes: string[];
};

function emptyResponse(studentId: string): StudentProgramProgressResponse {
  const { coreQuarterUnits, electiveQuarterUnits, clinicalHoursRequired } =
    catalogDegreeRequirementTotals(DEGREE_ELECTIVE_QUARTER_UNITS_REQUIRED);
  const quarterUnitsRequired = roundTwo(coreQuarterUnits + electiveQuarterUnits);
  return {
    studentId,
    program: null,
    ruleSetId: "none",
    quarterUnitsRequired,
    quarterUnitsEarned: 0,
    quarterUnitsInProgress: 0,
    quarterUnitsRemaining: 0,
    buckets: [
      {
        id: "core",
        unitKind: "quarter_units",
        required: roundTwo(coreQuarterUnits),
        completed: 0,
        inProgress: 0,
        remaining: roundTwo(coreQuarterUnits),
      },
      {
        id: "elective",
        unitKind: "quarter_units",
        required: roundTwo(electiveQuarterUnits),
        completed: 0,
        inProgress: 0,
        remaining: roundTwo(electiveQuarterUnits),
      },
      {
        id: "clinical",
        unitKind: "clinical_hours",
        required: clinicalHoursRequired,
        completed: 0,
        inProgress: 0,
        remaining: clinicalHoursRequired,
      },
    ],
    notes: [],
  };
}

export async function getStudentProgramProgressPayload(
  studentId: string,
): Promise<StudentProgramProgressResponse> {
  const trimmed = studentId.trim();
  if (trimmed === "") {
    return emptyResponse("");
  }
  if (trimmed === DEMO_STUDENT_ID) {
    return emptyResponse(trimmed);
  }

  const [evaluation, transcriptPayload, academics, courseLookup] = await Promise.all([
    evaluateGraduation(trimmed),
    getStudentTranscriptPreviewPayload(trimmed),
    getStudentAcademicsPayload(trimmed),
    loadCoursesTranscriptLookup(pool),
  ]);

  const { coreQuarterUnits, electiveQuarterUnits, clinicalHoursRequired } =
    catalogDegreeRequirementTotals(DEGREE_ELECTIVE_QUARTER_UNITS_REQUIRED);

  const earned = sumCatalogEarnedFromTranscript(transcriptPayload.transcript, courseLookup);
  const inProgBuckets = sumCatalogInProgressFromCourseRecords(
    academics.courseRecords,
    courseLookup,
  );
  const quarterUnitsInProgress = sumActiveDegreeQuarterUnits(academics.courseRecords);
  const quarterUnitsRemaining = Math.max(
    0,
    roundTwo(evaluation.requiredCredits - evaluation.earnedCredits - quarterUnitsInProgress),
  );

  const buckets: ProgramProgressBucketDto[] = [
    {
      id: "core",
      unitKind: "quarter_units",
      required: roundTwo(coreQuarterUnits),
      completed: earned.core,
      inProgress: inProgBuckets.core,
      remaining: Math.max(
        0,
        roundTwo(coreQuarterUnits - earned.core - inProgBuckets.core),
      ),
    },
    {
      id: "elective",
      unitKind: "quarter_units",
      required: roundTwo(electiveQuarterUnits),
      completed: earned.elective,
      inProgress: inProgBuckets.elective,
      remaining: Math.max(
        0,
        roundTwo(electiveQuarterUnits - earned.elective - inProgBuckets.elective),
      ),
    },
    {
      id: "clinical",
      unitKind: "clinical_hours",
      required: clinicalHoursRequired,
      completed: earned.clinical,
      inProgress: inProgBuckets.clinical,
      remaining: Math.max(
        0,
        roundTwo(clinicalHoursRequired - earned.clinical - inProgBuckets.clinical),
      ),
    },
  ];

  const quarterUnitsRequired = roundTwo(coreQuarterUnits + electiveQuarterUnits);

  const notes = [
    ...evaluation.notes,
    DEGREE_CREDIT_POLICY_SUMMARY,
    "Core / Elective / Clinical buckets combine the static MAHM curriculum map with `school.courses.category` (course_category ids). Staff can reassign a course’s category in the catalog editor; unlisted codes default to Core unless the title or category hints Clinical or Elective.",
    "Elective quarter-unit minimum is configured in `DEGREE_ELECTIVE_QUARTER_UNITS_REQUIRED` (backend); catalog courses tagged as elective via category also accumulate toward the elective bucket.",
  ];

  return {
    studentId: trimmed,
    program: evaluation.program,
    ruleSetId: evaluation.ruleSetId,
    quarterUnitsRequired,
    quarterUnitsEarned: evaluation.earnedCredits,
    quarterUnitsInProgress,
    quarterUnitsRemaining,
    buckets,
    notes,
  };
}
