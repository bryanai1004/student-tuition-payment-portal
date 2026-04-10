import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import {
  deletePortalEnrollmentByStudentCourseTermYear,
  softWithdrawPortalEnrollmentByCourseSection,
} from "../repositories/studentEnrollmentRepository.js";

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

  return { ok: true, removedCount };
}
