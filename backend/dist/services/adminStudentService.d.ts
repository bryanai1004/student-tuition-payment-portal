import type { AdminStudentCreateBody, AdminStudentDetail, AdminStudentListItem, AdminStudentRosterProgramFilter, AdminStudentUpdateBody } from "../types/adminStudent.js";
export type AdminStudentListPageResult = {
    items: AdminStudentListItem[];
    total: number;
    page: number;
    pageSize: number;
};
export declare function listAdminStudentsPage(options: {
    page: number;
    pageSize: number;
    search: string;
    program: AdminStudentRosterProgramFilter;
    includeClinicalSummary?: boolean;
}): Promise<AdminStudentListPageResult>;
export declare function getAdminStudentDetail(studentIdRaw: string): Promise<AdminStudentDetail | null>;
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