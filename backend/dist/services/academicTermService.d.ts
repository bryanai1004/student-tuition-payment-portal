import type { AcademicTermDetail, AcademicTermName, AcademicTermStatus, CreateAcademicTermInput, UpdateAcademicTermInput } from "../types/academicTerm.js";
export declare function isAcademicTermName(v: unknown): v is AcademicTermName;
export declare function isAcademicTermStatus(v: unknown): v is AcademicTermStatus;
export declare function quarterIndexForTermName(name: AcademicTermName): number;
export declare function canonicalAcademicTermId(year: number, termName: AcademicTermName): string;
export declare function defaultTermLabel(termName: AcademicTermName, year: number): string;
export declare function listAllAcademicTerms(): Promise<AcademicTermDetail[]>;
export declare function listVisibleTermsForStudents(limit?: number): Promise<AcademicTermDetail[]>;
export declare function listRecentVisibleTerms(limit?: number): Promise<AcademicTermDetail[]>;
export declare function getCurrentRegistrationOpenTerm(): Promise<AcademicTermDetail | null>;
export declare function getPostedToDashboardTerm(): Promise<AcademicTermDetail | null>;
export declare function postAcademicTermToDashboard(id: string): Promise<AcademicTermDetail | null>;
/** For response headers: whether `academic_terms` persists payment DDL / overdue-lock fields. */
export declare function academicTermPaymentPolicyColumnsAvailable(): Promise<boolean>;
export declare function createAcademicTerm(input: CreateAcademicTermInput): Promise<AcademicTermDetail>;
export declare function updateAcademicTerm(id: string, patch: UpdateAcademicTermInput): Promise<AcademicTermDetail | null>;
//# sourceMappingURL=academicTermService.d.ts.map