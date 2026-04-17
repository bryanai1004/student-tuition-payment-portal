import { pool } from "../lib/db.js";
const MS_PER_DAY = 86400000;
function str(v) {
    if (v == null)
        return "";
    const s = String(v).trim();
    return s;
}
function isMysqlZeroOrEmptyDate(v) {
    if (v == null)
        return true;
    if (v instanceof Date) {
        return Number.isNaN(v.getTime());
    }
    const s = String(v).trim();
    if (s === "")
        return true;
    if (/^0000-00-00/.test(s))
        return true;
    return false;
}
/** Parse MySQL DATE / DATETIME or ISO-ish string to UTC midnight for that calendar day. */
function toUtcMidnight(v) {
    if (isMysqlZeroOrEmptyDate(v))
        return null;
    if (v instanceof Date) {
        if (Number.isNaN(v.getTime()))
            return null;
        return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
    }
    const s = String(v).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m)
        return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    if (!Number.isFinite(y) || mo < 0 || mo > 11 || d < 1 || d > 31) {
        return null;
    }
    if (y < 1900)
        return null;
    const t = Date.UTC(y, mo, d);
    const out = new Date(t);
    return Number.isNaN(out.getTime()) ? null : out;
}
function toIsoDate(v) {
    const d = toUtcMidnight(v);
    if (!d)
        return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
/** Normalize a legacy DB date column to ISO `YYYY-MM-DD`, or null if zero/invalid. */
export function legacyDbDateToIso(v) {
    return toIsoDate(v);
}
/**
 * Prefer `signed_date` when it is a real calendar date; otherwise `EnrollStartDate`.
 */
export function resolveEnrollmentDate(signedDate, enrollStartDate) {
    if (!isMysqlZeroOrEmptyDate(signedDate)) {
        const iso = toIsoDate(signedDate);
        if (iso)
            return iso;
    }
    if (!isMysqlZeroOrEmptyDate(enrollStartDate)) {
        return toIsoDate(enrollStartDate);
    }
    return null;
}
/**
 * `age = floor((today - dob) / 365.25 days)` in whole UTC calendar days.
 */
export function ageFromDob(dobRaw, now = new Date()) {
    const dob = toUtcMidnight(dobRaw);
    if (!dob)
        return null;
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const dobUtc = dob.getTime();
    const days = (todayUtc - dobUtc) / MS_PER_DAY;
    if (!Number.isFinite(days) || days < 0)
        return null;
    return Math.floor(days / 365.25);
}
export function combineAddressLine(address, address2) {
    const a1 = str(address);
    const a2 = str(address2);
    const full = [a1, a2].filter((x) => x.length > 0).join(" ");
    return full.length > 0 ? full : null;
}
function creditsFromDb(v) {
    if (v == null || v === "")
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function studentProgramFromDb(v) {
    return str(v).toUpperCase() === "DAHM" ? "DAHM" : "MAHM";
}
export function trackFromRequirementsId(v) {
    if (v == null || v === "")
        return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
}
function readRow(row) {
    const r = row;
    const enrollStart = r.EnrollStartDate ??
        r.enrollstartdate ??
        r.enroll_start_date ??
        null;
    return {
        id: str(r.id),
        name: str(r.name),
        gender: str(r.gender),
        dob: r.dob,
        signed_date: r.signed_date,
        enroll_start: enrollStart,
        background: str(r.background),
        admission_credits: r.admission_credits,
        tertiary: str(r.tertiary),
        race: str(r.race),
        address: str(r.address),
        address2: str(r.address2),
        city: str(r.city),
        state: str(r.state),
        zip: str(r.zip),
        email: str(r.email),
        ssn: str(r.ssn),
        visa: str(r.visa),
        phone1: str(r.phone1),
        phone2: str(r.phone2),
        phone3: str(r.phone3),
        citizenship: str(r.citizenship),
        marital: str(r.marital),
        program: r.program,
        requirements_id: r.requirements_id,
    };
}
export function mapLegacyStudentRowToProfile(row) {
    const r = readRow(row);
    const fullName = r.name.length > 0 ? r.name : r.id;
    const enrollmentDate = resolveEnrollmentDate(r.signed_date, r.enroll_start);
    return {
        studentId: r.id,
        fullName,
        program: studentProgramFromDb(r.program),
        track: trackFromRequirementsId(r.requirements_id),
        gender: r.gender.length > 0 ? r.gender : null,
        age: ageFromDob(r.dob),
        enrollmentDate,
        background: r.background.length > 0 ? r.background : null,
        credits: creditsFromDb(r.admission_credits),
        highestDegree: r.tertiary.length > 0 ? r.tertiary : null,
        race: r.race.length > 0 ? r.race : null,
        address: combineAddressLine(r.address, r.address2),
        city: r.city.length > 0 ? r.city : null,
        state: r.state.length > 0 ? r.state : null,
        zip: r.zip.length > 0 ? r.zip : null,
        email: r.email.length > 0 ? r.email : null,
        dob: legacyDbDateToIso(r.dob),
        ssn: r.ssn.length > 0 ? r.ssn : null,
        visa: r.visa.length > 0 ? r.visa : null,
        phone1: r.phone1.length > 0 ? r.phone1 : null,
        phone2: r.phone2.length > 0 ? r.phone2 : null,
        phone3: r.phone3.length > 0 ? r.phone3 : null,
        citizenship: r.citizenship.length > 0 ? r.citizenship : null,
        marital: r.marital.length > 0 ? r.marital : null,
    };
}
export async function getLegacyStudentProfile(studentId) {
    const trimmed = studentId.trim();
    if (trimmed === "")
        return null;
    const [rows] = await pool.query(`SELECT
       id,
       name,
       program,
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
       ssn,
       visa,
       phone1,
       phone2,
       phone3,
       citizenship,
       marital,
       requirements_id
     FROM students
     WHERE id = ?
     LIMIT 1`, [trimmed]);
    const row = rows[0] ?? null;
    if (!row)
        return null;
    return mapLegacyStudentRowToProfile(row);
}
export async function updateLegacyStudentSensitiveProfile(studentId, patch) {
    const id = studentId.trim();
    if (id === "")
        return false;
    const updates = [];
    const params = [];
    const assignText = (column, raw) => {
        if (raw === undefined)
            return;
        updates.push(`${column} = ?`);
        params.push(raw == null ? "" : str(raw));
    };
    if (patch.dob !== undefined) {
        const iso = legacyDbDateToIso(patch.dob);
        updates.push("dob = ?");
        params.push(iso ?? "0000-00-00");
    }
    assignText("ssn", patch.ssn);
    assignText("visa", patch.visa);
    assignText("address", patch.address);
    assignText("phone1", patch.phone1);
    assignText("phone2", patch.phone2);
    assignText("phone3", patch.phone3);
    assignText("email", patch.email);
    assignText("citizenship", patch.citizenship);
    assignText("race", patch.race);
    assignText("marital", patch.marital);
    if (updates.length === 0)
        return false;
    const [result] = await pool.execute(`UPDATE students
     SET ${updates.join(", ")}
     WHERE id = ?`, [...params, id]);
    const header = result;
    return (header.affectedRows ?? 0) > 0;
}
//# sourceMappingURL=studentProfileService.js.map