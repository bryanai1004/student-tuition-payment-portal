import { type Pool } from "../lib/db.js";
import { issueStudentAccessToken } from "../lib/studentAuthToken.js";
import {
  signInStudentWithSupabasePassword,
  supabaseStudentAuthEnabled,
  upsertStudentSupabaseAuthUser,
} from "../lib/studentSupabaseAuth.js";
import { findLegacyStudentById } from "../repositories/studentLegacyAuthRepository.js";
import { authenticateLegacyStudent } from "./studentLegacyAuthService.js";

export type StudentLoginResult = {
  studentId: string;
  displayName: string;
  accessToken: string;
  verifiedVia: "supabase_auth" | "legacy_synced_to_supabase" | "legacy_only";
};

export async function authenticateStudentLogin(
  pool: Pool,
  studentIdRaw: string,
  passwordRaw: string,
): Promise<StudentLoginResult | null> {
  const studentId = studentIdRaw.trim();
  const password = passwordRaw.trim();
  if (studentId.length === 0 || password.length === 0) return null;

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
      return {
        studentId: row.id,
        displayName,
        accessToken: issueStudentAccessToken(row.id),
        verifiedVia: "supabase_auth",
      };
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
    return {
      studentId: legacy.studentId,
      displayName: legacy.displayName,
      accessToken: issueStudentAccessToken(legacy.studentId),
      verifiedVia: "legacy_synced_to_supabase",
    };
  }

  console.info("[auth] student login ok", {
    studentId,
    verifiedVia: "legacy_only",
  });
  return {
    studentId: legacy.studentId,
    displayName: legacy.displayName,
    accessToken: issueStudentAccessToken(legacy.studentId),
    verifiedVia: "legacy_only",
  };
}
