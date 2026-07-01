import { type Pool } from "../lib/db.js";
import { normalizeLoginEmail } from "../lib/studentLoginEmailUtils.js";
import { issueStudentAccessToken } from "../lib/studentAuthToken.js";
import {
  signInStudentWithSupabasePassword,
  supabaseStudentAuthEnabled,
  upsertStudentSupabaseAuthUser,
} from "../lib/studentSupabaseAuth.js";
import { findLoginEmailOwnerStudentId } from "../repositories/studentLoginEmailRepository.js";
import { findLegacyStudentById } from "../repositories/studentLegacyAuthRepository.js";
import { authenticateLegacyStudent } from "./studentLegacyAuthService.js";

export type StudentLoginResult = {
  studentId: string;
  displayName: string;
  accessToken: string;
  verifiedVia: "supabase_auth" | "legacy_synced_to_supabase" | "legacy_only" | "otp";
};

/** Accept legacy student id or a verified login email address. */
export async function resolveStudentLoginIdentifier(
  pool: Pool,
  identifierRaw: string,
): Promise<string | null> {
  const trimmed = identifierRaw.trim();
  if (trimmed.length === 0) return null;

  const byId = await findLegacyStudentById(pool, trimmed);
  if (byId != null) return byId.id;

  const email = normalizeLoginEmail(trimmed);
  if (email == null) return null;

  const owner = await findLoginEmailOwnerStudentId(email);
  if (owner == null || owner.length === 0) return null;

  const byEmail = await findLegacyStudentById(pool, owner);
  return byEmail?.id ?? null;
}

function buildStudentLoginResult(
  studentId: string,
  displayName: string,
  verifiedVia: StudentLoginResult["verifiedVia"],
): StudentLoginResult {
  return {
    studentId,
    displayName,
    accessToken: issueStudentAccessToken(studentId),
    verifiedVia,
  };
}

export async function authenticateStudentLogin(
  pool: Pool,
  studentIdRaw: string,
  passwordRaw: string,
): Promise<StudentLoginResult | null> {
  const password = passwordRaw.trim();
  if (password.length === 0) return null;

  const studentId = await resolveStudentLoginIdentifier(pool, studentIdRaw);
  if (studentId == null) {
    console.info("[auth] student login denied", {
      studentId: studentIdRaw.trim(),
      stage: "no_students_row",
    });
    return null;
  }

  const row = await findLegacyStudentById(pool, studentId);
  if (!row) {
    console.info("[auth] student login denied", { studentId, stage: "no_students_row" });
    return null;
  }

  const displayName = row.name.trim().length > 0 ? row.name.trim() : row.id;

  if (supabaseStudentAuthEnabled()) {
    const supabaseOk = await signInStudentWithSupabasePassword(studentId, password);
    if (supabaseOk) {
      console.info("[auth] student login ok", {
        studentId,
        verifiedVia: "supabase_auth",
      });
      return buildStudentLoginResult(studentId, displayName, "supabase_auth");
    }
  }

  const legacy = await authenticateLegacyStudent(pool, studentId, password);
  if (legacy == null) {
    console.info("[auth] student login denied", {
      studentId,
      stage: "credentials_rejected",
    });
    return null;
  }

  if (supabaseStudentAuthEnabled()) {
    await upsertStudentSupabaseAuthUser(studentId, password);
    console.info("[auth] student login ok", {
      studentId,
      verifiedVia: "legacy_synced_to_supabase",
    });
    return buildStudentLoginResult(
      legacy.studentId,
      legacy.displayName,
      "legacy_synced_to_supabase",
    );
  }

  console.info("[auth] student login ok", {
    studentId,
    verifiedVia: "legacy_only",
  });
  return buildStudentLoginResult(
    legacy.studentId,
    legacy.displayName,
    "legacy_only",
  );
}

export async function authenticateStudentLoginOtp(
  pool: Pool,
  emailRaw: string,
  codeRaw: string,
): Promise<StudentLoginResult> {
  const { verifyStudentLoginOtpCode } = await import("./studentLoginEmailService.js");
  const { studentId } = await verifyStudentLoginOtpCode(emailRaw, codeRaw);

  const row = await findLegacyStudentById(pool, studentId);
  if (!row) {
    throw new Error(`Student ${studentId} not found after OTP verification.`);
  }

  const displayName = row.name.trim().length > 0 ? row.name.trim() : row.id;
  console.info("[auth] student login ok", { studentId, verifiedVia: "otp" });
  return buildStudentLoginResult(studentId, displayName, "otp");
}
