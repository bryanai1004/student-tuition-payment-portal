import { createHmac, timingSafeEqual } from "node:crypto";

type StudentTokenPayload = {
  sub: string;
  role: "student";
  iat: number;
  exp: number;
};

export type AuthenticatedStudent = {
  studentId: string;
};

const DEV_FALLBACK_SECRET =
  "student-auth-dev-fallback-secret-set-student-auth-secret";
const TOKEN_HEADER = { alg: "HS256", typ: "JWT" } as const;
const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 12;

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

function readStudentAuthSecret(): string {
  const configured = process.env.STUDENT_AUTH_SECRET?.trim() ?? "";
  if (configured.length > 0) return configured;
  if ((process.env.NODE_ENV ?? "development") !== "production") {
    console.warn(
      "[student-auth] STUDENT_AUTH_SECRET is not set; using a temporary development secret",
    );
    return DEV_FALLBACK_SECRET;
  }
  throw new Error("Missing required environment variable: STUDENT_AUTH_SECRET");
}

const STUDENT_AUTH_SECRET = readStudentAuthSecret();

function readTokenTtlSeconds(): number {
  return parsePositiveInt(
    process.env.STUDENT_AUTH_TOKEN_TTL_SECONDS,
    DEFAULT_TOKEN_TTL_SECONDS,
  );
}

function sign(input: string): string {
  return createHmac("sha256", STUDENT_AUTH_SECRET)
    .update(input)
    .digest("base64url");
}

function parsePayload(part: string): StudentTokenPayload | null {
  const decoded = base64UrlDecode(part);
  if (decoded == null) return null;
  try {
    const parsed = JSON.parse(decoded) as Partial<StudentTokenPayload>;
    if (parsed.role !== "student") return null;
    if (typeof parsed.sub !== "string" || parsed.sub.trim() === "") return null;
    if (!Number.isInteger(parsed.iat) || !Number.isInteger(parsed.exp)) return null;
    return {
      sub: parsed.sub.trim(),
      role: "student",
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

export function issueStudentAccessToken(studentId: string): string {
  const trimmed = studentId.trim();
  if (trimmed === "") {
    throw new Error("studentId is required to issue a student access token");
  }
  const now = Math.floor(Date.now() / 1000);
  const payload: StudentTokenPayload = {
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

export function verifyStudentAccessToken(
  authorizationHeader: string | undefined,
): AuthenticatedStudent | null {
  const raw = authorizationHeader?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  const token = match?.[1]?.trim() ?? "";
  if (token === "") {
    console.debug("[student-auth] verification failed", {
      reason: "missing-bearer-token",
    });
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    console.debug("[student-auth] verification failed", {
      reason: "invalid-token-format",
    });
    return null;
  }
  const [encodedHeader, encodedPayload, signature] = parts;
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const expected = sign(unsigned);
  if (!safeEqualBase64Url(signature, expected)) {
    console.debug("[student-auth] verification failed", {
      reason: "signature-mismatch",
    });
    return null;
  }

  const payload = parsePayload(encodedPayload);
  if (payload == null) {
    console.debug("[student-auth] verification failed", {
      reason: "invalid-payload",
    });
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    console.debug("[student-auth] verification failed", {
      reason: "token-expired",
    });
    return null;
  }

  const authenticatedStudent = { studentId: payload.sub };
  console.debug("[student-auth] verification succeeded", {
    studentId: authenticatedStudent.studentId,
  });
  return authenticatedStudent;
}
