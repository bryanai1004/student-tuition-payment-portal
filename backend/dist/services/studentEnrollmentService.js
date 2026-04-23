/**
 * Registration domain (writes): portal enrollment into `portal_enrollments` + `course_sections`.
 * NOT `marks` (academic attempts), NOT transcript, NOT degree audit — those are read/computed elsewhere.
 */
import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import { enrollStudentInSections, listStudentHistoricalCourseReferences, resolveRequestedEnrollmentSectionsForTerm, } from "../repositories/studentEnrollmentRepository.js";
import { InvalidAcademicTermError } from "./courseSectionService.js";
import { getStudentQuarterBalance } from "./studentLedgerService.js";
import { isPastSchoolLocalDueDate } from "../lib/schoolLocalDate.js";
import { emitEnrollmentChanged } from "./realtimeEventBus.js";
/** Thrown when academic term policy blocks registration (maps to HTTP 400 with this message). */
export class RegistrationLockedOverdueBalanceError extends Error {
    constructor() {
        super("Registration is locked because the payment due date for this term has passed and the account still has an outstanding balance.");
        this.name = "RegistrationLockedOverdueBalanceError";
    }
}
function normalizeLookupKey(value) {
    if (value == null)
        return null;
    const trimmed = value.trim().toLowerCase();
    return trimmed === "" ? null : trimmed;
}
function formatMissingPrerequisiteLabel(section) {
    return {
        code: section.prerequisite_course_code?.trim() ||
            section.prerequisite_course_id?.trim() ||
            "required prerequisite course",
        title: section.prerequisite_course_title?.trim() || null,
    };
}
function formatMissingPrerequisiteError(details) {
    if (details.length === 1) {
        const item = details[0];
        return `Cannot complete registration. Missing prerequisite for ${item.courseCode} section ${item.sectionCode}: ${item.missingPrerequisiteCourseCode}.`;
    }
    return `Cannot complete registration. Missing prerequisites for: ${details
        .map((item) => `${item.courseCode} section ${item.sectionCode} requires ${item.missingPrerequisiteCourseCode}`)
        .join("; ")}.`;
}
async function validateEnrollmentPrerequisites(studentId, term, year, sections) {
    const resolved = await resolveRequestedEnrollmentSectionsForTerm(term, year, sections);
    if (!resolved.ok) {
        return resolved;
    }
    const history = await listStudentHistoricalCourseReferences(studentId);
    const historicalCourseIds = new Set();
    const historicalCourseCodes = new Set();
    for (const row of history) {
        const courseId = normalizeLookupKey(row.course_id);
        const courseCode = normalizeLookupKey(row.course_code);
        if (courseId != null)
            historicalCourseIds.add(courseId);
        if (courseCode != null)
            historicalCourseCodes.add(courseCode);
    }
    const missing = [];
    for (const section of resolved.sections) {
        const prerequisiteCourseId = normalizeLookupKey(section.prerequisite_course_id);
        if (prerequisiteCourseId == null) {
            continue;
        }
        const prerequisiteCourseCode = normalizeLookupKey(section.prerequisite_course_code);
        const satisfiedById = historicalCourseIds.has(prerequisiteCourseId);
        const satisfiedByCode = prerequisiteCourseCode != null &&
            historicalCourseCodes.has(prerequisiteCourseCode);
        if (satisfiedById || satisfiedByCode) {
            continue;
        }
        const prerequisite = formatMissingPrerequisiteLabel(section);
        missing.push({
            courseCode: section.course_code,
            sectionCode: section.section_code,
            missingPrerequisiteCourseCode: prerequisite.code,
            missingPrerequisiteCourseTitle: prerequisite.title,
        });
    }
    if (missing.length > 0) {
        return {
            ok: false,
            error: formatMissingPrerequisiteError(missing),
            details: missing,
        };
    }
    return { ok: true, resolvedSections: resolved.sections };
}
/**
 * Registers sections under the academic term’s `term_name` and `year`. Those values are the same
 * quarter key used by `portal_enrollments` and by finance (`getAccountingQuartersPayload` /
 * `getAccountingLedgerPayload` portal fallback), so a completed registration appears on the ledger
 * for that term without hardcoded quarter data.
 */
export async function enrollStudentForAcademicTerm(studentId, academicTermId, sections) {
    const row = await getAcademicTermById(academicTermId.trim());
    if (!row)
        throw new InvalidAcademicTermError();
    if (row.lock_registration_if_overdue === true) {
        const due = row.payment_due_date?.trim() ?? "";
        if (due.length >= 10) {
            const dueDay = due.slice(0, 10);
            if (isPastSchoolLocalDueDate(dueDay)) {
                const balance = await getStudentQuarterBalance(studentId.trim(), row.term_name, row.year);
                if (balance > 0) {
                    throw new RegistrationLockedOverdueBalanceError();
                }
            }
        }
    }
    const validation = await validateEnrollmentPrerequisites(studentId, row.term_name, row.year, sections);
    if (!validation.ok) {
        return validation;
    }
    const result = await enrollStudentInSections(studentId, row.term_name, row.year, sections, {
        resolvedSections: validation.resolvedSections,
    });
    if (result.ok && result.insertedCount > 0) {
        for (const section of validation.resolvedSections) {
            emitEnrollmentChanged({
                studentId,
                sectionId: section.course_section_id,
                action: "registered",
            });
        }
    }
    return result;
}
//# sourceMappingURL=studentEnrollmentService.js.map