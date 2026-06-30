import type { GraduationRequirements } from "../config/graduationRequirements.js";
import type { StudentAcademicCourseRecord } from "../types/studentAcademics.js";
import type { StudentProfilePayload } from "../types/studentProfile.js";
import { termSortOrder } from "./studentAcademicCourseRecords.js";
import { getGraduationRequirementsForProgramAsync } from "./programCatalogService.js";
import {
  getCourseEquivalencyIndex,
  normalizeCourseCode,
  type CourseEquivalencyIndex,
} from "./courseEquivalencyService.js";
import { computeCumulativeGpaFromAttempts } from "./studentGpaService.js";
import { loadUnifiedStudentAcademicContext } from "./studentUnifiedAcademicRecordsService.js";
import { getLegacyStudentProfile } from "./studentProfileService.js";

type GraduationEvaluationRecord = {
  profile: StudentProfilePayload | null;
  courseRecords: StudentAcademicCourseRecord[];
};

type GraduationAttempt = StudentAcademicCourseRecord & {
  source: "marks";
  status: "completed";
};

export type GraduationEvaluationResult = {
  eligible: boolean;
  program: string | null;
  track: string | null;
  ruleSetId: string;
  ruleSetSource: string;
  earnedCredits: number;
  totalCredits: number;
  transcriptCredits: number;
  transferCredits: number;
  requiredCredits: number;
  missingCredits: number;
  completedRequiredCourses: string[];
  missingCourses: string[];
  cumulativeGpa: number | null;
  requiredGpa: number | null;
  missingGpa: number | null;
  withdrawalCount: number;
  maximumWithdrawals: number | null;
  notes: string[];
};

export type GraduationEvaluationSummary = Pick<
  GraduationEvaluationResult,
  "earnedCredits" | "requiredCredits" | "eligible" | "missingCredits"
>;

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function isCompletedMarksAttempt(
  record: StudentAcademicCourseRecord,
): record is GraduationAttempt {
  return record.source === "marks" && record.status === "completed";
}

function compareAttemptsDesc(a: GraduationAttempt, b: GraduationAttempt): number {
  if (b.year !== a.year) return b.year - a.year;
  const termDiff = termSortOrder(b.term) - termSortOrder(a.term);
  if (termDiff !== 0) return termDiff;
  const aNumeric = a.numericGrade ?? Number.NEGATIVE_INFINITY;
  const bNumeric = b.numericGrade ?? Number.NEGATIVE_INFINITY;
  return bNumeric - aNumeric;
}

function pickLatestCompletedAttempts(
  records: StudentAcademicCourseRecord[],
  equiv: CourseEquivalencyIndex,
): Map<string, GraduationAttempt> {
  const completedAttempts = records.filter(isCompletedMarksAttempt).sort(compareAttemptsDesc);
  const byCourseCode = new Map<string, GraduationAttempt>();
  for (const attempt of completedAttempts) {
    const courseCode = equiv.resolveCanonical(normalizeCourseCode(attempt.courseCode));
    if (!byCourseCode.has(courseCode)) {
      byCourseCode.set(courseCode, attempt);
    }
  }
  return byCourseCode;
}

function safeNonNegativeNumber(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) && value > 0 ? value : 0;
}

function countEarnedCredits(attempts: Iterable<GraduationAttempt>): number {
  let total = 0;
  for (const attempt of attempts) {
    if (attempt.credits != null && Number.isFinite(attempt.credits)) {
      total += attempt.credits;
    }
  }
  return roundTwo(total);
}

function countWithdrawals(
  records: StudentAcademicCourseRecord[],
  equiv: CourseEquivalencyIndex,
): number {
  const seen = new Set<string>();
  let count = 0;
  for (const record of records) {
    if (record.status !== "withdrawn") continue;
    const key = [
      equiv.resolveCanonical(normalizeCourseCode(record.courseCode)),
      record.term.trim().toLowerCase(),
      String(record.year),
      record.source,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    count += 1;
  }
  return count;
}

function evaluateGraduationFromRecord(
  studentRecord: GraduationEvaluationRecord,
  requirements: GraduationRequirements,
  equiv: CourseEquivalencyIndex,
): GraduationEvaluationResult {
  const latestCompletedAttempts = pickLatestCompletedAttempts(
    studentRecord.courseRecords,
    equiv,
  );
  const completedCourseCodes = new Set(latestCompletedAttempts.keys());
  const transferCredits = safeNonNegativeNumber(studentRecord.profile?.credits);
  const transcriptCredits = countEarnedCredits(latestCompletedAttempts.values());
  const totalCredits = roundTwo(transcriptCredits + transferCredits);
  const requiredCredits = requirements.totalCreditsRequired;
  const missingCredits = Math.max(roundTwo(requiredCredits - totalCredits), 0);
  const missingCourses = requirements.requiredCourses.filter(
    (courseCode) =>
      !completedCourseCodes.has(equiv.resolveCanonical(normalizeCourseCode(courseCode))),
  );
  const completedRequiredCourses = requirements.requiredCourses.filter((courseCode) =>
    completedCourseCodes.has(equiv.resolveCanonical(normalizeCourseCode(courseCode))),
  );
  const cumulativeGpa = computeCumulativeGpaFromAttempts(latestCompletedAttempts.values());
  const requiredGpa = requirements.minimumGpa;
  const missingGpa =
    requiredGpa != null && cumulativeGpa != null && cumulativeGpa < requiredGpa
      ? roundTwo(requiredGpa - cumulativeGpa)
      : requiredGpa != null && cumulativeGpa == null
        ? requiredGpa
        : null;
  const withdrawalCount = countWithdrawals(studentRecord.courseRecords, equiv);

  const meetsCredits = missingCredits <= 0;
  const meetsCourses = missingCourses.length === 0;
  const meetsGpa =
    requiredGpa == null || (cumulativeGpa != null && cumulativeGpa >= requiredGpa);
  const meetsWithdrawals =
    requirements.maximumWithdrawals == null ||
    withdrawalCount <= requirements.maximumWithdrawals;

  const notes = [...requirements.notes];
  if (transferCredits > 0) {
    notes.push(`Transfer / admission credits included: ${transferCredits}.`);
  }
  if (requiredGpa != null && cumulativeGpa == null) {
    notes.push("A GPA requirement is configured, but no GPA-eligible transcript rows were found.");
  }

  return {
    eligible: meetsCredits && meetsCourses && meetsGpa && meetsWithdrawals,
    program: studentRecord.profile?.program ?? null,
    track: studentRecord.profile?.track ?? null,
    ruleSetId: requirements.ruleSetId,
    ruleSetSource: requirements.sourceLabel,
    earnedCredits: totalCredits,
    totalCredits,
    transcriptCredits,
    transferCredits,
    requiredCredits,
    missingCredits,
    completedRequiredCourses,
    missingCourses,
    cumulativeGpa,
    requiredGpa,
    missingGpa,
    withdrawalCount,
    maximumWithdrawals: requirements.maximumWithdrawals,
    notes,
  };
}

function isMostlyChinese(text: string): boolean {
  const hanCount = text.match(/[\u4E00-\u9FFF]/g)?.length ?? 0;
  if (hanCount === 0) return false;
  const latinCount = text.match(/[A-Za-z]/g)?.length ?? 0;
  return hanCount > latinCount || (latinCount === 0 && hanCount >= 2);
}

function formatCreditCount(value: number, zh: boolean): string {
  return zh ? `${value}学分` : `${value} credit${value === 1 ? "" : "s"}`;
}

function formatDirectEligibilityLine(
  evaluation: GraduationEvaluationSummary,
  zh: boolean,
): string {
  if (evaluation.eligible) {
    return zh
      ? "你目前符合毕业的学分条件。"
      : "You are currently eligible to graduate based on the configured backend requirement.";
  }
  if (evaluation.missingCredits <= 0) {
    return zh
      ? "你的学分已经达到要求，但你目前仍未满足全部毕业条件。"
      : "Your credits already meet the requirement, but you are still not eligible to graduate because some graduation conditions remain unmet.";
  }
  return zh
    ? `你还差${formatCreditCount(evaluation.missingCredits, true)}，所以你目前还不能毕业。`
    : `You still need ${formatCreditCount(evaluation.missingCredits, false)}, so you are not yet eligible to graduate.`;
}

export function formatDeterministicGraduationAnswer(
  question: string,
  evaluation: GraduationEvaluationSummary,
): string {
  const zh = isMostlyChinese(question);
  const lines = zh
    ? [
        `你目前已有${formatCreditCount(evaluation.earnedCredits, true)}。`,
        `毕业要求是${formatCreditCount(evaluation.requiredCredits, true)}。`,
        formatDirectEligibilityLine(evaluation, true),
      ]
    : [
        `You currently have ${formatCreditCount(evaluation.earnedCredits, false)}.`,
        `The graduation requirement is ${formatCreditCount(evaluation.requiredCredits, false)}.`,
        formatDirectEligibilityLine(evaluation, false),
      ];
  return lines.join("\n");
}

export async function evaluateGraduation(
  studentId: string,
): Promise<GraduationEvaluationResult> {
  const trimmedStudentId = studentId.trim();
  const [profile, ctx, equiv] = await Promise.all([
    getLegacyStudentProfile(trimmedStudentId),
    loadUnifiedStudentAcademicContext(trimmedStudentId),
    getCourseEquivalencyIndex(),
  ]);
  const program = profile?.program ?? null;
  const requirements = await getGraduationRequirementsForProgramAsync(program);

  const evaluation = evaluateGraduationFromRecord(
    {
      profile,
      courseRecords: ctx?.courseRecords ?? [],
    },
    requirements,
    equiv,
  );

  console.debug("[graduation-evaluation] computed", {
    studentId: trimmedStudentId,
    earnedCredits: evaluation.earnedCredits,
    requiredCredits: evaluation.requiredCredits,
    eligible: evaluation.eligible,
    missingCredits: evaluation.missingCredits,
    ruleSetId: evaluation.ruleSetId,
  });

  return evaluation;
}

export const evaluateStudentGraduation = evaluateGraduation;

export function formatGraduationEvaluationFacts(
  evaluation: GraduationEvaluationResult,
): string {
  const lines: string[] = ["Structured Graduation Evaluation"];
  lines.push(`- Eligible: ${evaluation.eligible ? "Yes" : "No"}`);
  lines.push(`- Program: ${evaluation.program ?? "Unavailable"}`);
  lines.push(`- Track: ${evaluation.track ?? "Unavailable"}`);
  lines.push(`- Rule set ID: ${evaluation.ruleSetId}`);
  lines.push(`- Rule set source: ${evaluation.ruleSetSource}`);
  lines.push(`- Earned credits: ${evaluation.earnedCredits}`);
  lines.push(`- Transcript credits: ${evaluation.transcriptCredits}`);
  lines.push(`- Transfer / admission credits counted: ${evaluation.transferCredits}`);
  lines.push(`- Required credits: ${evaluation.requiredCredits}`);
  lines.push(`- Missing credits: ${evaluation.missingCredits}`);
  lines.push(
    `- Completed required courses: ${evaluation.completedRequiredCourses.length > 0 ? evaluation.completedRequiredCourses.join("; ") : "None recorded"}`,
  );
  lines.push(
    `- Missing required courses: ${evaluation.missingCourses.length > 0 ? evaluation.missingCourses.join("; ") : "None"}`,
  );
  lines.push(
    `- Cumulative GPA: ${evaluation.cumulativeGpa != null ? evaluation.cumulativeGpa : "Unavailable"}`,
  );
  lines.push(
    `- Required GPA: ${evaluation.requiredGpa != null ? evaluation.requiredGpa : "Not configured"}`,
  );
  lines.push(
    `- Missing GPA: ${evaluation.missingGpa != null ? evaluation.missingGpa : "None"}`,
  );
  lines.push(`- Withdrawal count: ${evaluation.withdrawalCount}`);
  lines.push(
    `- Maximum withdrawals allowed: ${evaluation.maximumWithdrawals != null ? evaluation.maximumWithdrawals : "Not configured"}`,
  );
  lines.push("- Notes:");
  if (evaluation.notes.length === 0) {
    lines.push("  - None");
  } else {
    for (const note of evaluation.notes) {
      lines.push(`  - ${note}`);
    }
  }
  return lines.join("\n");
}
