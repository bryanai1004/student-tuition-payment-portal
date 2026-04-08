export type DocumentRequirementType =
  | "ferpa"
  | "titleix"
  | "campus"
  | "copyright_release_agreement";

export type DocumentRequirementStatus = "assigned" | "completed";

export const DOCUMENT_REQUIREMENT_TYPES: readonly DocumentRequirementType[] = [
  "ferpa",
  "titleix",
  "campus",
  "copyright_release_agreement",
] as const;

export function isDocumentRequirementType(
  value: string,
): value is DocumentRequirementType {
  return (DOCUMENT_REQUIREMENT_TYPES as readonly string[]).includes(value);
}

/** Quiz-backed document requirements (not the copyright agreement). */
export type DocumentQuizRequirementType = Extract<
  DocumentRequirementType,
  "ferpa" | "titleix" | "campus"
>;

export const DOCUMENT_QUIZ_REQUIREMENT_TYPES: readonly DocumentQuizRequirementType[] =
  ["ferpa", "titleix", "campus"] as const;

export function isDocumentQuizRequirementType(
  value: string,
): value is DocumentQuizRequirementType {
  return (DOCUMENT_QUIZ_REQUIREMENT_TYPES as readonly string[]).includes(value);
}

export type StudentDocumentRequirement = {
  id: number;
  studentExternalId: string;
  academicTermId: string;
  requirementType: DocumentRequirementType;
  status: DocumentRequirementStatus;
  scoreCorrect: number | null;
  totalQuestions: number | null;
  isPassed: boolean;
  assignedAt: string;
  submittedAt: string | null;
  lastReassignedAt: string | null;
  assignedBy: string | null;
  reassignedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudentDocumentRequirementAttempt = {
  id: number;
  studentExternalId: string;
  academicTermId: string;
  requirementType: DocumentRequirementType;
  attemptNo: number;
  submittedAnswersJson: unknown | null;
  scoreCorrect: number | null;
  totalQuestions: number | null;
  isPassed: boolean;
  submittedAt: string;
};

/** Insert/update current-state row (service layer supplies full merged values as needed). */
export type UpsertDocumentRequirementInput = {
  studentExternalId: string;
  academicTermId: string;
  requirementType: DocumentRequirementType;
  status: DocumentRequirementStatus;
  scoreCorrect: number | null;
  totalQuestions: number | null;
  isPassed: boolean;
  submittedAt: string | null;
  assignedBy: string | null;
  lastReassignedAt: string | null;
  reassignedBy: string | null;
};

export type CreateDocumentRequirementAttemptInput = {
  studentExternalId: string;
  academicTermId: string;
  requirementType: DocumentRequirementType;
  attemptNo: number;
  submittedAnswersJson: unknown | null;
  scoreCorrect: number | null;
  totalQuestions: number | null;
  isPassed: boolean;
};
