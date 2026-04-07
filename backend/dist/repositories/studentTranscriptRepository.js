/**
 * Read models for **transcript title lookup** (`courses`) and **clinic transcript lines** (`clinic`).
 *
 * - `clinic` rows here feed transcript **display** and attempt-shaped mappers — not academic unit totals for degree audit.
 * - Catalog `courses` map supports normalized English titles only; it is not registration or marks.
 */
import { MARKS_ORDER_BY_NEWEST } from "./studentAcademicsRepository.js";
function str(v) {
    if (v == null)
        return "";
    return String(v).trim();
}
function mapClinicRow(r) {
    const row = r;
    const unitsRaw = Number(row.units);
    const hoursRaw = Number(row.hours);
    return {
        name: str(row.name),
        code: str(row.code),
        course_title: str(row.course_title),
        units: Number.isFinite(unitsRaw) ? unitsRaw : 0,
        hours: Number.isFinite(hoursRaw) ? hoursRaw : 0,
        term: str(row.term),
        year: Number(row.year),
        grade: str(row.grade),
        grade2: row.grade2,
    };
}
/**
 * Clinical / practice / portfolio transcript rows from legacy `clinic`.
 */
export async function listClinicRowsForStudent(pool, studentId) {
    const [rows] = await pool.query(`SELECT TRIM(name) AS name,
            TRIM(code) AS code,
            course_title,
            units,
            hours,
            TRIM(term) AS term,
            year,
            grade,
            grade2
     FROM clinic
     WHERE TRIM(id) = TRIM(?)
     ORDER BY ${MARKS_ORDER_BY_NEWEST}`, [studentId]);
    return rows.map(mapClinicRow);
}
/**
 * Map TRIM(course code) → English name and units for transcript title resolution.
 */
export async function loadCoursesTranscriptLookup(pool) {
    const [rows] = await pool.query(`SELECT TRIM(code) AS code,
            eng_name,
            chi_name,
            units
     FROM courses`);
    const map = new Map();
    for (const r of rows) {
        const row = r;
        const code = str(row.code);
        if (code === "")
            continue;
        const unitsRaw = Number(row.units);
        map.set(code, {
            eng_name: str(row.eng_name),
            chi_name: str(row.chi_name),
            units: Number.isFinite(unitsRaw) ? unitsRaw : null,
        });
    }
    return map;
}
//# sourceMappingURL=studentTranscriptRepository.js.map