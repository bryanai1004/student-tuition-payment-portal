import {
  precheckPortalWithdrawalByCourseSection,
  precheckPortalWithdrawalLegacyCourseOnly,
  type PortalWithdrawalPrecheckCode,
} from "../repositories/studentEnrollmentRepository.js";

function messageForPrecheck(code: PortalWithdrawalPrecheckCode): string {
  switch (code) {
    case "allowed":
      return "";
    case "not_found":
      return "No active enrollment was found for this course section and term.";
    case "deadline_passed":
      return "The withdraw deadline for this term has passed.";
    case "already_withdrawn":
      return "This enrollment is already withdrawn.";
    case "completed":
      return "This course is completed; withdrawal is not available.";
    case "not_withdrawable_status":
      return "This enrollment cannot be withdrawn (status is not active).";
    default:
      return "Withdrawal is not allowed.";
  }
}

/**
 * Validates portal course withdrawal before running the soft-withdraw UPDATE.
 * Aligns with Academics `can_withdraw` (deadline + active/enrolled/registered + not completed).
 */
export async function assertPortalWithdrawalAllowed(params: {
  studentId: string;
  termName: string;
  year: number;
  courseSectionId?: number | null;
  courseCodeForLegacy?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = params.studentId.trim();
  const termName = params.termName.trim();
  const year = Math.trunc(Number(params.year));
  if (sid === "" || termName === "" || !Number.isFinite(year)) {
    return { ok: false, error: "studentId, term, and year are required." };
  }

  const csidRaw = params.courseSectionId;
  const csid =
    csidRaw == null ? NaN : Math.trunc(Number(csidRaw));
  const legacyCode = (params.courseCodeForLegacy ?? "").trim();

  if (Number.isFinite(csid) && csid > 0) {
    const code = await precheckPortalWithdrawalByCourseSection(
      sid,
      termName,
      year,
      csid,
    );
    if (code === "allowed") return { ok: true };
    return { ok: false, error: messageForPrecheck(code) };
  }

  if (legacyCode !== "") {
    const code = await precheckPortalWithdrawalLegacyCourseOnly(
      sid,
      legacyCode,
      termName,
      year,
    );
    if (code === "allowed") return { ok: true };
    return { ok: false, error: messageForPrecheck(code) };
  }

  return {
    ok: false,
    error: "course_section_id or course_code is required for withdrawal.",
  };
}
