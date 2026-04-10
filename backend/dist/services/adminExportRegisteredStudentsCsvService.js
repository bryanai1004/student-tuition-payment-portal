import { COURSE_FEEDBACK_CSV_QUESTION_RATING_HEADERS } from "../constants/courseFeedbackCsvColumns.js";
import { env } from "../config/env.js";
import { pool } from "../lib/db.js";
import { mapCourseFeedbackByStudentForCourseTermYear } from "../repositories/courseFeedbackRepository.js";
import { getCourseSectionById } from "../repositories/courseSectionRepository.js";
import { listAdminEnrollmentRowsForSection } from "../repositories/studentEnrollmentRepository.js";
import { mapLegacyStudentProfileExportRowsById } from "../repositories/studentLegacyAccountRepository.js";
/**
 * Portal registrations are section-keyed when `portal_enrollments.course_section_id` is set.
 * This export uses the same filtered roster as GET /api/admin/course-sections/enrollments with
 * `section_id` = the requested `course_sections.id` (plus legacy course-level rows on the canonical
 * MIN(section id) for that course when applicable). The `sectionId` argument resolves course_code /
 * term / year for the filename (`registeredstudent_<code>_<year><termlower>.csv`).
 *
 * Course feedback (`course_feedback`) is keyed by **course_code + term + year only** (not section).
 * There is no section_id on `course_feedback`; the same feedback row applies to every scheduled
 * section of that course in the term. We match enrollments and feedback on that shared key.
 * Columns mirror the stored form: `q1_rating`–`q5_rating`, separately stored `overall_rating`
 * (student “Overall rating” in the modal — not computed in the API), and `comment`.
 *
 * Grades use the same subquery as `listAdminEnrollmentRowsForSection`: latest legacy `marks` row by
 * `seqNumber` for student id + course code + term + year; withdrawn enrollments show `W`.
 */
function divisionFromStudentId(id) {
    const c = id.trim().charAt(0).toUpperCase();
    if (c === "C")
        return "Chinese";
    if (c === "E")
        return "English";
    return "Unknown";
}
/** Course code in download name: trim, strip whitespace, keep A–Z / a–z / 0–9 only (case preserved). */
function courseCodeForRegisteredStudentFilename(raw) {
    const compact = raw.trim().replace(/\s+/g, "");
    if (compact === "")
        return "unknown";
    const safe = compact.replace(/[^a-zA-Z0-9]/g, "");
    return safe !== "" ? safe : "unknown";
}
/** Term in download name: trim, remove spaces, lowercase (filename only). */
function termLowerCompactForFilename(raw) {
    return raw.trim().replace(/\s+/g, "").toLowerCase();
}
/** `registeredstudent_<COURSECODE>_<YEAR><termlower>.csv` (e.g. registeredstudent_AC102_2026fall.csv). */
function buildAttachmentFilename(args) {
    const code = courseCodeForRegisteredStudentFilename(args.courseCode);
    const year = String(Math.trunc(args.year));
    const termPart = termLowerCompactForFilename(args.term);
    const suffix = termPart !== "" ? `${year}${termPart}` : `${year}unknown`;
    return `registeredstudent_${code}_${suffix}.csv`;
}
/** RFC 4180-style escaping; newlines normalized to `\n` inside quoted fields; rows joined with `\r\n`. */
function csvEscapeCell(value) {
    const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (/[",\n]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
}
function cell(v) {
    if (v == null)
        return "";
    return String(v);
}
function ratingCsvCell(n) {
    if (n == null)
        return "";
    return String(n);
}
const CSV_HEADERS = [
    "Student ID",
    "Division",
    "Name",
    "Gender",
    "Email",
    "Program",
    "Highest Degree",
    "Background School",
    ...COURSE_FEEDBACK_CSV_QUESTION_RATING_HEADERS,
    "Overall Feedback Rating",
    "Feedback Comment",
    "Grade",
];
/** Exposed so the HTTP handler can log the same header list that was used to build the CSV. */
export const REGISTERED_STUDENTS_CSV_HEADERS = CSV_HEADERS;
const CSV_FIRST_LINE_MARKER = "Course Content & Organization Rating";
export async function buildRegisteredStudentsCsvForSection(sectionId) {
    const section = await getCourseSectionById(sectionId);
    if (!section) {
        return { ok: false, kind: "section_not_found" };
    }
    const courseCode = section.course_code.trim();
    const term = section.term.trim();
    const year = section.year;
    const enrollments = await listAdminEnrollmentRowsForSection(courseCode, term, year, { courseSectionId: sectionId });
    const studentIds = enrollments
        .map((e) => e.studentId.trim())
        .filter((id) => id !== "");
    const [profiles, feedbackByStudent] = await Promise.all([
        mapLegacyStudentProfileExportRowsById(pool, studentIds),
        mapCourseFeedbackByStudentForCourseTermYear(pool, {
            courseCode,
            term,
            year,
            studentIds,
        }),
    ]);
    const lines = [];
    const headerLine = CSV_HEADERS.map((h) => csvEscapeCell(h)).join(",");
    lines.push(headerLine);
    let firstFlattenedRow;
    for (const row of enrollments) {
        const sid = row.studentId.trim();
        if (sid === "")
            continue;
        const legacy = profiles.get(sid);
        const fb = feedbackByStudent.get(sid);
        const legacyName = legacy?.name ?? "";
        const rosterName = row.name != null ? String(row.name).trim() : "";
        const displayName = legacyName !== ""
            ? legacyName
            : rosterName !== ""
                ? rosterName
                : sid;
        const gradeCell = row.grade != null && String(row.grade).trim() !== ""
            ? String(row.grade).trim()
            : "";
        const commentCell = fb != null && fb.comment != null ? fb.comment : "";
        const qCells = fb == null
            ? ["", "", "", "", ""]
            : [
                ratingCsvCell(fb.q1_rating),
                ratingCsvCell(fb.q2_rating),
                ratingCsvCell(fb.q3_rating),
                ratingCsvCell(fb.q4_rating),
                ratingCsvCell(fb.q5_rating),
            ];
        const overallCell = fb == null ? "" : ratingCsvCell(fb.overall_rating);
        const values = [
            sid,
            divisionFromStudentId(sid),
            displayName,
            cell(legacy?.gender),
            cell(legacy?.email),
            cell(legacy?.program),
            cell(legacy?.highestDegree),
            cell(legacy?.backgroundSchool),
            ...qCells,
            overallCell,
            commentCell,
            gradeCell,
        ];
        lines.push(values.map(csvEscapeCell).join(","));
        if (firstFlattenedRow === undefined) {
            firstFlattenedRow = values;
        }
    }
    const csvBody = lines.join("\r\n");
    if (env.nodeEnv === "development") {
        if (!headerLine.includes(CSV_FIRST_LINE_MARKER)) {
            console.error("[adminExportRegisteredStudentsCsv] CSV header line missing per-question columns (wrong service or stale build?)", { headerLine });
        }
    }
    const filename = buildAttachmentFilename({
        courseCode: section.course_code,
        term: section.term,
        year: section.year,
    });
    return {
        ok: true,
        filename,
        csvBody,
        ...(env.nodeEnv === "development" && firstFlattenedRow !== undefined
            ? {
                devDiagnostic: {
                    headerLabels: CSV_HEADERS,
                    firstFlattenedRow,
                    csvFirstLine: headerLine,
                },
            }
            : {}),
    };
}
//# sourceMappingURL=adminExportRegisteredStudentsCsvService.js.map