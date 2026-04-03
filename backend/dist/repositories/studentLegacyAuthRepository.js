/**
 * Legacy `students` table: `id` matches portal registration id (e.g. C17310).
 */
export async function findLegacyStudentById(pool, studentId) {
    const [rows] = await pool.query("SELECT id, name FROM students WHERE id = ? LIMIT 1", [studentId]);
    const row = rows[0];
    if (!row)
        return null;
    return {
        id: String(row.id),
        name: row.name == null ? "" : String(row.name),
    };
}
/**
 * Stored `password` from legacy `password_stu` (typically MD5 hex; may be plain in edge cases).
 */
export async function findLegacyStudentPasswordStored(pool, studentId) {
    const [rows] = await pool.query("SELECT TRIM(password) AS pw FROM password_stu WHERE TRIM(id) = ? LIMIT 1", [studentId.trim()]);
    const row = rows[0];
    if (row?.pw == null)
        return null;
    const s = String(row.pw).trim();
    return s.length > 0 ? s : null;
}
//# sourceMappingURL=studentLegacyAuthRepository.js.map