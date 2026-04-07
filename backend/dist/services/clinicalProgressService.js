function str(v) {
    if (v == null)
        return "";
    return String(v).trim();
}
function normCode(code) {
    return code.trim().toUpperCase();
}
/** True when legacy `clinic.code` represents the given clinical level (e.g. CL211-8 → CL211). */
function codeStartsWithClinicalPrefix(code, prefix) {
    const u = normCode(code);
    const p = prefix.toUpperCase();
    return u === p || u.startsWith(`${p}-`) || u.startsWith(p);
}
function clinicalLevelFromCodes(codes) {
    for (const c of codes) {
        if (codeStartsWithClinicalPrefix(c, "CL311"))
            return 3;
    }
    for (const c of codes) {
        if (codeStartsWithClinicalPrefix(c, "CL211"))
            return 2;
    }
    for (const c of codes) {
        if (codeStartsWithClinicalPrefix(c, "CL111"))
            return 1;
    }
    return 0;
}
function hasClinicalPrefix(codes, prefix) {
    return codes.some((c) => codeStartsWithClinicalPrefix(c, prefix));
}
/**
 * Legacy clinical progress from `clinic`, `students`, and `requirements` (real students only).
 */
export async function buildClinicalProgress(pool, studentId) {
    const sid = studentId.trim();
    const [clinicRows] = await pool.query(`SELECT TRIM(code) AS code, hours
     FROM clinic
     WHERE TRIM(id) = TRIM(?)`, [sid]);
    const codeSet = new Set();
    let completedHours = 0;
    for (const row of clinicRows) {
        const r = row;
        const code = str(r.code);
        if (code !== "")
            codeSet.add(code);
        const h = Number(r.hours);
        if (Number.isFinite(h))
            completedHours += h;
    }
    const completedCourses = [...codeSet].sort((a, b) => normCode(a).localeCompare(normCode(b)));
    const level = clinicalLevelFromCodes(completedCourses);
    const has211 = hasClinicalPrefix(completedCourses, "CL211");
    const has311 = hasClinicalPrefix(completedCourses, "CL311");
    const [reqRows] = await pool.query(`SELECT requirements.clinic_hours AS clinic_hours
     FROM requirements
     INNER JOIN students ON students.requirements_id = requirements.id
     WHERE TRIM(students.id) = TRIM(?)`, [sid]);
    let requiredHours = 0;
    if (reqRows.length > 0) {
        const rh = Number(reqRows[0].clinic_hours);
        requiredHours = Number.isFinite(rh) && rh >= 0 ? rh : 0;
    }
    const readiness = completedHours >= requiredHours ? "ready" : "not_ready";
    const missing = [];
    if (!has211)
        missing.push("Complete CL211");
    if (!has311)
        missing.push("Complete CL311");
    if (requiredHours > 0 && completedHours < requiredHours) {
        missing.push(`Remaining ${requiredHours - completedHours} hours`);
    }
    return {
        level,
        completedHours,
        requiredHours,
        completedCourses,
        readiness,
        missing,
    };
}
//# sourceMappingURL=clinicalProgressService.js.map