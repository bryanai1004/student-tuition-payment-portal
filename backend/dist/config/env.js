import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env");
const dotenvResult = dotenv.config({ path: envPath });
if ((process.env.NODE_ENV ?? "development") === "development") {
    console.log("[env]", dotenvResult.error
        ? `.env not loaded from ${envPath}: ${dotenvResult.error.message}`
        : `.env loaded from ${envPath}`);
}
function required(name) {
    const value = process.env[name];
    if (value === undefined || value === "") {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
function parsePort(raw, fallback) {
    const n = Number(raw ?? fallback);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
        throw new Error(`Invalid PORT: ${raw ?? "(empty)"}`);
    }
    return n;
}
function parseDbPort(raw, fallback) {
    const n = Number(raw ?? fallback);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
        throw new Error(`Invalid DB_PORT: ${raw ?? "(empty)"}`);
    }
    return n;
}
/**
 * Extra browser origins to allow for CORS (comma-separated), merged with the built-in allowlist
 * in `app.ts` (production frontend + local Vite). If unset, only that built-in list applies.
 */
function parseCorsOrigins() {
    const raw = process.env.CORS_ORIGINS?.trim() ?? process.env.CORS_ORIGIN?.trim() ?? "";
    if (!raw)
        return null;
    const list = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    return list.length > 0 ? list : null;
}
export const env = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: parsePort(process.env.PORT, 3001),
    corsOrigins: parseCorsOrigins(),
    db: {
        host: required("DB_HOST"),
        port: parseDbPort(process.env.DB_PORT, 3306),
        user: required("DB_USER"),
        password: process.env.DB_PASSWORD ?? "",
        database: required("DB_NAME"),
    },
};
//# sourceMappingURL=env.js.map