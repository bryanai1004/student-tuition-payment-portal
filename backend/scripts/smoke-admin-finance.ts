/**
 * Smoke: admin finance read paths (Postgres / Supabase).
 * Run from backend: npx tsx scripts/smoke-admin-finance.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { pool } from "../src/lib/db.js";
import { listGlobalFinanceQuarters } from "../src/repositories/adminFinanceRepository.js";
import { listGlobalQuartersPayload } from "../src/services/adminFinanceService.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

console.log("[env] .env loaded from", path.join(root, ".env"));

let exit = 0;

try {
  console.log("[smoke] listGlobalFinanceQuarters …");
  const quarters = await listGlobalFinanceQuarters(pool);
  console.log("[smoke] quarters OK", {
    count: quarters.length,
    sample: quarters.slice(0, 3),
  });
} catch (e) {
  console.error("[smoke] listGlobalFinanceQuarters FAILED", e);
  exit = 1;
}

try {
  console.log("[smoke] listGlobalQuartersPayload …");
  const payload = await listGlobalQuartersPayload();
  console.log("[smoke] quarter payload OK", {
    count: payload.quarters.length,
    sample: payload.quarters.slice(0, 3),
  });
} catch (e) {
  console.error("[smoke] listGlobalQuartersPayload FAILED", e);
  exit = 1;
}

try {
  console.log("[smoke] admin finance roster count …");
  const [rows] = await pool.query<{ cnt: string }[]>(
    `SELECT COUNT(DISTINCT TRIM(student_external_id)) AS cnt
     FROM portal_enrollments
     WHERE TRIM(COALESCE(student_external_id, '')) <> ''`,
  );
  const cnt = Number(rows[0]?.cnt ?? 0);
  console.log("[smoke] roster source count OK", { distinctStudents: cnt });
} catch (e) {
  console.error("[smoke] roster count FAILED", e);
  exit = 1;
}

process.exit(exit);
