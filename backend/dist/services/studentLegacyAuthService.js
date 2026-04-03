import { legacyStudentPasswordMd5Hex } from "../repositories/studentLegacyAccountRepository.js";
import { findLegacyStudentById, findLegacyStudentPasswordStored, } from "../repositories/studentLegacyAuthRepository.js";
/**
 * Last-name initial for legacy password derivation.
 * - If a comma exists: first character of the trimmed substring before the comma (uppercased).
 * - Else: first character of the first whitespace-delimited token (uppercased).
 * - If the comma branch yields an empty segment, fall back to the no-comma rule on the full trimmed name.
 */
export function deriveLastNameInitial(name) {
    const trimmed = name.trim();
    if (trimmed.length === 0)
        return null;
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx >= 0) {
        const beforeComma = trimmed.slice(0, commaIdx).trim();
        if (beforeComma.length > 0) {
            const ch = beforeComma.codePointAt(0);
            if (ch === undefined)
                return null;
            return String.fromCodePoint(ch).toUpperCase();
        }
    }
    const spaceIdx = trimmed.search(/\s/);
    const firstToken = spaceIdx >= 0 ? trimmed.slice(0, spaceIdx).trim() : trimmed;
    if (firstToken.length === 0)
        return null;
    const ch = firstToken.codePointAt(0);
    if (ch === undefined)
        return null;
    return String.fromCodePoint(ch).toUpperCase();
}
/** Last 5 characters of trimmed id, or the full id when length < 5. */
export function legacyPasswordIdSuffix(studentId) {
    const id = studentId.trim();
    if (id.length < 5)
        return id;
    return id.slice(-5);
}
export function buildExpectedLegacyPassword(studentName, studentId) {
    const initial = deriveLastNameInitial(studentName);
    if (initial == null)
        return null;
    return initial + legacyPasswordIdSuffix(studentId);
}
function storedPasswordMatchesInput(inputPlain, stored) {
    const s = stored.trim();
    if (s.length === 0)
        return false;
    if (/^[a-f0-9]{32}$/i.test(s)) {
        return legacyStudentPasswordMd5Hex(inputPlain) === s.toLowerCase();
    }
    return inputPlain.trim() === s;
}
export async function authenticateLegacyStudent(pool, studentIdRaw, passwordRaw) {
    const studentId = studentIdRaw.trim();
    const password = passwordRaw.trim();
    if (studentId.length === 0 || password.length === 0)
        return null;
    const row = await findLegacyStudentById(pool, studentId);
    if (!row)
        return null;
    const storedPw = await findLegacyStudentPasswordStored(pool, studentId);
    if (storedPw != null && storedPasswordMatchesInput(password, storedPw)) {
        const displayName = row.name.trim();
        return {
            studentId: row.id,
            displayName: displayName.length > 0 ? displayName : row.id,
        };
    }
    const expected = buildExpectedLegacyPassword(row.name, studentId);
    if (expected != null && password === expected) {
        const displayName = row.name.trim();
        return {
            studentId: row.id,
            displayName: displayName.length > 0 ? displayName : row.id,
        };
    }
    return null;
}
//# sourceMappingURL=studentLegacyAuthService.js.map