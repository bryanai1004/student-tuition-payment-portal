import { listCoursesFromMysql, type CourseListItem } from "../repositories/courseRepository.js";
import { getStudentAcademicsPayload } from "./studentAcademicsService.js";
import type { StudentAcademicsResponse } from "../types/studentAcademics.js";
import { getLegacyStudentProfile } from "./studentProfileService.js";
import { evaluateStudentGraduation } from "./graduationEvaluationService.js";

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

export type ResolveAmuCourseResult =
  | { status: "resolved"; course: EligibilityResolvedCourse }
  | { status: "ambiguous"; matches: EligibilityResolvedCourse[] }
  | { status: "no_match" };

export type StudentAcademicCourseContext = {
  studentId: string;
  studentExternalId: string;
  program: "DAHM" | "MAHM" | null;
  track: string | null;
  preferredLanguage: "en" | "zh" | null;
  catalogYear: string | null;
  completedCourses: Array<{ code: string; title: string; grade: string | null }>;
  transferCredits: number;
  currentRegistrations: Array<{ code: string; title: string }>;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeCode(value: string | null | undefined): string {
  return (value ?? "").replace(/[\s-]+/g, "").trim().toUpperCase();
}

function normalizeForNameSearch(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\s\-_]+/g, "")
    .trim();
}

function extractLikelyCourseNameToken(question: string): string | null {
  const compact = question
    .replace(/[\s?？!！.,，。:：;；"“”'‘’()（）]/g, "")
    .trim();
  if (compact.length < 2 || compact.length > 20) return null;
  if (/^[a-z]{1,20}$/i.test(compact)) return compact.toLowerCase();
  if (/^[\u4E00-\u9FFF]{2,20}$/.test(compact)) return compact;
  return null;
}

function parseCatalogYearFromTrack(track: string | null | undefined): string | null {
  if (track == null) return null;
  const m = track.match(/\b(20\d{2})\b/);
  return m?.[1] ?? null;
}

export function isLikelyPassingGrade(value: string | null | undefined): boolean {
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

export function parsePrerequisiteRules(
  course: EligibilityResolvedCourse,
): PrerequisiteRuleSet | null {
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

export function isLikelyCourseRelatedQuery(question: string): boolean {
  const q = question.trim();
  if (q === "") return false;
  const lower = q.toLowerCase();
  if (/\b([a-z]{2,6})[\s-]?(\d{3}[a-z]?)\b/i.test(q)) return true;
  if (
    /\b(course|class|prerequisite|prereq|co-?requisite|register|registration|eligible)\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (/课程|先修|先决|选课|注册|我可以选|能选吗|能不能修|还差什么课|eligible/.test(q)) {
    return true;
  }
  return extractLikelyCourseNameToken(q) != null;
}

export function isShortCourseLikeQuery(question: string): boolean {
  const q = question.trim();
  if (q.length === 0 || q.length > 24) return false;
  if (/\b([a-z]{2,6})[\s-]?(\d{3}[a-z]?)\b/i.test(q)) return true;
  return extractLikelyCourseNameToken(q) != null;
}

export function detectPrerequisiteQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return /\b(prerequisite|prereq|pre-req|先修|先决)\b/i.test(q);
}

export function detectEligibilityQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return (
    /\b(can\s+i\s+take|am\s+i\s+eligible|eligible|what\s+am\s+i\s+missing)\b/i.test(
      q,
    ) || /我可以选|我可不可以选|我能选|我还差什么课|是否满足先修|能不能修/.test(question)
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

  const queryNameNormalized = normalizeForNameSearch(qRaw);
  const nameMatches = candidates.filter((c) => {
    const eng = normalizeForNameSearch(c.engName);
    const chi = (c.chiName ?? "").trim();
    if (eng.length >= 3 && queryNameNormalized.includes(eng)) return true;
    if (chi.length >= 2 && qRaw.includes(chi)) return true;
    if (eng.length >= 3 && eng.includes(queryNameNormalized) && queryNameNormalized.length >= 3) {
      return true;
    }
    if (
      chi.length >= 2 &&
      queryNameNormalized.length >= 2 &&
      normalizeForNameSearch(chi).includes(queryNameNormalized)
    ) {
      return true;
    }
    return false;
  });
  if (nameMatches.length === 1) return { resolved: nameMatches[0]!, ambiguous: [] };
  if (nameMatches.length > 1) return { resolved: null, ambiguous: nameMatches.slice(0, 5) };

  return { resolved: null, ambiguous: [] };
}

export async function resolveAmuCourse(
  query: string,
  _studentContext?: StudentAcademicCourseContext | null,
): Promise<ResolveAmuCourseResult> {
  const courses = await listCoursesFromMysql();
  const resolved = resolveTargetCourse(query, courses);
  if (resolved.resolved != null) {
    return { status: "resolved", course: resolved.resolved };
  }
  if (resolved.ambiguous.length > 0) {
    return { status: "ambiguous", matches: resolved.ambiguous.slice(0, 5) };
  }
  return { status: "no_match" };
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

export async function loadStudentAcademicCourseContext(
  studentId: string,
): Promise<StudentAcademicCourseContext> {
  const trimmed = studentId.trim();
  const [profile, academics, graduation] = await Promise.all([
    getLegacyStudentProfile(trimmed),
    getStudentAcademicsPayload(trimmed),
    evaluateStudentGraduation(trimmed),
  ]);

  const completedCourses = academics.courseRecords
    .filter((r) => r.status === "completed")
    .map((r) => ({
      code: normalizeCode(r.courseCode),
      title: r.courseTitle,
      grade: r.grade ?? null,
    }));

  const currentRegistrations = academics.courseRecords
    .filter((r) => r.status === "active")
    .map((r) => ({
      code: normalizeCode(r.courseCode),
      title: r.courseTitle,
    }));

  return {
    studentId: trimmed,
    studentExternalId: trimmed,
    program: profile?.program ?? null,
    track: profile?.track ?? null,
    preferredLanguage: null,
    catalogYear: parseCatalogYearFromTrack(profile?.track),
    completedCourses,
    transferCredits: graduation.transferCredits,
    currentRegistrations,
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
