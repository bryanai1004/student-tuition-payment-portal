import type { PoolConnection } from "mysql2/promise";
export type ClinicalAssignmentDbRow = {
    id: number;
    student_id: string;
    course_code: string;
    session_date: string;
    session_name: string | null;
    site: string | null;
    faculty: string | null;
    status: string;
    created_at: Date;
    timetable_id: number | null;
    ca_term: string | null;
    ca_year: number | null;
    tt_day: string | null;
    tt_time_from: string | null;
    tt_time_to: string | null;
    tt_slot: string | null;
    tt_instructor: string | null;
    tt_term: string | null;
    tt_year: number | null;
};
export declare function listStudentClinicalAssignments(studentId: string): Promise<ClinicalAssignmentDbRow[]>;
export type InsertClinicalAssignmentPayload = {
    studentId: string;
    courseCode: string;
    sessionDate: string;
    sessionName: string | null;
    site: string | null;
    faculty: string | null;
    status?: string;
    timetableId?: number | null;
    assignmentTerm?: string | null;
    assignmentYear?: number | null;
};
export declare function insertClinicalAssignment(payload: InsertClinicalAssignmentPayload, connection?: PoolConnection): Promise<number>;
//# sourceMappingURL=clinicalScheduleRepository.d.ts.map