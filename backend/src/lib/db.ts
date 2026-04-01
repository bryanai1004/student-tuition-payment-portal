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
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

export const pool: mysql.Pool = mysql.createPool(poolConfig);

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
