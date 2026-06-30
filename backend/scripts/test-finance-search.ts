import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { pool } from "../src/lib/db.js";
import {
  countAdminFinanceRosterSearchOnly,
  listAdminFinanceRosterPageSearchOnly,
} from "../src/repositories/adminFinanceRepository.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const search = process.argv[2] ?? "bing chen";

const term = process.argv[3] ?? 'Spring';
const year = Number(process.argv[4] ?? 2027);

const total = await countAdminFinanceRosterSearchOnly(pool, {
  searchTrimmed: search,
  rosterScope: 'quarter',
  term,
  year,
});
const rows = await listAdminFinanceRosterPageSearchOnly(pool, {
  searchTrimmed: search,
  rosterScope: 'quarter',
  term,
  year,
  limit: 5,
  offset: 0,
});

console.log({ search, total, sample: rows });

await pool.end();
