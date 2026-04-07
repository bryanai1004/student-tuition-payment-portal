/**
 * Student academics API: merges **portal registration** (`portal_enrollments` + `course_sections`) with **marks**
 * attempts. `transcript` in the response is marks-only; `enrollmentHistory` is the **combined** sorted timeline
 * (legacy JSON field name). This service does **not** compute degree audit or clinical progress — those belong in
 * `computeDegreeAudit` and `clinicalProgressService` respectively, merged only at the account layer when needed.
 */
import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool } from "../lib/db.js";
import { getLegacyStudentDisplayName, listMarksForStudent, } from "../repositories/studentAcademicsRepository.js";
import { findLatestLegacyTermYear } from "../repositories/studentLegacyAccountRepository.js";
import { findLatestPortalEnrollmentTermYear, getPortalStudentDisplayName, listPortalEnrollmentRowsForStudentAcademics, } from "../repositories/studentEnrollmentRepository.js";
import { loadCoursesTranscriptLookup } from "../repositories/studentTranscriptRepository.js";
import { buildAcademicCourseRecordsFromMarksWithLookup, buildAvailableTermsFromCourseRecords, courseRecordToEnrollmentItem, courseRecordToScheduleItem, courseRecordToTranscriptItem, legacyCompletedBlocksPortalRow, pickNewerRegistrationAnchor, portalEnrollmentRowToAcademicCourseRecord, resolveCourseDisplayTitle, resolveRegistrationAnchoredAcademicTerm, sortTranscriptPreviewRecords, termsMatch, } from "./studentAcademicCourseRecords.js";
import { courseFeedbackLookupKey, getFeedbackSubmittedAtMapForStudent, } from "./studentCourseFeedbackService.js";
function mergeEnrollmentFeedbackIntoPayload(payload, submittedAtByKey) {
    const combinedAcademicHistory = payload.courseRecords.map((r) => {
        const k = courseFeedbackLookupKey(r.courseCode, r.term, r.year);
        const at = submittedAtByKey.get(k) ?? null;
        return courseRecordToEnrollmentItem(r, {
            submitted: at != null,
            submittedAt: at,
        });
    });
    return { ...payload, enrollmentHistory: combinedAcademicHistory };
}
function buildMergedPayload(studentId, studentName, marksRows, legacyCourseRecords, portalCourseRecords, latestRegistration) {
    const academicAttemptsFromMarks = legacyCourseRecords;
    const registrationHistoryFromPortal = portalCourseRecords;
    const combinedSortedCourseRecords = [
        ...academicAttemptsFromMarks,
        ...registrationHistoryFromPortal,
    ];
    sortTranscriptPreviewRecords(combinedSortedCourseRecords);
    const courseRecords = combinedSortedCourseRecords;
    const resolvedActive = resolveRegistrationAnchoredAcademicTerm(latestRegistration, marksRows);
    const currentTerm = resolvedActive;
    const currentSchedule = currentTerm == null
        ? []
        : courseRecords
            .filter((r) => r.year === currentTerm.year &&
            termsMatch(r.term, currentTerm.term))
            .map(courseRecordToScheduleItem);
    const combinedAcademicHistory = courseRecords.map((r) => courseRecordToEnrollmentItem(r));
    return {
        studentId,
        studentName,
        currentTerm,
        availableTerms: buildAvailableTermsFromCourseRecords(courseRecords),
        currentSchedule,
        transcript: academicAttemptsFromMarks.map(courseRecordToTranscriptItem),
        enrollmentHistory: combinedAcademicHistory,
        courseRecords,
    };
}
export async function getStudentAcademicsPayload(studentId) {
    const trimmed = studentId.trim();
    if (trimmed === "") {
        return {
            studentId: "",
            studentName: "",
            currentTerm: null,
            availableTerms: [],
            currentSchedule: [],
            transcript: [],
            enrollmentHistory: [],
            courseRecords: [],
        };
    }
    if (trimmed === DEMO_STUDENT_ID) {
        return {
            studentId: trimmed,
            studentName: trimmed,
            currentTerm: null,
            availableTerms: [],
            currentSchedule: [],
            transcript: [],
            enrollmentHistory: [],
            courseRecords: [],
        };
    }
    const [marksRows, latestLegacy, latestPortal, courseLookup, portalRows] = await Promise.all([
        listMarksForStudent(pool, trimmed),
        findLatestLegacyTermYear(pool, trimmed),
        findLatestPortalEnrollmentTermYear(trimmed),
        loadCoursesTranscriptLookup(pool),
        listPortalEnrollmentRowsForStudentAcademics(trimmed),
    ]);
    const latestRegistration = pickNewerRegistrationAnchor(latestLegacy, latestPortal);
    const nameFromMarks = marksRows[0]?.name?.trim() ?? "";
    let studentName = nameFromMarks.length > 0 ? nameFromMarks : trimmed;
    if (nameFromMarks.length === 0) {
        const legacyName = await getLegacyStudentDisplayName(pool, trimmed);
        if (legacyName != null)
            studentName = legacyName;
        else {
            const pn = await getPortalStudentDisplayName(trimmed);
            if (pn != null)
                studentName = pn;
        }
    }
    if (marksRows.length === 0 && portalRows.length === 0) {
        const resolvedActive = resolveRegistrationAnchoredAcademicTerm(latestRegistration, []);
        return {
            studentId: trimmed,
            studentName,
            currentTerm: resolvedActive,
            availableTerms: [],
            currentSchedule: [],
            transcript: [],
            enrollmentHistory: [],
            courseRecords: [],
        };
    }
    const resolvedActiveForRecords = resolveRegistrationAnchoredAcademicTerm(latestRegistration, marksRows);
    const legacyCourseRecords = marksRows.length > 0
        ? buildAcademicCourseRecordsFromMarksWithLookup(trimmed, marksRows, courseLookup, resolvedActiveForRecords)
        : [];
    const portalCourseRecords = portalRows
        .filter((p) => !legacyCompletedBlocksPortalRow(legacyCourseRecords, p.course_code, p.term, p.year))
        .map((p) => portalEnrollmentRowToAcademicCourseRecord(trimmed, p, resolveCourseDisplayTitle(p.course_code, p.course_title_raw.length > 0 ? p.course_title_raw : p.course_code, courseLookup), resolvedActiveForRecords));
    const payload = buildMergedPayload(trimmed, studentName, marksRows, legacyCourseRecords, portalCourseRecords, latestRegistration);
    if (payload.courseRecords.length === 0) {
        return payload;
    }
    try {
        const submittedAtByKey = await getFeedbackSubmittedAtMapForStudent(trimmed);
        return mergeEnrollmentFeedbackIntoPayload(payload, submittedAtByKey);
    }
    catch (e) {
        const code = e.code;
        if (code === "ER_NO_SUCH_TABLE") {
            console.warn("[academics] student_course_feedback missing; enrollment feedback flags omitted");
            return payload;
        }
        throw e;
    }
}
//# sourceMappingURL=studentAcademicsService.js.map