/**
 * Portal enrollment removal is always a **soft withdraw** (`status = withdrawn`, `withdrawn_at` set).
 * No `DELETE` from `portal_enrollments` on this path — rows are retained for audit and unofficial W display.
 */
import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import {
  deletePortalEnrollmentByStudentCourseTermYear,
  softWithdrawPortalEnrollmentByCourseSection,
} from "../repositories/studentEnrollmentRepository.js";
import { assertPortalWithdrawalAllowed } from "./portalWithdrawalEligibilityService.js";
import { emitEnrollmentChanged } from "./realtimeEventBus.js";

export async function removeAdminPortalEnrollment(params: {
  studentId: string;
  academic_term_id: string;
  /** Preferred: withdraw this `course_sections.id` row only. */
  course_section_id?: number | null;
  /** Legacy fallback when `course_section_id` is omitted: course-level row (`course_section_id` IS NULL). */
  course_code?: string;
}): Promise<
  { ok: true; removedCount: number } | { ok: false; error: string }
> {
  const tid = params.academic_term_id.trim();
  const sid = params.studentId.trim();
  const csidRaw = params.course_section_id;
  const csid =
    csidRaw == null ? NaN : Math.trunc(Number(csidRaw));
  const code = (params.course_code ?? "").trim();

  if (tid === "" || sid === "") {
    return {
      ok: false,
      error:
        "studentId and academic_term_id are required; provide course_section_id or course_code.",
    };
  }

  const term = await getAcademicTermById(tid);
  if (term == null) {
    return { ok: false, error: "Invalid or unknown academic_term_id." };
  }

  const eligibility = await assertPortalWithdrawalAllowed({
    studentId: sid,
    termName: term.term_name,
    year: term.year,
    courseSectionId: Number.isFinite(csid) && csid > 0 ? csid : null,
    courseCodeForLegacy:
      Number.isFinite(csid) && csid > 0 ? null : code !== "" ? code : null,
  });
  if (!eligibility.ok) {
    return { ok: false, error: eligibility.error };
  }

  let removedCount = 0;
  if (Number.isFinite(csid) && csid > 0) {
    removedCount = await softWithdrawPortalEnrollmentByCourseSection(
      sid,
      term.term_name,
      term.year,
      csid,
    );
  } else if (code !== "") {
    removedCount = await deletePortalEnrollmentByStudentCourseTermYear(
      sid,
      code,
      term.term_name,
      term.year,
    );
  } else {
    return {
      ok: false,
      error: "course_section_id or course_code is required.",
    };
  }

  if (removedCount > 0) {
    emitEnrollmentChanged({
      studentId: sid,
      sectionId: Number.isFinite(csid) && csid > 0 ? csid : null,
      action: "dropped",
    });
  }

  return { ok: true, removedCount };
}
