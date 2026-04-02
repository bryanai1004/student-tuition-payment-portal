/** GET /api/students/:studentId/transcript-preview — merged `marks` + `clinic`, titles from `courses`. */

export type StudentTranscriptAvailableTerm = {
  term: string;
  year: number;
  label: string;
};

export type StudentTranscriptRow = {
  courseCode: string;
  courseTitle: string;
  term: string;
  year: number;
  grade: string | null;
  numericGrade: number | null;
  credits: number | null;
  source: "marks" | "clinic";
};

export type StudentTranscriptPreviewResponse = {
  studentId: string;
  studentName: string;
  availableTerms: StudentTranscriptAvailableTerm[];
  transcript: StudentTranscriptRow[];
};
