import crypto from "node:crypto";
import {
  maskLoginEmail,
  normalizeLoginEmail,
} from "../lib/studentLoginEmailUtils.js";
import { upsertStudentSupabaseAuthUser } from "../lib/studentSupabaseAuth.js";
import { pool } from "../lib/db.js";
import { updateLegacyStudentPasswordRow } from "../repositories/studentLegacyAccountRepository.js";
import {
  findLoginEmailByStudentId,
  findLoginEmailOwnerStudentId,
} from "../repositories/studentLoginEmailRepository.js";
import {
  consumeOutstandingPasswordResetTokens,
  consumePasswordResetToken,
  countRecentPasswordResetRequests,
  findActivePasswordResetTokenByHash,
  insertPasswordResetToken,
} from "../repositories/studentPasswordResetRepository.js";
import { EMAIL_LOGO_IMG_TAG, emailLogoAttachment } from "../lib/emailBranding.js";
import { sendEmail } from "./emailService.js";

const RESET_EXPIRY_MINUTES = 60;
const PROD_MAX_RESET_REQUESTS_PER_WINDOW = 3;
const PROD_RESET_REQUEST_WINDOW_MINUTES = 60;
const DEV_MAX_RESET_REQUESTS_PER_WINDOW = 30;
const DEV_RESET_REQUEST_WINDOW_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 8;

function passwordResetRateLimit(): { maxRequests: number; windowMinutes: number } {
  if ((process.env.NODE_ENV ?? "development") === "production") {
    return {
      maxRequests: PROD_MAX_RESET_REQUESTS_PER_WINDOW,
      windowMinutes: PROD_RESET_REQUEST_WINDOW_MINUTES,
    };
  }
  return {
    maxRequests: DEV_MAX_RESET_REQUESTS_PER_WINDOW,
    windowMinutes: DEV_RESET_REQUEST_WINDOW_MINUTES,
  };
}

export class StudentPasswordResetError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StudentPasswordResetError";
    this.status = status;
  }
}

function resetTokenPepper(): string {
  return (
    process.env.STUDENT_AUTH_SECRET?.trim() ||
    process.env.STUDENT_PASSWORD_RESET_SECRET?.trim() ||
    "dev-only-password-reset-pepper"
  );
}

function hashResetToken(token: string): string {
  return crypto
    .createHash("sha256")
    .update(`${token}:${resetTokenPepper()}`)
    .digest("hex");
}

function generateResetToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function studentPortalPublicUrl(): string {
  const configured = process.env.STUDENT_PORTAL_PUBLIC_URL?.trim();
  if (configured != null && configured.length > 0) {
    return configured.replace(/\/+$/, "");
  }
  if ((process.env.NODE_ENV ?? "development") === "production") {
    return "https://myamu.wanpanel.ai";
  }
  // Match frontend/vite.config.ts (port 5175) and bind address (localhost, not 127.0.0.1).
  return "http://localhost:5175";
}

function buildResetPasswordUrl(token: string): string {
  return `${studentPortalPublicUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

function validateNewPassword(raw: string): string {
  const password = raw.trim();
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new StudentPasswordResetError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      400,
    );
  }
  return password;
}

function buildResetEmailBodies(resetUrl: string): { text: string; html: string } {
  const text = [
    "Reset your myAMU password",
    "",
    "Use the link below to choose a new password:",
    resetUrl,
    "",
    "This link expires in 1 hour.",
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
        ${EMAIL_LOGO_IMG_TAG}
      </td>
    </tr>
    <tr>
      <td style="font-size:18px;font-weight:600;padding-bottom:8px;">Reset your password</td>
    </tr>
    <tr>
      <td style="font-size:15px;line-height:1.5;padding-bottom:24px;color:#444;">
        Click the button below to choose a new password for myAMU. This link expires in 1 hour.
      </td>
    </tr>
    <tr>
      <td align="center" style="padding-bottom:24px;">
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#8b0015;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Reset password</a>
      </td>
    </tr>
    <tr>
      <td style="font-size:13px;line-height:1.5;color:#666;word-break:break-all;">
        Or copy this link into your browser:<br />${resetUrl}
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text, html };
}

function isMissingTableError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "42P01";
}

/** Always resolves without revealing whether the email exists. */
export async function requestStudentPasswordReset(
  emailRaw: string,
): Promise<{ ok: true }> {
  const email = normalizeLoginEmail(emailRaw);
  if (email == null) {
    throw new StudentPasswordResetError("Enter a valid email address.", 400);
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

    const { maxRequests, windowMinutes } = passwordResetRateLimit();
    const recent = await countRecentPasswordResetRequests(
      studentId,
      windowMinutes,
    );
    if (recent >= maxRequests) {
      throw new StudentPasswordResetError(
        "Too many reset requests. Please wait and try again later.",
        429,
      );
    }

    const token = generateResetToken();
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + RESET_EXPIRY_MINUTES * 60 * 1000);
    const saved = await insertPasswordResetToken({
      studentId,
      tokenHash,
      expiresAt,
    });
    await consumeOutstandingPasswordResetTokens(studentId, saved.id);

    const resetUrl = buildResetPasswordUrl(token);
    const bodies = buildResetEmailBodies(resetUrl);
    const mail = await sendEmail({
      to: [email],
      subject: "Reset your myAMU password",
      text: bodies.text,
      html: bodies.html,
      attachments: [emailLogoAttachment()],
    });

    if (!mail.delivered) {
      throw new StudentPasswordResetError(
        mail.note ?? "Unable to send reset email right now.",
        503,
      );
    }

    return { ok: true };
  } catch (err) {
    if (err instanceof StudentPasswordResetError) throw err;
    if (isMissingTableError(err)) {
      throw new StudentPasswordResetError(
        "Password reset is not available until the latest database migration is applied.",
        503,
      );
    }
    throw err;
  }
}

export async function validateStudentPasswordResetToken(
  tokenRaw: string,
): Promise<{ valid: true; emailMasked: string } | { valid: false }> {
  const token = tokenRaw.trim();
  if (token.length < 16) return { valid: false };

  try {
    const row = await findActivePasswordResetTokenByHash(hashResetToken(token));
    if (row == null) return { valid: false };

    const verified = await findLoginEmailByStudentId(row.studentId);
    if (verified == null) return { valid: false };

    return {
      valid: true,
      emailMasked: maskLoginEmail(verified.email),
    };
  } catch (err) {
    if (isMissingTableError(err)) return { valid: false };
    throw err;
  }
}

export async function confirmStudentPasswordReset(
  tokenRaw: string,
  passwordRaw: string,
): Promise<{ ok: true }> {
  const token = tokenRaw.trim();
  const password = validateNewPassword(passwordRaw);
  if (token.length < 16) {
    throw new StudentPasswordResetError("This reset link is invalid or has expired.", 400);
  }

  const row = await findActivePasswordResetTokenByHash(hashResetToken(token));
  if (row == null) {
    throw new StudentPasswordResetError("This reset link is invalid or has expired.", 400);
  }

  const updated = await updateLegacyStudentPasswordRow(pool, row.studentId, password);
  if (!updated) {
    throw new StudentPasswordResetError(
      "Unable to update password for this account. Please contact the registrar.",
      503,
    );
  }

  try {
    await upsertStudentSupabaseAuthUser(row.studentId, password);
  } catch (err) {
    console.error("[password-reset] supabase sync failed", err);
    throw new StudentPasswordResetError(
      "Password was updated but sign-in sync failed. Try signing in again or contact support.",
      503,
    );
  }

  await consumePasswordResetToken(row.id);
  return { ok: true };
}
