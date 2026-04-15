import { pool } from "../lib/db.js";
import { listLegacyRegistrationTermsForStudent } from "../repositories/studentLegacyAccountRepository.js";
import {
  evaluateStudentGraduation,
  type GraduationEvaluationResult,
} from "./graduationEvaluationService.js";
import { type RagAnswerResult } from "./ragService.js";
import {
  detectStudentRecordQuestion,
  extractCourseCode,
} from "./studentAiQuestionRouter.js";
import { getStudentAcademicsPayload } from "./studentAcademicsService.js";
import { termSortOrder, termsMatch } from "./studentAcademicCourseRecords.js";
import { getStudentTranscriptPreviewPayload } from "./studentTranscriptService.js";
import type {
  StudentAcademicCourseRecord,
  StudentAcademicsResponse,
} from "../types/studentAcademics.js";
import type {
  StudentTranscriptPreviewResponse,
  StudentTranscriptRow,
} from "../types/studentTranscript.js";

type TermYear = { term: string; year: number };
type AcademicHistoryCoverage = "full" | "partial";

type HistoricalAcademicRecordTerm = {
  term: string;
  year: number;
  label: string;
  courses: StudentTranscriptRow[];
};

type HistoricalAcademicRecordSummary = {
  coverage: AcademicHistoryCoverage;
  coverageNote: string;
  knownTerms: TermYear[];
  academicTerms: TermYear[];
  registrationTerms: TermYear[];
  registrationOnlyTerms: TermYear[];
  terms: HistoricalAcademicRecordTerm[];
};

type StudentRecordDataLoader = {
  studentId: string;
  academicsPromise?: Promise<StudentAcademicsResponse>;
  transcriptPreviewPromise?: Promise<StudentTranscriptPreviewResponse>;
  registrationTermsPromise?: Promise<TermYear[]>;
  historicalSummaryPromise?: Promise<HistoricalAcademicRecordSummary>;
};

export type StudentRecordAnswerResult = {
  result: RagAnswerResult;
  usedHelpers: string[];
};

export type StudentRecordFactsResult = {
  contextText: string;
  usedHelpers: string[];
};

function createLoader(studentId: string): StudentRecordDataLoader {
  return { studentId: studentId.trim() };
}

async function getAcademics(
  loader: StudentRecordDataLoader,
): Promise<StudentAcademicsResponse> {
  if (loader.academicsPromise == null) {
    loader.academicsPromise = getStudentAcademicsPayload(loader.studentId);
  }
  return loader.academicsPromise;
}

async function getTranscriptPreview(
  loader: StudentRecordDataLoader,
): Promise<StudentTranscriptPreviewResponse> {
  if (loader.transcriptPreviewPromise == null) {
    loader.transcriptPreviewPromise = getStudentTranscriptPreviewPayload(loader.studentId);
  }
  return loader.transcriptPreviewPromise;
}

async function getRegistrationTerms(loader: StudentRecordDataLoader): Promise<TermYear[]> {
  if (loader.registrationTermsPromise == null) {
    loader.registrationTermsPromise = listLegacyRegistrationTermsForStudent(
      pool,
      loader.studentId,
    );
  }
  return loader.registrationTermsPromise;
}

function formatTermLabel(term: string, year: number): string {
  const t = term.trim();
  return t === "" ? String(year) : `${t} ${year}`;
}

function normalizeCourseCode(courseCode: string): string {
  return courseCode.replace(/[\s-]+/g, "").trim().toUpperCase();
}

function formatCourseLabel(record: {
  courseCode: string;
  courseTitle: string;
  sectionCode?: string | null;
}): string {
  const code = record.courseCode.trim();
  const title = record.courseTitle.trim();
  const section = record.sectionCode?.trim() ?? "";
  const base = code && title ? `${code} - ${title}` : code || title || "Unknown course";
  return section !== "" ? `${base} (section ${section})` : base;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function sumCredits(
  records: Array<{ credits: number | null }>,
): number | null {
  let total = 0;
  let found = false;
  for (const record of records) {
    if (record.credits != null && Number.isFinite(record.credits)) {
      total += record.credits;
      found = true;
    }
  }
  return found ? roundTwo(total) : null;
}

function compareTermsDesc(a: TermYear, b: TermYear): number {
  if (b.year !== a.year) return b.year - a.year;
  return termSortOrder(b.term) - termSortOrder(a.term);
}

function termYearKey(term: string, year: number): string {
  return `${term.trim().toLowerCase()}|${year}`;
}

function uniqueSortedTerms(terms: TermYear[]): TermYear[] {
  const byKey = new Map<string, TermYear>();
  for (const item of terms) {
    const term = item.term.trim();
    const year = Math.trunc(item.year);
    if (term === "" || !Number.isFinite(year)) continue;
    const key = termYearKey(term, year);
    if (!byKey.has(key)) {
      byKey.set(key, { term, year });
    }
  }
  return [...byKey.values()].sort(compareTermsDesc);
}

function sourceLabel(source: StudentAcademicCourseRecord["source"] | StudentTranscriptRow["source"]): string {
  switch (source) {
    case "marks":
      return "marks transcript";
    case "portal":
      return "portal enrollment";
    case "clinic":
      return "clinic transcript";
    default:
      return source;
  }
}

function buildHistoricalAcademicRecordSummary(
  transcriptPreview: StudentTranscriptPreviewResponse,
  registrationTerms: TermYear[],
): HistoricalAcademicRecordSummary {
  const grouped = new Map<string, HistoricalAcademicRecordTerm>();

  for (const record of transcriptPreview.transcript) {
    const term = record.term.trim();
    const year = Math.trunc(record.year);
    if (term === "" || !Number.isFinite(year)) continue;
    const key = termYearKey(term, year);
    const existing = grouped.get(key);
    if (existing == null) {
      grouped.set(key, {
        term,
        year,
        label: formatTermLabel(term, year),
        courses: [record],
      });
      continue;
    }
    existing.courses.push(record);
  }

  const terms = [...grouped.values()].sort(compareTermsDesc);
  const transcriptTerms =
    transcriptPreview.availableTerms.length > 0
      ? uniqueSortedTerms(
          transcriptPreview.availableTerms.map((item) => ({
            term: item.term,
            year: item.year,
          })),
        )
      : uniqueSortedTerms(terms.map((item) => ({ term: item.term, year: item.year })));
  const academicTerms = transcriptTerms;
  const normalizedRegistrationTerms = uniqueSortedTerms(registrationTerms);
  const academicTermKeys = new Set(academicTerms.map((item) => termYearKey(item.term, item.year)));
  const registrationOnlyTerms = normalizedRegistrationTerms.filter(
    (item) => !academicTermKeys.has(termYearKey(item.term, item.year)),
  );
  const knownTerms = uniqueSortedTerms([...academicTerms, ...normalizedRegistrationTerms]);

  let coverage: AcademicHistoryCoverage = "partial";
  let coverageNote =
    "Course-level academic history is unavailable or limited in the current verified sources.";

  if (transcriptPreview.transcript.length > 0 && registrationOnlyTerms.length === 0) {
    coverage = "full";
    coverageNote =
      "Course-level history is available for every known term in the verified transcript preview sources.";
  } else if (registrationOnlyTerms.length > 0) {
    coverageNote = `Some known term${registrationOnlyTerms.length === 1 ? "" : "s"} appear only in legacy registration data without course-level detail: ${registrationOnlyTerms
      .map((item) => formatTermLabel(item.term, item.year))
      .join("; ")}.`;
  } else if (transcriptPreview.transcript.length > 0) {
    coverageNote =
      "Course-level history exists, but the available sources do not guarantee complete lifetime coverage for every historical term.";
  }

  return {
    coverage,
    coverageNote,
    knownTerms,
    academicTerms,
    registrationTerms: normalizedRegistrationTerms,
    registrationOnlyTerms,
    terms,
  };
}

async function getHistoricalSummary(
  loader: StudentRecordDataLoader,
): Promise<HistoricalAcademicRecordSummary> {
  if (loader.historicalSummaryPromise == null) {
    loader.historicalSummaryPromise = Promise.all([
      getTranscriptPreview(loader),
      getRegistrationTerms(loader),
    ]).then(([transcriptPreview, registrationTerms]) =>
      buildHistoricalAcademicRecordSummary(transcriptPreview, registrationTerms),
    );
  }
  return loader.historicalSummaryPromise;
}

export async function getHistoricalAcademicRecord(
  studentId: string,
): Promise<HistoricalAcademicRecordSummary> {
  return getHistoricalSummary(createLoader(studentId));
}

export async function getCoursesByYear(
  studentId: string,
  year: number,
): Promise<StudentTranscriptRow[]> {
  const summary = await getHistoricalAcademicRecord(studentId);
  return summary.terms
    .filter((term) => term.year === year)
    .flatMap((term) => term.courses);
}

export async function getCoursesByTerm(
  studentId: string,
  term: string,
  year: number,
): Promise<StudentTranscriptRow[]> {
  const summary = await getHistoricalAcademicRecord(studentId);
  return summary.terms
    .filter((item) => item.year === year && termsMatch(item.term, term))
    .flatMap((item) => item.courses);
}

function logHistoricalLookup(args: {
  studentId: string;
  year: number;
  term: string | null;
  resultCount: number;
  coverage: AcademicHistoryCoverage;
}): void {
  console.debug("[student-record] historical lookup", {
    studentId: args.studentId,
    detectedYear: args.year,
    detectedTerm: args.term,
    historicalQueryResultCount: args.resultCount,
    coverage: args.coverage,
  });
}

function formatHistoricalCourseEntry(record: StudentAcademicCourseRecord): string {
  const details = [
    formatCourseLabel(record),
    `source: ${sourceLabel(record.source)}`,
  ];
  if (record.status != null) {
    details.push(`status: ${record.status}`);
  }
  if (record.grade?.trim()) {
    details.push(`grade: ${record.grade.trim()}`);
  }
  if (record.credits != null) {
    details.push(`credits: ${record.credits}`);
  }
  return details.join(" | ");
}

function formatHistoricalTranscriptEntry(record: StudentTranscriptRow): string {
  const details = [
    formatCourseLabel(record),
    `source: ${sourceLabel(record.source)}`,
  ];
  if (record.status != null) {
    details.push(`status: ${record.status}`);
  }
  if (record.grade?.trim()) {
    details.push(`grade: ${record.grade.trim()}`);
  }
  if (record.credits != null) {
    details.push(`credits: ${record.credits}`);
  }
  return details.join(" | ");
}

function formatCourseStatusRecord(record: StudentAcademicCourseRecord): string {
  const details = [`${formatTermLabel(record.term, record.year)}`, `status: ${record.status}`];
  if (record.grade?.trim()) {
    details.push(`grade: ${record.grade.trim()}`);
  }
  details.push(`source: ${sourceLabel(record.source)}`);
  return details.join(", ");
}

function getCurrentTermCourseRecords(
  academics: StudentAcademicsResponse,
): StudentAcademicCourseRecord[] {
  const currentTerm = academics.currentTerm;
  if (currentTerm == null) return [];

  const sameTerm = academics.courseRecords.filter(
    (record) =>
      record.year === currentTerm.year && termsMatch(record.term, currentTerm.term),
  );

  const activePortal = sameTerm.filter(
    (record) => record.source === "portal" && record.status === "active",
  );
  if (activePortal.length > 0) {
    return activePortal;
  }

  return sameTerm.filter((record) => record.status === "active");
}

export async function getCurrentTermCourses(studentId: string) {
  const academics = await getStudentAcademicsPayload(studentId.trim());
  return getCurrentTermCourseRecords(academics).map((record) => ({
    courseCode: record.courseCode,
    courseTitle: record.courseTitle,
    term: record.term,
    year: record.year,
    credits: record.credits,
    sectionCode: record.sectionCode ?? null,
  }));
}

export async function getCurrentTermCourseCount(studentId: string): Promise<number> {
  const courses = await getCurrentTermCourses(studentId.trim());
  return courses.length;
}

export async function getRegisteredTerms(studentId: string): Promise<TermYear[]> {
  const transcriptPreview = await getStudentTranscriptPreviewPayload(studentId.trim());
  const registrationTerms = await listLegacyRegistrationTermsForStudent(
    pool,
    studentId.trim(),
  );
  return buildHistoricalAcademicRecordSummary(
    transcriptPreview,
    registrationTerms,
  ).knownTerms;
}

export async function getRegisteredTermCount(studentId: string): Promise<number> {
  const terms = await getRegisteredTerms(studentId.trim());
  return terms.length;
}

export async function hasRegistrationInYear(
  studentId: string,
  year: number,
): Promise<boolean> {
  const terms = await getRegisteredTerms(studentId.trim());
  return terms.some((item) => item.year === year);
}

export async function getCurrentTermCredits(studentId: string): Promise<number | null> {
  const courses = await getCurrentTermCourses(studentId.trim());
  return sumCredits(courses);
}

export async function hasCompletedCourse(
  studentId: string,
  courseCode: string,
): Promise<boolean> {
  const academics = await getStudentAcademicsPayload(studentId.trim());
  const wanted = normalizeCourseCode(courseCode);
  return academics.courseRecords.some(
    (record) =>
      record.source === "marks" &&
      record.status === "completed" &&
      normalizeCourseCode(record.courseCode) === wanted,
  );
}

export async function getWithdrawalHistory(studentId: string) {
  const academics = await getStudentAcademicsPayload(studentId.trim());
  const seen = new Set<string>();
  const history = academics.courseRecords.filter((record) => record.status === "withdrawn");
  return history.filter((record) => {
    const key = [
      normalizeCourseCode(record.courseCode),
      record.term.trim().toLowerCase(),
      String(record.year),
      record.source,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildCurrentTermCoursesAnswer(
  question: string,
  academics: StudentAcademicsResponse,
  records: StudentAcademicCourseRecord[],
): StudentRecordAnswerResult {
  const currentTerm = academics.currentTerm;
  if (currentTerm == null) {
    return {
      result: {
        question,
        answer:
          "I could not identify an active current term from your verified registration and marks data, so I cannot answer a current-term course question.",
        sources: [],
      },
      usedHelpers: ["getCurrentTermCourses"],
    };
  }

  const termLabel = formatTermLabel(currentTerm.term, currentTerm.year);
  if (records.length === 0) {
    return {
      result: {
        question,
        answer: `I did not find any active current-term enrollments for ${termLabel}.`,
        sources: [],
      },
      usedHelpers: ["getCurrentTermCourses"],
    };
  }

  const courseList = records.map((record) => formatCourseLabel(record)).join("; ");
  return {
    result: {
      question,
      answer: `You are currently taking ${records.length} course${records.length === 1 ? "" : "s"} in ${termLabel}: ${courseList}.`,
      sources: [],
    },
    usedHelpers: ["getCurrentTermCourses"],
  };
}

function buildCurrentTermCourseCountAnswer(
  question: string,
  academics: StudentAcademicsResponse,
  records: StudentAcademicCourseRecord[],
): StudentRecordAnswerResult {
  const currentTerm = academics.currentTerm;
  if (currentTerm == null) {
    return {
      result: {
        question,
        answer:
          "I could not identify an active current term from your verified registration and marks data, so I cannot answer a current-term course-count question.",
        sources: [],
      },
      usedHelpers: ["getCurrentTermCourseCount"],
    };
  }
  return {
    result: {
      question,
      answer: `You are taking ${records.length} course${records.length === 1 ? "" : "s"} in ${formatTermLabel(currentTerm.term, currentTerm.year)}.`,
      sources: [],
    },
    usedHelpers: ["getCurrentTermCourseCount"],
  };
}

function buildCurrentTermCreditsAnswer(
  question: string,
  academics: StudentAcademicsResponse,
  records: StudentAcademicCourseRecord[],
): StudentRecordAnswerResult {
  const currentTerm = academics.currentTerm;
  if (currentTerm == null) {
    return {
      result: {
        question,
        answer:
          "I could not identify an active current term from your verified registration and marks data, so I cannot answer a current-term credit question.",
        sources: [],
      },
      usedHelpers: ["getCurrentTermCredits"],
    };
  }
  const credits = sumCredits(records);
  if (records.length === 0) {
    return {
      result: {
        question,
        answer: `I did not find any active current-term enrollments for ${formatTermLabel(currentTerm.term, currentTerm.year)}.`,
        sources: [],
      },
      usedHelpers: ["getCurrentTermCredits"],
    };
  }
  if (credits == null) {
    return {
      result: {
        question,
        answer: `I found ${records.length} active current-term course${records.length === 1 ? "" : "s"} in ${formatTermLabel(currentTerm.term, currentTerm.year)}, but one or more rows are missing unit values, so I cannot compute an exact current-term credit total.`,
        sources: [],
      },
      usedHelpers: ["getCurrentTermCredits"],
    };
  };
  return {
    result: {
      question,
      answer: `You are currently taking ${credits} credit${credits === 1 ? "" : "s"} in ${formatTermLabel(currentTerm.term, currentTerm.year)}.`,
      sources: [],
    },
    usedHelpers: ["getCurrentTermCredits"],
  };
}

function buildRegisteredTermCountAnswer(
  question: string,
  summary: HistoricalAcademicRecordSummary,
): StudentRecordAnswerResult {
  if (summary.knownTerms.length === 0) {
    return {
      result: {
        question,
        answer:
          "I do not have enough historical academic or registration data to confirm your term history.",
        sources: [],
      },
      usedHelpers: ["getRegisteredTerms", "getRegisteredTermCount"],
    };
  }

  const labels = summary.knownTerms
    .map((term) => formatTermLabel(term.term, term.year))
    .join("; ");
  const base = `I found ${summary.knownTerms.length} term${summary.knownTerms.length === 1 ? "" : "s"} in your available academic history: ${labels}.`;
  return {
    result: {
      question,
      answer:
        summary.coverage === "full"
          ? base
          : `${base} Academic history coverage is partial, so I cannot confirm whether this is your full lifetime term count.`,
      sources: [],
    },
    usedHelpers: ["getRegisteredTerms", "getRegisteredTermCount"],
  };
}

function buildRegistrationInYearAnswer(
  question: string,
  year: number,
  summary: HistoricalAcademicRecordSummary,
): StudentRecordAnswerResult {
  const matchingTerms = summary.knownTerms.filter((term) => term.year === year);
  if (matchingTerms.length === 0) {
    return {
      result: {
        question,
        answer:
          summary.coverage === "full"
            ? `No. I did not find any verified academic or registration term records for ${year}.`
            : `I cannot confirm from the available records whether you registered in ${year}, because academic history coverage is partial.`,
        sources: [],
      },
      usedHelpers: ["getRegisteredTerms", "hasRegistrationInYear"],
    };
  }

  const labels = matchingTerms
    .map((term) => formatTermLabel(term.term, term.year))
    .join("; ");
  return {
    result: {
      question,
      answer:
        summary.coverage === "full"
          ? `Yes. I found verified academic or registration term records for ${year}: ${labels}.`
          : `Yes. I found term records for ${year}: ${labels}. Academic history coverage is partial, so there may be additional historical detail outside the currently available records.`,
      sources: [],
    },
    usedHelpers: ["getRegisteredTerms", "hasRegistrationInYear"],
  };
}

function buildHistoricalTermLookupAnswer(
  question: string,
  studentId: string,
  year: number,
  term: string | null,
  summary: HistoricalAcademicRecordSummary,
): StudentRecordAnswerResult {
  const matchingTerms = summary.terms.filter(
    (item) => item.year === year && (term == null || termsMatch(item.term, term)),
  );
  const registrationOnlyTerms = summary.registrationOnlyTerms.filter((term) => term.year === year);
  const scopeLabel = term == null ? String(year) : formatTermLabel(term, year);

  logHistoricalLookup({
    studentId,
    year,
    term,
    resultCount: matchingTerms.reduce((count, item) => count + item.courses.length, 0),
    coverage: summary.coverage,
  });

  if (matchingTerms.length === 0) {
    if (registrationOnlyTerms.length > 0 || summary.coverage === "partial") {
      const partialNote =
        registrationOnlyTerms.length > 0
          ? ` I found registration-only term records for ${year}: ${registrationOnlyTerms
              .map((term) => formatTermLabel(term.term, term.year))
              .join("; ")}.`
          : "";
      return {
        result: {
          question,
          answer: `I cannot confirm the full list of courses for ${scopeLabel} from the available transcript-history records because coverage is partial.${partialNote}`,
          sources: [],
        },
        usedHelpers: [
          term == null ? "getCoursesByYear" : "getCoursesByTerm",
          "getHistoricalAcademicRecord",
          "getRegisteredTerms",
        ],
      };
    }

    return {
      result: {
        question,
        answer: `I did not find any transcript-history course records for ${scopeLabel}.`,
        sources: [],
      },
      usedHelpers: [
        term == null ? "getCoursesByYear" : "getCoursesByTerm",
        "getHistoricalAcademicRecord",
      ],
    };
  }

  const details = matchingTerms
    .map(
      (term) =>
        `${term.label}: ${term.courses
          .map((record) => formatHistoricalTranscriptEntry(record))
          .join("; ")}`,
    )
    .join(" | ");
  const extraNote =
    registrationOnlyTerms.length > 0
      ? ` I also found registration-only term records without course detail: ${registrationOnlyTerms
          .map((term) => formatTermLabel(term.term, term.year))
          .join("; ")}.`
      : "";

  return {
    result: {
      question,
      answer: `Here is the exact transcript-history course list I found for ${scopeLabel}: ${details}.${summary.coverage === "partial" ? " Transcript-history coverage is partial, so there may be additional records not shown." : ""}${extraNote}`,
      sources: [],
    },
    usedHelpers: [
      term == null ? "getCoursesByYear" : "getCoursesByTerm",
      "getHistoricalAcademicRecord",
      "getRegisteredTerms",
    ],
  };
}

function buildAllCoursesHistoryAnswer(
  question: string,
  summary: HistoricalAcademicRecordSummary,
): StudentRecordAnswerResult {
  if (summary.terms.length === 0) {
    if (summary.registrationOnlyTerms.length > 0) {
      return {
        result: {
          question,
          answer: `I found historical registration term${summary.registrationOnlyTerms.length === 1 ? "" : "s"} without course-level detail: ${summary.registrationOnlyTerms
            .map((term) => formatTermLabel(term.term, term.year))
            .join("; ")}. I could not find verified transcript-preview course rows for this request.`,
          sources: [],
        },
        usedHelpers: ["getHistoricalAcademicRecord", "getRegisteredTerms"],
      };
    }

    return {
      result: {
        question,
        answer:
          "I could not find any verified transcript-preview course history for your account.",
        sources: [],
      },
      usedHelpers: ["getHistoricalAcademicRecord", "getRegisteredTerms"],
    };
  }

  const details = summary.terms
    .map(
      (term) =>
        `${term.label}: ${term.courses
          .map((record) => formatHistoricalTranscriptEntry(record))
          .join("; ")}`,
    )
    .join(" | ");
  const coverageNote =
    summary.coverage === "partial" ? ` ${summary.coverageNote}` : "";

  return {
    result: {
      question,
      answer: `Here is your verified academic course history: ${details}.${coverageNote}`,
      sources: [],
    },
    usedHelpers: ["getHistoricalAcademicRecord", "getRegisteredTerms"],
  };
}

function buildWithdrawalHistoryAnswer(
  question: string,
  history: StudentAcademicCourseRecord[],
): StudentRecordAnswerResult {
  if (history.length === 0) {
    return {
      result: {
        question,
        answer:
          "I did not find any explicit withdrawal records in your available academic history.",
        sources: [],
      },
      usedHelpers: ["getWithdrawalHistory"],
    };
  }

  const items = history
    .slice(0, 8)
    .map(
      (record) =>
        `${formatCourseLabel(record)} in ${formatTermLabel(record.term, record.year)}`,
    )
    .join("; ");
  return {
    result: {
      question,
      answer: `Yes. I found ${history.length} withdrawal record${history.length === 1 ? "" : "s"}: ${items}.`,
      sources: [],
    },
    usedHelpers: ["getWithdrawalHistory"],
  };
}

function buildCompletedCourseAnswer(
  question: string,
  courseCode: string,
  academics: StudentAcademicsResponse,
  coverage: AcademicHistoryCoverage,
): StudentRecordAnswerResult {
  const wanted = normalizeCourseCode(courseCode);
  const matches = academics.courseRecords.filter(
    (record) =>
      record.source === "marks" &&
      record.status === "completed" &&
      normalizeCourseCode(record.courseCode) === wanted,
  );

  if (matches.length === 0) {
    return {
      result: {
        question,
        answer:
          coverage === "full"
            ? `No completed transcript record for ${wanted} was found in your available academic history.`
            : `I cannot confirm from the available records whether you completed ${wanted}, because academic history coverage is partial.`,
        sources: [],
      },
      usedHelpers: ["hasCompletedCourse"],
    };
  }

  const details = matches.map((match) => formatCourseStatusRecord(match)).join("; ");
  return {
    result: {
      question,
      answer: `Yes. I found completed ${wanted} transcript record${matches.length === 1 ? "" : "s"}: ${details}.`,
      sources: [],
    },
    usedHelpers: ["hasCompletedCourse"],
  };
}

function buildTookCourseAnswer(
  question: string,
  courseCode: string,
  academics: StudentAcademicsResponse,
  coverage: AcademicHistoryCoverage,
): StudentRecordAnswerResult {
  const wanted = normalizeCourseCode(courseCode);
  const matches = academics.courseRecords.filter(
    (record) => normalizeCourseCode(record.courseCode) === wanted,
  );

  if (matches.length === 0) {
    return {
      result: {
        question,
        answer:
          coverage === "full"
            ? `No verified course record for ${wanted} was found in your available academic history.`
            : `I cannot confirm from the available records whether you took ${wanted}, because academic history coverage is partial.`,
        sources: [],
      },
      usedHelpers: ["getStudentAcademicsPayload"],
    };
  }

  const details = matches.map((match) => formatCourseStatusRecord(match)).join("; ");
  return {
    result: {
      question,
      answer: `Yes. I found ${wanted} in your academic history: ${details}.`,
      sources: [],
    },
    usedHelpers: ["getStudentAcademicsPayload"],
  };
}

function buildCompletedCreditsTotalAnswer(
  question: string,
  evaluation: GraduationEvaluationResult,
): StudentRecordAnswerResult {
  const transferNote =
    evaluation.transferCredits > 0
      ? ` This total includes ${evaluation.transferCredits} transfer or admission credit${evaluation.transferCredits === 1 ? "" : "s"}.`
      : "";
  return {
    result: {
      question,
      answer: `You currently have ${evaluation.earnedCredits} earned credit${evaluation.earnedCredits === 1 ? "" : "s"} counted toward graduation based on your latest completed transcript records.${transferNote}`,
      sources: [],
    },
    usedHelpers: ["evaluateStudentGraduation", "getStudentAcademicsPayload"],
  };
}

export async function answerDeterministicStudentRecordQuestion(
  studentId: string,
  question: string,
): Promise<StudentRecordAnswerResult | null> {
  const match = detectStudentRecordQuestion(question);
  if (match == null) return null;

  const loader = createLoader(studentId);
  console.debug("[student-record] deterministic question matched", {
    studentId: loader.studentId,
    questionKind: match.kind,
    detectedYear: "year" in match ? match.year : null,
    detectedTerm: "term" in match ? match.term : null,
  });

  switch (match.kind) {
    case "current_term_courses": {
      const academics = await getAcademics(loader);
      const records = getCurrentTermCourseRecords(academics);
      return buildCurrentTermCoursesAnswer(question, academics, records);
    }
    case "current_term_course_count": {
      const academics = await getAcademics(loader);
      const records = getCurrentTermCourseRecords(academics);
      return buildCurrentTermCourseCountAnswer(question, academics, records);
    }
    case "current_term_credits": {
      const academics = await getAcademics(loader);
      const records = getCurrentTermCourseRecords(academics);
      return buildCurrentTermCreditsAnswer(question, academics, records);
    }
    case "registered_term_count": {
      const summary = await getHistoricalSummary(loader);
      return buildRegisteredTermCountAnswer(question, summary);
    }
    case "registration_in_year": {
      const summary = await getHistoricalSummary(loader);
      return buildRegistrationInYearAnswer(question, match.year, summary);
    }
    case "historical_term_lookup": {
      const summary = await getHistoricalSummary(loader);
      return buildHistoricalTermLookupAnswer(
        question,
        loader.studentId,
        match.year,
        match.term,
        summary,
      );
    }
    case "all_courses_history": {
      const summary = await getHistoricalSummary(loader);
      return buildAllCoursesHistoryAnswer(question, summary);
    }
    case "withdrawal_history": {
      const history = await getWithdrawalHistory(loader.studentId);
      return buildWithdrawalHistoryAnswer(question, history);
    }
    case "took_course": {
      const academics = await getAcademics(loader);
      const summary = await getHistoricalSummary(loader);
      return buildTookCourseAnswer(question, match.courseCode, academics, summary.coverage);
    }
    case "completed_course": {
      const academics = await getAcademics(loader);
      const summary = await getHistoricalSummary(loader);
      return buildCompletedCourseAnswer(
        question,
        match.courseCode,
        academics,
        summary.coverage,
      );
    }
    case "completed_credits_total": {
      const evaluation = await evaluateStudentGraduation(loader.studentId);
      return buildCompletedCreditsTotalAnswer(question, evaluation);
    }
    default:
      return null;
  }
}

function buildCurrentTermFacts(academics: StudentAcademicsResponse): string[] {
  const lines: string[] = [];
  const currentTerm = academics.currentTerm;
  if (currentTerm == null) {
    lines.push("- Current term: Unavailable");
    lines.push("- Current active enrollments: None confirmed");
    return lines;
  }

  const currentRecords = getCurrentTermCourseRecords(academics);
  const credits = sumCredits(currentRecords);
  lines.push(`- Current term: ${formatTermLabel(currentTerm.term, currentTerm.year)}`);
  lines.push(`- Current active enrollments: ${currentRecords.length}`);
  if (credits != null) {
    lines.push(`- Current active credits: ${credits}`);
  }
  if (currentRecords.length > 0) {
    lines.push(
      `- Current courses: ${currentRecords.map((record) => formatCourseLabel(record)).join("; ")}`,
    );
  }
  return lines;
}

function buildWithdrawalFacts(history: StudentAcademicCourseRecord[]): string[] {
  if (history.length === 0) {
    return ["- Withdrawal records: None found"];
  }
  return [
    `- Withdrawal records found: ${history.length}`,
    `- Withdrawal details: ${history
      .slice(0, 8)
      .map(
        (record) =>
          `${formatCourseLabel(record)} in ${formatTermLabel(record.term, record.year)}`,
      )
      .join("; ")}`,
  ];
}

function buildHistoricalAcademicRecordFacts(
  summary: HistoricalAcademicRecordSummary,
): string[] {
  const lines: string[] = [
    `- Academic history coverage: ${summary.coverage}`,
    `- Academic history coverage note: ${summary.coverageNote}`,
    `- Historical academic terms found: ${summary.academicTerms.length}`,
  ];

  if (summary.knownTerms.length > 0) {
    lines.push(
      `- Historical term list: ${summary.knownTerms
        .map((term) => formatTermLabel(term.term, term.year))
        .join("; ")}`,
    );
  } else {
    lines.push("- Historical term list: None found");
  }

  lines.push(
    `- Legacy registration terms found: ${summary.registrationTerms.length}`,
  );

  if (summary.registrationOnlyTerms.length > 0) {
    lines.push(
      `- Registration-only terms without course detail: ${summary.registrationOnlyTerms
        .map((term) => formatTermLabel(term.term, term.year))
        .join("; ")}`,
    );
  }

  lines.push("- Historical academic record:");
  if (summary.terms.length === 0) {
    lines.push("  - No course-level academic history found");
  } else {
    for (const term of summary.terms) {
      lines.push(`  - ${term.label}`);
      for (const record of term.courses) {
        lines.push(`    - ${formatHistoricalTranscriptEntry(record)}`);
      }
    }
  }

  return lines;
}

function buildCompletedCourseFacts(
  courseCode: string,
  academics: StudentAcademicsResponse,
  coverage: AcademicHistoryCoverage,
): string[] {
  const wanted = normalizeCourseCode(courseCode);
  const matches = academics.courseRecords.filter(
    (record) =>
      record.source === "marks" &&
      record.status === "completed" &&
      normalizeCourseCode(record.courseCode) === wanted,
  );

  if (matches.length === 0) {
    return [
      coverage === "full"
        ? `- Completed ${wanted}: No completed transcript record found`
        : `- Completed ${wanted}: Cannot confirm from the available records because academic history coverage is partial`,
    ];
  }

  return [
    `- Completed ${wanted}: ${matches
      .map((match) => formatCourseStatusRecord(match))
      .join("; ")}`,
  ];
}

function needsCurrentTermFacts(question: string): boolean {
  return /\b(current|this term|now|currently|apply to me|pay attention|record)\b/i.test(
    question,
  );
}

function needsWithdrawalFacts(question: string): boolean {
  return /\b(withdraw|withdrawal)\b/i.test(question);
}

function needsRegisteredTermFacts(question: string): boolean {
  return /\b(register|registered|enroll|enrolled)\b/i.test(question);
}

function buildHistoricalTermLookupFacts(
  year: number,
  term: string | null,
  summary: HistoricalAcademicRecordSummary,
): string[] {
  const matchingTerms = summary.terms.filter(
    (item) => item.year === year && (term == null || termsMatch(item.term, term)),
  );
  const registrationOnlyTerms = summary.registrationOnlyTerms.filter((term) => term.year === year);
  const scopeLabel = term == null ? String(year) : formatTermLabel(term, year);

  if (matchingTerms.length === 0) {
    if (registrationOnlyTerms.length > 0) {
      return [
        `- Historical lookup ${scopeLabel}: Registration-only term records found without course detail: ${registrationOnlyTerms
          .map((term) => formatTermLabel(term.term, term.year))
          .join("; ")}`,
      ];
    }
    return [
      summary.coverage === "full"
        ? `- Historical lookup ${scopeLabel}: No transcript-history course records found`
        : `- Historical lookup ${scopeLabel}: Cannot confirm from the available records because transcript-history coverage is partial`,
    ];
  }

  return [
    `- Historical lookup ${scopeLabel}: ${matchingTerms
      .map(
        (term) =>
          `${term.label}: ${term.courses
            .map((record) => formatHistoricalTranscriptEntry(record))
            .join("; ")}`,
      )
      .join(" | ")}`,
  ];
}

function buildTookCourseFacts(
  courseCode: string,
  academics: StudentAcademicsResponse,
  coverage: AcademicHistoryCoverage,
): string[] {
  const wanted = normalizeCourseCode(courseCode);
  const matches = academics.courseRecords.filter(
    (record) => normalizeCourseCode(record.courseCode) === wanted,
  );

  if (matches.length === 0) {
    return [
      coverage === "full"
        ? `- Took ${wanted}: No verified course record found`
        : `- Took ${wanted}: Cannot confirm from the available records because academic history coverage is partial`,
    ];
  }

  return [
    `- Took ${wanted}: ${matches
      .map((match) => formatCourseStatusRecord(match))
      .join("; ")}`,
  ];
}

function pushUnique(lines: string[], newLines: string[]): void {
  for (const line of newLines) {
    if (!lines.includes(line)) lines.push(line);
  }
}

export async function buildStudentRecordFactsForQuestion(
  studentId: string,
  question: string,
): Promise<StudentRecordFactsResult | null> {
  const loader = createLoader(studentId);
  const lines: string[] = ["Student Record Facts"];
  const usedHelpers = new Set<string>();
  const recordMatch = detectStudentRecordQuestion(question);
  const courseCode = extractCourseCode(question);
  const historySummary = await getHistoricalSummary(loader);

  pushUnique(lines, buildHistoricalAcademicRecordFacts(historySummary));
  usedHelpers.add("getHistoricalAcademicRecord");
  usedHelpers.add("getRegisteredTerms");

  if (recordMatch != null) {
    switch (recordMatch.kind) {
      case "current_term_courses":
      case "current_term_course_count":
      case "current_term_credits": {
        const academics = await getAcademics(loader);
        pushUnique(lines, buildCurrentTermFacts(academics));
        usedHelpers.add("getCurrentTermCourses");
        break;
      }
      case "registered_term_count":
      case "registration_in_year": {
        lines.push(
          `- Historical term count answer basis: ${historySummary.knownTerms.length} known term${historySummary.knownTerms.length === 1 ? "" : "s"} in the available academic history`,
        );
        usedHelpers.add("getRegisteredTerms");
        break;
      }
      case "historical_term_lookup": {
        pushUnique(
          lines,
          buildHistoricalTermLookupFacts(recordMatch.year, recordMatch.term, historySummary),
        );
        usedHelpers.add(
          recordMatch.term == null ? "getCoursesByYear" : "getCoursesByTerm",
        );
        usedHelpers.add("getRegisteredTerms");
        break;
      }
      case "all_courses_history": {
        lines.push(
          `- Historical course history answer basis: ${historySummary.terms.length} term${historySummary.terms.length === 1 ? "" : "s"} with course-level detail in verified sources`,
        );
        usedHelpers.add("getStudentAcademicsPayload");
        usedHelpers.add("getRegisteredTerms");
        break;
      }
      case "withdrawal_history": {
        const history = await getWithdrawalHistory(loader.studentId);
        pushUnique(lines, buildWithdrawalFacts(history));
        usedHelpers.add("getWithdrawalHistory");
        break;
      }
      case "took_course": {
        const academics = await getAcademics(loader);
        pushUnique(
          lines,
          buildTookCourseFacts(recordMatch.courseCode, academics, historySummary.coverage),
        );
        usedHelpers.add("getStudentAcademicsPayload");
        break;
      }
      case "completed_course": {
        const academics = await getAcademics(loader);
        pushUnique(
          lines,
          buildCompletedCourseFacts(
            recordMatch.courseCode,
            academics,
            historySummary.coverage,
          ),
        );
        usedHelpers.add("hasCompletedCourse");
        break;
      }
      case "completed_credits_total": {
        const evaluation = await evaluateStudentGraduation(loader.studentId);
        lines.push(`- Earned credits: ${evaluation.earnedCredits}`);
        lines.push(`- Transcript credits: ${evaluation.transcriptCredits}`);
        lines.push(`- Transfer / admission credits counted: ${evaluation.transferCredits}`);
        lines.push(`- Missing credits toward graduation rules: ${evaluation.missingCredits}`);
        usedHelpers.add("evaluateStudentGraduation");
        break;
      }
    }
  }

  if (needsCurrentTermFacts(question)) {
    const academics = await getAcademics(loader);
    pushUnique(lines, buildCurrentTermFacts(academics));
    usedHelpers.add("getCurrentTermCourses");
  }

  if (needsWithdrawalFacts(question)) {
    const history = await getWithdrawalHistory(loader.studentId);
    pushUnique(lines, buildWithdrawalFacts(history));
    usedHelpers.add("getWithdrawalHistory");
  }

  if (needsRegisteredTermFacts(question)) {
    lines.push(
      `- Historical term count answer basis: ${historySummary.knownTerms.length} known term${historySummary.knownTerms.length === 1 ? "" : "s"} in the available academic history`,
    );
    usedHelpers.add("getRegisteredTerms");
  }

  if (courseCode != null && /\b(can i take|prereq|prerequisite|completed)\b/i.test(question)) {
    const academics = await getAcademics(loader);
    pushUnique(
      lines,
      buildCompletedCourseFacts(courseCode, academics, historySummary.coverage),
    );
    usedHelpers.add("hasCompletedCourse");
  }

  return {
    contextText: lines.join("\n"),
    usedHelpers: [...usedHelpers],
  };
}
