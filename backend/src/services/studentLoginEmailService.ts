import crypto from "node:crypto";
import {
  maskLoginEmail,
  normalizeLoginEmail,
  toLoginEmailStatus,
  type StudentLoginEmailStatus,
} from "../lib/studentLoginEmailUtils.js";
import {
  consumeOtpChallenge,
  consumeOutstandingOtpChallenges,
  countRecentOtpSends,
  findLatestActiveOtpChallenge,
  findLoginEmailByStudentId,
  findLoginEmailOwnerStudentId,
  incrementOtpChallengeAttempts,
  insertOtpChallenge,
  updateOtpChallengeHash,
  upsertVerifiedLoginEmail,
} from "../repositories/studentLoginEmailRepository.js";
import { sendEmail } from "./emailService.js";

const OTP_PURPOSE_VERIFY = "verify";
const OTP_EXPIRY_MINUTES = 10;
const MAX_SENDS_PER_WINDOW = 3;
const SEND_WINDOW_MINUTES = 15;
const MAX_VERIFY_ATTEMPTS = 5;

const PORTAL_LOGO_URL = "https://myamu.wanpanel.ai/app.png";

function otpPepper(): string {
  return (
    process.env.STUDENT_AUTH_SECRET?.trim() ||
    process.env.STUDENT_LOGIN_EMAIL_OTP_SECRET?.trim() ||
    "dev-only-login-email-otp-pepper"
  );
}

function hashOtpCode(code: string, challengeId: number, studentId: string): string {
  return crypto
    .createHash("sha256")
    .update(`${code}:${challengeId}:${studentId}:${otpPepper()}`)
    .digest("hex");
}

function generateOtpCode(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}

function buildOtpEmailBodies(code: string): { text: string; html: string } {
  const text = [
    "Your myAMU verification code",
    "",
    code,
    "",
    "This code expires in 10 minutes.",
    "If you did not request this, you can ignore this email.",
    "",
    "Alhambra Medical University",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px 24px;">
    <tr>
      <td align="center" style="padding-bottom:24px;">
        <img src="${PORTAL_LOGO_URL}" alt="Alhambra Medical University" width="80" height="93" style="display:block;" />
      </td>
    </tr>
    <tr>
      <td style="font-size:18px;font-weight:600;padding-bottom:8px;">Your verification code</td>
    </tr>
    <tr>
      <td style="font-size:15px;line-height:1.5;padding-bottom:24px;color:#444;">
        Enter this code in My Account to verify your login email for myAMU.
      </td>
    </tr>
    <tr>
      <td align="center" style="padding-bottom:24px;">
        <span style="display:inline-block;font-size:32px;font-weight:700;letter-spacing:6px;padding:12px 20px;background:#f0f0f0;border-radius:8px;">${code}</span>
      </td>
    </tr>
    <tr>
      <td style="font-size:13px;line-height:1.5;color:#666;">
        This code expires in 10 minutes. If you did not request this, you can ignore this email.
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text, html };
}

export class StudentLoginEmailError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StudentLoginEmailError";
    this.status = status;
  }
}

function isMissingTableError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "42P01";
}

export async function getStudentLoginEmailStatus(
  studentId: string,
): Promise<StudentLoginEmailStatus> {
  try {
    const row = await findLoginEmailByStudentId(studentId);
    return toLoginEmailStatus(
      row ? { email: row.email, verifiedAt: row.verifiedAt } : null,
    );
  } catch (err) {
    if (isMissingTableError(err)) {
      throw new StudentLoginEmailError(
        "Login email is not available until the student_login_email migration is applied.",
        503,
      );
    }
    throw err;
  }
}

export async function sendStudentLoginEmailCode(
  studentId: string,
  emailRaw: string,
): Promise<{ expiresInSeconds: number }> {
  const email = normalizeLoginEmail(emailRaw);
  if (email == null) {
    throw new StudentLoginEmailError("Enter a valid email address.", 400);
  }

  const owner = await findLoginEmailOwnerStudentId(email);
  if (owner != null && owner.toLowerCase() !== studentId.trim().toLowerCase()) {
    throw new StudentLoginEmailError(
      "This email is already linked to another student account.",
      409,
    );
  }

  const recentSends = await countRecentOtpSends(studentId, SEND_WINDOW_MINUTES);
  if (recentSends >= MAX_SENDS_PER_WINDOW) {
    throw new StudentLoginEmailError(
      "Too many codes sent. Please wait a few minutes and try again.",
      429,
    );
  }

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const challenge = await insertOtpChallenge({
    studentId,
    email,
    codeHash: "pending",
    purpose: OTP_PURPOSE_VERIFY,
    expiresAt,
  });

  const codeHash = hashOtpCode(code, challenge.id, studentId);
  await updateOtpChallengeHash(challenge.id, codeHash);
  await consumeOutstandingOtpChallenges({
    studentId,
    purpose: OTP_PURPOSE_VERIFY,
    exceptId: challenge.id,
  });

  const bodies = buildOtpEmailBodies(code);
  const mail = await sendEmail({
    to: [email],
    subject: `${code} is your myAMU verification code`,
    text: bodies.text,
    html: bodies.html,
  });

  if (!mail.delivered) {
    throw new StudentLoginEmailError(
      mail.note ?? "Unable to send verification email right now.",
      503,
    );
  }

  return { expiresInSeconds: OTP_EXPIRY_MINUTES * 60 };
}

export async function verifyStudentLoginEmailCode(
  studentId: string,
  emailRaw: string,
  codeRaw: string,
): Promise<StudentLoginEmailStatus> {
  const email = normalizeLoginEmail(emailRaw);
  if (email == null) {
    throw new StudentLoginEmailError("Enter a valid email address.", 400);
  }

  const code = codeRaw.trim().replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) {
    throw new StudentLoginEmailError("Enter the 6-digit code from your email.", 400);
  }

  const owner = await findLoginEmailOwnerStudentId(email);
  if (owner != null && owner.toLowerCase() !== studentId.trim().toLowerCase()) {
    throw new StudentLoginEmailError(
      "This email is already linked to another student account.",
      409,
    );
  }

  const existing = await findLoginEmailByStudentId(studentId);
  if (existing != null && existing.email.toLowerCase() === email) {
    return {
      verified: true,
      emailMasked: maskLoginEmail(existing.email),
      verifiedAt: existing.verifiedAt,
    };
  }

  const challenge = await findLatestActiveOtpChallenge({
    studentId,
    email,
    purpose: OTP_PURPOSE_VERIFY,
  });
  if (challenge == null) {
    throw new StudentLoginEmailError(
      "No active verification code. Send a new code and try again.",
      400,
    );
  }

  if (challenge.email.toLowerCase() !== email) {
    throw new StudentLoginEmailError(
      "This code was sent to a different email address. Send a new code for the email you entered.",
      400,
    );
  }

  if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
    throw new StudentLoginEmailError(
      "Too many incorrect attempts. Send a new code and try again.",
      429,
    );
  }

  const expected = hashOtpCode(code, challenge.id, studentId);
  if (expected !== challenge.codeHash) {
    await incrementOtpChallengeAttempts(challenge.id);
    throw new StudentLoginEmailError("Incorrect code. Try again.", 400);
  }

  await consumeOtpChallenge(challenge.id);
  const saved = await upsertVerifiedLoginEmail(studentId, email);
  return {
    verified: true,
    emailMasked: maskLoginEmail(saved.email),
    verifiedAt: saved.verifiedAt,
  };
}
