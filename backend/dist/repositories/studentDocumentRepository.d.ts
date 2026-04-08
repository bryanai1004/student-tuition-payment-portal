import type { Pool, PoolConnection, ResultSetHeader } from "mysql2/promise";
import { type CreateDocumentRequirementAttemptInput, type DocumentRequirementType, type StudentDocumentRequirement, type StudentDocumentRequirementAttempt, type UpsertDocumentRequirementInput } from "../types/studentDocuments.js";
/** Pool or transaction connection — both implement `.query`. */
export type StudentDocumentsDbClient = Pool | PoolConnection;
export declare function portalStudentExists(db: StudentDocumentsDbClient, studentExternalId: string): Promise<boolean>;
/**
 * Inserts missing current-state rows for all requirement types (assigned, no scores).
 * Rows that already exist are left unchanged (ON DUPLICATE KEY UPDATE id=id).
 */
export declare function seedMissingPortalDocumentRequirements(db: StudentDocumentsDbClient, studentExternalId: string, academicTermId: string): Promise<void>;
export declare function getNextDocumentAttemptNumber(db: StudentDocumentsDbClient, studentExternalId: string, academicTermId: string, requirementType: DocumentRequirementType): Promise<number>;
export declare function listStudentDocumentRequirements(db: StudentDocumentsDbClient, studentExternalId: string, academicTermId: string): Promise<StudentDocumentRequirement[]>;
export declare function getStudentDocumentRequirement(db: StudentDocumentsDbClient, studentExternalId: string, academicTermId: string, requirementType: DocumentRequirementType): Promise<StudentDocumentRequirement | null>;
export declare function upsertStudentDocumentRequirement(db: StudentDocumentsDbClient, input: UpsertDocumentRequirementInput): Promise<StudentDocumentRequirement>;
export declare function createStudentDocumentRequirementAttempt(db: StudentDocumentsDbClient, input: CreateDocumentRequirementAttemptInput): Promise<StudentDocumentRequirementAttempt>;
export declare function listStudentDocumentRequirementAttempts(db: StudentDocumentsDbClient, studentExternalId: string, academicTermId: string, requirementType: DocumentRequirementType): Promise<StudentDocumentRequirementAttempt[]>;
export declare function resetStudentDocumentRequirement(db: StudentDocumentsDbClient, studentExternalId: string, academicTermId: string, requirementType: DocumentRequirementType, reassignedBy: string | null): Promise<ResultSetHeader>;
export declare function resetAllStudentDocumentRequirementsForTerm(db: StudentDocumentsDbClient, studentExternalId: string, academicTermId: string, reassignedBy: string | null): Promise<ResultSetHeader>;
//# sourceMappingURL=studentDocumentRepository.d.ts.map