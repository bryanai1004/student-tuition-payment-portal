import { listCoursesFromMysql, type CourseListItem } from "../repositories/courseRepository.js";
import { getStudentAcademicsPayload } from "./studentAcademicsService.js";
import type { StudentAcademicsResponse } from "../types/studentAcademics.js";

export type EligibilityResolvedCourse = {
  code: string;
  engName: string | null;
  chiName: string | null;
  prerequisiteText: string | null;
  corequisiteText: string | null;
};

type PrerequisiteRuleSet = {
  prerequisites: string[];
  corequisites: string[];
  gradeRequirements: string[];
  programRestrictions: string[];
  rawText: string;
};

export type CourseEligibilityResult = {
  eligible: true | false | "unknown";
  missingPrerequisites: string[];
  matchedPrerequisites: string[];
  blockingReasons: string[];
};

export type CourseEligibilityAnswer = {
  resolvedCourse: EligibilityResolvedCourse | null;
  ambiguousMatches: EligibilityResolvedCourse[];
  rules: PrerequisiteRuleSet | null;
  result: CourseEligibilityResult;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeCode(value: string | null | undefined): string {
  return (value ?? "").replace(/[\s-]+/g, "").trim().toUpperCase();
}

function isLikelyPassingGrade(value: string | null | undefined): boolean {
  const grade = normalizeText(value);
  if (grade === "") return false;
  if (["p", "pass", "s", "cr", "credit"].includes(grade)) return true;
  if (["f", "fail", "w", "withdrawn", "dropped", "np", "nc", "u"].includes(grade)) {
    return false;
  }
  if (/^[abc][+-]?$/.test(grade)) return true;
  if (/^d[+-]?$/.test(grade)) return false;
  const numeric = Number(grade);
  return Number.isFinite(numeric) && numeric >= 70;
}

function tokenizePrerequisiteCodes(text: string): string[] {
  const matches = text.matchAll(/\b([A-Za-z]{2,6})[\s-]?(\d{3}[A-Za-z]?)\b/g);
  const out = new Set<string>();
  for (const match of matches) {
    const code = `${match[1]}${match[2]}`.toUpperCase();
    out.add(code);
  }
  return [...out];
}

function parsePrerequisiteRules(course: EligibilityResolvedCourse): PrerequisiteRuleSet | null {
  const prerequisiteText = (course.prerequisiteText ?? "").trim();
  const corequisiteText = (course.corequisiteText ?? "").trim();
  const merged = [prerequisiteText, corequisiteText].filter(Boolean).join(" | ");
  if (merged === "") return null;
  return {
    prerequisites: tokenizePrerequisiteCodes(prerequisiteText),
    corequisites: tokenizePrerequisiteCodes(corequisiteText),
    gradeRequirements:
      merged.match(/(minimum\s+grade\s+[A-F][+-]?|grade\s+[A-F][+-]?\s+or\s+better|成绩.{0,8}[A-F][+-]?)/gi) ?? [],
    programRestrictions:
      merged.match(/(MAHM|DAHM|master|doctoral|博士|硕士|program\s+only)/gi) ?? [],
    rawText: merged,
  };
}

function hasEligibilityIntent(question: string): boolean {
  const q = question.toLowerCase();
  return (
    /\b(can\s+i\s+take|eligible|prerequisite|prereq|co-?requisite|what\s+am\s+i\s+missing)\b/.test(
      q,
    ) || /我可以选|我还差什么课|先修|先决|能不能修|能选吗/.test(question)
  );
}

function resolveTargetCourse(
  question: string,
  courses: CourseListItem[],
): { resolved: EligibilityResolvedCourse | null; ambiguous: EligibilityResolvedCourse[] } {
  const qRaw = question.trim();
  const qLower = normalizeText(question);
  const codeFromQuestion = normalizeCode(
    question.match(/\b([A-Za-z]{2,6})[\s-]?(\d{3}[A-Za-z]?)\b/)?.[0] ?? "",
  );

  const candidates = courses.map((row) => {
    const code = normalizeCode(String(row.code ?? ""));
    const eng = String(row.eng_name ?? "").trim() || null;
    const chi = String(row.chi_name ?? "").trim() || null;
    return {
      code,
      engName: eng,
      chiName: chi,
      prerequisiteText: String(row.prerequisite ?? "").trim() || null,
      corequisiteText: String(row.concurrent ?? "").trim() || null,
    } satisfies EligibilityResolvedCourse;
  });

  if (codeFromQuestion !== "") {
    const codeMatches = candidates.filter((c) => c.code === codeFromQuestion);
    if (codeMatches.length === 1) return { resolved: codeMatches[0]!, ambiguous: [] };
    if (codeMatches.length > 1) return { resolved: null, ambiguous: codeMatches };
  }

  const nameMatches = candidates.filter((c) => {
    const eng = normalizeText(c.engName);
    const chi = c.chiName?.trim() ?? "";
    if (eng.length >= 3 && qLower.includes(eng)) return true;
    if (chi.length >= 2 && qRaw.includes(chi)) return true;
    return false;
  });
  if (nameMatches.length === 1) return { resolved: nameMatches[0]!, ambiguous: [] };
  if (nameMatches.length > 1) return { resolved: null, ambiguous: nameMatches.slice(0, 5) };

  return { resolved: null, ambiguous: [] };
}

export function evaluateCourseEligibility(args: {
  targetCourse: EligibilityResolvedCourse;
  prerequisites: PrerequisiteRuleSet | null;
  studentCompletedCourses: Array<{ code: string; passed: boolean }>;
  studentEnrollments: Array<{ code: string; status: string }>;
}): CourseEligibilityResult {
  if (args.prerequisites == null) {
    return {
      eligible: "unknown",
      missingPrerequisites: [],
      matchedPrerequisites: [],
      blockingReasons: ["No clear prerequisite rule was found for this course."],
    };
  }

  const completedPassed = new Set(
    args.studentCompletedCourses
      .filter((item) => item.passed)
      .map((item) => normalizeCode(item.code)),
  );
  const inProgress = new Set(
    args.studentEnrollments
      .filter((item) => normalizeText(item.status) === "active")
      .map((item) => normalizeCode(item.code)),
  );

  const required = args.prerequisites.prerequisites.map(normalizeCode).filter(Boolean);
  if (required.length === 0) {
    return {
      eligible: "unknown",
      missingPrerequisites: [],
      matchedPrerequisites: [],
      blockingReasons: ["Prerequisite text exists but no parseable course codes were found."],
    };
  }

  const matched: string[] = [];
  const missing: string[] = [];
  const blocking: string[] = [];
  for (const req of required) {
    if (completedPassed.has(req)) {
      matched.push(req);
      continue;
    }
    if (inProgress.has(req)) {
      missing.push(req);
      blocking.push(`${req} is still in progress and not yet completed.`);
      continue;
    }
    missing.push(req);
  }

  return {
    eligible: missing.length === 0,
    missingPrerequisites: missing,
    matchedPrerequisites: matched,
    blockingReasons: blocking,
  };
}

function buildStudentInputs(academics: StudentAcademicsResponse): {
  completedCourses: Array<{ code: string; passed: boolean }>;
  enrollments: Array<{ code: string; status: string }>;
} {
  return {
    completedCourses: academics.courseRecords
      .filter((r) => r.status === "completed")
      .map((r) => ({ code: r.courseCode, passed: isLikelyPassingGrade(r.grade) })),
    enrollments: academics.courseRecords.map((r) => ({
      code: r.courseCode,
      status: r.status,
    })),
  };
}

export async function evaluateEligibilityQuestion(
  studentId: string,
  question: string,
): Promise<CourseEligibilityAnswer | null> {
  if (!hasEligibilityIntent(question)) return null;

  const [academics, courses] = await Promise.all([
    getStudentAcademicsPayload(studentId),
    listCoursesFromMysql(),
  ]);
  const resolved = resolveTargetCourse(question, courses);
  if (resolved.resolved == null) {
    return {
      resolvedCourse: null,
      ambiguousMatches: resolved.ambiguous,
      rules: null,
      result: {
        eligible: "unknown",
        missingPrerequisites: [],
        matchedPrerequisites: [],
        blockingReasons:
          resolved.ambiguous.length > 0
            ? ["Ambiguous course match."]
            : ["Unable to resolve target course from the question."],
      },
    };
  }

  const rules = parsePrerequisiteRules(resolved.resolved);
  const studentInputs = buildStudentInputs(academics);
  const result = evaluateCourseEligibility({
    targetCourse: resolved.resolved,
    prerequisites: rules,
    studentCompletedCourses: studentInputs.completedCourses,
    studentEnrollments: studentInputs.enrollments,
  });

  return {
    resolvedCourse: resolved.resolved,
    ambiguousMatches: [],
    rules,
    result,
  };
}
