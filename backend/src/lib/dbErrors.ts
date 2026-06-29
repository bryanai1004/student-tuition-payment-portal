/** Normalize DB driver errors across Postgres (pg) and legacy MySQL (mysql2). */

type DbErrorLike = {
  code?: string;
  errno?: number;
};

function asDbError(e: unknown): DbErrorLike {
  if (e == null || typeof e !== "object") return {};
  return e as DbErrorLike;
}

/** Unique / duplicate key violation (Postgres 23505, MySQL ER_DUP_ENTRY / errno 1062). */
export function isUniqueViolation(e: unknown): boolean {
  const err = asDbError(e);
  return err.code === "23505" || err.code === "ER_DUP_ENTRY" || err.errno === 1062;
}

/** Missing column (Postgres 42703, MySQL ER_BAD_FIELD_ERROR / errno 1054). */
export function isMissingColumn(e: unknown): boolean {
  const err = asDbError(e);
  return err.code === "42703" || err.code === "ER_BAD_FIELD_ERROR" || err.errno === 1054;
}

/** Missing relation / table (Postgres 42P01, MySQL ER_NO_SUCH_TABLE / errno 1146). */
export function isMissingTable(e: unknown): boolean {
  const err = asDbError(e);
  return (
    err.code === "42P01" ||
    err.code === "ER_NO_SUCH_TABLE" ||
    err.errno === 1146
  );
}
