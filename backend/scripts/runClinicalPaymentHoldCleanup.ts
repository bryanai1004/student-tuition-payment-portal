/**
 * Manual / cron-friendly entrypoint for Phase 3 clinical booking payment holds.
 * Usage: `npm run job:clinical-hold-cleanup` (from backend/).
 */
import { closePool, testDatabaseConnection } from "../src/lib/db.js";
import { runClinicalBookingPaymentHoldCleanup } from "../src/services/clinicalBookingPaymentHoldService.js";

async function main(): Promise<void> {
  await testDatabaseConnection();
  const stats = await runClinicalBookingPaymentHoldCleanup();
  console.log(JSON.stringify(stats, null, 2));
  await closePool();
}

main().catch((e: unknown) => {
  console.error("[runClinicalPaymentHoldCleanup] failed:", e);
  process.exit(1);
});
