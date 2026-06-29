import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";
import pg from "pg";
import { env } from "../config/env.js";

export type HyperdriveBinding = {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
};

export type ResultSetHeader = {
  fieldCount: number;
  affectedRows: number;
  insertId: number;
  info: string;
  serverStatus: number;
  warningStatus: number;
  changedRows: number;
};

export type RowDataPacket = pg.QueryResultRow;
export type Pool = DbPool;
export type PoolConnection = DbPoolConnection;

export interface DbPoolConnection {
  query<T = unknown>(
    sql: string,
    values?: unknown,
  ): Promise<[T, pg.FieldDef[]]>;
  execute<T = unknown>(
    sql: string,
    values?: unknown,
  ): Promise<[T, pg.FieldDef[]]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

export interface DbPool {
  query<T = unknown>(
    sql: string,
    values?: unknown,
  ): Promise<[T, pg.FieldDef[]]>;
  execute<T = unknown>(
    sql: string,
    values?: unknown,
  ): Promise<[T, pg.FieldDef[]]>;
  getConnection(): Promise<DbPoolConnection>;
  end(): Promise<void>;
}

type PgClientLike = pg.PoolClient | pg.Client;

function closePgClient(client: PgClientLike): void {
  if (client instanceof pg.Client) {
    void client.end().catch(() => {});
    return;
  }
  client.release();
}

let poolInstance: pg.Pool | null = null;
let poolConfig: pg.PoolConfig | null = null;
let workersMode = false;

/** One Postgres client per HTTP request on Cloudflare Workers (required by the runtime). */
const requestConnection = new AsyncLocalStorage<PgClientLike>();

function isWorkersDb(): boolean {
  return workersMode;
}

function defaultPoolConfig(): pg.PoolConfig {
  return {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    max: 5,
    idleTimeoutMillis: 30_000,
    ...(env.db.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

function resolveConnectionConfig(): pg.ClientConfig {
  const cfg = poolConfig ?? defaultPoolConfig();
  return {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    ...(cfg.ssl ? { ssl: cfg.ssl } : {}),
  };
}

/** Legacy MySQL column/table names preserved with camelCase in Postgres. */
const MIXED_CASE_IDENTIFIERS = [
  "EnrollStartDate",
  "seqNumber",
  "seqNum",
  "sequenceNumber",
  "clinicL1Required",
  "clinicL2Required",
  "HasStuReturned",
  "isLockedOut",
  "passwordChanged",
  "StartDate",
  "EndDate",
  "100Max",
  "200Max",
  "300Max",
  "123Max",
] as const;

function quoteMixedCaseIdentifiers(sql: string): string {
  const parts = sql.split(/('(?:''|[^'])*')/g);
  return parts
    .map((segment, idx) => {
      if (idx % 2 === 1) return segment;
      let out = segment;
      for (const ident of MIXED_CASE_IDENTIFIERS) {
        const escaped = ident.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        out = out.replace(
          new RegExp(`\\.${escaped}\\b(?!")`, "g"),
          `."${ident}"`,
        );
        out = out.replace(
          new RegExp(`(?<![".])\\b${escaped}\\b(?!")`, "g"),
          `"${ident}"`,
        );
      }
      return out;
    })
    .join("");
}

function normalizeSql(sql: string): string {
  let out = sql.replace(/`([^`]+)`/g, '"$1"');
  out = out.replace(/\bCAST\s*\(([^)]+)\)\s+AS\s+SIGNED\b/gi, "CAST($1 AS INTEGER)");
  out = out.replace(/\bCURRENT_DATE\s*\(\s*\)/gi, "CURRENT_DATE");
  out = out.replace(/\bDATE\s*\(([^)]+)\)/gi, "($1)::date");
  out = out.replace(/\bYEAR\s*\(([^)]+)\)/gi, "EXTRACT(YEAR FROM $1)");
  out = out.replace(/\bUTC_TIMESTAMP\s*\(\s*\)/gi, "(NOW() AT TIME ZONE 'UTC')");
  out = out.replace(
    /\bDATE_ADD\s*\(\s*UTC_TIMESTAMP\s*\(\s*\)\s*,\s*INTERVAL\s+(\d+)\s+HOUR\s*\)/gi,
    "((NOW() AT TIME ZONE 'UTC') + ($1 || ' hours')::interval)",
  );
  out = quoteMixedCaseIdentifiers(out);
  return out;
}

function convertPlaceholders(
  sql: string,
  values: unknown[] | undefined,
): { text: string; values: unknown[] } {
  const params = values ?? [];
  let index = 0;
  const text = sql.replace(/\?/g, () => `$${++index}`);
  return { text, values: params };
}

function isMutatingSql(sql: string): boolean {
  return /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql.trim());
}

function isInsertSql(sql: string): boolean {
  return /^\s*INSERT\b/i.test(sql.trim());
}

function ensureInsertReturning(sql: string): string {
  if (!isInsertSql(sql) || /\bRETURNING\b/i.test(sql)) return sql;
  const trimmed = sql.trimEnd().replace(/;\s*$/, "");
  return `${trimmed} RETURNING *`;
}

function extractInsertId(row: pg.QueryResultRow | undefined): number {
  if (row == null) return 0;
  for (const key of ["id", "seqNumber", "ID"]) {
    const value = row[key];
    if (value != null && value !== "") return Number(value);
  }
  const first = Object.values(row)[0];
  if (first != null && first !== "") return Number(first);
  return 0;
}

function toMysqlResult(
  sql: string,
  result: pg.QueryResult,
): [unknown, pg.FieldDef[]] {
  if (isMutatingSql(sql)) {
    const header: ResultSetHeader = {
      fieldCount: 0,
      affectedRows: result.rowCount ?? 0,
      insertId: isInsertSql(sql) ? extractInsertId(result.rows[0]) : 0,
      info: "",
      serverStatus: 0,
      warningStatus: 0,
      changedRows: 0,
    };
    return [header, result.fields];
  }
  return [result.rows, result.fields];
}

async function runQuery(
  client: PgClientLike,
  sql: string,
  values?: unknown,
): Promise<[unknown, pg.FieldDef[]]> {
  const normalized = normalizeSql(String(sql));
  const preparedSql = isInsertSql(normalized)
    ? ensureInsertReturning(normalized)
    : normalized;
  const { text, values: params } = convertPlaceholders(
    preparedSql,
    Array.isArray(values) ? values : values == null ? [] : [values],
  );
  const result = await client.query(text, params);
  return toMysqlResult(normalized, result);
}

function wrapClient(client: PgClientLike, onRelease?: () => void): DbPoolConnection {
  let inTransaction = false;
  return {
    query: <T = unknown>(sql: string, values?: unknown) =>
      runQuery(client, sql, values) as Promise<[T, pg.FieldDef[]]>,
    execute: <T = unknown>(sql: string, values?: unknown) =>
      runQuery(client, sql, values) as Promise<[T, pg.FieldDef[]]>,
    beginTransaction: async () => {
      await client.query("BEGIN");
      inTransaction = true;
    },
    commit: async () => {
      await client.query("COMMIT");
      inTransaction = false;
    },
    rollback: async () => {
      await client.query("ROLLBACK");
      inTransaction = false;
    },
    release: () => {
      if (inTransaction) {
        void client.query("ROLLBACK").catch(() => {});
      }
      if (onRelease) {
        onRelease();
      } else {
        closePgClient(client);
      }
    },
  };
}

async function openWorkersConnection(): Promise<PgClientLike> {
  const client = new pg.Client(resolveConnectionConfig());
  await client.connect();
  return client;
}

/** Configure Postgres pool from a Cloudflare Hyperdrive binding (Workers production). */
export function configureDbFromHyperdrive(hyperdrive: HyperdriveBinding): void {
  poolConfig = {
    host: hyperdrive.host,
    user: hyperdrive.user,
    password: hyperdrive.password,
    database: hyperdrive.database,
    port: hyperdrive.port,
    max: 5,
    idleTimeoutMillis: 30_000,
  };
  workersMode = true;
  poolInstance = null;
}

function getPool(): pg.Pool {
  if (poolInstance == null) {
    const config = poolConfig ?? defaultPoolConfig();
    poolInstance = new pg.Pool(config);
    poolInstance.on("error", (err: Error) => {
      console.error("[db] pool error:", err.message);
    });
  }
  return poolInstance;
}

async function workersQuery(
  sql: string,
  values?: unknown,
): Promise<[unknown, pg.FieldDef[]]> {
  const scoped = requestConnection.getStore();
  if (scoped != null) {
    return runQuery(scoped, sql, values);
  }
  const connection = await openWorkersConnection();
  try {
    return await runQuery(connection, sql, values);
  } finally {
    closePgClient(connection);
  }
}

async function workersGetConnection(): Promise<DbPoolConnection> {
  const scoped = requestConnection.getStore();
  if (scoped != null) {
    return wrapClient(scoped, () => {});
  }
  const connection = await openWorkersConnection();
  return wrapClient(connection, () => {
    closePgClient(connection);
  });
}

function createWorkersPoolFacade(): DbPool {
  return {
    query: <T = unknown>(sql: string, values?: unknown) =>
      workersQuery(sql, values) as Promise<[T, pg.FieldDef[]]>,
    execute: <T = unknown>(sql: string, values?: unknown) =>
      workersQuery(sql, values) as Promise<[T, pg.FieldDef[]]>,
    getConnection: workersGetConnection,
    end: async () => {},
  };
}

function createNodePoolFacade(pgPool: pg.Pool): DbPool {
  return {
    query: <T = unknown>(sql: string, values?: unknown) =>
      pgPool
        .query(
          ...(() => {
            const normalized = normalizeSql(String(sql));
            const preparedSql = isInsertSql(normalized)
              ? ensureInsertReturning(normalized)
              : normalized;
            const { text, values: params } = convertPlaceholders(
              preparedSql,
              Array.isArray(values) ? values : values == null ? [] : [values],
            );
            return [text, params] as const;
          })(),
        )
        .then((result) => toMysqlResult(normalizeSql(String(sql)), result) as [T, pg.FieldDef[]]),
    execute<T = unknown>(sql: string, values?: unknown) {
      return this.query<T>(sql, values);
    },
    getConnection: async () => {
      const client = await pgPool.connect();
      return wrapClient(client);
    },
    end: () => pgPool.end(),
  };
}

function getDbAccessor(): DbPool {
  if (isWorkersDb()) {
    return createWorkersPoolFacade();
  }
  return createNodePoolFacade(getPool());
}

/** Express middleware — attach one Hyperdrive connection per request on Workers. */
export function workersDbMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isWorkersDb()) {
    next();
    return;
  }

  void openWorkersConnection()
    .then((connection) => {
      let closed = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        closePgClient(connection);
      };

      requestConnection.run(connection, () => {
        res.once("finish", close);
        res.once("close", close);
        next();
      });
    })
    .catch(next);
}

/** Lazy pool proxy — Hyperdrive uses per-request connections on Workers. */
export const pool: DbPool = new Proxy({} as DbPool, {
  get(_target, prop, receiver) {
    const accessor = getDbAccessor();
    const value = Reflect.get(accessor, prop, receiver);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(accessor);
    }
    return value;
  },
});

/**
 * Verifies the pool can reach Postgres (fail fast on startup).
 * Logs structured details on failure for network/credential issues.
 */
export async function testDatabaseConnection(): Promise<void> {
  if (isWorkersDb()) {
    const connection = await openWorkersConnection();
    try {
      await connection.query("SELECT 1");
    } finally {
      closePgClient(connection);
    }
    return;
  }

  let connection: pg.PoolClient | undefined;
  try {
    connection = await getPool().connect();
    await connection.query("SELECT 1");
  } catch (err) {
    const e = err as NodeJS.ErrnoException & Error;
    const cfg = poolConfig ?? defaultPoolConfig();
    console.error("[db] connection failed:", {
      message: e.message,
      code: e.code,
      host: cfg.host,
      database: cfg.database,
    });
    if (e.stack) console.error("[db] stack:", e.stack);
    throw err;
  } finally {
    connection?.release();
  }
}

export async function closePool(): Promise<void> {
  if (poolInstance != null) {
    await poolInstance.end();
    poolInstance = null;
  }
}
