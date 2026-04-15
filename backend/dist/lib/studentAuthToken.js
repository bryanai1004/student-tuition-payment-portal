import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
const DEV_FALLBACK_SECRET = randomBytes(32).toString("hex");
const TOKEN_HEADER = { alg: "HS256", typ: "JWT" };
const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 12;
function base64UrlEncode(value) {
    return Buffer.from(value, "utf8").toString("base64url");
}
function base64UrlDecode(value) {
    try {
        return Buffer.from(value, "base64url").toString("utf8");
    }
    catch {
        return null;
    }
}
function parsePositiveInt(raw, fallback) {
    const n = Number(raw ?? fallback);
    if (!Number.isInteger(n) || n <= 0)
        return fallback;
    return n;
}
function readStudentAuthSecret() {
    const configured = process.env.STUDENT_AUTH_SECRET?.trim() ?? "";
    if (configured.length > 0)
        return configured;
    if ((process.env.NODE_ENV ?? "development") !== "production") {
        console.warn("[student-auth] STUDENT_AUTH_SECRET is not set; using a temporary development secret");
        return DEV_FALLBACK_SECRET;
    }
    throw new Error("Missing required environment variable: STUDENT_AUTH_SECRET");
}
const STUDENT_AUTH_SECRET = readStudentAuthSecret();
function readTokenTtlSeconds() {
    return parsePositiveInt(process.env.STUDENT_AUTH_TOKEN_TTL_SECONDS, DEFAULT_TOKEN_TTL_SECONDS);
}
function sign(input) {
    return createHmac("sha256", STUDENT_AUTH_SECRET)
        .update(input)
        .digest("base64url");
}
function parsePayload(part) {
    const decoded = base64UrlDecode(part);
    if (decoded == null)
        return null;
    try {
        const parsed = JSON.parse(decoded);
        if (parsed.role !== "student")
            return null;
        if (typeof parsed.sub !== "string" || parsed.sub.trim() === "")
            return null;
        if (!Number.isInteger(parsed.iat) || !Number.isInteger(parsed.exp))
            return null;
        return {
            sub: parsed.sub.trim(),
            role: "student",
            iat: Number(parsed.iat),
            exp: Number(parsed.exp),
        };
    }
    catch {
        return null;
    }
}
function safeEqualBase64Url(a, b) {
    const left = Buffer.from(a, "utf8");
    const right = Buffer.from(b, "utf8");
    if (left.length !== right.length)
        return false;
    return timingSafeEqual(left, right);
}
export function issueStudentAccessToken(studentId) {
    const trimmed = studentId.trim();
    if (trimmed === "") {
        throw new Error("studentId is required to issue a student access token");
    }
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub: trimmed,
        role: "student",
        iat: now,
        exp: now + readTokenTtlSeconds(),
    };
    const encodedHeader = base64UrlEncode(JSON.stringify(TOKEN_HEADER));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const unsigned = `${encodedHeader}.${encodedPayload}`;
    return `${unsigned}.${sign(unsigned)}`;
}
export function verifyStudentAccessToken(authorizationHeader) {
    const raw = authorizationHeader?.trim() ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(raw);
    const token = match?.[1]?.trim() ?? "";
    if (token === "")
        return null;
    const parts = token.split(".");
    if (parts.length !== 3)
        return null;
    const [encodedHeader, encodedPayload, signature] = parts;
    const unsigned = `${encodedHeader}.${encodedPayload}`;
    const expected = sign(unsigned);
    if (!safeEqualBase64Url(signature, expected))
        return null;
    const payload = parsePayload(encodedPayload);
    if (payload == null)
        return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now)
        return null;
    return { studentId: payload.sub };
}
//# sourceMappingURL=studentAuthToken.js.map