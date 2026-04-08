/**
 * Applies portal_accounts_schema.sql then portal_accounts_seed.sql using backend/.env.
 * Usage (from backend/): npm run db:bootstrap-portal
 *
 * Note: `portal_accounts_schema.sql` includes document-requirement tables with FKs to
 * `academic_terms`. Ensure that table exists first (e.g. registration_bootstrap / academic_terms_schema)
 * or bootstrap will fail on those CREATEs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

const required = ["DB_HOST", "DB_USER", "DB_NAME"];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`Missing ${k} in .env`);
    process.exit(1);
  }
}

const port = Number(process.env.DB_PORT ?? 3306);
const password = process.env.DB_PASSWORD ?? "";

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port,
    user: process.env.DB_USER,
    password,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  const schemaPath = path.join(backendRoot, "sql", "portal_accounts_schema.sql");
  const seedPath = path.join(backendRoot, "sql", "portal_accounts_seed.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  const seed = fs.readFileSync(seedPath, "utf8");

  console.log("[db:bootstrap-portal] applying schema…");
  await conn.query(schema);
  console.log("[db:bootstrap-portal] applying seed…");
  await conn.query(seed);
  await conn.end();
  console.log("[db:bootstrap-portal] done.");
}

main().catch((err) => {
  console.error("[db:bootstrap-portal] failed:", err.message ?? err);
  process.exit(1);
});
