import { env } from "../config/env.js";
import { pool } from "../lib/db.js";
export function getHealth(_req, res) {
    res.json({ status: "ok" });
}
export async function getHealthDb(_req, res) {
    try {
        await pool.query("SELECT 1 AS ok");
        res.json({ ok: true, db: true });
    }
    catch (e) {
        console.error("[health/db] database check failed:", e);
        const message = e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
        const body = {
            ok: false,
            db: false,
        };
        if (env.nodeEnv === "development") {
            body.message = message;
        }
        res.status(500).json(body);
    }
}
//# sourceMappingURL=healthController.js.map