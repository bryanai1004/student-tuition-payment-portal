/**
 * Transcript preview: merges **marks** + **clinic** into display-sorted `TranscriptRecord` rows (`StudentTranscriptRow`).
 * This is a **presentation** read model only — not registration, not degree audit, and not the place to compute
 * earned units or graduation status (`computeDegreeAudit` owns audit math; clinic hours stay in `clinicalProgressService`).
 */
import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool } from "../lib/db.js";
import { findLatestLegacyTermYear } from "../repositories/studentLegacyAccountRepository.js";
import { listClinicRowsForStudent, loadCoursesTranscriptLookup, } from "../repositories/studentTranscriptRepository.js";
import { listMarksForStudent, } from "../repositories/studentAcademicsRepository.js";
import { academicCourseRecordToTranscriptPreviewRow, buildAcademicCourseRecordsFromClinicWithLookupAndActiveTerm, buildAcademicCourseRecordsFromMarksWithLookup, buildAvailableTermsFromCourseRecords, resolveRegistrationAnchoredAcademicTerm, sortTranscriptPreviewRecords, } from "./studentAcademicCourseRecords.js";
function resolveStudentName(studentId, marksRows, clinicRows) {
    const fromMarks = marksRows[0]?.name.trim() ?? "";
    if (fromMarks.length > 0)
        return fromMarks;
    const fromClinic = clinicRows[0]?.name.trim() ?? "";
    if (fromClinic.length > 0)
        return fromClinic;
    return studentId;
}
export async function getStudentTranscriptPreviewPayload(studentId) {
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
    const [marksRows, clinicRows, courseLookup, latestReg] = await Promise.all([
        listMarksForStudent(pool, trimmed),
        listClinicRowsForStudent(pool, trimmed),
        loadCoursesTranscriptLookup(pool),
        findLatestLegacyTermYear(pool, trimmed),
    ]);
    const activeTerm = resolveRegistrationAnchoredAcademicTerm(latestReg, marksRows);
    const fromMarks = buildAcademicCourseRecordsFromMarksWithLookup(trimmed, marksRows, courseLookup, activeTerm);
    const fromClinic = buildAcademicCourseRecordsFromClinicWithLookupAndActiveTerm(trimmed, clinicRows, courseLookup, activeTerm);
    const merged = [...fromMarks, ...fromClinic];
    sortTranscriptPreviewRecords(merged);
    const transcript = merged.map(academicCourseRecordToTranscriptPreviewRow);
    return {
        studentId: trimmed,
        studentName: resolveStudentName(trimmed, marksRows, clinicRows),
        availableTerms: buildAvailableTermsFromCourseRecords(merged),
        transcript,
    };
}
//# sourceMappingURL=studentTranscriptService.js.map