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