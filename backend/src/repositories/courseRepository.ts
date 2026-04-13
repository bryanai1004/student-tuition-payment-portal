import type { RowDataPacket } from "mysql2";
import { pool } from "../lib/db.js";
import { ensurePortalCoursesForLegacyCatalog } from "./portalCourseRepository.js";

/** API output keys (fixed contract). */
export const COURSE_LIST_KEYS = [
  "course_id",
  "code",
  "eng_name",
  "chi_name",
  "units",
  "prerequisite",
  "concurrent",
  "category",
  "is_daim",
  "clinic1Required",
  "clinic2Required",
] as const;

export type CourseListKey = (typeof COURSE_LIST_KEYS)[number];

export type CourseListItem = Record<CourseListKey, string | number | boolean | null>;

type ColumnSpec = { out: CourseListKey; candidates: readonly string[] };

const COLUMN_SPECS: ColumnSpec[] = [
  { out: "code", candidates: ["code"] },
  { out: "eng_name", candidates: ["eng_name", "engName"] },
  { out: "chi_name", candidates: ["chi_name", "chiName"] },
  { out: "units", candidates: ["units"] },
  {
    out: "prerequisite",
    candidates: ["prerequisite", "prereq", "prerequisites"],
  },
  { out: "concurrent", candidates: ["concurrent"] },
  { out: "category", candidates: ["category"] },
  { out: "is_daim", candidates: ["is_daim", "isDaim"] },
  {
    out: "clinic1Required",
    candidates: [
      "clinic1Required",
      "clinic1_required",
      "clinic_1_required",
      "clinic1_req",
    ],
  },
  {
    out: "clinic2Required",
    candidates: [
      "clinic2Required",
      "clinic2_required",
      "clinic_2_required",
      "clinic2_req",
    ],
  },
];

const ORDER_BY_CANDIDATES = ["code"] as const;

let columnsCache: Set<string> | null = null;

function invalidateCoursesColumnCache(): void {
  columnsCache = null;
}

async function loadCoursesTableColumns(): Promise<Set<string>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME AS columnName
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'courses'
     ORDER BY ORDINAL_POSITION`,
  );
  return new Set(rows.map((r) => String(r.columnName)));
}

function pickColumn(
  cols: Set<string>,
  candidates: readonly string[],
): string | undefined {
  for (const c of candidates) {
    if (cols.has(c)) return c;
  }
  return undefined;
}

function quoteIdent(name: string): string {
  return `\`${name.replace(/`/g, "")}\``;
}

function normalizeRow(row: RowDataPacket): CourseListItem {
  const out = {} as CourseListItem;
  for (const key of COURSE_LIST_KEYS) {
    const v = row[key];
    out[key] =
      v === undefined || v === null
        ? null
        : typeof v === "bigint"
          ? Number(v)
          : (v as string | number | boolean);
  }
  return out;
}

/**
 * Lists rows from `school.courses` (current DB from env). Column names are
 * resolved against INFORMATION_SCHEMA so minor naming differences are handled.
 */
export async function listCoursesFromMysql(): Promise<CourseListItem[]> {
  let cols = columnsCache;
  if (!cols) {
    try {
      cols = await loadCoursesTableColumns();
      columnsCache = cols;
    } catch (e) {
      invalidateCoursesColumnCache();
      throw e;
    }
  }

  const selections: string[] = [];
  const codePhysical = pickColumn(cols, ["code"]);

  if (codePhysical) {
    await ensurePortalCoursesForLegacyCatalog();
  }

  for (const spec of COLUMN_SPECS) {
    const physical = pickColumn(cols, spec.candidates);
    if (!physical) continue;
    selections.push(
      `${quoteIdent(physical)} AS ${quoteIdent(spec.out)}`,
    );
  }

  if (codePhysical) {
    selections.unshift("pc.course_id AS `course_id`");
  }

  if (selections.length === 0) {
    return [];
  }

  const orderCol = pickColumn(cols, ORDER_BY_CANDIDATES);
  const orderClause = orderCol
    ? `ORDER BY c.${quoteIdent(orderCol)} ASC`
    : "";
  const joinClause = codePhysical
    ? `LEFT JOIN (
         SELECT
           course_code,
           MIN(course_id) AS course_id
         FROM portal_courses
         GROUP BY course_code
       ) pc
         ON CONVERT(TRIM(pc.course_code) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
            CONVERT(TRIM(c.${quoteIdent(codePhysical)}) USING utf8mb4) COLLATE utf8mb4_unicode_ci`
    : "";

  const sql = `SELECT ${selections.join(", ")} FROM ${quoteIdent("courses")} c ${joinClause} ${orderClause}`.trim();

  try {
    const [rows] = await pool.query<RowDataPacket[]>(sql);
    return rows.map((row) => normalizeRow(row));
  } catch (e) {
    invalidateCoursesColumnCache();
    throw e;
  }
}
