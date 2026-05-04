import { DEMO_STUDENT_ID } from "../config/constants.js";
import { MAHM_COURSES } from "../data/mahmCatalog.js";
import type { CourseRecord } from "../types/studentAccount.js";
import type { StudentAcademicCourseRecord } from "../types/studentAcademics.js";
import type { StudentTranscriptRow } from "../types/studentTranscript.js";
import { evaluateGraduation } from "./graduationEvaluationService.js";
import { getStudentAcademicsPayload } from "./studentAcademicsService.js";
import { getStudentTranscriptPreviewPayload } from "./studentTranscriptService.js";

function normalizeCourseCode(courseCode: string): string {
  return courseCode.replace(/[\s-]+/g, "").trim().toUpperCase();
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildCatalogByCode(): Map<string, CourseRecord> {
  const byCode = new Map<string, CourseRecord>();
  for (const c of MAHM_COURSES) {
    byCode.set(normalizeCourseCode(c.courseCode), c);
  }
  return byCode;
}

function catalogRequirementTotals(): {
  didacticRequired: number;
  labRequired: number;
  clinicalHoursRequired: number;
} {
  let didacticRequired = 0;
  let labRequired = 0;
  let clinicalHoursRequired = 0;
  for (const c of MAHM_COURSES) {
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
  return { didacticRequired, labRequired, clinicalHoursRequired };
}

/**
 * Transcript preview rows are newest-first; first completed row per (source, code) is the latest attempt.
 */
function sumCatalogEarnedFromTranscript(
  transcript: StudentTranscriptRow[],
  byCode: Map<string, CourseRecord>,
): { didactic: number; lab: number; clinicalHours: number } {
  const seenMarks = new Set<string>();
  const seenClinic = new Set<string>();
  let didactic = 0;
  let lab = 0;
  let clinicalHours = 0;

  for (const row of transcript) {
    if (row.status !== "completed") continue;
    const code = normalizeCourseCode(row.courseCode);
    const cat = byCode.get(code);
    if (cat == null) continue;

    const credits = row.credits;
    const crOk = credits != null && Number.isFinite(credits) && credits > 0;

    if (row.source === "marks") {
      if (seenMarks.has(code)) continue;
      seenMarks.add(code);
      if (!crOk) continue;
      if (cat.type === "didactic") didactic += credits;
      else if (cat.type === "lab") lab += credits;
      else if (cat.type === "clinical") clinicalHours += credits;
    } else if (row.source === "clinic") {
      if (seenClinic.has(code)) continue;
      seenClinic.add(code);
      if (cat.type !== "clinical") continue;
      if (crOk) clinicalHours += credits;
    }
  }

  return {
    didactic: roundTwo(didactic),
    lab: roundTwo(lab),
    clinicalHours: roundTwo(clinicalHours),
  };
}

function portalInProgressDedupeKey(r: StudentAcademicCourseRecord): string {
  if (r.portalEnrollmentRowId != null && Number.isFinite(r.portalEnrollmentRowId)) {
    return `portal:${r.portalEnrollmentRowId}`;
  }
  const code = normalizeCourseCode(r.courseCode);
  return `portal:${code}|${r.term}|${r.year}|${(r.sectionCode ?? "").trim().toLowerCase()}|${(r.scheduleTrack ?? "").trim().toLowerCase()}`;
}

/**
 * Active marks/portal rows (not clinic narrative), deduped; all courses — same credit pool as graduation earned
 * (excluding transfer; excluding completed-only clinic transcript lines).
 */
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

/** Catalog-matched active enrollments by MAHM bucket (didactic / lab / clinical hours). */
function sumCatalogInProgressFromCourseRecords(
  records: StudentAcademicCourseRecord[],
  byCode: Map<string, CourseRecord>,
): { didactic: number; lab: number; clinicalHours: number } {
  const seen = new Set<string>();
  let didactic = 0;
  let lab = 0;
  let clinicalHours = 0;

  for (const r of records) {
    if (r.status !== "active") continue;
    if (r.source === "clinic") continue;
    const code = normalizeCourseCode(r.courseCode);
    const cat = byCode.get(code);
    if (cat == null) continue;
    const cr = r.credits;
    if (cr == null || !Number.isFinite(cr) || cr <= 0) continue;
    const dedupe =
      r.source === "portal"
        ? portalInProgressDedupeKey(r)
        : `marks:${code}|${r.term}|${r.year}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

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
  /** Active registrations / attempts in the portal catalog for this bucket (not yet completed on transcript). */
  inProgress: number;
  remaining: number;
};

export type StudentProgramProgressResponse = {
  studentId: string;
  program: string | null;
  ruleSetId: string;
  /** Non-clinical quarter units (didactic + lab), per graduation evaluator (includes transfer when configured). */
  quarterUnitsRequired: number;
  quarterUnitsEarned: number;
  /** Active marks + portal rows with positive credits (excludes clinic transcript narrative source). */
  quarterUnitsInProgress: number;
  quarterUnitsRemaining: number;
  buckets: ProgramProgressBucketDto[];
  notes: string[];
};

function emptyResponse(studentId: string): StudentProgramProgressResponse {
  const { didacticRequired, labRequired, clinicalHoursRequired } = catalogRequirementTotals();
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
        required: roundTwo(didacticRequired),
        completed: 0,
        inProgress: 0,
        remaining: roundTwo(didacticRequired),
      },
      {
        id: "lab",
        unitKind: "quarter_units",
        required: roundTwo(labRequired),
        completed: 0,
        inProgress: 0,
        remaining: roundTwo(labRequired),
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

  /** Sequential loads avoid overlapping with evaluateGraduation's own DB work (reduces connection spikes). */
  const evaluation = await evaluateGraduation(trimmed);
  const transcriptPayload = await getStudentTranscriptPreviewPayload(trimmed);
  const academics = await getStudentAcademicsPayload(trimmed);

  const byCode = buildCatalogByCode();
  const { didacticRequired, labRequired, clinicalHoursRequired } = catalogRequirementTotals();
  const earned = sumCatalogEarnedFromTranscript(transcriptPayload.transcript, byCode);
  const inProgBuckets = sumCatalogInProgressFromCourseRecords(academics.courseRecords, byCode);
  const quarterUnitsInProgress = sumActiveDegreeQuarterUnits(academics.courseRecords);
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
    "Didactic, lab, and clinical rows match portal catalog course codes on your unofficial transcript. Quarter-unit totals in the chart follow graduation credit rules (including transfer credits when recorded).",
    "In progress counts active marks and portal registrations with positive credits (not yet completed). Remaining is required minus completed and in progress for each bucket.",
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
