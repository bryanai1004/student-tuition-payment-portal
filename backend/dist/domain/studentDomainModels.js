/**
 * Canonical domain shapes for student academics, registration, transcript display, degree audit, and clinical progress.
 *
 * ## Source of truth (read path)
 *
 * - **AcademicAttempt** — legacy `marks` (primary didactic outcomes); legacy `clinic` rows may appear as
 *   attempts for **transcript display only**. Clinic rows must not be folded into **earned academic units**
 *   for degree audit (use `attemptsFromMarks` only in {@link computeDegreeAudit}).
 * - **RegistrationRecord** — `portal_enrollments` joined to catalog + one deterministic `course_sections` row
 *   per course/term/year (see `listPortalEnrollmentRowsForStudentAcademics`).
 * - **DegreeAudit** — program `requirements` (with fallbacks when null) plus **cleaned** marks-based attempts;
 *   clinic hours are tracked separately from academic units.
 * - **TranscriptRecord** — presentation-only history (sorted, normalized titles). Not authoritative for
 *   registration state or degree progress.
 * - **ClinicalProgressDomain** — `clinic` + `requirements.clinic_hours`; independent of {@link AcademicAttempt}.
 */
export function isAcademicAttemptRow(r) {
    return r.source === "marks" || r.source === "clinic";
}
export function isRegistrationPortalRow(r) {
    return r.source === "portal";
}
/** Narrows a transport row to {@link AcademicAttempt} when `source` is `marks` or `clinic`. */
export function academicCourseRecordToAcademicAttempt(r) {
    if (!isAcademicAttemptRow(r))
        return null;
    return {
        studentId: r.studentId,
        courseCode: r.courseCode,
        courseTitle: r.courseTitle,
        term: r.term,
        year: r.year,
        credits: r.credits,
        grade: r.grade,
        numericGrade: r.numericGrade,
        status: r.status,
        source: r.source,
    };
}
/**
 * Skeleton for future degree audit. Transcript and preview services must **not** embed this logic.
 *
 * TODO:
 * - Dedupe attempts by course code (pick best / latest per program rules).
 * - Exclude AUD / NP / null grades from earned academic units.
 * - Sum earned units from eligible marks attempts only.
 * - Apply fallback requirements when `requirements` row is missing.
 */
export function computeDegreeAudit(input) {
    return {
        requiredAcademicUnits: input.requiredAcademicUnits,
        earnedAcademicUnits: 0,
        requiredClinicHours: input.requiredClinicHours,
        earnedClinicHours: input.earnedClinicHours,
        officialStatus: input.officialStudentStatus,
        computedStatus: "unknown",
    };
}
//# sourceMappingURL=studentDomainModels.js.map