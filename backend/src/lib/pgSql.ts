/** Postgres helpers for SQL migrated from MySQL. */

export const PG_PUBLIC_SCHEMA = "public";

/** information_schema column list for one table in public schema. */
export function infoSchemaColumnsSql(tableName: string): string {
  return `SELECT column_name AS column_name
     FROM information_schema.columns
     WHERE table_schema = '${PG_PUBLIC_SCHEMA}'
       AND table_name = '${tableName}'`;
}

/** information_schema tables filter — caller supplies IN (?, ?, …). */
export function infoSchemaTablesSql(): string {
  return `SELECT table_name AS table_name
     FROM information_schema.tables
     WHERE table_schema = '${PG_PUBLIC_SCHEMA}'
       AND table_name IN `;
}

/** Non-empty trimmed text (Postgres equivalent of legacy utf8mb4 trim helper). */
export function trimNonEmpty(columnRef: string): string {
  return `NULLIF(TRIM(COALESCE(${columnRef}, '')), '')`;
}

/** Calendar quarter sort key for portal enrollment term labels. */
export function portalQuarterOrderSql(termColumnRef: string): string {
  const t = `UPPER(TRIM(COALESCE(${termColumnRef}, '')))`;
  return `CASE
    WHEN ${t} = 'FALL' THEN 4
    WHEN ${t} = 'SUMMER' THEN 3
    WHEN ${t} = 'SPRING' THEN 2
    WHEN ${t} = 'WINTER' THEN 1
    ELSE 0
  END`;
}

/** Strip MySQL CONVERT(… USING utf8mb4) and COLLATE utf8mb4_unicode_ci from SQL fragments. */
export function mysqlUtf8ToPostgres(sql: string): string {
  let out = sql;
  for (let i = 0; i < 20; i++) {
    const next = out.replace(
      /CONVERT\(([^()]+(?:\([^()]*\)[^()]*)*)\s+USING\s+utf8mb4\)/gi,
      "$1",
    );
    if (next === out) break;
    out = next;
  }
  out = out.replace(/\s+COLLATE\s+utf8mb4_unicode_ci/gi, "");
  out = out.replace(/\bIFNULL\(/gi, "COALESCE(");
  return out;
}
