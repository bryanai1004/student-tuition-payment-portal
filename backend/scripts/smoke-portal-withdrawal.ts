/**
 * Smoke: portal course withdrawal eligibility + soft-withdraw (Postgres / Supabase).
 *
 * Usage (from backend/):
 *   npx tsx scripts/smoke-portal-withdrawal.ts [--prepare] [<STUDENT_ID> <ACADEMIC_TERM_ID> <COURSE_SECTION_ID>]
 *
 * With `--prepare` (default when args omitted): extends withdraw_deadline, reactivates enrollment, runs test, restores deadline.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { removeAdminPortalEnrollment } from "../src/services/adminEnrollmentService.js";
import {
  prepareWithdrawalSmokeFixture,
  restoreWithdrawalSmokeFixtureDeadline,
  type WithdrawalSmokeFixture,
} from "./lib/withdrawalSmokeFixture.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const argv = process.argv.slice(2);
const prepare = argv.includes("--prepare") || argv.length === 0;
const positional = argv.filter((a) => a !== "--prepare");

let sid = positional[0]?.trim() ?? "";
let tid = positional[1]?.trim() ?? "";
const csRaw = positional[2]?.trim() ?? "";
let csid = /^\d+$/.test(csRaw) ? parseInt(csRaw, 10) : NaN;

console.log("[env] .env loaded from", path.join(root, ".env"));

let fixture: WithdrawalSmokeFixture | null = null;
if (prepare) {
  console.log("[smoke] preparing withdrawal fixture …");
  fixture = await prepareWithdrawalSmokeFixture(
    sid && tid && Number.isFinite(csid)
      ? { studentId: sid, academicTermId: tid, courseSectionId: csid }
      : undefined,
  );
  sid = fixture.studentId;
  tid = fixture.academicTermId;
  csid = fixture.courseSectionId;
  console.log("[smoke] fixture ready", fixture);
}

if (sid === "" || tid === "" || !Number.isFinite(csid) || csid <= 0) {
  console.error(
    "Usage: npx tsx scripts/smoke-portal-withdrawal.ts [--prepare] [<STUDENT_ID> <ACADEMIC_TERM_ID> <COURSE_SECTION_ID>]",
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

try {
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
      throw new Error(
        "removedCount was 0 — check active enrollment, deadline, and section id.",
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
      throw new Error("unexpected: second call removed rows again.");
    }
    if (!r.ok) {
      console.log("[smoke] second call rejected as expected:", r.error);
    } else {
      console.log("[smoke] second call returned ok with 0 rows (idempotent).");
    }
  });
} finally {
  if (fixture != null) {
    await restoreWithdrawalSmokeFixtureDeadline(fixture);
    console.log("[smoke] restored withdraw_deadline", fixture.previousWithdrawDeadline);
  }
}

process.exit(exit);
