#!/usr/bin/env node
/**
 * Verifies supabase/migrations filenames align with the production ledger documented
 * in docs/database-migrations.md. Exit 1 on mismatch.
 *
 * Usage (from repo root): node backend/scripts/verify-supabase-migration-manifest.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = path.join(repoRoot, "supabase/migrations");

/** Production ledger as of 2026-06-30 — keep in sync with docs/database-migrations.md */
const PRODUCTION_LEDGER = [
  ["20260629154823", "enable_rls_on_all_public_tables"],
  ["20260629161555", "cleanup_nonstandard_student_names"],
  ["20260629181658", "admin_users_staff_columns"],
  ["20260629185159", "grant_public_schema_api_roles"],
  ["20260629191733", "fk_preflight_cleanup"],
  ["20260629191740", "fk_batch_01_portal_core"],
  ["20260629191751", "fk_batch_02_clinical_billing"],
  ["20260629191803", "fk_batch_03_quiz_requirements"],
  ["20260629191805", "fk_batch_04_evaluations"],
  ["20260629191810", "fk_batch_05_evaluations_deferred"],
  ["20260629233852", "portal_store_orders"],
  ["20260629234519", "fix_portal_id_sequences"],
  ["20260630164017", "student_course_bin"],
  ["20260630164451", "backfill_portal_enrollment_course_section_id_v2"],
  ["20260630180000", "course_placeholder_equivalencies"],
];

const PENDING = [
  ["20260630190000", "student_login_email"],
];

function parseFilename(file) {
  const m = /^(\d+)_(.+)\.sql$/.exec(file);
  if (m == null) return null;
  return { version: m[1], name: m[2], file };
}

const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
const parsed = files.map(parseFilename).filter(Boolean);

const expected = new Map([...PRODUCTION_LEDGER, ...PENDING].map(([v, n]) => [v, n]));
const errors = [];

for (const { version, name, file } of parsed) {
  const want = expected.get(version);
  if (want == null) {
    errors.push(`Unexpected migration file: ${file}`);
    continue;
  }
  if (want !== name) {
    errors.push(`Name mismatch for ${version}: file=${name}, expected=${want}`);
  }
}

for (const [version, name] of expected) {
  if (!parsed.some((p) => p.version === version)) {
    errors.push(`Missing migration file: ${version}_${name}.sql`);
  }
}

if (errors.length > 0) {
  console.error("[verify-supabase-migration-manifest] FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `[verify-supabase-migration-manifest] OK — ${parsed.length} files (${PRODUCTION_LEDGER.length} production + ${PENDING.length} pending)`,
);
