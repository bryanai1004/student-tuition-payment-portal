/**
 * Upserts the DB-backed admin (`deanjiang@amu`) into `admin_users`.
 * Other admin emails use legacy hardcoded auth (see `legacyAdminAccounts.ts`).
 * Run after migration `015_admin_users.sql`. Usage (from backend/): `npm run admin:create`
 */
import bcrypt from "bcrypt";
import { closePool, pool, testDatabaseConnection } from "../src/lib/db.js";

type SeedRow = { email: string; password: string; role: string };

const SEED_ROWS: readonly SeedRow[] = [
  { email: "deanjiang@amu", password: "deanjiang123", role: "super_admin" },
] as const;

async function main(): Promise<void> {
  await testDatabaseConnection();
  for (const row of SEED_ROWS) {
    const passwordHash = await bcrypt.hash(row.password, 10);
    await pool.execute(
      `INSERT INTO admin_users (email, password_hash, role)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         role = VALUES(role)`,
      [row.email, passwordHash, row.role],
    );
  }
  console.log(`[admin:create] Upserted ${SEED_ROWS.length} admin_users row(s).`);
  await closePool();
}

main().catch((e: unknown) => {
  console.error("[admin:create] failed:", e);
  process.exit(1);
});
