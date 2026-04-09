import { COURSE_FEEDBACK_CSV_QUESTION_RATING_HEADERS } from "../constants/courseFeedbackCsvColumns.js";
import { pool } from "../lib/db.js";
import { mapCourseFeedbackByStudentForCourseTermYear } from "../repositories/courseFeedbackRepository.js";
import { getCourseSectionById } from "../repositories/courseSectionRepository.js";
import { listAdminEnrollmentRowsForSection } from "../repositories/studentEnrollmentRepository.js";
import { mapLegacyStudentProfileExportRowsById } from "../repositories/studentLegacyAccountRepository.js";
/**
 * Portal registrations are stored in `portal_enrollments` at **course + calendar term + year** only.
 * There is no `course_sections.id` (or section_code) on enrollment rows. The admin UI therefore shows
 * the same enrolled roster on every scheduled section row for that course in the term; this export
 * uses the same student list as GET /api/admin/course-sections/enrollments for that course/term/year.
 * The requested `sectionId` is used to resolve course_code / term / year / section metadata for the
 * filename and to anchor the admin action to a concrete timetable row.
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
function sanitizeFilenamePart(raw) {
    const t = raw.trim();
    if (t === "")
        return "unknown";
    return t.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}
function buildAttachmentFilename(args) {
    const course = sanitizeFilenamePart(args.courseCode);
    const section = sanitizeFilenamePart(args.sectionCode);
    const term = sanitizeFilenamePart(args.term);
    const year = sanitizeFilenamePart(String(Math.trunc(args.year)));
    return `registered-students-${course}-${section}-${term}-${year}.csv`;
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
export async function buildRegisteredStudentsCsvForSection(sectionId) {
    const section = await getCourseSectionById(sectionId);
    if (!section) {
        return { ok: false, kind: "section_not_found" };
    }
    const courseCode = section.course_code.trim();
    const term = section.term.trim();
    const year = section.year;
    const enrollments = await listAdminEnrollmentRowsForSection(courseCode, term, year);
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
    lines.push(CSV_HEADERS.map((h) => csvEscapeCell(h)).join(","));
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
    }
    const filename = buildAttachmentFilename({
        courseCode: section.course_code,
        sectionCode: section.section_code,
        term: section.term,
        year: section.year,
    });
    return {
        ok: true,
        filename,
        csvBody: lines.join("\r\n"),
    };
}
//# sourceMappingURL=adminExportRegisteredStudentsCsvService.js.map