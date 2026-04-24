import { pool } from "../lib/db.js";
import { createLegacyStudentLoaRow, createLegacyStudentMasterRow, createLegacyStudentPasswordRow, deleteLegacyStudentMasterRow, deleteLegacyStudentPasswordRow, findLatestLegacyStudentLoaRow, findLatestLegacyTermYear, getNextLegacyStudentId, hasLegacyStudentAccounting, hasLegacyStudentMarks, hasLegacyStudentRegistration, legacyStudentMasterExists, legacyStudentPasswordRowExists, countLegacyAdminStudentListRows, listLegacyAdminStudentLoaTermFacetRows, listLegacyAdminStudentEnrollmentFacetRows, listLegacyAdminStudentListRows, listLegacyAdminStudentListRowsPage, listLegacyAdminStudentListRowsByStudentIds, loadLegacyStudentProfileRow, updateLegacyStudentMasterRow, } from "../repositories/studentLegacyAccountRepository.js";
import { listPortalEnrollmentHistoryForStudentTerm, listPortalEnrollmentTermsForStudent, } from "../repositories/studentEnrollmentRepository.js";
import { combineAddressLine, legacyDbDateToIso, resolveEnrollmentDate, } from "./studentProfileService.js";
import { batchBuildClinicalProgressForStudentIds, buildClinicalProgress, } from "./clinicalProgressService.js";
import { getAdminStudentIntakeLabel, parseAdminStudentEnrollmentInfo, } from "./adminStudentEnrollmentMetadata.js";
import { deriveAdminLoaQuarterStartDate, normalizeAdminLoaQuarter, normalizeAdminLoaYear, } from "./adminStudentLoaDates.js";
function str(v) {
    if (v == null)
        return "";
    return String(v).trim();
}
function divisionFromStudentId(id) {
    const c = id.trim().charAt(0).toUpperCase();
    if (c === "C")
        return "Chinese";
    if (c === "E")
        return "English";
    return "Unknown";
}
function readEnrollStart(row) {
    return (row.EnrollStartDate ??
        row.enrollstartdate ??
        row.enroll_start_date ??
        row.enroll_start ??
        null);
}
function studentProgramFromDb(v) {
    return str(v).toUpperCase() === "DAHM" ? "DAHM" : "MAHM";
}
/** e.g. `Fall 2025` from legacy `registration` term + year. */
function formatLatestRegistrationTerm(termRaw, yearRaw) {
    const t = str(termRaw);
    const yearN = Number(yearRaw);
    if (t === "" || !Number.isFinite(yearN))
        return null;
    const norm = t.length > 0
        ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
        : t;
    return `${norm} ${yearN}`;
}
function formatAdminRegistrationTermLabel(termRaw, yearRaw) {
    const term = str(termRaw);
    const year = Number(yearRaw);
    if (term === "" || !Number.isFinite(year))
        return "";
    const normalized = `${term.charAt(0).toUpperCase()}${term.slice(1).toLowerCase()}`;
    return `${normalized} ${Math.trunc(year)}`;
}
function requirementsIdToApi(v) {
    if (v == null || v === "")
        return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
}
function statusToApi(v) {
    const s = str(v);
    return s === "" ? null : s;
}
function entryYearFromResolved(iso) {
    if (iso == null || iso.length < 4)
        return null;
    const y = Number.parseInt(iso.slice(0, 4), 10);
    return Number.isFinite(y) ? y : null;
}
function normalizedQuarter(raw) {
    return normalizeAdminLoaQuarter(raw);
}
function normalizedYear(raw) {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : null;
}
function formatLoaTerm(quarterRaw, yearRaw) {
    const quarter = normalizedQuarter(quarterRaw);
    const year = normalizedYear(yearRaw);
    if (quarter == null || year == null)
        return null;
    return `${quarter} ${year}`;
}
async function buildAdminStudentLoaSummary(studentId) {
    const latestLoa = await findLatestLegacyStudentLoaRow(pool, studentId);
    if (!latestLoa) {
        return {
            hasLoa: false,
            loaTerm: null,
            plannedReturnTerm: null,
            reason: null,
        };
    }
    return {
        hasLoa: true,
        loaTerm: formatLoaTerm(latestLoa.absentQuarter, latestLoa.absentYear),
        plannedReturnTerm: formatLoaTerm(latestLoa.returnQuarter, latestLoa.returnYear),
        reason: latestLoa.reason,
    };
}
function clinicalProgressToListSummary(cp) {
    const missing = cp.missing;
    const missingCount = missing.length;
    let missingSummary = null;
    if (missingCount > 0) {
        const parts = missing.slice(0, 2);
        missingSummary = parts.join("; ");
        if (missingCount > 2) {
            missingSummary += ` (+${missingCount - 2} more)`;
        }
    }
    return {
        level: cp.level,
        completedHours: cp.completedHours,
        requiredHours: cp.requiredHours,
        readiness: cp.readiness,
        missingCount,
        missingSummary,
    };
}
function mapRowToListItem(r) {
    const studentId = str(r.id);
    const nameRaw = str(r.name);
    const name = nameRaw.length > 0 ? nameRaw : studentId;
    const emailRaw = str(r.email);
    const email = emailRaw.length > 0 ? emailRaw : null;
    const enrollment = parseAdminStudentEnrollmentInfo(studentId);
    const signedDate = legacyDbDateToIso(r.signed_date);
    const enrollStartDate = legacyDbDateToIso(readEnrollStart(r));
    const resolvedEntryDate = resolveEnrollmentDate(r.signed_date, readEnrollStart(r));
    const bg = str(r.background);
    const tertiary = str(r.tertiary);
    return {
        studentId,
        division: divisionFromStudentId(studentId),
        name,
        email,
        status: statusToApi(r.status),
        program: studentProgramFromDb(r.program),
        trackCode: enrollment.trackCode,
        trackLabel: enrollment.trackLabel,
        requirementsId: requirementsIdToApi(r.requirements_id),
        highestDegree: tertiary.length > 0 ? tertiary : null,
        backgroundSchool: bg.length > 0 ? bg : null,
        signedDate,
        enrollStartDate,
        resolvedEntryDate,
        entryYear: enrollment.entryYear,
        intakeCode: enrollment.intakeCode,
        intakeLabel: enrollment.intakeLabel,
        latestRegistrationTerm: formatLatestRegistrationTerm(r.latest_term, r.latest_year),
    };
}
async function buildAdminStudentEnrollmentFilterOptions(options) {
    const [rows, loaRows] = await Promise.all([
        listLegacyAdminStudentEnrollmentFacetRows(pool, options),
        listLegacyAdminStudentLoaTermFacetRows(pool, options),
    ]);
    const years = Array.from(new Set(rows
        .map((row) => str(row.entry_year))
        .filter((entryYear) => /^\d{4}$/.test(entryYear)))).sort((a, b) => Number(b) - Number(a));
    const intakes = Array.from(new Set(rows
        .map((row) => str(row.intake_code))
        .filter((intakeCode) => intakeCode !== "")))
        .sort((a, b) => a.localeCompare(b))
        .map((code) => ({
        code,
        label: getAdminStudentIntakeLabel(code) ?? code,
    }));
    const loaTerms = [];
    const seenLoaTerms = new Set();
    for (const row of loaRows) {
        const quarter = normalizedQuarter(row.absent_quarter);
        const year = normalizedYear(row.absent_year);
        if (quarter == null || year == null)
            continue;
        const key = `${quarter}|${year}`;
        if (seenLoaTerms.has(key))
            continue;
        seenLoaTerms.add(key);
        loaTerms.push({
            quarter,
            year,
            label: `${quarter} ${year}`,
        });
    }
    return { years, intakes, loaTerms };
}
export async function listAdminStudentsPage(options) {
    const page = Math.max(1, Math.trunc(options.page));
    const pageSize = Math.max(1, Math.trunc(options.pageSize));
    const search = options.search.trim();
    const program = options.program;
    const track = options.track;
    const entryYear = options.entryYear;
    const intakeCode = options.intakeCode;
    const loa = options.loa;
    const loaQuarter = options.loaQuarter;
    const loaYear = options.loaYear;
    const offset = (page - 1) * pageSize;
    const listQuery = {
        search,
        program,
        track,
        entryYear,
        intakeCode,
        loa,
        loaQuarter,
        loaYear,
    };
    console.time("[admin students list] base query");
    let total;
    let rows;
    let enrollmentFilterOptions;
    try {
        [total, rows, enrollmentFilterOptions] = await Promise.all([
            countLegacyAdminStudentListRows(pool, listQuery),
            listLegacyAdminStudentListRowsPage(pool, {
                ...listQuery,
                limit: pageSize,
                offset,
            }),
            buildAdminStudentEnrollmentFilterOptions(listQuery),
        ]);
    }
    finally {
        console.timeEnd("[admin students list] base query");
    }
    const base = rows.map((row) => mapRowToListItem(row));
    let items;
    /** Roster clinical columns only when `clinicalSummary=1` is explicitly requested. */
    if (options.includeClinicalSummary !== true) {
        items = base;
    }
    else {
        console.time("[admin students] clinical summary");
        try {
            const byId = await batchBuildClinicalProgressForStudentIds(pool, base.map((b) => b.studentId));
            items = base.map((item) => {
                const cp = byId.get(item.studentId.trim());
                if (!cp) {
                    return item;
                }
                return {
                    ...item,
                    clinicalProgressSummary: clinicalProgressToListSummary(cp),
                };
            });
        }
        catch (e) {
            console.error("[admin] batch clinical progress failed (list)", e);
            items = base;
        }
        finally {
            console.timeEnd("[admin students] clinical summary");
        }
    }
    return { items, total, page, pageSize, enrollmentFilterOptions };
}
function csvEscapeCell(value) {
    const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (/[",\n]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
}
function csvCell(value) {
    return value == null ? "" : String(value);
}
function formatCsvDate(iso) {
    if (iso == null || iso.trim() === "")
        return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
    if (!m)
        return iso;
    const [, year, month, day] = m;
    return `${month}/${day}/${year}`;
}
function pad2(n) {
    return String(n).padStart(2, "0");
}
function buildAdminStudentsExportTimestamp(date = new Date()) {
    return [
        String(date.getFullYear()),
        pad2(date.getMonth() + 1),
        pad2(date.getDate()),
        "_",
        pad2(date.getHours()),
        pad2(date.getMinutes()),
    ].join("");
}
const ADMIN_STUDENTS_CSV_HEADERS = [
    "Student ID",
    "Name",
    "Division",
    "Email",
    "Program",
    "Signed Date",
    "Latest Registration Term",
];
export async function buildAdminStudentsCsv(input) {
    const rows = input.mode === "selected"
        ? await listLegacyAdminStudentListRowsByStudentIds(pool, input.studentIds)
        : await listLegacyAdminStudentListRows(pool, {
            search: input.search.trim(),
            program: input.program,
            track: input.track,
            entryYear: input.entryYear,
            intakeCode: input.intakeCode,
            loa: input.loa,
            loaQuarter: input.loaQuarter,
            loaYear: input.loaYear,
        });
    const items = rows.map((row) => mapRowToListItem(row));
    const lines = [
        ADMIN_STUDENTS_CSV_HEADERS
            .map((header) => csvEscapeCell(header))
            .join(","),
    ];
    for (const item of items) {
        const values = [
            item.studentId,
            item.name,
            item.division,
            csvCell(item.email),
            item.program,
            formatCsvDate(item.signedDate),
            csvCell(item.latestRegistrationTerm),
        ];
        lines.push(values.map(csvEscapeCell).join(","));
    }
    const timestamp = buildAdminStudentsExportTimestamp();
    const prefix = input.view === "new-enrollment"
        ? input.mode === "selected"
            ? "new_enrollment_selected_"
            : "new_enrollment_filtered_"
        : input.mode === "selected"
            ? "students_selected_"
            : "students_filtered_";
    return {
        mode: input.mode,
        filename: `${prefix}${timestamp}.csv`,
        csvBody: lines.join("\r\n"),
        rowCount: items.length,
    };
}
function mapProfileRowToAdminDetail(row, latestRegistrationTerm, loaSummary) {
    const studentId = str(row.id);
    const nameRaw = str(row.name);
    const name = nameRaw.length > 0 ? nameRaw : studentId;
    const emailRaw = str(row.email);
    const email = emailRaw.length > 0 ? emailRaw : null;
    const genderRaw = str(row.gender);
    const gender = genderRaw.length > 0 ? genderRaw : null;
    const signedDate = legacyDbDateToIso(row.signed_date);
    const enrollStartDate = legacyDbDateToIso(readEnrollStart(row));
    const dob = legacyDbDateToIso(row.dob);
    const resolvedEntryDate = resolveEnrollmentDate(row.signed_date, readEnrollStart(row));
    const bg = str(row.background);
    const tertiary = str(row.tertiary);
    const address = combineAddressLine(row.address, row.address2);
    const cityRaw = str(row.city);
    const city = cityRaw.length > 0 ? cityRaw : null;
    const stateRaw = str(row.state);
    const state = stateRaw.length > 0 ? stateRaw : null;
    const ssnRaw = str(row.ssn);
    const ssn = ssnRaw.length > 0 ? ssnRaw : null;
    const visaRaw = str(row.visa);
    const visa = visaRaw.length > 0 ? visaRaw : null;
    const phone1Raw = str(row.phone1);
    const phone1 = phone1Raw.length > 0 ? phone1Raw : null;
    const phone2Raw = str(row.phone2);
    const phone2 = phone2Raw.length > 0 ? phone2Raw : null;
    const phone3Raw = str(row.phone3);
    const phone3 = phone3Raw.length > 0 ? phone3Raw : null;
    const citizenshipRaw = str(row.citizenship);
    const citizenship = citizenshipRaw.length > 0 ? citizenshipRaw : null;
    const raceRaw = str(row.race);
    const race = raceRaw.length > 0 ? raceRaw : null;
    const maritalRaw = str(row.marital);
    const marital = maritalRaw.length > 0 ? maritalRaw : null;
    const zipRaw = row.zip;
    let zipStr = null;
    if (zipRaw != null && String(zipRaw).trim() !== "") {
        zipStr = String(zipRaw).trim();
    }
    return {
        studentId,
        division: divisionFromStudentId(studentId),
        name,
        email,
        program: studentProgramFromDb(row.program),
        requirementsId: requirementsIdToApi(row.requirements_id),
        highestDegree: tertiary.length > 0 ? tertiary : null,
        backgroundSchool: bg.length > 0 ? bg : null,
        gender,
        signedDate,
        enrollStartDate,
        resolvedEntryDate,
        entryYear: entryYearFromResolved(resolvedEntryDate),
        address,
        city,
        state,
        zip: zipStr,
        ssn,
        visa,
        dob,
        phone1,
        phone2,
        phone3,
        citizenship,
        race,
        marital,
        latestRegistrationTerm,
        loaSummary,
    };
}
export async function getAdminStudentDetail(studentIdRaw, options) {
    const studentId = studentIdRaw.trim();
    if (studentId === "")
        return null;
    const row = await loadLegacyStudentProfileRow(pool, studentId);
    if (!row)
        return null;
    const [latest, loaSummary] = await Promise.all([
        findLatestLegacyTermYear(pool, studentId),
        buildAdminStudentLoaSummary(studentId),
    ]);
    const latestRegistrationTerm = latest
        ? formatLatestRegistrationTerm(latest.term, latest.year)
        : null;
    const base = mapProfileRowToAdminDetail(row, latestRegistrationTerm, loaSummary);
    if (options?.includeClinicalProgress !== true) {
        return base;
    }
    try {
        const clinicalProgress = await buildClinicalProgress(pool, studentId);
        return { ...base, clinicalProgress };
    }
    catch (e) {
        console.error("[admin] buildClinicalProgress failed", studentId, e);
        return base;
    }
}
export async function listAdminStudentRegistrationTerms(studentIdRaw) {
    const studentId = studentIdRaw.trim();
    if (studentId === "")
        return [];
    const rows = await listPortalEnrollmentTermsForStudent(studentId);
    return rows.map((row) => ({
        term: row.term,
        year: Math.trunc(row.year),
        label: formatAdminRegistrationTermLabel(row.term, row.year),
    }));
}
export async function listAdminStudentRegistrationHistoryForTerm(studentIdRaw, termRaw, yearRaw) {
    const studentId = studentIdRaw.trim();
    const term = termRaw.trim();
    const year = Math.trunc(yearRaw);
    if (studentId === "" || term === "" || !Number.isFinite(year))
        return [];
    const rows = await listPortalEnrollmentHistoryForStudentTerm(studentId, term, year);
    return rows.map((row) => ({
        courseCode: row.courseCode,
        courseTitle: row.courseTitle,
        section: row.section,
        units: row.units,
        status: row.status,
        term: row.term,
        year: Math.trunc(row.year),
        termLabel: formatAdminRegistrationTermLabel(row.term, row.year),
    }));
}
export async function createAdminStudentLoa(studentIdRaw, body) {
    const studentId = studentIdRaw.trim();
    if (studentId === "") {
        return { ok: false, status: 400, message: "Missing student id." };
    }
    const absentQuarter = normalizeAdminLoaQuarter(body.loaQuarter);
    if (!absentQuarter) {
        return {
            ok: false,
            status: 400,
            message: "Validation: LOA Quarter is required.",
        };
    }
    const absentYear = normalizeAdminLoaYear(body.loaYear);
    if (absentYear == null) {
        return {
            ok: false,
            status: 400,
            message: "Validation: LOA Year is required.",
        };
    }
    const returnQuarter = normalizeAdminLoaQuarter(body.plannedReturnQuarter);
    if (!returnQuarter) {
        return {
            ok: false,
            status: 400,
            message: "Validation: Planned Return Quarter is required.",
        };
    }
    const returnYear = normalizeAdminLoaYear(body.plannedReturnYear);
    if (returnYear == null) {
        return {
            ok: false,
            status: 400,
            message: "Validation: Planned Return Year is required.",
        };
    }
    const reason = str(body.reason);
    const absentStartingDate = deriveAdminLoaQuarterStartDate(absentQuarter, absentYear);
    const returnDate = deriveAdminLoaQuarterStartDate(returnQuarter, returnYear);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        if (!(await legacyStudentMasterExists(connection, studentId))) {
            await connection.rollback();
            return { ok: false, status: 404, message: "Student not found." };
        }
        const existingLoa = await findLatestLegacyStudentLoaRow(connection, studentId);
        if (existingLoa) {
            await connection.rollback();
            return {
                ok: false,
                status: 409,
                message: "This student already has an LOA record on file. Editing existing LOA is not supported here yet.",
            };
        }
        await createLegacyStudentLoaRow(connection, {
            studentId,
            absentQuarter,
            absentYear,
            absentStartingDate,
            returnQuarter,
            returnYear,
            returnDate,
            reason,
        });
        await connection.commit();
    }
    catch (e) {
        await connection.rollback();
        throw e;
    }
    finally {
        connection.release();
    }
    const detail = await getAdminStudentDetail(studentId);
    if (!detail) {
        return { ok: false, status: 404, message: "Student not found." };
    }
    return { ok: true, detail };
}
const DATE_VALIDATION_PREFIX = "Validation:";
function sqlDateFromBodyField(label, raw) {
    if (raw == null) {
        return { kind: "sql", value: "0000-00-00" };
    }
    const s = String(raw).trim();
    if (s === "") {
        return { kind: "sql", value: "0000-00-00" };
    }
    const iso = legacyDbDateToIso(s);
    if (!iso) {
        return {
            kind: "error",
            message: `${DATE_VALIDATION_PREFIX} ${label} must be a valid calendar date (YYYY-MM-DD).`,
        };
    }
    return { kind: "sql", value: iso };
}
function parseRequirementsIdForDb(raw) {
    if (raw == null)
        return { kind: "ok", value: null };
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return { kind: "ok", value: Math.trunc(raw) };
    }
    const s = String(raw).trim();
    if (s === "")
        return { kind: "ok", value: null };
    const n = Number.parseInt(s, 10);
    if (!Number.isFinite(n)) {
        return {
            kind: "error",
            message: `${DATE_VALIDATION_PREFIX} requirementsId must be numeric or empty.`,
        };
    }
    return { kind: "ok", value: n };
}
function parseZipForDb(raw) {
    if (raw == null)
        return { kind: "ok", value: 0 };
    const s = String(raw).trim();
    if (s === "")
        return { kind: "ok", value: 0 };
    const n = Number.parseInt(s, 10);
    if (!Number.isFinite(n) || n < 0) {
        return {
            kind: "error",
            message: `${DATE_VALIDATION_PREFIX} zip must be a non-negative integer or empty.`,
        };
    }
    return { kind: "ok", value: n };
}
export async function updateAdminStudent(studentIdRaw, body) {
    const studentId = studentIdRaw.trim();
    if (studentId === "") {
        return { ok: false, status: 400, message: "Missing student id." };
    }
    const existing = await loadLegacyStudentProfileRow(pool, studentId);
    if (!existing) {
        return { ok: false, status: 404, message: "Student not found." };
    }
    const name = str(body.name);
    if (name === "") {
        return {
            ok: false,
            status: 400,
            message: `${DATE_VALIDATION_PREFIX} name is required.`,
        };
    }
    const signed = sqlDateFromBodyField("signedDate", body.signedDate);
    if (signed.kind === "error") {
        return { ok: false, status: 400, message: signed.message };
    }
    const enroll = sqlDateFromBodyField("enrollStartDate", body.enrollStartDate);
    if (enroll.kind === "error") {
        return { ok: false, status: 400, message: enroll.message };
    }
    const dob = sqlDateFromBodyField("dob", body.dob);
    if (dob.kind === "error") {
        return { ok: false, status: 400, message: dob.message };
    }
    const req = parseRequirementsIdForDb(body.requirementsId);
    if (req.kind === "error") {
        return { ok: false, status: 400, message: req.message };
    }
    const zip = parseZipForDb(body.zip);
    if (zip.kind === "error") {
        return { ok: false, status: 400, message: zip.message };
    }
    const patch = {
        name,
        email: str(body.email),
        program: body.program,
        gender: str(body.gender),
        background: str(body.backgroundSchool),
        tertiary: str(body.highestDegree),
        requirements_id: req.value,
        address: str(body.address),
        address2: "",
        city: str(body.city),
        state: str(body.state),
        zip: zip.value,
        signed_date_sql: signed.value,
        enroll_start_sql: enroll.value,
        ssn: str(body.ssn),
        visa: str(body.visa),
        dob_sql: dob.value,
        phone1: str(body.phone1),
        phone2: str(body.phone2),
        phone3: str(body.phone3),
        citizenship: str(body.citizenship),
        race: str(body.race),
        marital: str(body.marital),
    };
    const updated = await updateLegacyStudentMasterRow(pool, studentId, patch);
    if (!updated) {
        return { ok: false, status: 404, message: "Student not found." };
    }
    const detail = await getAdminStudentDetail(studentId);
    if (!detail) {
        return { ok: false, status: 404, message: "Student not found." };
    }
    return { ok: true, detail };
}
const ENTRY_YEAR_MIN = 1900;
const ENTRY_YEAR_MAX = 2100;
function parseDivisionParam(raw) {
    if (raw === "Chinese" || raw === "English") {
        return { ok: true, value: raw };
    }
    return {
        ok: false,
        status: 400,
        message: "division must be Chinese or English.",
    };
}
function parseEntryDateParam(raw) {
    if (raw == null || String(raw).trim() === "") {
        return {
            ok: false,
            status: 400,
            message: "entryDate is required.",
        };
    }
    const iso = legacyDbDateToIso(raw);
    if (!iso) {
        return {
            ok: false,
            status: 400,
            message: "entryDate must be a valid calendar date (YYYY-MM-DD).",
        };
    }
    const y = Number.parseInt(iso.slice(0, 4), 10);
    const month = Number.parseInt(iso.slice(5, 7), 10);
    if (!Number.isFinite(y) || y < ENTRY_YEAR_MIN || y > ENTRY_YEAR_MAX) {
        return {
            ok: false,
            status: 400,
            message: "entry date year is out of range.",
        };
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
        return {
            ok: false,
            status: 400,
            message: "entry date month is invalid.",
        };
    }
    return { ok: true, year: y, month };
}
export async function previewNextAdminStudentId(divisionRaw, entryDateRaw) {
    const div = parseDivisionParam(divisionRaw);
    if (!div.ok)
        return div;
    const dt = parseEntryDateParam(entryDateRaw);
    if (!dt.ok)
        return dt;
    try {
        const studentId = await getNextLegacyStudentId(pool, div.value, dt.year, dt.month);
        return { ok: true, studentId };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : "Could not compute next id.";
        return { ok: false, status: 400, message: msg };
    }
}
export async function createAdminStudent(body) {
    const div = parseDivisionParam(body.division);
    if (!div.ok) {
        return { ok: false, status: 400, message: div.message };
    }
    const dt = parseEntryDateParam(body.entryDate);
    if (!dt.ok) {
        return { ok: false, status: 400, message: dt.message };
    }
    const name = str(body.name);
    if (name === "") {
        return {
            ok: false,
            status: 400,
            message: `${DATE_VALIDATION_PREFIX} name is required.`,
        };
    }
    const initialPassword = str(body.initialPassword);
    if (initialPassword === "") {
        return {
            ok: false,
            status: 400,
            message: `${DATE_VALIDATION_PREFIX} initialPassword is required.`,
        };
    }
    const signed = sqlDateFromBodyField("signedDate", body.signedDate);
    if (signed.kind === "error") {
        return { ok: false, status: 400, message: signed.message };
    }
    const enroll = sqlDateFromBodyField("enrollStartDate", body.enrollStartDate);
    if (enroll.kind === "error") {
        return { ok: false, status: 400, message: enroll.message };
    }
    const req = parseRequirementsIdForDb(body.requirementsId);
    if (req.kind === "error") {
        return { ok: false, status: 400, message: req.message };
    }
    const zip = parseZipForDb(body.zip);
    if (zip.kind === "error") {
        return { ok: false, status: 400, message: zip.message };
    }
    const insertPayload = {
        name,
        email: str(body.email),
        program: body.program,
        gender: str(body.gender),
        background: str(body.backgroundSchool),
        tertiary: str(body.highestDegree),
        requirements_id: req.value,
        address: str(body.address),
        address2: str(body.address2),
        city: str(body.city),
        state: str(body.state),
        zip: zip.value,
        signed_date_sql: signed.value,
        enroll_start_sql: enroll.value,
    };
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const studentId = await getNextLegacyStudentId(connection, div.value, dt.year, dt.month);
        if (await legacyStudentMasterExists(connection, studentId)) {
            await connection.rollback();
            return {
                ok: false,
                status: 409,
                message: "Generated student id already exists. Refresh and try again.",
            };
        }
        if (await legacyStudentPasswordRowExists(connection, studentId)) {
            await connection.rollback();
            return {
                ok: false,
                status: 409,
                message: "A password record already exists for the generated id. Refresh and try again.",
            };
        }
        await createLegacyStudentMasterRow(connection, {
            studentId,
            ...insertPayload,
        });
        await createLegacyStudentPasswordRow(connection, studentId, initialPassword);
        await connection.commit();
        return { ok: true, studentId };
    }
    catch (e) {
        await connection.rollback();
        const err = e;
        if (err.code === "ER_DUP_ENTRY") {
            return {
                ok: false,
                status: 409,
                message: "Student id or password row conflicts with existing data.",
            };
        }
        throw e;
    }
    finally {
        connection.release();
    }
}
const ADMIN_STUDENT_ID_BODY = /^[A-Za-z0-9._-]{1,64}$/;
export async function deleteSelectedAdminStudents(rawStudentIds) {
    if (!Array.isArray(rawStudentIds)) {
        return {
            ok: false,
            status: 400,
            message: "studentIds must be a non-empty array.",
        };
    }
    if (rawStudentIds.length === 0) {
        return {
            ok: false,
            status: 400,
            message: "studentIds must be a non-empty array.",
        };
    }
    const seen = new Set();
    const normalized = [];
    for (const item of rawStudentIds) {
        if (typeof item !== "string") {
            return {
                ok: false,
                status: 400,
                message: "Each student id must be a string.",
            };
        }
        const t = item.trim();
        if (t === "")
            continue;
        if (!ADMIN_STUDENT_ID_BODY.test(t)) {
            return {
                ok: false,
                status: 400,
                message: `Invalid student id: ${t}`,
            };
        }
        if (!seen.has(t)) {
            seen.add(t);
            normalized.push(t);
        }
    }
    if (normalized.length === 0) {
        return {
            ok: false,
            status: 400,
            message: "studentIds must contain at least one valid id.",
        };
    }
    const deletedStudentIds = [];
    const blocked = [];
    for (const studentId of normalized) {
        if (!(await legacyStudentMasterExists(pool, studentId))) {
            blocked.push({ studentId, reason: "Student not found." });
            continue;
        }
        if (await hasLegacyStudentRegistration(pool, studentId)) {
            blocked.push({
                studentId,
                reason: "Student has registration history",
            });
            continue;
        }
        if (await hasLegacyStudentAccounting(pool, studentId)) {
            blocked.push({
                studentId,
                reason: "Student has accounting records",
            });
            continue;
        }
        if (await hasLegacyStudentMarks(pool, studentId)) {
            blocked.push({
                studentId,
                reason: "Student has marks history",
            });
            continue;
        }
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await deleteLegacyStudentPasswordRow(connection, studentId);
            await deleteLegacyStudentMasterRow(connection, studentId);
            await connection.commit();
            deletedStudentIds.push(studentId);
        }
        catch (e) {
            await connection.rollback();
            const msg = e instanceof Error ? e.message : "Delete failed.";
            blocked.push({ studentId, reason: msg });
        }
        finally {
            connection.release();
        }
    }
    return { ok: true, deletedStudentIds, blocked };
}
//# sourceMappingURL=adminStudentService.js.map