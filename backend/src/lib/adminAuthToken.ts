import { createHmac, timingSafeEqual } from "node:crypto";

export type AdminJwtRole =
  | "super_admin"
  | "admin"
  | "teacher"
  | "clinical_teacher"
  | "clinical_admin";

export type AuthenticatedAdmin = {
  email: string;
  role: AdminJwtRole;
};

type AdminTokenPayload = {
  sub: string;
  role: AdminJwtRole;
  typ: "admin";
  iat: number;
  exp: number;
};

const DEV_FALLBACK_SECRET =
  "admin-auth-dev-fallback-secret-set-admin-auth-secret";
const TOKEN_HEADER = { alg: "HS256", typ: "JWT" } as const;
const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 12;

const ADMIN_ROLE_SET = new Set<string>([
  "super_admin",
  "admin",
  "teacher",
  "clinical_teacher",
  "clinical_admin",
]);

/** Well-formed bcrypt hash used only to keep timing stable when the user row is missing. */
const DUMMY_PASSWORD_HASH =
  "$2b$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDMVr5yUP1KUOYTa";

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

function readAdminAuthSecret(): string {
  const configured = process.env.ADMIN_AUTH_SECRET?.trim() ?? "";
  if (configured.length > 0) return configured;
  if ((process.env.NODE_ENV ?? "development") !== "production") {
    console.warn(
      "[admin-auth] ADMIN_AUTH_SECRET is not set; using a temporary development secret",
    );
    return DEV_FALLBACK_SECRET;
  }
  throw new Error("Missing required environment variable: ADMIN_AUTH_SECRET");
}

let cachedAdminAuthSecret: string | null = null;

function getAdminAuthSecret(): string {
  if (cachedAdminAuthSecret == null) {
    cachedAdminAuthSecret = readAdminAuthSecret();
  }
  return cachedAdminAuthSecret;
}

function readTokenTtlSeconds(): number {
  return parsePositiveInt(
    process.env.ADMIN_AUTH_TOKEN_TTL_SECONDS,
    DEFAULT_TOKEN_TTL_SECONDS,
  );
}

function sign(input: string): string {
  return createHmac("sha256", getAdminAuthSecret())
    .update(input)
    .digest("base64url");
}

function isAdminJwtRole(value: string): value is AdminJwtRole {
  return ADMIN_ROLE_SET.has(value);
}

function parsePayload(part: string): AdminTokenPayload | null {
  const decoded = base64UrlDecode(part);
  if (decoded == null) return null;
  try {
    const parsed = JSON.parse(decoded) as Partial<AdminTokenPayload>;
    if (parsed.typ !== "admin") return null;
    if (typeof parsed.sub !== "string" || parsed.sub.trim() === "") return null;
    if (typeof parsed.role !== "string" || !isAdminJwtRole(parsed.role)) return null;
    if (!Number.isInteger(parsed.iat) || !Number.isInteger(parsed.exp)) return null;
    return {
      sub: parsed.sub.trim().toLowerCase(),
      role: parsed.role,
      typ: "admin",
      iat: Number(parsed.iat),
      exp: Number(parsed.exp),
    };
  } catch {
    return null;
  }
}

function safeEqualBase64Url(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export const ADMIN_ACCESS_COOKIE_NAME = "admin_access_token";

export function issueAdminAccessToken(
  email: string,
  role: AdminJwtRole,
): string {
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail === "") {
    throw new Error("email is required to issue an admin access token");
  }
  if (!isAdminJwtRole(role)) {
    throw new Error("invalid admin role for token");
  }
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminTokenPayload = {
    sub: normalizedEmail,
    role,
    typ: "admin",
    iat: now,
    exp: now + readTokenTtlSeconds(),
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(TOKEN_HEADER));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  return `${unsigned}.${sign(unsigned)}`;
}

export function verifyAdminAccessToken(
  authorizationHeader: string | undefined,
): AuthenticatedAdmin | null {
  const raw = authorizationHeader?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  const token = match?.[1]?.trim() ?? "";
  if (token === "") return null;
  return verifyAdminAccessTokenString(token);
}

export function verifyAdminAccessTokenString(token: string): AuthenticatedAdmin | null {
  const trimmed = token.trim();
  if (trimmed === "") return null;

  const parts = trimmed.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const expected = sign(unsigned);
  if (!safeEqualBase64Url(signature, expected)) return null;

  const payload = parsePayload(encodedPayload);
  if (payload == null) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;

  return { email: payload.sub, role: payload.role };
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const raw = cookieHeader?.trim() ?? "";
  if (raw === "") return {};
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name === "") continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function readAdminTokenFromCookieHeader(
  cookieHeader: string | undefined,
): string | null {
  const cookies = parseCookies(cookieHeader);
  const token = cookies[ADMIN_ACCESS_COOKIE_NAME]?.trim() ?? "";
  return token === "" ? null : token;
}

export function verifyAdminAccessTokenFromCookieHeader(
  cookieHeader: string | undefined,
): AuthenticatedAdmin | null {
  const token = readAdminTokenFromCookieHeader(cookieHeader);
  if (token == null) return null;
  return verifyAdminAccessTokenString(token);
}

type AdminAuthRequestLike = {
  headers: {
    authorization?: string;
    cookie?: string;
  };
  cookies?: Record<string, unknown>;
};

/**
 * Resolve admin JWT from Bearer header, cookie-parser `req.cookies`, or raw `Cookie` header.
 * Workers may not populate `req.cookies`; the header fallback keeps auth working cross-runtime.
 */
export function resolveAuthenticatedAdminFromRequest(
  req: AdminAuthRequestLike,
): AuthenticatedAdmin | null {
  const fromAuth = verifyAdminAccessToken(req.headers.authorization);
  if (fromAuth != null) return fromAuth;

  const rawCookie = req.cookies?.[ADMIN_ACCESS_COOKIE_NAME];
  if (typeof rawCookie === "string" && rawCookie.trim() !== "") {
    const fromParsed = verifyAdminAccessTokenString(rawCookie.trim());
    if (fromParsed != null) return fromParsed;
  }

  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader === "string" && cookieHeader.trim() !== "") {
    return verifyAdminAccessTokenFromCookieHeader(cookieHeader);
  }

  return null;
}

export function readTokenTtlSecondsPublic(): number {
  return readTokenTtlSeconds();
}
