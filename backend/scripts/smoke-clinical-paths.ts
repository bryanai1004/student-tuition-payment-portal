/**
 * Smoke: clinical timetable + enrollment read paths (Postgres / Supabase).
 * Run from backend: npx tsx scripts/smoke-clinical-paths.ts [STUDENT_ID]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { listClinicTimetableSlots } from "../src/repositories/clinicalTimetableRepository.js";
import { listStudentClinicalAssignments } from "../src/repositories/clinicalScheduleRepository.js";
import { listOpenClinicalSlotsForStudent } from "../src/services/clinicalEnrollmentService.js";
import { getStudentClinicalSchedule } from "../src/services/clinicalScheduleService.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const studentId = process.argv[2]?.trim() ?? "C17310";

console.log("[env] .env loaded from", path.join(root, ".env"));
console.log("[smoke] student id:", studentId);

let exit = 0;

try {
  console.log("[smoke] listClinicTimetableSlots …");
  const slots = await listClinicTimetableSlots();
  console.log("[smoke] clinic timetable OK", { slotCount: slots.length });
} catch (e) {
  console.error("[smoke] listClinicTimetableSlots FAILED", e);
  exit = 1;
}

try {
  console.log("[smoke] listStudentClinicalAssignments …");
  const assignments = await listStudentClinicalAssignments(studentId);
  console.log("[smoke] clinical assignments OK", {
    count: assignments.length,
  });
} catch (e) {
  console.error("[smoke] listStudentClinicalAssignments FAILED", e);
  exit = 1;
}

try {
  console.log("[smoke] listOpenClinicalSlotsForStudent …");
  const open = await listOpenClinicalSlotsForStudent(studentId);
  console.log("[smoke] open clinical slots OK", { count: open.length });
} catch (e) {
  console.error("[smoke] open clinical slots FAILED", e);
  exit = 1;
}

try {
  console.log("[smoke] getStudentClinicalSchedule …");
  const schedule = await getStudentClinicalSchedule(studentId);
  console.log("[smoke] clinical schedule OK", {
    sessionCount: schedule.length,
  });
} catch (e) {
  console.error("[smoke] getStudentClinicalSchedule FAILED", e);
  exit = 1;
}

process.exit(exit);
