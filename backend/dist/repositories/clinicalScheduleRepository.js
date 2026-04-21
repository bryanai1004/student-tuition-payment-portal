import { pool } from "../lib/db.js";
function coerceMysqlTime(v) {
    if (v instanceof Date) {
        const h = v.getUTCHours();
        const m = v.getUTCMinutes();
        const sec = v.getUTCSeconds();
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    }
    const s = String(v ?? "");
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
    if (m) {
        return `${m[1].padStart(2, "0")}:${m[2]}:${(m[3] ?? "00").padStart(2, "0")}`;
    }
    return s;
}
function mapRow(r) {
    const row = r;
    const sd = row.session_date;
    let sessionDateStr;
    if (sd instanceof Date) {
        sessionDateStr = sd.toISOString().slice(0, 10);
    }
    else if (typeof sd === "string") {
        sessionDateStr = sd.slice(0, 10);
    }
    else {
        sessionDateStr = String(sd ?? "");
    }
    const ca = row.created_at;
    const createdAt = ca instanceof Date ? ca : new Date(String(ca ?? ""));
    const tid = row.timetable_id;
    const caTerm = row.ca_term;
    const caYear = row.ca_year;
    return {
        id: Number(row.id),
        student_id: String(row.student_id ?? "").trim(),
        course_code: String(row.course_code ?? "").trim(),
        session_date: sessionDateStr,
        session_name: row.session_name == null
            ? null
            : String(row.session_name).trim() || null,
        site: row.site == null ? null : String(row.site).trim() || null,
        faculty: row.faculty == null ? null : String(row.faculty).trim() || null,
        status: String(row.status ?? "Scheduled").trim() || "Scheduled",
        created_at: createdAt,
        timetable_id: tid == null || tid === ""
            ? null
            : Number(tid),
        ca_term: caTerm == null || caTerm === ""
            ? null
            : String(caTerm).trim() || null,
        ca_year: caYear == null || caYear === "" || Number.isNaN(Number(caYear))
            ? null
            : Number(caYear),
        tt_day: row.tt_day == null || row.tt_day === ""
            ? null
            : String(row.tt_day).trim() || null,
        tt_time_from: row.tt_time_from == null || row.tt_time_from === ""
            ? null
            : coerceMysqlTime(row.tt_time_from),
        tt_time_to: row.tt_time_to == null || row.tt_time_to === ""
            ? null
            : coerceMysqlTime(row.tt_time_to),
        tt_slot: row.tt_slot == null || row.tt_slot === ""
            ? null
            : String(row.tt_slot).trim() || null,
        tt_instructor: row.tt_instructor == null || row.tt_instructor === ""
            ? null
            : String(row.tt_instructor).trim() || null,
        tt_term: row.tt_term == null || row.tt_term === ""
            ? null
            : String(row.tt_term).trim() || null,
        tt_year: row.tt_year == null || row.tt_year === ""
            ? null
            : Number(row.tt_year),
    };
}
export async function listStudentClinicalAssignments(studentId) {
    const sid = studentId.trim();
    const [rows] = await pool.query(`SELECT ca.id, ca.student_id, ca.course_code, ca.session_date, ca.session_name,
            ca.site, ca.faculty, ca.status, ca.created_at,
            ca.timetable_id, ca.term AS ca_term, ca.\`year\` AS ca_year,
            ct.day AS tt_day, ct.time_from AS tt_time_from, ct.time_to AS tt_time_to,
            ct.slot AS tt_slot, ct.instructor AS tt_instructor, ct.term AS tt_term, ct.year AS tt_year
       FROM clinical_assignments ca
       LEFT JOIN clinic_timetable ct ON ca.timetable_id = ct.seqNum
      WHERE TRIM(ca.student_id) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
       AND (
         ca.timetable_id IS NULL
         OR EXISTS (
           SELECT 1
             FROM clinical_enrollments ce
            WHERE TRIM(ce.student_id) COLLATE utf8mb4_unicode_ci = TRIM(ca.student_id) COLLATE utf8mb4_unicode_ci
              AND ce.timetable_id = ca.timetable_id
              AND TRIM(ce.term) COLLATE utf8mb4_unicode_ci = TRIM(IFNULL(ca.term, '')) COLLATE utf8mb4_unicode_ci
              AND ce.year = ca.\`year\`
              AND LOWER(TRIM(ce.status)) COLLATE utf8mb4_unicode_ci = 'enrolled' COLLATE utf8mb4_unicode_ci
         )
       )
      ORDER BY COALESCE(ca.\`year\`, YEAR(ca.session_date)) DESC,
               ca.session_date ASC,
               ca.id ASC`, [sid]);
    return rows.map(mapRow);
}
export async function insertClinicalAssignment(payload, connection) {
    const cx = connection ?? pool;
    const status = payload.status != null && String(payload.status).trim() !== ""
        ? String(payload.status).trim()
        : "Scheduled";
    const timetableId = payload.timetableId != null &&
        Number.isFinite(payload.timetableId) &&
        payload.timetableId > 0
        ? Number(payload.timetableId)
        : null;
    const term = payload.assignmentTerm != null &&
        String(payload.assignmentTerm).trim() !== ""
        ? String(payload.assignmentTerm).trim().slice(0, 20)
        : null;
    const year = payload.assignmentYear != null && Number.isFinite(payload.assignmentYear)
        ? Number(payload.assignmentYear)
        : null;
    const [res] = await cx.query(`INSERT INTO clinical_assignments
      (student_id, course_code, session_date, session_name, site, faculty,
       timetable_id, term, \`year\`, status)
     VALUES (TRIM(?), TRIM(?), ?, ?, ?, ?, ?, ?, ?, ?)`, [
        payload.studentId,
        payload.courseCode,
        payload.sessionDate,
        payload.sessionName,
        payload.site,
        payload.faculty,
        timetableId,
        term,
        year,
        status,
    ]);
    return Number(res.insertId);
}
//# sourceMappingURL=clinicalScheduleRepository.js.map