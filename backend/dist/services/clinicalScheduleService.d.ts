import { type ClinicTimetableDbRow } from "../repositories/clinicalTimetableRepository.js";
import { type InsertClinicalAssignmentPayload } from "../repositories/clinicalScheduleRepository.js";
/** Thrown when `getStudentClinicalSchedule` receives an invalid student id (maps to HTTP 400). */
export declare class ClinicalScheduleValidationError extends Error {
    constructor(message: string);
}
/**
 * Interim placeholder DATE for timetable-driven rows: legacy slots are weekday/time only.
 * Canonical metadata is `timetable_id` + `clinic_timetable`; API maps to a human-readable
 * `sessionDate` string for clients (see `assignmentRowToScheduleDto`).
 */
export declare const TIMETABLE_ASSIGNMENT_SESSION_DATE_PLACEHOLDER = "1900-01-01";
export type ClinicalScheduleSessionDto = {
    id: number;
    studentId: string;
    courseCode: string;
    sessionDate: string;
    sessionName: string | null;
    site: string | null;
    faculty: string | null;
    status: string;
};
export type AdminClinicalTimetableSlotDto = {
    id: number;
    term: string;
    year: number;
    weekday: string;
    startTime: string | null;
    endTime: string | null;
    instructor: string | null;
    site: string | null;
    courseCode: string | null;
    slotLabel: string;
};
/** Normalize MySQL TIME string to HH:MM for API consumers. */
export declare function formatClinicTimeHm(raw: string | null | undefined): string | null;
/**
 * Human-readable label for a legacy `clinic_timetable` row (also stored on assignments as snapshot).
 */
export declare function buildClinicTimetableSlotLabel(row: {
    weekday: string;
    timeFrom: string | null;
    timeTo: string | null;
    slot: string;
    instructor: string | null;
}): string;
export declare function getStudentClinicalSchedule(studentId: string): Promise<ClinicalScheduleSessionDto[]>;
export declare function listAdminClinicalTimetable(query: {
    term?: string | null;
    year?: string | null;
}): Promise<AdminClinicalTimetableSlotDto[]>;
export type AssignClinicalSessionBody = {
    studentId: string;
    /** JSON may send a numeric string; controller normalizes before calling in some paths. */
    timetableId?: number | string | null;
    courseCode?: string;
    sessionDate?: string;
    sessionName?: string | null;
    site?: string | null;
    faculty?: string | null;
    status?: string | null;
};
export type AssignClinicalSessionResult = {
    ok: true;
    id: number;
} | {
    ok: false;
    error: string;
    status: number;
};
export declare function assignClinicalSession(body: AssignClinicalSessionBody): Promise<AssignClinicalSessionResult>;
/**
 * Build the same `clinical_assignments` insert payload used by
 * `POST /api/admin/clinical/assign` for timetable-driven rows (CLINIC + placeholder date).
 */
export declare function buildTimetableClinicalAssignmentPayload(studentId: string, tt: ClinicTimetableDbRow, status: string | null | undefined): InsertClinicalAssignmentPayload;
//# sourceMappingURL=clinicalScheduleService.d.ts.map