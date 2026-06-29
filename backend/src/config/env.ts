import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

function loadLocalDotenv(): void {
  // Workers inject env via wrangler; import.meta.url is unavailable during deploy validation.
  if (process.env.USE_HYPERDRIVE === "1" && process.env.NODE_ENV === "production") {
    return;
  }
  try {
    const moduleUrl = import.meta.url;
    if (typeof moduleUrl !== "string" || moduleUrl.length === 0) return;
    const dirname = path.dirname(fileURLToPath(moduleUrl));
    const envPath = path.resolve(dirname, "../../.env");
    const dotenvResult = dotenv.config({ path: envPath, override: true });
    if ((process.env.NODE_ENV ?? "development") === "development") {
      console.log(
        "[env]",
        dotenvResult.error
          ? `.env not loaded from ${envPath}: ${dotenvResult.error.message}`
          : `.env loaded from ${envPath}`,
      );
    }
  } catch {
    // Non-Node / Workers bundle — rely on process.env bindings only.
  }
}

loadLocalDotenv();

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Workers production uses Hyperdrive binding; DB_* env vars are optional then. */
function useHyperdrive(): boolean {
  const raw = process.env.USE_HYPERDRIVE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function requiredUnlessHyperdrive(name: string, placeholder: string): string {
  if (useHyperdrive()) {
    const value = process.env[name];
    if (value === undefined || value === "") return placeholder;
    return value;
  }
  return required(name);
}

function optional(name: string): string | null {
  const value = process.env[name];
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parsePort(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid PORT: ${raw ?? "(empty)"}`);
  }
  return n;
}

function parseDbPort(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid DB_PORT: ${raw ?? "(empty)"}`);
  }
  return n;
}

function parseDbSsl(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === "") return fallback;
  return parseBoolean(raw, fallback);
}

type DbEnvConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
};

function parseDatabaseUrl(url: string): DbEnvConfig {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid DATABASE_URL — must be a postgresql:// connection string.");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(`Invalid DATABASE_URL protocol: ${parsed.protocol}`);
  }
  const database = parsed.pathname.replace(/^\//, "");
  return {
    host: parsed.hostname,
    port: parseDbPort(parsed.port || undefined, 5432),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: database === "" ? "postgres" : database,
    ssl: parseDbSsl(process.env.DB_SSL, true),
  };
}

function resolveDbConfig(): DbEnvConfig {
  const databaseUrl = optional("DATABASE_URL");
  if (databaseUrl) {
    return parseDatabaseUrl(databaseUrl);
  }
  return {
    host: requiredUnlessHyperdrive("DB_HOST", "hyperdrive"),
    port: parseDbPort(process.env.DB_PORT, 5432),
    user: requiredUnlessHyperdrive("DB_USER", "hyperdrive"),
    password: process.env.DB_PASSWORD ?? "",
    database: requiredUnlessHyperdrive("DB_NAME", "postgres"),
    ssl: parseDbSsl(process.env.DB_SSL, !useHyperdrive()),
  };
}

/**
 * Extra browser origins to allow for CORS (comma-separated), merged with the built-in allowlist
 * in `app.ts` (production frontend + local Vite). If unset, only that built-in list applies.
 */
function parseCorsOrigins(): string[] | null {
  const raw =
    process.env.CORS_ORIGINS?.trim() ?? process.env.CORS_ORIGIN?.trim() ?? "";
  if (!raw) return null;
  const list = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  return list.length > 0 ? list : null;
}

function parseSmtpPortValue(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid SMTP port: ${raw}`);
  }
  return n;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

export type SmtpProfile = {
  /** Stable id used by the API (e.g. `admissions`). Lowercase, alnum + `-` / `_`. */
  id: string;
  /** Human label shown in the compose UI. Defaults to the From-address when missing. */
  label: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromAddress: string;
  fromName: string;
};

function envKey(prefix: string, profileId: string, suffix: string): string {
  return `${prefix}${profileId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${suffix}`;
}

function readProfileFromEnv(rawId: string): SmtpProfile | null {
  const id = rawId.trim();
  if (id === "") return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(
      `Invalid SMTP profile id "${id}" — only letters, digits, underscore, and hyphen are allowed.`,
    );
  }
  const k = (suffix: string) => process.env[envKey("SMTP_PROFILE_", id, suffix)];
  const host = (k("HOST") ?? "").trim();
  const user = (k("USER") ?? "").trim();
  if (host === "" || user === "") return null;
  const fromAddress =
    (k("FROM_ADDRESS") ?? "").trim() === ""
      ? user
      : (k("FROM_ADDRESS") ?? "").trim();
  return {
    id: id.toLowerCase(),
    label: (k("LABEL") ?? "").trim() || fromAddress,
    host,
    port: parseSmtpPortValue(k("PORT"), 587),
    secure: parseBoolean(k("SECURE"), false),
    user,
    password: k("PASSWORD") ?? "",
    fromAddress,
    fromName:
      (k("FROM_NAME") ?? "").trim() || "Alhambra Medical University",
  };
}

function buildLegacySingleProfile(): SmtpProfile | null {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const user = (process.env.SMTP_USER ?? "").trim();
  if (host === "" || user === "") return null;
  const fromAddress =
    (process.env.SMTP_FROM_ADDRESS ?? "").trim() === ""
      ? user
      : (process.env.SMTP_FROM_ADDRESS ?? "").trim();
  return {
    id: "default",
    label:
      (process.env.SMTP_FROM_NAME ?? "").trim() ||
      fromAddress ||
      "Default sender",
    host,
    port: parseSmtpPortValue(process.env.SMTP_PORT, 587),
    secure: parseBoolean(process.env.SMTP_SECURE, false),
    user,
    password: process.env.SMTP_PASSWORD ?? "",
    fromAddress,
    fromName:
      (process.env.SMTP_FROM_NAME ?? "").trim() ||
      "Alhambra Medical University",
  };
}

/**
 * Builds the list of available SMTP sender profiles for outgoing bulk-email.
 * When `SMTP_PROFILES` is set
 * (comma-separated list of profile ids), each id pulls its credentials from
 * `SMTP_PROFILE_<ID>_HOST` / `_USER` / `_PASSWORD` / `_FROM_ADDRESS` / `_FROM_NAME`
 * / `_PORT` / `_SECURE` / `_LABEL`. When `SMTP_PROFILES` is unset, the legacy
 * single-profile env (`SMTP_HOST` / `SMTP_USER` / etc.) becomes a single
 * profile with id `default`. When neither is set, returns an empty list and
 * the email service falls back to logging messages.
 */
function parseSmtpProfiles(): SmtpProfile[] {
  const list = (process.env.SMTP_PROFILES ?? "").trim();
  if (list === "") {
    const legacy = buildLegacySingleProfile();
    return legacy ? [legacy] : [];
  }
  const ids = list
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const seen = new Set<string>();
  const profiles: SmtpProfile[] = [];
  for (const id of ids) {
    const profile = readProfileFromEnv(id);
    if (profile == null) {
      console.warn(
        `[env] SMTP profile "${id}" is missing SMTP_PROFILE_${id.toUpperCase()}_HOST or _USER — skipped.`,
      );
      continue;
    }
    if (seen.has(profile.id)) continue;
    seen.add(profile.id);
    profiles.push(profile);
  }
  return profiles;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parsePort(process.env.PORT, 3001),
  corsOrigins: parseCorsOrigins(),
  db: resolveDbConfig(),
  supabase: {
    url: optional("SUPABASE_URL"),
    serviceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
    /** Publishable/anon key — required for Supabase Auth student sign-in on the API. */
    anonKey:
      optional("SUPABASE_ANON_KEY") ??
      optional("SUPABASE_PUBLISHABLE_KEY"),
    storageBucket: optional("SUPABASE_STORAGE_BUCKET") ?? "student-photos",
  },
  smtp: {
    /** Available SMTP sender profiles (one or more). Empty list = log-only fallback. */
    profiles: parseSmtpProfiles(),
    /** Cap on the number of BCC recipients per request. Soft safeguard against abuse. */
    bulkRecipientLimit: (() => {
      const raw = process.env.SMTP_BULK_RECIPIENT_LIMIT?.trim();
      if (!raw) return 200;
      const n = Number(raw);
      return Number.isInteger(n) && n > 0 ? n : 200;
    })(),
  },
} as const;
