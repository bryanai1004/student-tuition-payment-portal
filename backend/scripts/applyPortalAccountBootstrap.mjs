/**
 * Applies portal_accounts_schema.sql then portal_accounts_seed.sql using backend/.env.
 * Usage (from backend/): npm run db:bootstrap-portal
 *
 * Note: SQL files must be PostgreSQL-compatible. Ensure `academic_terms` exists first.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

function connectConfig() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      ssl: process.env.DB_SSL === "0" ? undefined : { rejectUnauthorized: false },
    };
  }
  const required = ["DB_HOST", "DB_USER"];
  for (const k of required) {
    if (!process.env[k]) {
      console.error(`Missing ${k} or DATABASE_URL in .env`);
      process.exit(1);
    }
  }
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "postgres",
    ssl: process.env.DB_SSL === "0" ? undefined : { rejectUnauthorized: false },
  };
}

async function main() {
  const conn = new pg.Client(connectConfig());
  await conn.connect();

  const schemaPath = path.join(backendRoot, "sql", "portal_accounts_schema.sql");
  const seedPath = path.join(backendRoot, "sql", "portal_accounts_seed.sql");
  const schema = fs.readFileSync(schemaPath, "utf8").replace(/`([^`]+)`/g, '"$1"');
  const seed = fs.readFileSync(seedPath, "utf8").replace(/`([^`]+)`/g, '"$1"');

  console.log("[db:bootstrap-portal] applying schema…");
  await conn.query(schema);
  console.log("[db:bootstrap-portal] applying seed…");
  await conn.query(seed);
  await conn.end();
  console.log("[db:bootstrap-portal] done.");
}

main().catch((err) => {
  console.error("[db:bootstrap-portal] failed:", err);
  process.exit(1);
});
