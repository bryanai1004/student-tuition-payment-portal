import { getClinicTimetableById, listClinicTimetableSlots, listClinicalOfferedTimetableDetailRows, } from "../repositories/clinicalTimetableRepository.js";
import { insertClinicalAssignment, listStudentClinicalAssignments, } from "../repositories/clinicalScheduleRepository.js";
/** Thrown when `getStudentClinicalSchedule` receives an invalid student id (maps to HTTP 400). */
export class ClinicalScheduleValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ClinicalScheduleValidationError";
    }
}
/**
 * Interim placeholder DATE for timetable-driven rows: legacy slots are weekday/time only.
 * Canonical metadata is `timetable_id` + `clinic_timetable`; API maps to a human-readable
 * `sessionDate` string for clients (see `assignmentRowToScheduleDto`).
 */
export const TIMETABLE_ASSIGNMENT_SESSION_DATE_PLACEHOLDER = "1900-01-01";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_SHORT = {
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
    sunday: "Sun",
};
function shortWeekday(day) {
    const t = day.trim();
    if (t === "") {
        return "";
    }
    const k = t.toLowerCase();
    return WEEKDAY_SHORT[k] ?? t.slice(0, 3);
}
/** Normalize MySQL TIME string to HH:MM for API consumers. */
export function formatClinicTimeHm(raw) {
    if (raw == null || raw === "") {
        return null;
    }
    const m = /^(\d{1,2}):(\d{2})/.exec(String(raw).trim());
    if (!m) {
        return null;
    }
    return `${m[1].padStart(2, "0")}:${m[2]}`;
}
function isMidnightPlaceholder(start, end) {
    return start === "00:00" && end === "00:00";
}
/**
 * Human-readable label for a legacy `clinic_timetable` row (also stored on assignments as snapshot).
 */
export function buildClinicTimetableSlotLabel(row) {
    const dayShort = shortWeekday(row.weekday);
    const st = row.timeFrom;
    const en = row.timeTo;
    const timeRange = st != null && en != null && !isMidnightPlaceholder(st, en)
        ? `${st}–${en}`
        : null;
    const instr = row.instructor?.trim() ?? "";
    const slotNum = row.slot?.trim() ?? "";
    if (dayShort !== "" && timeRange != null) {
        const tail = instr !== "" ? instr : `Clinic slot ${slotNum || "—"}`;
        return `${dayShort} ${timeRange} · ${tail}`;
    }
    if (dayShort !== "" && timeRange == null) {
        const tail = instr !== "" ? instr : `Clinic slot ${slotNum || "—"}`;
        return `${dayShort} · ${tail}`;
    }
    if (timeRange != null) {
        const tail = instr !== "" ? instr : `Clinic slot ${slotNum || "—"}`;
        return `${timeRange} · ${tail}`;
    }
    if (instr !== "") {
        return `Clinic slot ${slotNum || "—"} · ${instr}`;
    }
    return `Clinic slot ${slotNum || "—"}`;
}
function timetableRowToSlotLabel(row) {
    return buildClinicTimetableSlotLabel({
        weekday: row.weekday,
        timeFrom: formatClinicTimeHm(row.time_from),
        timeTo: formatClinicTimeHm(row.time_to),
        slot: row.slot,
        instructor: row.instructor || null,
    });
}
function joinedRowSlotLabel(r) {
    if (r.tt_day == null) {
        return null;
    }
    return buildClinicTimetableSlotLabel({
        weekday: r.tt_day,
        timeFrom: formatClinicTimeHm(r.tt_time_from),
        timeTo: formatClinicTimeHm(r.tt_time_to),
        slot: r.tt_slot ?? "",
        instructor: r.tt_instructor,
    });
}
/** Display-safe label for timetable-driven rows: "Spring 2026 · weekly". */
function weeklySessionDateLabel(term, year) {
    const t = term.trim();
    if (t === "" || year == null || !Number.isFinite(year)) {
        return null;
    }
    return `${t} ${year} · weekly`;
}
function assignmentRowToScheduleDto(r) {
    const isPlaceholderSessionDate = r.session_date === TIMETABLE_ASSIGNMENT_SESSION_DATE_PLACEHOLDER;
    if (r.timetable_id != null) {
        const term = (r.tt_term ?? r.ca_term ?? "").trim();
        const year = r.tt_year ?? r.ca_year;
        const displayDate = weeklySessionDateLabel(term, year) ?? "Weekly clinic (timetable)";
        const sessionName = joinedRowSlotLabel(r) ?? r.session_name;
        const faculty = r.tt_instructor ?? r.faculty;
        return {
            id: r.id,
            studentId: r.student_id,
            courseCode: r.course_code,
            sessionDate: displayDate,
            sessionName,
            site: r.site,
            faculty,
            status: r.status,
        };
    }
    if (isPlaceholderSessionDate) {
        const term = (r.ca_term ?? "").trim();
        const year = r.ca_year;
        const displayDate = weeklySessionDateLabel(term, year) ?? "Weekly clinic (timetable)";
        return {
            id: r.id,
            studentId: r.student_id,
            courseCode: r.course_code,
            sessionDate: displayDate,
            sessionName: r.session_name,
            site: r.site,
            faculty: r.faculty,
            status: r.status,
        };
    }
    return {
        id: r.id,
        studentId: r.student_id,
        courseCode: r.course_code,
        sessionDate: r.session_date,
        sessionName: r.session_name,
        site: r.site,
        faculty: r.faculty,
        status: r.status,
    };
}
export async function getStudentClinicalSchedule(studentId) {
    const sid = String(studentId ?? "").trim();
    if (sid === "") {
        throw new ClinicalScheduleValidationError("Student id is required");
    }
    const rows = await listStudentClinicalAssignments(sid);
    const sessions = rows
        .filter((r) => {
        const st = (r.status ?? "").trim().toLowerCase();
        return st !== "dropped" && st !== "cancelled";
    })
        .map(assignmentRowToScheduleDto);
    const termYears = rows
        .map((r) => {
        const term = (r.tt_term ?? r.ca_term ?? "").trim();
        const year = r.tt_year ?? r.ca_year;
        if (term === "" || year == null || !Number.isFinite(year)) {
            return null;
        }
        return `${term} ${year}`;
    })
        .filter((v) => v != null);
    const uniqueTermYears = [...new Set(termYears)];
    console.info("[clinical-trace] student upcoming assignments query", {
        studentId: sid,
        termYear: uniqueTermYears.length > 0 ? uniqueTermYears : ["unknown"],
        sourceTable: "clinical_assignments LEFT JOIN clinic_timetable (timetable rows gated by active clinical_enrollments)",
        sourceQuery: "clinicalScheduleRepository.listStudentClinicalAssignments",
        rawRowCount: rows.length,
        returnedRowCount: sessions.length,
    });
    return sessions;
}
export async function listAdminClinicalTimetable(query) {
    let yearNum = null;
    if (query.year != null && String(query.year).trim() !== "") {
        const n = Number(String(query.year).trim());
        if (Number.isFinite(n)) {
            yearNum = n;
        }
    }
    const term = query.term != null && String(query.term).trim() !== ""
        ? String(query.term).trim()
        : null;
    const rows = await listClinicTimetableSlots({
        year: yearNum,
        term,
    });
    return rows.map((row) => {
        const start = formatClinicTimeHm(row.time_from);
        const end = formatClinicTimeHm(row.time_to);
        return {
            id: row.id,
            term: row.term,
            year: row.year,
            weekday: row.weekday,
            startTime: start,
            endTime: end,
            instructor: row.instructor.trim() === "" ? null : row.instructor.trim(),
            site: null,
            courseCode: null,
            slotLabel: timetableRowToSlotLabel(row),
        };
    });
}
export async function listClinicalOfferedTimetableForPortal(query) {
    let yearNum = null;
    if (query.year != null && String(query.year).trim() !== "") {
        const n = Number(String(query.year).trim());
        if (Number.isFinite(n)) {
            yearNum = n;
        }
    }
    const term = query.term != null && String(query.term).trim() !== ""
        ? String(query.term).trim()
        : null;
    const rows = await listClinicalOfferedTimetableDetailRows({
        year: yearNum,
        term,
    });
    return rows.map((r) => {
        const start = formatClinicTimeHm(r.time_from);
        const end = formatClinicTimeHm(r.time_to);
        const slotLabel = buildClinicTimetableSlotLabel({
            weekday: r.weekday,
            timeFrom: start,
            timeTo: end,
            slot: r.slot,
            instructor: r.instructor,
        });
        return {
            id: r.timetableId,
            term: r.term,
            year: r.year,
            weekday: r.weekday,
            startTime: start,
            endTime: end,
            instructor: r.instructor,
            site: null,
            courseCode: null,
            slotLabel,
            slotCode: r.slot,
            capacity: r.capacity,
            enrolledCount: r.enrolledCount,
            remainingSeats: r.remainingSeats,
            capacity100: r.capacity100,
            capacity200: r.capacity200,
            capacity300: r.capacity300,
            capacityAll: r.capacityAll,
            enrolled100: r.enrolled100,
            enrolled200: r.enrolled200,
            enrolled300: r.enrolled300,
            enrolledAll: r.enrolledAll,
            remaining100: r.remaining100,
            remaining200: r.remaining200,
            remaining300: r.remaining300,
            remainingAll: r.remainingAll,
        };
    });
}
function isValidCalendarDate(ymd) {
    if (!ISO_DATE.test(ymd)) {
        return false;
    }
    const [y, m, d] = ymd.split("-").map((x) => Number(x));
    const dt = new Date(y, m - 1, d);
    return (dt.getFullYear() === y &&
        dt.getMonth() === m - 1 &&
        dt.getDate() === d);
}
function opt(v) {
    if (v === undefined) {
        return null;
    }
    if (v === null) {
        return null;
    }
    const s = String(v).trim();
    return s === "" ? null : s;
}
export async function assignClinicalSession(body) {
    const studentId = String(body.studentId ?? "").trim();
    if (studentId === "") {
        return { ok: false, error: "studentId is required", status: 400 };
    }
    const rawTid = body.timetableId;
    let timetableId = NaN;
    if (rawTid != null && rawTid !== "") {
        timetableId =
            typeof rawTid === "number"
                ? rawTid
                : typeof rawTid === "string"
                    ? Number(rawTid.trim())
                    : Number(rawTid);
    }
    if (Number.isFinite(timetableId) && timetableId > 0) {
        return assignClinicalFromTimetableSlot(studentId, timetableId, body.status);
    }
    const courseCode = String(body.courseCode ?? "").trim();
    const sessionDate = String(body.sessionDate ?? "").trim();
    if (courseCode === "") {
        return { ok: false, error: "courseCode is required", status: 400 };
    }
    if (sessionDate === "") {
        return { ok: false, error: "sessionDate is required", status: 400 };
    }
    if (!isValidCalendarDate(sessionDate)) {
        return {
            ok: false,
            error: "sessionDate must be a valid YYYY-MM-DD date",
            status: 400,
        };
    }
    let statusForDb;
    if (body.status !== undefined && body.status !== null) {
        const t = String(body.status).trim();
        if (t !== "") {
            statusForDb = t;
        }
    }
    const payload = {
        studentId,
        courseCode,
        sessionDate,
        sessionName: opt(body.sessionName),
        site: opt(body.site),
        faculty: opt(body.faculty),
        ...(statusForDb !== undefined ? { status: statusForDb } : {}),
    };
    try {
        const id = await insertClinicalAssignment(payload);
        return { ok: true, id };
    }
    catch (e) {
        console.error(e);
        return {
            ok: false,
            error: "Failed to create clinical assignment",
            status: 500,
        };
    }
}
/**
 * Build the same `clinical_assignments` insert payload used by
 * `POST /api/admin/clinical/assign` for timetable-driven rows (CLINIC + placeholder date).
 */
export function buildTimetableClinicalAssignmentPayload(studentId, tt, status) {
    const slotLabel = timetableRowToSlotLabel(tt);
    const term = tt.term.slice(0, 20);
    const year = tt.year;
    let statusForDb;
    if (status !== undefined && status !== null) {
        const t = String(status).trim();
        if (t !== "") {
            statusForDb = t;
        }
    }
    const faculty = tt.instructor.trim() === "" ? null : tt.instructor.trim();
    return {
        studentId,
        courseCode: "CLINIC",
        sessionDate: TIMETABLE_ASSIGNMENT_SESSION_DATE_PLACEHOLDER,
        sessionName: slotLabel,
        site: null,
        faculty,
        timetableId: tt.id,
        assignmentTerm: term || null,
        assignmentYear: year,
        ...(statusForDb !== undefined ? { status: statusForDb } : {}),
    };
}
async function assignClinicalFromTimetableSlot(studentId, timetableId, status) {
    const tt = await getClinicTimetableById(timetableId);
    if (tt == null) {
        return { ok: false, error: "timetableId not found", status: 404 };
    }
    const payload = buildTimetableClinicalAssignmentPayload(studentId, tt, status);
    try {
        const id = await insertClinicalAssignment(payload);
        return { ok: true, id };
    }
    catch (e) {
        console.error(e);
        return {
            ok: false,
            error: "Failed to create clinical assignment",
            status: 500,
        };
    }
}
//# sourceMappingURL=clinicalScheduleService.js.map