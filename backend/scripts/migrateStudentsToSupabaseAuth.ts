#!/usr/bin/env npx tsx
/**
 * Bulk-create Supabase Auth users for legacy students (student id + password login).
 *
 * Password source (first match):
 * 1. defaultStudentPassword(name, id) when name is present
 * 2. skip when no name
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 * Optional: DB_* / DATABASE_URL to read students from Supabase Postgres
 */
import "dotenv/config";
import { pool, type RowDataPacket } from "../src/lib/db.js";
import { defaultStudentPassword } from "../src/lib/defaultStudentPassword.js";
import {
  studentIdToAuthEmail,
  supabaseStudentAuthEnabled,
  upsertStudentSupabaseAuthUser,
} from "../src/lib/studentSupabaseAuth.js";

type StudentRow = { id: string; name: string | null };

async function loadStudentsFromPostgres(): Promise<StudentRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(s.id) AS id, TRIM(s.name) AS name
     FROM students s
     INNER JOIN password_stu p ON TRIM(p.id) = TRIM(s.id)
     ORDER BY s.id ASC`,
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name == null ? null : String(r.name),
  }));
}

async function main(): Promise<void> {
  if (!supabaseStudentAuthEnabled()) {
    throw new Error(
      "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY before running.",
    );
  }

  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : null;

  const students = await loadStudentsFromPostgres();
  const slice =
    limit != null && Number.isFinite(limit) && limit > 0
      ? students.slice(0, limit)
      : students;

  console.log(`Migrating ${slice.length} student auth users to Supabase…`);
  if (dryRun) console.log("(dry run — no writes)");

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of slice) {
    const name = row.name?.trim() ?? "";
    if (name === "") {
      skipped += 1;
      console.warn(`skip ${row.id}: empty name`);
      continue;
    }
    const password = defaultStudentPassword(name, row.id);
    const email = studentIdToAuthEmail(row.id);
    if (dryRun) {
      console.log(`would upsert ${row.id} → ${email}`);
      ok += 1;
      continue;
    }
    try {
      await upsertStudentSupabaseAuthUser(row.id, password);
      ok += 1;
      if (ok % 50 === 0) console.log(`… ${ok} done`);
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`fail ${row.id}: ${msg}`);
    }
  }

  console.log(`Done. ok=${ok} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
