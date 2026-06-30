import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { pool } from "../src/lib/db.js";
import {
  countAdminFinanceRosterSearchOnly,
  listStudentIdsWithPortalQuarterActivity,
} from "../src/repositories/adminFinanceRepository.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const term = process.argv[2] ?? "Spring";
const year = Number(process.argv[3] ?? 2027);

const totalRoster = await countAdminFinanceRosterSearchOnly(pool, {
  searchTrimmed: "",
  rosterScope: "all",
  term,
  year,
});
const quarterRoster = await countAdminFinanceRosterSearchOnly(pool, {
  searchTrimmed: "",
  rosterScope: "quarter",
  term,
  year,
});
const quarterActive = await listStudentIdsWithPortalQuarterActivity(
  pool,
  term,
  year,
);

const [enrollRows] = await pool.query<{ cnt: string }[]>(
  `SELECT COUNT(DISTINCT TRIM(student_external_id)) AS cnt
   FROM portal_enrollments
   WHERE term = $1 AND year = $2
     AND COALESCE(TRIM(status), '') <> 'withdrawn'`,
  [term, year],
);

console.log({
  financeRosterAllStudents: totalRoster,
  financeRosterQuarterScoped: quarterRoster,
  portalQuarterActivity: quarterActive.length,
  portalEnrolledNonWithdrawn: Number(enrollRows[0]?.cnt ?? 0),
  term,
  year,
});

await pool.end();
