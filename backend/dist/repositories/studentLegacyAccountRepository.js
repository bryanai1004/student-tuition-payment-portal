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
        console.debug("[account-debug] findLatestLegacyTermYear: none", JSON.stringify({ studentId }));
        return null;
    }
    const r = rows[0];
    const out = { term: normalizeTerm(r.term), year: Number(r.year) };
    console.debug("[account-debug] findLatestLegacyTermYear: ok", JSON.stringify({ studentId, ...out }));
    return out;
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
        console.debug("[account-debug] loadLegacyAccountSnapshot: no registration row", JSON.stringify({ studentId, term, year }));
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
    console.debug("[account-debug] loadLegacyAccountSnapshot: ok", JSON.stringify({
        studentId,
        term: regTerm,
        year: regYear,
        hasStudentRow: Boolean(rawName),
    }));
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
    const [rows] = await pool.query(`SELECT TRIM(term) AS term, year
     FROM accounting
     WHERE id = ?
     GROUP BY TRIM(term), year
     ORDER BY year DESC,
       CASE UPPER(TRIM(term))
         WHEN 'FALL' THEN 4
         WHEN 'SUMMER' THEN 3
         WHEN 'SPRING' THEN 2
         WHEN 'WINTER' THEN 1
         ELSE 0
       END DESC`, [studentId]);
    const out = rows.map((r) => ({
        term: normalizeTerm(r.term),
        year: Math.trunc(num(r.year)),
    }));
    console.debug("[account-debug] listLegacyAccountingQuarters", JSON.stringify({ studentId, count: out.length }));
    return out;
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
export async function loadLegacyAccountingRows(pool, studentId, term, year) {
    const [rows] = await pool.query(`SELECT seqNumber, year, TRIM(term) AS term, date, type, code, debit, credit, memo
     FROM accounting
     WHERE id = ?
       AND LOWER(TRIM(term)) = LOWER(TRIM(?))
       AND year = ?
     ORDER BY date ASC, seqNumber ASC`, [studentId, term, year]);
    const out = rows.map((r) => ({
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
    console.debug("[account-debug] loadLegacyAccountingRows", JSON.stringify({
        studentId,
        term,
        year,
        rowCount: out.length,
    }));
    return out;
}
//# sourceMappingURL=studentLegacyAccountRepository.js.map