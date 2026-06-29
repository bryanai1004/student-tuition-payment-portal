#!/usr/bin/env npx tsx
/**
 * Wipe legacy admin accounts and seed the new staff roster in Postgres + Supabase Auth.
 *
 * Requires: DB_* / DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  deleteNonStudentSupabaseAuthUsers,
} from "../src/lib/supabaseAuthCommon.js";
import {
  STAFF_SEED_ROWS,
  upsertStaffSupabaseAuthUser,
  supabaseStaffAuthEnabled,
} from "../src/lib/staffSupabaseAuth.js";
import { closePool, pool, type Pool, type RowDataPacket } from "../src/lib/db.js";

async function ensureAdminUsersColumns(db: Pool): Promise<void> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'admin_users'
       AND column_name = 'username'`,
  );
  if (rows.length === 0) {
    throw new Error(
      "admin_users.username is missing — apply supabase/migrations for admin_users first.",
    );
  }
}

async function resetAdminUsers(db: Pool): Promise<void> {
  await db.execute(`DELETE FROM admin_users`);
  for (const row of STAFF_SEED_ROWS) {
    const passwordHash = await bcrypt.hash(row.password, 10);
    await db.execute(
      `INSERT INTO admin_users (email, username, display_name, password_hash, role)
       VALUES (?, ?, ?, ?, ?)`,
      [
        row.email.trim().toLowerCase(),
        row.username.trim().toLowerCase(),
        row.displayName.trim(),
        passwordHash,
        row.role,
      ],
    );
  }
}

async function main(): Promise<void> {
  if (!supabaseStaffAuthEnabled()) {
    throw new Error(
      "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY before running.",
    );
  }

  try {
    console.log("Ensuring admin_users columns…");
    await ensureAdminUsersColumns(pool);

    console.log("Removing non-student Supabase Auth users…");
    const deleted = await deleteNonStudentSupabaseAuthUsers();
    console.log(`Deleted ${deleted} non-student auth user(s).`);

    console.log("Resetting admin_users in Postgres…");
    await resetAdminUsers(pool);
    console.log(`Inserted ${STAFF_SEED_ROWS.length} admin_users row(s).`);

    console.log("Creating staff Supabase Auth users…");
    for (const row of STAFF_SEED_ROWS) {
      await upsertStaffSupabaseAuthUser(row);
      console.log(`  ✓ ${row.username} (${row.email}) [${row.role}]`);
    }

    console.log("Staff migration complete.");
  } finally {
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
