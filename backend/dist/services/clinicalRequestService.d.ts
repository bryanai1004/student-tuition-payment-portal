export type ClinicalRequestApiItem = {
    id: number;
    studentId: string;
    timetableId: number;
    term: string;
    year: number;
    status: string;
    slotLabel: string;
    createdAt: string;
    decidedAt: string | null;
    decidedBy: string | null;
};
export type AdminPendingClinicalRequestApiItem = {
    id: number;
    studentId: string;
    timetableId: number;
    term: string;
    year: number;
    slotLabel: string;
    createdAt: string;
};
export type CreateClinicalRequestResult = {
    ok: true;
    id: number;
} | {
    ok: false;
    error: string;
    status: number;
};
export declare function createStudentClinicalRequest(studentId: string, timetableId: number): Promise<CreateClinicalRequestResult>;
export declare function listStudentClinicalRequestsApi(studentId: string): Promise<ClinicalRequestApiItem[]>;
export declare function listAdminPendingClinicalRequestsApi(): Promise<AdminPendingClinicalRequestApiItem[]>;
export type DecideClinicalRequestResult = {
    ok: true;
    assignmentId?: number;
} | {
    ok: false;
    error: string;
    status: number;
};
export declare function approveClinicalRequestById(requestId: number, decidedBy: string | null): Promise<DecideClinicalRequestResult>;
export declare function rejectClinicalRequestById(requestId: number, decidedBy: string | null): Promise<DecideClinicalRequestResult>;
//# sourceMappingURL=clinicalRequestService.d.ts.map