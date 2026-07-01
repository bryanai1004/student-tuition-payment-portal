import { pool } from "../lib/db.js";
import { normalizeLoginEmail } from "../lib/studentLoginEmailUtils.js";
import { findLegacyStudentById } from "../repositories/studentLegacyAuthRepository.js";
import {
  findLoginEmailByStudentId,
  findLoginEmailOwnerStudentId,
} from "../repositories/studentLoginEmailRepository.js";
import {
  countRecentStudentIdRecoveryRequests,
  insertStudentIdRecoveryRequest,
} from "../repositories/studentIdRecoveryRepository.js";
import { EMAIL_LOGO_IMG_TAG, emailLogoAttachment } from "../lib/emailBranding.js";
import { sendEmail } from "./emailService.js";

const MAX_REQUESTS_PER_WINDOW = 3;
const REQUEST_WINDOW_MINUTES = 60;

export class StudentIdRecoveryError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StudentIdRecoveryError";
    this.status = status;
  }
}

function isMissingTableError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "42P01";
}

function buildStudentIdRecoveryEmailBodies(input: {
  studentId: string;
  displayName: string;
}): { text: string; html: string } {
  const text = [
    "Your myAMU student ID",
    "",
    `Student ID: ${input.studentId}`,
    input.displayName.length > 0 ? `Name: ${input.displayName}` : "",
    "",
    "Use this ID to sign in at myAMU. If you did not request this, you can ignore this email.",
    "",
    "Alhambra Medical University",
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  const nameRow =
    input.displayName.length > 0
      ? `<tr>
      <td style="font-size:15px;line-height:1.5;padding-bottom:8px;color:#444;">
        Name: <strong>${input.displayName}</strong>
      </td>
    </tr>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px 24px;">
    <tr>
      <td align="center" style="padding-bottom:24px;">
        ${EMAIL_LOGO_IMG_TAG}
      </td>
    </tr>
    <tr>
      <td style="font-size:18px;font-weight:600;padding-bottom:8px;">Your student ID</td>
    </tr>
    <tr>
      <td style="font-size:15px;line-height:1.5;padding-bottom:16px;color:#444;">
        Here is the student ID linked to your verified login email.
      </td>
    </tr>
    <tr>
      <td align="center" style="padding-bottom:16px;">
        <span style="display:inline-block;font-size:28px;font-weight:700;letter-spacing:2px;padding:12px 20px;background:#f0f0f0;border-radius:8px;">${input.studentId}</span>
      </td>
    </tr>
    ${nameRow}
    <tr>
      <td style="font-size:13px;line-height:1.5;color:#666;">
        If you did not request this, you can ignore this email.
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text, html };
}

/** Always resolves without revealing whether the email exists. */
export async function requestStudentIdRecovery(emailRaw: string): Promise<{ ok: true }> {
  const email = normalizeLoginEmail(emailRaw);
  if (email == null) {
    throw new StudentIdRecoveryError("Enter a valid email address.", 400);
  }

  try {
    const studentId = await findLoginEmailOwnerStudentId(email);
    if (studentId == null || studentId.length === 0) {
      return { ok: true };
    }

    const verified = await findLoginEmailByStudentId(studentId);
    if (verified == null || verified.email.toLowerCase() !== email) {
      return { ok: true };
    }

    const recent = await countRecentStudentIdRecoveryRequests(
      studentId,
      REQUEST_WINDOW_MINUTES,
    );
    if (recent >= MAX_REQUESTS_PER_WINDOW) {
      throw new StudentIdRecoveryError(
        "Too many requests. Please wait and try again later.",
        429,
      );
    }

    const legacy = await findLegacyStudentById(pool, studentId);
    const displayName = legacy?.name.trim() ?? "";
    await insertStudentIdRecoveryRequest({ studentId, email });

    const bodies = buildStudentIdRecoveryEmailBodies({
      studentId,
      displayName,
    });
    const mail = await sendEmail({
      to: [email],
      subject: `Your myAMU student ID: ${studentId}`,
      text: bodies.text,
      html: bodies.html,
      attachments: [emailLogoAttachment()],
    });

    if (!mail.delivered) {
      throw new StudentIdRecoveryError(
        mail.note ?? "Unable to send email right now.",
        503,
      );
    }

    return { ok: true };
  } catch (err) {
    if (err instanceof StudentIdRecoveryError) throw err;
    if (isMissingTableError(err)) {
      throw new StudentIdRecoveryError(
        "Student ID recovery is not available until the latest database migration is applied.",
        503,
      );
    }
    throw err;
  }
}
