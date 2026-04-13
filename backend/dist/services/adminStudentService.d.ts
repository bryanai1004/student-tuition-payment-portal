import type { AdminStudentCreateBody, AdminStudentCreateLoaBody, AdminStudentDetail, AdminStudentEnrollmentFilterOptions, AdminStudentListItem, AdminStudentRosterLoaFilter, AdminStudentRosterProgramFilter, AdminStudentRosterTrackFilter, AdminStudentUpdateBody } from "../types/adminStudent.js";
export type AdminStudentListPageResult = {
    items: AdminStudentListItem[];
    total: number;
    page: number;
    pageSize: number;
    enrollmentFilterOptions: AdminStudentEnrollmentFilterOptions;
};
export declare function listAdminStudentsPage(options: {
    page: number;
    pageSize: number;
    search: string;
    program: AdminStudentRosterProgramFilter;
    track: AdminStudentRosterTrackFilter;
    entryYear: string | null;
    intakeCode: string | null;
    loa: AdminStudentRosterLoaFilter;
    loaQuarter: "Winter" | "Spring" | "Summer" | "Fall" | null;
    loaYear: number | null;
    includeClinicalSummary?: boolean;
}): Promise<AdminStudentListPageResult>;
export type BuildAdminStudentsCsvInput = {
    mode: "selected";
    studentIds: string[];
    view: "roster" | "new-enrollment";
} | {
    mode: "filtered";
    search: string;
    program: AdminStudentRosterProgramFilter;
    track: AdminStudentRosterTrackFilter;
    entryYear: string | null;
    intakeCode: string | null;
    loa: AdminStudentRosterLoaFilter;
    loaQuarter: "Winter" | "Spring" | "Summer" | "Fall" | null;
    loaYear: number | null;
    view: "roster" | "new-enrollment";
};
export type BuildAdminStudentsCsvResult = {
    mode: "selected" | "filtered";
    filename: string;
    csvBody: string;
    rowCount: number;
};
export declare function buildAdminStudentsCsv(input: BuildAdminStudentsCsvInput): Promise<BuildAdminStudentsCsvResult>;
export declare function getAdminStudentDetail(studentIdRaw: string): Promise<AdminStudentDetail | null>;
export type AdminStudentCreateLoaResult = {
    ok: true;
    detail: AdminStudentDetail;
} | {
    ok: false;
    status: 400 | 404 | 409;
    message: string;
};
export declare function createAdminStudentLoa(studentIdRaw: string, body: AdminStudentCreateLoaBody): Promise<AdminStudentCreateLoaResult>;
export type AdminStudentUpdateResult = {
    ok: true;
    detail: AdminStudentDetail;
} | {
    ok: false;
    status: 400 | 404;
    message: string;
};
export declare function updateAdminStudent(studentIdRaw: string, body: AdminStudentUpdateBody): Promise<AdminStudentUpdateResult>;
export declare function previewNextAdminStudentId(divisionRaw: unknown, entryDateRaw: unknown): Promise<{
    ok: true;
    studentId: string;
} | {
    ok: false;
    status: 400;
    message: string;
}>;
export type AdminStudentCreateResult = {
    ok: true;
    studentId: string;
} | {
    ok: false;
    status: 400 | 409;
    message: string;
};
export declare function createAdminStudent(body: AdminStudentCreateBody): Promise<AdminStudentCreateResult>;
export type DeleteSelectedAdminStudentsSuccess = {
    ok: true;
    deletedStudentIds: string[];
    blocked: Array<{
        studentId: string;
        reason: string;
    }>;
};
export type DeleteSelectedAdminStudentsResult = DeleteSelectedAdminStudentsSuccess | {
    ok: false;
    status: 400;
    message: string;
};
export declare function deleteSelectedAdminStudents(rawStudentIds: unknown): Promise<DeleteSelectedAdminStudentsResult>;
//# sourceMappingURL=adminStudentService.d.ts.map