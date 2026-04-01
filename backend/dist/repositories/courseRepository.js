import { pool } from "../lib/db.js";
/** API output keys (fixed contract). */
export const COURSE_LIST_KEYS = [
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
];
const COLUMN_SPECS = [
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
const ORDER_BY_CANDIDATES = ["code"];
let columnsCache = null;
function invalidateCoursesColumnCache() {
    columnsCache = null;
}
async function loadCoursesTableColumns() {
    const [rows] = await pool.query(`SELECT COLUMN_NAME AS columnName
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'courses'
     ORDER BY ORDINAL_POSITION`);
    return new Set(rows.map((r) => String(r.columnName)));
}
function pickColumn(cols, candidates) {
    for (const c of candidates) {
        if (cols.has(c))
            return c;
    }
    return undefined;
}
function quoteIdent(name) {
    return `\`${name.replace(/`/g, "")}\``;
}
function normalizeRow(row) {
    const out = {};
    for (const key of COURSE_LIST_KEYS) {
        const v = row[key];
        out[key] =
            v === undefined || v === null
                ? null
                : typeof v === "bigint"
                    ? Number(v)
                    : v;
    }
    return out;
}
/**
 * Lists rows from `school.courses` (current DB from env). Column names are
 * resolved against INFORMATION_SCHEMA so minor naming differences are handled.
 */
export async function listCoursesFromMysql() {
    let cols = columnsCache;
    if (!cols) {
        try {
            cols = await loadCoursesTableColumns();
            columnsCache = cols;
        }
        catch (e) {
            invalidateCoursesColumnCache();
            throw e;
        }
    }
    const selections = [];
    for (const spec of COLUMN_SPECS) {
        const physical = pickColumn(cols, spec.candidates);
        if (!physical)
            continue;
        selections.push(`${quoteIdent(physical)} AS ${quoteIdent(spec.out)}`);
    }
    if (selections.length === 0) {
        return [];
    }
    const orderCol = pickColumn(cols, ORDER_BY_CANDIDATES);
    const orderClause = orderCol
        ? `ORDER BY ${quoteIdent(orderCol)} ASC`
        : "";
    const sql = `SELECT ${selections.join(", ")} FROM ${quoteIdent("courses")} ${orderClause}`.trim();
    try {
        const [rows] = await pool.query(sql);
        return rows.map((row) => normalizeRow(row));
    }
    catch (e) {
        invalidateCoursesColumnCache();
        throw e;
    }
}
//# sourceMappingURL=courseRepository.js.map