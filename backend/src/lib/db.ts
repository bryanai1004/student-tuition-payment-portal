import { EventEmitter } from "node:events";
import mysql from "mysql2/promise";
import { env } from "../config/env.js";

const poolConfig: mysql.PoolOptions = {
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  /** Lower cap reduces pressure on shared MySQL max_connections when multiple dev processes run. */
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

export const pool: mysql.Pool = mysql.createPool(poolConfig);

/**
 * Verifies the pool can reach MySQL (fail fast on startup).
 * Logs structured details on failure for RDS/network/credential issues.
 */
export async function testDatabaseConnection(): Promise<void> {
  let connection: mysql.PoolConnection | undefined;
  try {
    connection = await pool.getConnection();
    await connection.ping();
    if ((process.env.NODE_ENV ?? "development") === "development") {
      console.log("[db] connection verified");
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException & Error;
    console.error("[db] connection failed:", {
      message: e.message,
      code: e.code,
      errno: e.errno,
      syscall: e.syscall,
      host: poolConfig.host,
      database: poolConfig.database,
    });
    if (e.stack) console.error("[db] stack:", e.stack);
    throw err;
  } finally {
    connection?.release();
  }
}

pool.on("connection", (connection) => {
  (connection as unknown as EventEmitter).on(
    "error",
    (err: NodeJS.ErrnoException) => {
      console.error("[db] connection error:", err.code ?? err.message);
    },
  );
});

(pool as unknown as EventEmitter).on(
  "error",
  (err: NodeJS.ErrnoException) => {
    console.error("[db] pool error:", err.code ?? err.message);
  },
);

export async function closePool(): Promise<void> {
  await pool.end();
}
