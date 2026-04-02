import mysql from "mysql2/promise";
import { env } from "../config/env.js";
const poolConfig = {
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
export const pool = mysql.createPool(poolConfig);
/**
 * Verifies the pool can reach MySQL (fail fast on startup).
 * Logs structured details on failure for RDS/network/credential issues.
 */
export async function testDatabaseConnection() {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.ping();
        if ((process.env.NODE_ENV ?? "development") === "development") {
            console.log("[db] connection verified");
        }
    }
    catch (err) {
        const e = err;
        console.error("[db] connection failed:", {
            message: e.message,
            code: e.code,
            errno: e.errno,
            syscall: e.syscall,
            host: poolConfig.host,
            database: poolConfig.database,
        });
        if (e.stack)
            console.error("[db] stack:", e.stack);
        throw err;
    }
    finally {
        connection?.release();
    }
}
pool.on("connection", (connection) => {
    connection.on("error", (err) => {
        console.error("[db] connection error:", err.code ?? err.message);
    });
});
pool.on("error", (err) => {
    console.error("[db] pool error:", err.code ?? err.message);
});
export async function closePool() {
    await pool.end();
}
//# sourceMappingURL=db.js.map