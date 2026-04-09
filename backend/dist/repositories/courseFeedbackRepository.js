function mapFullRow(r) {
    const row = r;
    const sidRaw = row.student_id ?? row.student_external_id;
    return {
        id: Number(row.id),
        student_id: String(sidRaw ?? "").trim(),
        course_code: String(row.course_code ?? "").trim(),
        term: String(row.term ?? "").trim(),
        year: Number(row.year),
        q1_rating: Number(row.q1_rating),
        q2_rating: Number(row.q2_rating),
        q3_rating: Number(row.q3_rating),
        q4_rating: Number(row.q4_rating),
        q5_rating: Number(row.q5_rating),
        overall_rating: Number(row.overall_rating),
        comment: row.comment == null ? null : String(row.comment).trim() || null,
        submitted_at: row.submitted_at instanceof Date
            ? row.submitted_at
            : new Date(String(row.submitted_at)),
    };
}
function mapKeyRow(r) {
    const row = r;
    return {
        course_code: String(row.course_code ?? "").trim(),
        term: String(row.term ?? "").trim(),
        year: Number(row.year),
        submitted_at: row.submitted_at instanceof Date
            ? row.submitted_at
            : new Date(String(row.submitted_at)),
    };
}
export async function createCourseFeedback(pool, input) {
    const [res] = await pool.query(`INSERT INTO course_feedback (
      student_id, course_code, term, year,
      q1_rating, q2_rating, q3_rating, q4_rating, q5_rating,
      overall_rating, comment
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        input.studentExternalId.trim(),
        input.courseCode.trim(),
        input.term.trim(),
        input.year,
        input.q1Rating,
        input.q2Rating,
        input.q3Rating,
        input.q4Rating,
        input.q5Rating,
        input.overallRating,
        input.comment,
    ]);
    return res.insertId;
}
export async function findCourseFeedbackByStudentCourseTerm(pool, args) {
    const [rows] = await pool.query(`SELECT id, student_id, course_code, term, year,
            q1_rating, q2_rating, q3_rating, q4_rating, q5_rating,
            overall_rating, comment, submitted_at
     FROM course_feedback
     WHERE student_id = ?
       AND course_code = ?
       AND term = ?
       AND year = ?
     LIMIT 1`, [
        args.studentExternalId.trim(),
        args.courseCode.trim(),
        args.term.trim(),
        args.year,
    ]);
    if (rows.length === 0)
        return null;
    return mapFullRow(rows[0]);
}
/** For merging feedback flags into GET /academics. */
export async function listCourseFeedbackSubmittedKeysForStudent(pool, studentExternalId) {
    const [rows] = await pool.query(`SELECT course_code, term, year, submitted_at
     FROM course_feedback
     WHERE student_id = ?
     ORDER BY year DESC, submitted_at DESC`, [studentExternalId.trim()]);
    return rows.map(mapKeyRow);
}
/** Integer 1–5 only; anything else becomes null (empty CSV cell). */
export function parseStoredFeedbackRating1to5(raw) {
    if (raw == null)
        return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 5)
        return null;
    return n;
}
/**
 * Batch-load `course_feedback` for many students in one course + term + year.
 * Map key: trimmed `student_id` (legacy login id, same as `portal_enrollments.student_external_id`).
 */
export async function mapCourseFeedbackByStudentForCourseTermYear(pool, args) {
    const code = args.courseCode.trim();
    const term = args.term.trim();
    const year = Math.trunc(args.year);
    const ids = [
        ...new Set(args.studentIds.map((s) => String(s ?? "").trim()).filter((s) => s !== "")),
    ];
    const out = new Map();
    if (ids.length === 0 || code === "" || term === "" || !Number.isFinite(year)) {
        return out;
    }
    const ph = ids.map(() => "?").join(", ");
    const [rows] = await pool.query(`SELECT student_id,
            q1_rating, q2_rating, q3_rating, q4_rating, q5_rating,
            overall_rating, comment
     FROM course_feedback
     WHERE course_code = ?
       AND term = ?
       AND year = ?
       AND student_id IN (${ph})`, [code, term, year, ...ids]);
    for (const r of rows) {
        const sid = String(r.student_id ?? "").trim();
        if (sid === "")
            continue;
        const commentRaw = r.comment;
        const comment = commentRaw == null ? null : String(commentRaw).trim() || null;
        out.set(sid, {
            student_id: sid,
            q1_rating: parseStoredFeedbackRating1to5(r.q1_rating),
            q2_rating: parseStoredFeedbackRating1to5(r.q2_rating),
            q3_rating: parseStoredFeedbackRating1to5(r.q3_rating),
            q4_rating: parseStoredFeedbackRating1to5(r.q4_rating),
            q5_rating: parseStoredFeedbackRating1to5(r.q5_rating),
            overall_rating: parseStoredFeedbackRating1to5(r.overall_rating),
            comment,
        });
    }
    return out;
}
//# sourceMappingURL=courseFeedbackRepository.js.map