/**
 * Run a single SQL statement against DB_* / DATABASE_URL in backend/.env.
 * Usage (from repo root): npm run db:query -w backend -- "SELECT 1;"
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const sql = process.argv.slice(2).join(" ").trim();
if (!sql) {
  console.error('Usage: npm run db:query -w backend -- "YOUR SQL HERE"');
  process.exit(1);
}

function connectConfig() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      ssl: process.env.DB_SSL === "0" ? undefined : { rejectUnauthorized: false },
    };
  }
  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT ?? 5432);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD ?? "";
  const database = process.env.DB_NAME ?? "postgres";
  if (!host || !user) {
    console.error("Missing DB_HOST/DB_USER or DATABASE_URL in backend/.env");
    process.exit(1);
  }
  return {
    host,
    port,
    user,
    password,
    database,
    ssl: process.env.DB_SSL === "0" ? undefined : { rejectUnauthorized: false },
  };
}

const conn = new pg.Client(connectConfig());
await conn.connect();

try {
  const normalized = sql.replace(/`([^`]+)`/g, '"$1"');
  const result = await conn.query(normalized);
  if (result.rows?.length) {
    console.log(JSON.stringify(result.rows, null, 2));
  } else {
    console.log(
      JSON.stringify(
        { rowCount: result.rowCount, command: result.command },
        null,
        2,
      ),
    );
  }
} finally {
  await conn.end();
}
