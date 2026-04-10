import { pool } from "../lib/db.js";
import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import { upsertMarkGrade } from "../repositories/adminMarksRepository.js";
/** Same letter → numeric mapping as admin roster UI; server is source of truth for `grade2`. */
const GRADE_TO_NUMERIC = {
    A: 4,
    "A-": 3.75,
    "B+": 3.5,
    B: 3,
    "B-": 2.75,
    "C+": 2.5,
    C: 2,
    "C-": 1.75,
    D: 1,
    F: 0,
    P: null,
    NP: null,
    INC: null,
};
async function assertEnrollmentAllowsMarkGrade(db, studentId, courseCode, legacyTerm, year) {
    const sid = studentId.trim();
    const code = courseCode.trim();
    const term = legacyTerm.trim();
    const [rows] = await db.query(`SELECT 1 AS ok
     FROM portal_enrollments e
     INNER JOIN portal_courses pc ON pc.course_id = e.course_id
     WHERE TRIM(e.student_external_id) = TRIM(?)
       AND TRIM(pc.course_code) = TRIM(?)
       AND TRIM(e.term) = TRIM(?)
       AND e.year = ?
       AND (e.status IS NULL OR LOWER(TRIM(e.status)) = 'active')
     LIMIT 1`, [sid, code, term, year]);
    if (rows.length === 0) {
        return {
            ok: false,
            error: "Student has no active portal enrollment in this course for this term.",
        };
    }
    return { ok: true };
}
export async function setAdminStudentMarkGrade(input) {
    const studentId = input.studentId.trim();
    const courseCode = input.courseCode.trim();
    const academicTermId = input.academicTermId.trim();
    const grade = input.grade.trim();
    if (studentId === "" || courseCode === "" || academicTermId === "") {
        return { ok: false, status: 400, error: "Missing studentId, courseCode, or term." };
    }
    if (grade === "") {
        return { ok: false, status: 400, error: "Grade is required." };
    }
    if (!(grade in GRADE_TO_NUMERIC)) {
        return { ok: false, status: 400, error: "Invalid grade." };
    }
    const termRow = await getAcademicTermById(academicTermId);
    if (!termRow) {
        return {
            ok: false,
            status: 400,
            error: "The selected academic term is not valid or no longer exists.",
        };
    }
    const gate = await assertEnrollmentAllowsMarkGrade(pool, studentId, courseCode, termRow.term_name, termRow.year);
    if (!gate.ok) {
        return { ok: false, status: 400, error: gate.error };
    }
    const grade2Numeric = GRADE_TO_NUMERIC[grade] ?? null;
    try {
        await upsertMarkGrade(pool, {
            studentId,
            courseCode,
            legacyTerm: termRow.term_name,
            year: termRow.year,
            grade,
            grade2Numeric,
        });
    }
    catch (e) {
        const o = e;
        const dbOrMsg = o?.sqlMessage ?? (e instanceof Error ? e.message : String(e));
        console.error("[admin-marks] upsertMarkGrade failed (see staged logs above if DB):", dbOrMsg);
        return {
            ok: false,
            status: 500,
            error: "Failed to save grade.",
        };
    }
    return { ok: true };
}
//# sourceMappingURL=adminMarksService.js.map