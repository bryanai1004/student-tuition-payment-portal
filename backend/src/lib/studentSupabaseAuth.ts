import type { User } from "@supabase/supabase-js";
import { findLoginEmailByStudentId } from "../repositories/studentLoginEmailRepository.js";
import {
  findSupabaseAuthUserByEmail,
} from "./supabaseAuthCommon.js";
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

export class StudentSupabaseAuthLinkError extends Error {
  readonly status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "StudentSupabaseAuthLinkError";
    this.status = status;
  }
}

async function findAuthUserByStudentId(studentId: string): Promise<User | null> {
  const target = studentId.trim().toLowerCase();
  const admin = getSupabaseAdminClient();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => {
      const linked = readStudentIdFromAuthUser(u);
      return linked != null && linked.toLowerCase() === target;
    });
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

function readAccountType(user: User): string | null {
  const meta = user.app_metadata as Record<string, unknown> | undefined;
  const raw = meta?.account_type;
  return typeof raw === "string" ? raw.trim().toLowerCase() : null;
}

function authUserOwnsStudentId(user: User, studentId: string): boolean {
  const linked = readStudentIdFromAuthUser(user);
  return linked != null && linked.toLowerCase() === studentId.trim().toLowerCase();
}

/** After profile OTP verification, persist the real login email on the Supabase auth user. */
export async function linkVerifiedLoginEmailToSupabaseAuth(
  studentId: string,
  loginEmailRaw: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const trimmedId = studentId.trim();
  const loginEmail = loginEmailRaw.trim().toLowerCase();
  const admin = getSupabaseAdminClient();
  const appMetadata = { student_id: trimmedId, role: "student" as const };

  const studentUser =
    (await findAuthUserByStudentId(trimmedId)) ??
    (await findSupabaseAuthUserByEmail(studentIdToAuthEmail(trimmedId)));
  const emailUser = await findSupabaseAuthUserByEmail(loginEmail);

  if (emailUser != null && !authUserOwnsStudentId(emailUser, trimmedId)) {
    if (readAccountType(emailUser) === "staff") {
      throw new StudentSupabaseAuthLinkError("This email is already in use.");
    }
    const otherStudent = readStudentIdFromAuthUser(emailUser);
    if (otherStudent != null) {
      throw new StudentSupabaseAuthLinkError(
        "This email is already linked to another student account.",
      );
    }
    if (emailUser.id !== studentUser?.id) {
      throw new StudentSupabaseAuthLinkError("This email is already in use.");
    }
  }

  if (studentUser != null) {
    const emailMatches =
      (studentUser.email ?? "").trim().toLowerCase() === loginEmail;
    const updated = await admin.auth.admin.updateUserById(studentUser.id, {
      ...(emailMatches ? {} : { email: loginEmail }),
      email_confirm: true,
      app_metadata: appMetadata,
    });
    if (updated.error) {
      const msg = updated.error.message ?? "";
      if (
        msg.toLowerCase().includes("already") ||
        updated.error.status === 422
      ) {
        throw new StudentSupabaseAuthLinkError(
          "This email is already linked to another student account.",
        );
      }
      throw updated.error;
    }

    if (
      emailUser != null &&
      emailUser.id !== studentUser.id &&
      authUserOwnsStudentId(emailUser, trimmedId)
    ) {
      await admin.auth.admin.deleteUser(emailUser.id);
    }
    return;
  }

  if (emailUser != null && authUserOwnsStudentId(emailUser, trimmedId)) {
    const updated = await admin.auth.admin.updateUserById(emailUser.id, {
      email_confirm: true,
      app_metadata: appMetadata,
    });
    if (updated.error) throw updated.error;
    return;
  }

  const created = await admin.auth.admin.createUser({
    email: loginEmail,
    email_confirm: true,
    app_metadata: appMetadata,
  });
  if (created.error) {
    const msg = created.error.message ?? "";
    if (msg.toLowerCase().includes("already") || created.error.status === 422) {
      throw new StudentSupabaseAuthLinkError(
        "This email is already linked to another student account.",
      );
    }
    throw created.error;
  }
}

export async function upsertStudentSupabaseAuthUser(
  studentId: string,
  password: string,
): Promise<User> {
  const trimmedId = studentId.trim();
  const verifiedLoginEmail = (await findLoginEmailByStudentId(trimmedId))?.email;
  const email =
    verifiedLoginEmail != null && verifiedLoginEmail.trim().length > 0
      ? verifiedLoginEmail.trim().toLowerCase()
      : studentIdToAuthEmail(trimmedId);
  const admin = getSupabaseAdminClient();
  const appMetadata = { student_id: trimmedId, role: "student" as const };

  const existingStudentUser =
    (await findAuthUserByStudentId(trimmedId)) ??
    (await findSupabaseAuthUserByEmail(email));

  if (existingStudentUser != null) {
    const emailMatches =
      (existingStudentUser.email ?? "").trim().toLowerCase() === email;
    const updated = await admin.auth.admin.updateUserById(existingStudentUser.id, {
      ...(emailMatches ? {} : { email }),
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

  const existing = await findSupabaseAuthUserByEmail(email);
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

  const verifiedLoginEmail = (await findLoginEmailByStudentId(studentId))?.email;
  const emailsToTry = [
    verifiedLoginEmail?.trim().toLowerCase(),
    studentIdToAuthEmail(studentId),
  ].filter((e): e is string => typeof e === "string" && e.length > 0);

  for (const email of emailsToTry) {
    const { data, error } = await anon.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session) continue;
    const linkedId = readStudentIdFromAuthUser(data.user);
    if (linkedId != null && linkedId.toLowerCase() === studentId.trim().toLowerCase()) {
      return true;
    }
  }
  return false;
}

export function supabaseStudentAuthEnabled(): boolean {
  return isSupabaseConfigured() && getSupabaseAnonClient() != null;
}
