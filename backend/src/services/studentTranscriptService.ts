/**
 * Transcript preview — same unified marks + portal + clinic merge as GET /academics.
 */

import { DEMO_STUDENT_ID } from "../config/constants.js";
import type { StudentTranscriptPreviewResponse } from "../types/studentTranscript.js";
import {
  academicCourseRecordToTranscriptPreviewRow,
  buildAvailableTermsFromCourseRecords,
} from "./studentAcademicCourseRecords.js";
import { loadUnifiedStudentAcademicContext } from "./studentUnifiedAcademicRecordsService.js";

export async function getStudentTranscriptPreviewPayload(
  studentId: string,
): Promise<StudentTranscriptPreviewResponse> {
  const trimmed = studentId.trim();
  if (trimmed === "") {
    return {
      studentId: "",
      studentName: "",
      availableTerms: [],
      transcript: [],
    };
  }

  if (trimmed === DEMO_STUDENT_ID) {
    return {
      studentId: trimmed,
      studentName: trimmed,
      availableTerms: [],
      transcript: [],
    };
  }

  const ctx = await loadUnifiedStudentAcademicContext(trimmed);
  if (ctx == null) {
    return {
      studentId: trimmed,
      studentName: trimmed,
      availableTerms: [],
      transcript: [],
    };
  }

  const transcript = ctx.courseRecords.map(academicCourseRecordToTranscriptPreviewRow);

  return {
    studentId: trimmed,
    studentName: ctx.studentName,
    availableTerms: buildAvailableTermsFromCourseRecords(ctx.courseRecords),
    transcript,
  };
}
