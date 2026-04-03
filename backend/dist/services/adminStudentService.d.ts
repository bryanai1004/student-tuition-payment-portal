import type { AdminStudentCreateBody, AdminStudentDetail, AdminStudentListItem, AdminStudentUpdateBody } from "../types/adminStudent.js";
export declare function listAdminStudents(): Promise<AdminStudentListItem[]>;
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
//# sourceMappingURL=adminStudentService.d.ts.map