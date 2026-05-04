/**
 * Smoke: portal course withdrawal eligibility + soft-withdraw (requires MySQL in .env).
 *
 * Usage (from backend/):
 *   npx tsx scripts/smoke-portal-withdrawal.ts <STUDENT_ID> <ACADEMIC_TERM_UUID> <COURSE_SECTION_ID>
 *
 * Steps:
 * 1. Calls `removeAdminPortalEnrollment` (same as POST /api/student/withdraw).
 * 2. Calls again — expect failure (already withdrawn) or zero rows if first call failed.
 *
 * Manual QA (not automated here): past-deadline term, completed enrollment — expect 400 messages
 * from server. Adjust `withdraw_deadline` on `academic_terms` or pick fixture rows to verify.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { removeAdminPortalEnrollment } from "../src/services/adminEnrollmentService.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const sid = process.argv[2]?.trim() ?? "";
const tid = process.argv[3]?.trim() ?? "";
const csRaw = process.argv[4]?.trim() ?? "";
const csid = /^\d+$/.test(csRaw) ? parseInt(csRaw, 10) : NaN;

console.log("[env] .env loaded from", path.join(root, ".env"));

if (sid === "" || tid === "" || !Number.isFinite(csid) || csid <= 0) {
  console.error(
    "Usage: npx tsx scripts/smoke-portal-withdrawal.ts <STUDENT_ID> <ACADEMIC_TERM_ID> <COURSE_SECTION_ID>",
  );
  process.exit(2);
}

let exit = 0;

async function run(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.error(`[smoke] ${label} FAILED`, e);
    exit = 1;
  }
}

await run("withdraw (1st)", async () => {
  console.log("[smoke] first withdraw …", { sid, tid, csid });
  const r = await removeAdminPortalEnrollment({
    studentId: sid,
    academic_term_id: tid,
    course_section_id: csid,
  });
  console.log("[smoke] first result:", r);
  if (!r.ok) {
    throw new Error(String(r.error));
  }
  if (r.removedCount < 1) {
    console.warn(
      "[smoke] removedCount was 0 — check active enrollment, deadline, and section id.",
    );
  }
});

await run("withdraw (2nd, expect block)", async () => {
  console.log("[smoke] second withdraw (should be blocked if first succeeded) …");
  const r = await removeAdminPortalEnrollment({
    studentId: sid,
    academic_term_id: tid,
    course_section_id: csid,
  });
  console.log("[smoke] second result:", r);
  if (r.ok && r.removedCount > 0) {
    console.warn("[smoke] unexpected: second call removed rows again.");
  }
  if (r.ok && r.removedCount === 0) {
    console.log("[smoke] second call returned ok with 0 rows (idempotent / race).");
  }
  if (!r.ok) {
    console.log("[smoke] second call rejected as expected:", r.error);
  }
});

process.exit(exit);
