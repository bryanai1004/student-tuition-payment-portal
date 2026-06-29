import type { User } from "@supabase/supabase-js";
import {
  getSupabaseAdminClient,
  getSupabaseAnonClient,
  isSupabaseConfigured,
} from "./supabaseAdmin.js";

/** Internal login email — not used for outbound mail in phase 1. */
export const STUDENT_AUTH_EMAIL_DOMAIN = "students.myamu.auth";

export function studentIdToAuthEmail(studentId: string): string {
  return `${studentId.trim().toLowerCase()}@${STUDENT_AUTH_EMAIL_DOMAIN}`;
}

export function readStudentIdFromAuthUser(user: User): string | null {
  const meta = user.app_metadata as Record<string, unknown> | undefined;
  const raw = meta?.student_id;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = getSupabaseAdminClient();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

export async function upsertStudentSupabaseAuthUser(
  studentId: string,
  password: string,
): Promise<User> {
  const trimmedId = studentId.trim();
  const email = studentIdToAuthEmail(trimmedId);
  const admin = getSupabaseAdminClient();
  const appMetadata = { student_id: trimmedId, role: "student" as const };

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: appMetadata,
  });

  if (!created.error && created.data.user) {
    return created.data.user;
  }

  const msg = created.error?.message ?? "";
  const alreadyExists =
    msg.toLowerCase().includes("already") ||
    msg.toLowerCase().includes("registered") ||
    created.error?.status === 422;

  if (!alreadyExists) {
    throw created.error ?? new Error("Failed to create Supabase auth user.");
  }

  const existing = await findAuthUserByEmail(email);
  if (existing == null) {
    throw new Error(`Supabase auth user exists for ${email} but could not be loaded.`);
  }

  const updated = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    app_metadata: appMetadata,
  });
  if (updated.error) throw updated.error;
  if (!updated.data.user) {
    throw new Error(`Failed to update Supabase auth user for ${trimmedId}.`);
  }
  return updated.data.user;
}

export async function signInStudentWithSupabasePassword(
  studentId: string,
  password: string,
): Promise<boolean> {
  const anon = getSupabaseAnonClient();
  if (anon == null) return false;
  const email = studentIdToAuthEmail(studentId);
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) return false;
  const linkedId = readStudentIdFromAuthUser(data.user);
  return linkedId != null && linkedId.toLowerCase() === studentId.trim().toLowerCase();
}

export function supabaseStudentAuthEnabled(): boolean {
  return isSupabaseConfigured() && getSupabaseAnonClient() != null;
}
