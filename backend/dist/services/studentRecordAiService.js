import { pool } from "../lib/db.js";
import { listLegacyRegistrationTermsForStudent } from "../repositories/studentLegacyAccountRepository.js";
import { detectStudentRecordQuestion, extractCourseCode, } from "./studentAiQuestionRouter.js";
import { getStudentAcademicsPayload } from "./studentAcademicsService.js";
import { termSortOrder, termsMatch } from "./studentAcademicCourseRecords.js";
function createLoader(studentId) {
    return { studentId: studentId.trim() };
}
async function getAcademics(loader) {
    if (loader.academicsPromise == null) {
        loader.academicsPromise = getStudentAcademicsPayload(loader.studentId);
    }
    return loader.academicsPromise;
}
async function getRegistrationTerms(loader) {
    if (loader.registrationTermsPromise == null) {
        loader.registrationTermsPromise = listLegacyRegistrationTermsForStudent(pool, loader.studentId);
    }
    return loader.registrationTermsPromise;
}
function formatTermLabel(term, year) {
    const t = term.trim();
    return t === "" ? String(year) : `${t} ${year}`;
}
function normalizeCourseCode(courseCode) {
    return courseCode.replace(/[\s-]+/g, "").trim().toUpperCase();
}
function formatCourseLabel(record) {
    const code = record.courseCode.trim();
    const title = record.courseTitle.trim();
    const section = record.sectionCode?.trim() ?? "";
    const base = code && title ? `${code} - ${title}` : code || title || "Unknown course";
    return section !== "" ? `${base} (section ${section})` : base;
}
function roundTwo(value) {
    return Math.round(value * 100) / 100;
}
function sumCredits(records) {
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
function compareTermsDesc(a, b) {
    if (b.year !== a.year)
        return b.year - a.year;
    return termSortOrder(b.term) - termSortOrder(a.term);
}
function termYearKey(term, year) {
    return `${term.trim().toLowerCase()}|${year}`;
}
function uniqueSortedTerms(terms) {
    const byKey = new Map();
    for (const item of terms) {
        const term = item.term.trim();
        const year = Math.trunc(item.year);
        if (term === "" || !Number.isFinite(year))
            continue;
        const key = termYearKey(term, year);
        if (!byKey.has(key)) {
            byKey.set(key, { term, year });
        }
    }
    return [...byKey.values()].sort(compareTermsDesc);
}
function sourceLabel(source) {
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
function buildHistoricalAcademicRecordSummary(academics, registrationTerms) {
    const grouped = new Map();
    for (const record of academics.courseRecords) {
        const term = record.term.trim();
        const year = Math.trunc(record.year);
        if (term === "" || !Number.isFinite(year))
            continue;
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
    const academicTerms = uniqueSortedTerms(terms.map((item) => ({ term: item.term, year: item.year })));
    const normalizedRegistrationTerms = uniqueSortedTerms(registrationTerms);
    const academicTermKeys = new Set(academicTerms.map((item) => termYearKey(item.term, item.year)));
    const registrationOnlyTerms = normalizedRegistrationTerms.filter((item) => !academicTermKeys.has(termYearKey(item.term, item.year)));
    const knownTerms = uniqueSortedTerms([...academicTerms, ...normalizedRegistrationTerms]);
    let coverage = "partial";
    let coverageNote = "Course-level academic history is unavailable or limited in the current verified sources.";
    if (academics.courseRecords.length > 0 && registrationOnlyTerms.length === 0) {
        coverage = "full";
        coverageNote =
            "Course-level history is available for every known term in the verified marks and portal enrollment sources.";
    }
    else if (registrationOnlyTerms.length > 0) {
        coverageNote = `Some known term${registrationOnlyTerms.length === 1 ? "" : "s"} appear only in legacy registration data without course-level detail: ${registrationOnlyTerms
            .map((item) => formatTermLabel(item.term, item.year))
            .join("; ")}.`;
    }
    else if (academics.courseRecords.length > 0) {
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
async function getHistoricalSummary(loader) {
    if (loader.historicalSummaryPromise == null) {
        loader.historicalSummaryPromise = Promise.all([
            getAcademics(loader),
            getRegistrationTerms(loader),
        ]).then(([academics, registrationTerms]) => buildHistoricalAcademicRecordSummary(academics, registrationTerms));
    }
    return loader.historicalSummaryPromise;
}
function formatHistoricalCourseEntry(record) {
    const details = [
        formatCourseLabel(record),
        `status: ${record.status}`,
        `source: ${sourceLabel(record.source)}`,
    ];
    if (record.grade?.trim()) {
        details.push(`grade: ${record.grade.trim()}`);
    }
    if (record.credits != null) {
        details.push(`credits: ${record.credits}`);
    }
    return details.join(" | ");
}
function formatCourseStatusRecord(record) {
    const details = [`${formatTermLabel(record.term, record.year)}`, `status: ${record.status}`];
    if (record.grade?.trim()) {
        details.push(`grade: ${record.grade.trim()}`);
    }
    details.push(`source: ${sourceLabel(record.source)}`);
    return details.join(", ");
}
function getCurrentTermCourseRecords(academics) {
    const currentTerm = academics.currentTerm;
    if (currentTerm == null)
        return [];
    const sameTerm = academics.courseRecords.filter((record) => record.year === currentTerm.year && termsMatch(record.term, currentTerm.term));
    const activePortal = sameTerm.filter((record) => record.source === "portal" && record.status === "active");
    if (activePortal.length > 0) {
        return activePortal;
    }
    return sameTerm.filter((record) => record.status === "active");
}
export async function getCurrentTermCourses(studentId) {
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
export async function getCurrentTermCourseCount(studentId) {
    const courses = await getCurrentTermCourses(studentId.trim());
    return courses.length;
}
export async function getRegisteredTerms(studentId) {
    const academics = await getStudentAcademicsPayload(studentId.trim());
    const registrationTerms = await listLegacyRegistrationTermsForStudent(pool, studentId.trim());
    return buildHistoricalAcademicRecordSummary(academics, registrationTerms).knownTerms;
}
export async function getRegisteredTermCount(studentId) {
    const terms = await getRegisteredTerms(studentId.trim());
    return terms.length;
}
export async function hasRegistrationInYear(studentId, year) {
    const terms = await getRegisteredTerms(studentId.trim());
    return terms.some((item) => item.year === year);
}
export async function getCurrentTermCredits(studentId) {
    const courses = await getCurrentTermCourses(studentId.trim());
    return sumCredits(courses);
}
export async function hasCompletedCourse(studentId, courseCode) {
    const academics = await getStudentAcademicsPayload(studentId.trim());
    const wanted = normalizeCourseCode(courseCode);
    return academics.courseRecords.some((record) => record.source === "marks" &&
        record.status === "completed" &&
        normalizeCourseCode(record.courseCode) === wanted);
}
export async function getWithdrawalHistory(studentId) {
    const academics = await getStudentAcademicsPayload(studentId.trim());
    const seen = new Set();
    const history = academics.courseRecords.filter((record) => record.status === "withdrawn");
    return history.filter((record) => {
        const key = [
            normalizeCourseCode(record.courseCode),
            record.term.trim().toLowerCase(),
            String(record.year),
            record.source,
        ].join("|");
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function buildCurrentTermCoursesAnswer(question, academics, records) {
    const currentTerm = academics.currentTerm;
    if (currentTerm == null) {
        return {
            result: {
                question,
                answer: "I don't have enough information from your records to confirm your current-term courses.",
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
function buildCurrentTermCourseCountAnswer(question, academics, records) {
    const currentTerm = academics.currentTerm;
    if (currentTerm == null) {
        return {
            result: {
                question,
                answer: "I don't have enough information from your records to confirm your current-term course count.",
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
function buildCurrentTermCreditsAnswer(question, academics, records) {
    const currentTerm = academics.currentTerm;
    if (currentTerm == null) {
        return {
            result: {
                question,
                answer: "I don't have enough information from your records to confirm your current credit load.",
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
                answer: `I found ${records.length} active current-term course${records.length === 1 ? "" : "s"} in ${formatTermLabel(currentTerm.term, currentTerm.year)}, but I don't have enough information from your records to confirm the exact credit total.`,
                sources: [],
            },
            usedHelpers: ["getCurrentTermCredits"],
        };
    }
    ;
    return {
        result: {
            question,
            answer: `You are currently taking ${credits} credit${credits === 1 ? "" : "s"} in ${formatTermLabel(currentTerm.term, currentTerm.year)}.`,
            sources: [],
        },
        usedHelpers: ["getCurrentTermCredits"],
    };
}
function buildRegisteredTermCountAnswer(question, summary) {
    if (summary.knownTerms.length === 0) {
        return {
            result: {
                question,
                answer: "I do not have enough historical academic or registration data to confirm your term history.",
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
            answer: summary.coverage === "full"
                ? base
                : `${base} Academic history coverage is partial, so I cannot confirm whether this is your full lifetime term count.`,
            sources: [],
        },
        usedHelpers: ["getRegisteredTerms", "getRegisteredTermCount"],
    };
}
function buildRegistrationInYearAnswer(question, year, summary) {
    const matchingTerms = summary.knownTerms.filter((term) => term.year === year);
    if (matchingTerms.length === 0) {
        return {
            result: {
                question,
                answer: summary.coverage === "full"
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
            answer: summary.coverage === "full"
                ? `Yes. I found verified academic or registration term records for ${year}: ${labels}.`
                : `Yes. I found term records for ${year}: ${labels}. Academic history coverage is partial, so there may be additional historical detail outside the currently available records.`,
            sources: [],
        },
        usedHelpers: ["getRegisteredTerms", "hasRegistrationInYear"],
    };
}
function buildCoursesInYearAnswer(question, year, summary) {
    const matchingTerms = summary.terms.filter((term) => term.year === year);
    const registrationOnlyTerms = summary.registrationOnlyTerms.filter((term) => term.year === year);
    if (matchingTerms.length === 0) {
        if (registrationOnlyTerms.length > 0 || summary.coverage === "partial") {
            const partialNote = registrationOnlyTerms.length > 0
                ? ` I found registration-only term records for ${year}: ${registrationOnlyTerms
                    .map((term) => formatTermLabel(term.term, term.year))
                    .join("; ")}.`
                : "";
            return {
                result: {
                    question,
                    answer: `I cannot confirm the full list of courses you took in ${year} from the available records because academic history coverage is partial.${partialNote}`,
                    sources: [],
                },
                usedHelpers: ["getStudentAcademicsPayload", "getRegisteredTerms"],
            };
        }
        return {
            result: {
                question,
                answer: `I did not find any course-level academic records for ${year}.`,
                sources: [],
            },
            usedHelpers: ["getStudentAcademicsPayload"],
        };
    }
    const details = matchingTerms
        .map((term) => `${term.label}: ${term.courses.map((record) => formatHistoricalCourseEntry(record)).join("; ")}`)
        .join(" | ");
    const extraNote = registrationOnlyTerms.length > 0
        ? ` I also found registration-only term records without course detail: ${registrationOnlyTerms
            .map((term) => formatTermLabel(term.term, term.year))
            .join("; ")}.`
        : "";
    return {
        result: {
            question,
            answer: `Here is the course-level history I found for ${year}: ${details}.${summary.coverage === "partial" ? " Academic history coverage is partial, so there may be additional records not shown." : ""}${extraNote}`,
            sources: [],
        },
        usedHelpers: ["getStudentAcademicsPayload", "getRegisteredTerms"],
    };
}
function buildWithdrawalHistoryAnswer(question, history) {
    if (history.length === 0) {
        return {
            result: {
                question,
                answer: "I did not find any explicit withdrawal records in your available academic history.",
                sources: [],
            },
            usedHelpers: ["getWithdrawalHistory"],
        };
    }
    const items = history
        .slice(0, 8)
        .map((record) => `${formatCourseLabel(record)} in ${formatTermLabel(record.term, record.year)}`)
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
function buildCompletedCourseAnswer(question, courseCode, academics, coverage) {
    const wanted = normalizeCourseCode(courseCode);
    const matches = academics.courseRecords.filter((record) => record.source === "marks" &&
        record.status === "completed" &&
        normalizeCourseCode(record.courseCode) === wanted);
    if (matches.length === 0) {
        return {
            result: {
                question,
                answer: coverage === "full"
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
function buildTookCourseAnswer(question, courseCode, academics, coverage) {
    const wanted = normalizeCourseCode(courseCode);
    const matches = academics.courseRecords.filter((record) => normalizeCourseCode(record.courseCode) === wanted);
    if (matches.length === 0) {
        return {
            result: {
                question,
                answer: coverage === "full"
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
function buildCompletedCreditsTotalAnswer(question) {
    return {
        result: {
            question,
            answer: "I can calculate your current-term credit load exactly, but I am not returning an all-time completed-credit total here because that would require additional earned-credit rules for repeats and credit counting that are not yet defined in this endpoint.",
            sources: [],
        },
        usedHelpers: [],
    };
}
export async function answerDeterministicStudentRecordQuestion(studentId, question) {
    const match = detectStudentRecordQuestion(question);
    if (match == null)
        return null;
    const loader = createLoader(studentId);
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
        case "courses_in_year": {
            const summary = await getHistoricalSummary(loader);
            return buildCoursesInYearAnswer(question, match.year, summary);
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
            return buildCompletedCourseAnswer(question, match.courseCode, academics, summary.coverage);
        }
        case "completed_credits_total":
            return buildCompletedCreditsTotalAnswer(question);
        default:
            return null;
    }
}
function buildCurrentTermFacts(academics) {
    const lines = [];
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
        lines.push(`- Current courses: ${currentRecords.map((record) => formatCourseLabel(record)).join("; ")}`);
    }
    return lines;
}
function buildWithdrawalFacts(history) {
    if (history.length === 0) {
        return ["- Withdrawal records: None found"];
    }
    return [
        `- Withdrawal records found: ${history.length}`,
        `- Withdrawal details: ${history
            .slice(0, 8)
            .map((record) => `${formatCourseLabel(record)} in ${formatTermLabel(record.term, record.year)}`)
            .join("; ")}`,
    ];
}
function buildHistoricalAcademicRecordFacts(summary) {
    const lines = [
        `- Academic history coverage: ${summary.coverage}`,
        `- Academic history coverage note: ${summary.coverageNote}`,
        `- Historical academic terms found: ${summary.academicTerms.length}`,
    ];
    if (summary.knownTerms.length > 0) {
        lines.push(`- Historical term list: ${summary.knownTerms
            .map((term) => formatTermLabel(term.term, term.year))
            .join("; ")}`);
    }
    else {
        lines.push("- Historical term list: None found");
    }
    lines.push(`- Legacy registration terms found: ${summary.registrationTerms.length}`);
    if (summary.registrationOnlyTerms.length > 0) {
        lines.push(`- Registration-only terms without course detail: ${summary.registrationOnlyTerms
            .map((term) => formatTermLabel(term.term, term.year))
            .join("; ")}`);
    }
    lines.push("- Historical academic record:");
    if (summary.terms.length === 0) {
        lines.push("  - No course-level academic history found");
    }
    else {
        for (const term of summary.terms) {
            lines.push(`  - ${term.label}`);
            for (const record of term.courses) {
                lines.push(`    - ${formatHistoricalCourseEntry(record)}`);
            }
        }
    }
    return lines;
}
function buildCompletedCourseFacts(courseCode, academics, coverage) {
    const wanted = normalizeCourseCode(courseCode);
    const matches = academics.courseRecords.filter((record) => record.source === "marks" &&
        record.status === "completed" &&
        normalizeCourseCode(record.courseCode) === wanted);
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
function needsCurrentTermFacts(question) {
    return /\b(current|this term|now|currently|apply to me|pay attention|record)\b/i.test(question);
}
function needsWithdrawalFacts(question) {
    return /\b(withdraw|withdrawal)\b/i.test(question);
}
function needsRegisteredTermFacts(question) {
    return /\b(register|registered|enroll|enrolled)\b/i.test(question);
}
function buildCoursesInYearFacts(year, summary) {
    const matchingTerms = summary.terms.filter((term) => term.year === year);
    const registrationOnlyTerms = summary.registrationOnlyTerms.filter((term) => term.year === year);
    if (matchingTerms.length === 0) {
        if (registrationOnlyTerms.length > 0) {
            return [
                `- Courses in ${year}: Registration-only term records found without course detail: ${registrationOnlyTerms
                    .map((term) => formatTermLabel(term.term, term.year))
                    .join("; ")}`,
            ];
        }
        return [
            summary.coverage === "full"
                ? `- Courses in ${year}: No course-level academic records found`
                : `- Courses in ${year}: Cannot confirm from the available records because academic history coverage is partial`,
        ];
    }
    return [
        `- Courses in ${year}: ${matchingTerms
            .map((term) => `${term.label}: ${term.courses
            .map((record) => formatHistoricalCourseEntry(record))
            .join("; ")}`)
            .join(" | ")}`,
    ];
}
function buildTookCourseFacts(courseCode, academics, coverage) {
    const wanted = normalizeCourseCode(courseCode);
    const matches = academics.courseRecords.filter((record) => normalizeCourseCode(record.courseCode) === wanted);
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
function pushUnique(lines, newLines) {
    for (const line of newLines) {
        if (!lines.includes(line))
            lines.push(line);
    }
}
export async function buildStudentRecordFactsForQuestion(studentId, question) {
    const loader = createLoader(studentId);
    const lines = ["Student Record Facts"];
    const usedHelpers = new Set();
    const recordMatch = detectStudentRecordQuestion(question);
    const courseCode = extractCourseCode(question);
    const historySummary = await getHistoricalSummary(loader);
    pushUnique(lines, buildHistoricalAcademicRecordFacts(historySummary));
    usedHelpers.add("getStudentAcademicsPayload");
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
                lines.push(`- Historical term count answer basis: ${historySummary.knownTerms.length} known term${historySummary.knownTerms.length === 1 ? "" : "s"} in the available academic history`);
                usedHelpers.add("getRegisteredTerms");
                break;
            }
            case "courses_in_year": {
                pushUnique(lines, buildCoursesInYearFacts(recordMatch.year, historySummary));
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
                pushUnique(lines, buildTookCourseFacts(recordMatch.courseCode, academics, historySummary.coverage));
                usedHelpers.add("getStudentAcademicsPayload");
                break;
            }
            case "completed_course": {
                const academics = await getAcademics(loader);
                pushUnique(lines, buildCompletedCourseFacts(recordMatch.courseCode, academics, historySummary.coverage));
                usedHelpers.add("hasCompletedCourse");
                break;
            }
            case "completed_credits_total":
                lines.push("- All-time completed credits are intentionally not computed here because repeat-course credit rules are not yet defined for this endpoint.");
                break;
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
        lines.push(`- Historical term count answer basis: ${historySummary.knownTerms.length} known term${historySummary.knownTerms.length === 1 ? "" : "s"} in the available academic history`);
        usedHelpers.add("getRegisteredTerms");
    }
    if (courseCode != null && /\b(can i take|prereq|prerequisite|completed)\b/i.test(question)) {
        const academics = await getAcademics(loader);
        pushUnique(lines, buildCompletedCourseFacts(courseCode, academics, historySummary.coverage));
        usedHelpers.add("hasCompletedCourse");
    }
    return {
        contextText: lines.join("\n"),
        usedHelpers: [...usedHelpers],
    };
}
//# sourceMappingURL=studentRecordAiService.js.map