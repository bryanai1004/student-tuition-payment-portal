/**
 * Legacy **financial registration** and accounting (`registration`, `accounting`, `students` profile slices).
 *
 * Domain boundary: these queries anchor **billing term** and ledger rows — not academic attempts (`marks`),
 * not portal course registration (`portal_enrollments`), not transcript or degree audit. Do not treat
 * `registration` as authoritative for grades or earned units.
 */
import { createHash } from "node:crypto";
function normalizeTerm(raw) {
    return String(raw ?? "").trim();
}
/**
 * Latest term/year from legacy registration for this student.
 * Order: highest year first, then Fall > Summer > Spring > Winter within the year.
 */
export async function findLatestLegacyTermYear(pool, studentId) {
    const [rows] = await pool.query(`SELECT TRIM(term) AS term, year
     FROM registration
     WHERE id = ?
     ORDER BY year DESC,
       CASE UPPER(TRIM(term))
         WHEN 'FALL' THEN 4
         WHEN 'SUMMER' THEN 3
         WHEN 'SPRING' THEN 2
         WHEN 'WINTER' THEN 1
         ELSE 0
       END DESC
     LIMIT 1`, [studentId]);
    if (rows.length === 0) {
        return null;
    }
    const r = rows[0];
    return { term: normalizeTerm(r.term), year: Number(r.year) };
}
/**
 * Distinct term/year pairs from legacy `registration` for this student.
 * Newest first: year DESC, then Fall > Summer > Spring > Winter within the year.
 */
export async function listLegacyRegistrationTermsForStudent(pool, studentId) {
    const [rows] = await pool.query(`SELECT DISTINCT TRIM(term) AS term, year
     FROM registration
     WHERE id = ?
     ORDER BY year DESC,
       CASE UPPER(TRIM(term))
         WHEN 'FALL' THEN 4
         WHEN 'SUMMER' THEN 3
         WHEN 'SPRING' THEN 2
         WHEN 'WINTER' THEN 1
         ELSE 0
       END DESC`, [studentId]);
    return rows.map((r) => ({
        term: normalizeTerm(r.term),
        year: Number(r.year),
    }));
}
/**
 * Load display name from `students` and financial snapshot from `registration` for one term.
 */
export async function loadLegacyAccountSnapshot(pool, studentId, term, year) {
    const [[studentRow]] = await pool.query(`SELECT TRIM(name) AS name FROM students WHERE id = ? LIMIT 1`, [studentId]);
    const [regRows] = await pool.query(`SELECT TRIM(term) AS term, year, total_fees AS totalFees
     FROM registration
     WHERE id = ?
       AND LOWER(TRIM(term)) = LOWER(TRIM(?))
       AND year = ?
     ORDER BY date DESC
     LIMIT 1`, [studentId, term, year]);
    if (regRows.length === 0) {
        return null;
    }
    const reg = regRows[0];
    const regTerm = normalizeTerm(reg.term);
    const regYear = Number(reg.year);
    const rawName = studentRow?.name != null && String(studentRow.name).trim() !== ""
        ? String(studentRow.name).trim()
        : "";
    const displayName = rawName || studentId;
    const totalFees = Number(reg.totalFees);
    const fees = Number.isFinite(totalFees) ? totalFees : 0;
    return {
        studentId,
        displayName,
        term: regTerm,
        year: regYear,
        totalFees: fees,
    };
}
function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}
/**
 * List quarters (calendar year + term) that have at least one `accounting` row for this student.
 * Newest first: year DESC, then Fall > Summer > Spring > Winter within the year.
 */
export async function listLegacyAccountingQuarters(pool, studentId) {
    // Inner query: GROUP BY only (MySQL ONLY_FULL_GROUP_BY rejects ORDER BY on raw `term`
    // in the same SELECT as GROUP BY). Outer query orders by normalized `q.term`.
    const [rows] = await pool.query(`SELECT q.term, q.year
     FROM (
       SELECT TRIM(term) AS term, year
       FROM accounting
       WHERE id = ?
       GROUP BY TRIM(term), year
     ) AS q
     ORDER BY q.year DESC,
       CASE UPPER(q.term)
         WHEN 'FALL' THEN 4
         WHEN 'SUMMER' THEN 3
         WHEN 'SPRING' THEN 2
         WHEN 'WINTER' THEN 1
         ELSE 0
       END DESC`, [studentId]);
    return rows.map((r) => ({
        term: normalizeTerm(r.term),
        year: Math.trunc(num(r.year)),
    }));
}
/**
 * Load one legacy `students` row by primary key `id` (e.g. C17310).
 */
export async function loadLegacyStudentProfileRow(pool, studentId) {
    const [rows] = await pool.query(`SELECT
       id,
       name,
       gender,
       dob,
       signed_date,
       EnrollStartDate,
       background,
       admission_credits,
       tertiary,
       race,
       address,
       address2,
       city,
       state,
       zip,
       email,
       requirements_id
     FROM students
     WHERE id = ?
     LIMIT 1`, [studentId]);
    if (rows.length === 0) {
        return null;
    }
    return rows[0];
}
function strCell(v) {
    if (v == null)
        return null;
    const s = String(v).trim();
    return s === "" ? null : s;
}
/**
 * Batch-load legacy `students` rows for CSV export (same source as admin profile).
 */
export async function mapLegacyStudentProfileExportRowsById(pool, studentIds) {
    const ids = [
        ...new Set(studentIds.map((s) => String(s ?? "").trim()).filter((s) => s !== "")),
    ];
    const out = new Map();
    if (ids.length === 0)
        return out;
    const ph = ids.map(() => "?").join(", ");
    const [rows] = await pool.query(`SELECT
       TRIM(id) AS id,
       name,
       gender,
       email,
       requirements_id,
       tertiary,
       background
     FROM students
     WHERE TRIM(id) IN (${ph})`, ids);
    for (const r of rows) {
        const id = strCell(r.id);
        if (id == null)
            continue;
        const name = strCell(r.name);
        const gender = strCell(r.gender);
        const email = strCell(r.email);
        const req = strCell(r.requirements_id);
        const tertiary = strCell(r.tertiary);
        const bg = strCell(r.background);
        out.set(id, {
            id,
            name,
            gender,
            email,
            program: req,
            highestDegree: tertiary,
            backgroundSchool: bg,
        });
    }
    return out;
}
export async function loadLegacyAccountingRows(pool, studentId, term, year) {
    const [rows] = await pool.query(`SELECT seqNumber, year, TRIM(term) AS term, date, type, code, debit, credit, memo
     FROM accounting
     WHERE id = ?
       AND LOWER(TRIM(term)) = LOWER(TRIM(?))
       AND year = ?
     ORDER BY date ASC, seqNumber ASC`, [studentId, term, year]);
    return rows.map((r) => ({
        seqNumber: num(r.seqNumber),
        year: num(r.year),
        term: normalizeTerm(r.term),
        date: Math.trunc(num(r.date)),
        type: String(r.type ?? "").trim(),
        code: String(r.code ?? "").trim(),
        debit: num(r.debit),
        credit: num(r.credit),
        memo: String(r.memo ?? "").trim(),
    }));
}
/**
 * Per-student net balance from legacy `accounting` for one quarter:
 * `SUM(debit - credit)` (same sign convention as the finance ledger).
 */
export async function sumLegacyAccountingBalanceByStudentForQuarter(pool, term, year) {
    const t = term.trim();
    const y = Math.trunc(year);
    const [rows] = await pool.query(`SELECT TRIM(id) AS studentId,
            COALESCE(SUM(debit - credit), 0) AS balance
     FROM accounting
     WHERE LOWER(TRIM(term)) = LOWER(TRIM(?))
       AND CAST(year AS SIGNED) = ?
     GROUP BY TRIM(id)`, [t, y]);
    const out = new Map();
    for (const r of rows) {
        const id = String(r.studentId ?? "").trim();
        if (id === "")
            continue;
        out.set(id, num(r.balance));
    }
    return out;
}
/** Latest registration row per student (same ordering as `findLatestLegacyTermYear`). */
const ADMIN_STUDENT_LIST_LATEST_REG_JOIN = `LEFT JOIN (
       SELECT
         id,
         TRIM(term) AS term,
         year,
         ROW_NUMBER() OVER (
           PARTITION BY id
           ORDER BY year DESC,
             CASE UPPER(TRIM(term))
               WHEN 'FALL' THEN 4
               WHEN 'SUMMER' THEN 3
               WHEN 'SPRING' THEN 2
               WHEN 'WINTER' THEN 1
               ELSE 0
             END DESC
         ) AS rn
       FROM registration
     ) lr ON lr.id = s.id AND lr.rn = 1`;
/** Escape `%`, `_`, and `\\` for use in a MySQL `LIKE` pattern with `ESCAPE '\\\\'`. */
function escapeMysqlLikePattern(fragment) {
    return fragment
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
}
function buildAdminStudentListSearch(searchTrimmed) {
    if (searchTrimmed === "") {
        return { clause: "", params: [] };
    }
    const like = `%${escapeMysqlLikePattern(searchTrimmed.toLowerCase())}%`;
    return {
        clause: ` WHERE (
       LOWER(TRIM(s.id)) LIKE ? ESCAPE '\\\\'
       OR LOWER(COALESCE(s.name, '')) LIKE ? ESCAPE '\\\\'
       OR LOWER(COALESCE(s.email, '')) LIKE ? ESCAPE '\\\\'
       OR LOWER(TRIM(CAST(IFNULL(s.requirements_id, '') AS CHAR))) LIKE ? ESCAPE '\\\\'
     )`,
        params: [like, like, like, like],
    };
}
/**
 * Count of students matching the admin roster search (before pagination).
 */
export async function countLegacyAdminStudentListRows(pool, query) {
    const { clause, params } = buildAdminStudentListSearch(query.search.trim());
    const [rows] = await pool.query(`SELECT COUNT(*) AS cnt
     FROM students s
     ${ADMIN_STUDENT_LIST_LATEST_REG_JOIN}
     ${clause}`, params);
    const row = rows[0];
    if (row == null)
        return 0;
    const n = Number(row.cnt);
    return Number.isFinite(n) ? n : 0;
}
/**
 * One page of legacy `students` rows with latest registration term/year (admin roster).
 * Search is applied in SQL before `LIMIT` / `OFFSET`.
 */
export async function listLegacyAdminStudentListRowsPage(pool, query) {
    const { clause, params } = buildAdminStudentListSearch(query.search.trim());
    const limit = Math.max(0, Math.trunc(query.limit));
    const offset = Math.max(0, Math.trunc(query.offset));
    const [rows] = await pool.query(`SELECT
       TRIM(s.id) AS id,
       s.name,
       s.email,
       s.background,
       s.requirements_id,
       s.tertiary,
       s.signed_date,
       s.EnrollStartDate AS enroll_start_date,
       lr.term AS latest_term,
       lr.year AS latest_year
     FROM students s
     ${ADMIN_STUDENT_LIST_LATEST_REG_JOIN}
     ${clause}
     ORDER BY s.name ASC, s.id ASC
     LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return rows;
}
/**
 * Update safe legacy `students` master columns only. Returns whether a row was updated.
 * Date strings must already be validated SQL `YYYY-MM-DD` or `0000-00-00` for NOT NULL legacy columns.
 */
export async function updateLegacyStudentMasterRow(pool, studentId, patch) {
    const [result] = await pool.execute(`UPDATE students SET
       name = ?,
       email = ?,
       gender = ?,
       background = ?,
       tertiary = ?,
       requirements_id = ?,
       address = ?,
       address2 = ?,
       city = ?,
       state = ?,
       zip = ?,
       signed_date = ?,
       EnrollStartDate = ?
     WHERE id = ?`, [
        patch.name,
        patch.email,
        patch.gender,
        patch.background,
        patch.tertiary,
        patch.requirements_id,
        patch.address,
        patch.address2,
        patch.city,
        patch.state,
        patch.zip,
        patch.signed_date_sql,
        patch.enroll_start_sql,
        studentId,
    ]);
    const header = result;
    return (header.affectedRows ?? 0) > 0;
}
/**
 * Legacy id: [C|E][YY][M][NN] — month M is 1–12 without leading zero; NN is 2-digit sequence in that bucket.
 * Parses sequence as the last two characters; month is the substring between YY and NN.
 */
function parseSequenceFromLegacyStudentId(id, head, expectedMonthStr) {
    const trimmed = id.trim();
    if (trimmed.length < head.length + 3)
        return null;
    if (!trimmed.toUpperCase().startsWith(head.toUpperCase()))
        return null;
    const rest = trimmed.slice(head.length);
    if (rest.length < 3)
        return null;
    const seqStr = rest.slice(-2);
    const monthStr = rest.slice(0, -2);
    if (monthStr !== expectedMonthStr)
        return null;
    const month = Number.parseInt(monthStr, 10);
    const seq = Number.parseInt(seqStr, 10);
    if (!Number.isFinite(month) || month < 1 || month > 12)
        return null;
    if (!Number.isFinite(seq) || seq < 1 || seq > 99)
        return null;
    if (String(month) !== monthStr)
        return null;
    return seq;
}
/**
 * Next student id in a division + calendar year + month bucket.
 * Query uses `LIKE 'C174%'` (prefix + YY + month); empty bucket starts at ...01.
 */
export async function getNextLegacyStudentId(pool, division, entryYear, entryMonth) {
    const letter = division === "Chinese" ? "C" : "E";
    const y = Math.trunc(entryYear);
    const m = Math.trunc(entryMonth);
    if (m < 1 || m > 12) {
        throw new Error("Entry month must be between 1 and 12.");
    }
    const year2 = String(((y % 100) + 100) % 100).padStart(2, "0");
    const monthStr = String(m);
    const head = `${letter}${year2}`;
    /** Anchored match so month `1` does not pick up `C1710…` (October) rows. */
    const regexpPattern = `^${head}${monthStr}[0-9]{2}$`;
    const [rows] = await pool.query(`SELECT TRIM(id) AS id
     FROM students
     WHERE TRIM(id) REGEXP ?`, [regexpPattern]);
    let maxSeq = 0;
    for (const row of rows) {
        const rawId = row?.id != null ? String(row.id).trim() : "";
        if (rawId === "")
            continue;
        const seq = parseSequenceFromLegacyStudentId(rawId, head, monthStr);
        if (seq != null && seq > maxSeq)
            maxSeq = seq;
    }
    const nextSeq = maxSeq + 1;
    if (nextSeq > 99) {
        throw new Error(`Legacy student id sequence overflow for ${head}${monthStr} (max 99).`);
    }
    return `${head}${monthStr}${String(nextSeq).padStart(2, "0")}`;
}
export async function legacyStudentMasterExists(pool, studentId) {
    const [rows] = await pool.query(`SELECT 1 AS ok FROM students WHERE id = ? LIMIT 1`, [studentId]);
    return rows.length > 0;
}
export async function legacyStudentPasswordRowExists(pool, studentId) {
    const [rows] = await pool.query(`SELECT 1 AS ok FROM password_stu WHERE id = ? LIMIT 1`, [studentId]);
    return rows.length > 0;
}
/**
 * Insert one legacy `students` row with safe defaults for columns not exposed in the admin create form.
 */
export async function createLegacyStudentMasterRow(pool, input) {
    await pool.execute(`INSERT INTO students (
       name, alias, id, dob,
       address, address2, city, state, zip, country, ssn,
       gender, race, status,
       phone1, phone2, phone3, email,
       background, tertiary, visa,
       regis_fee, clinic_fee, admission_credits,
       notes, cpr, toefl, exam, level1exam, level2exam, level3exam, cnt,
       hold, signed_date, grad_date, grad_term, grad_year, withdraw_date,
       required_units_to_grad, marital, citizenship,
       EnrollStartDate, requirements_id, financial_aid, grad_check_out,
       cale_license, cale_date, level1practice
     ) VALUES (
       ?, '', ?, '0000-00-00',
       ?, ?, ?, ?, ?, '', '',
       ?, '', '',
       '', '', '', ?,
       ?, ?, '',
       0, 0, 0,
       '', '', '', '', '', '', '', '',
       0, ?, '0000-00-00', '-', 0, '0000-00-00',
       0, '', '',
       ?, ?, 0, 0,
       NULL, '0000-00-00', ''
     )`, [
        input.name,
        input.studentId,
        input.address,
        input.address2,
        input.city,
        input.state,
        input.zip,
        input.gender,
        input.email,
        input.background,
        input.tertiary,
        input.signed_date_sql,
        input.enroll_start_sql,
        input.requirements_id,
    ]);
}
/** Legacy `password_stu.password` values are MD5 hex (32 chars), matching the school database. */
export function legacyStudentPasswordMd5Hex(plainPassword) {
    return createHash("md5").update(plainPassword, "utf8").digest("hex");
}
export async function createLegacyStudentPasswordRow(pool, studentId, plainPassword) {
    const hash = legacyStudentPasswordMd5Hex(plainPassword);
    await pool.execute(`INSERT INTO password_stu (id, password) VALUES (?, ?)`, [
        studentId,
        hash,
    ]);
}
export async function hasLegacyStudentRegistration(pool, studentId) {
    const [rows] = await pool.query(`SELECT 1 AS ok FROM registration WHERE TRIM(id) = ? LIMIT 1`, [studentId.trim()]);
    return rows.length > 0;
}
export async function hasLegacyStudentAccounting(pool, studentId) {
    const [rows] = await pool.query(`SELECT 1 AS ok FROM accounting WHERE TRIM(id) = ? LIMIT 1`, [studentId.trim()]);
    return rows.length > 0;
}
export async function hasLegacyStudentMarks(pool, studentId) {
    const [rows] = await pool.query(`SELECT 1 AS ok FROM marks WHERE TRIM(id) = ? LIMIT 1`, [studentId.trim()]);
    return rows.length > 0;
}
export async function deleteLegacyStudentPasswordRow(pool, studentId) {
    await pool.execute(`DELETE FROM password_stu WHERE TRIM(id) = ?`, [
        studentId.trim(),
    ]);
}
export async function deleteLegacyStudentMasterRow(pool, studentId) {
    await pool.execute(`DELETE FROM students WHERE id = ?`, [studentId.trim()]);
}
//# sourceMappingURL=studentLegacyAccountRepository.js.map