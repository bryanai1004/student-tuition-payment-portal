/**
 * Audit (and optionally repair) legacy `password_stu` rows for students listed in
 * `amu_2026_spring_initial_passwords.csv` (output of `generate-initial-passwords.ts`
 * for AMU_2026_Spring.xlsx).
 *
 * For each CSV row with a non-empty `initial_password`, compares DB
 * `password_stu.password` to MD5(initial_password) using the same helper as runtime.
 *
 * Usage (from backend/):
 *   npx tsx scripts/audit-amu-2026-password-migration.ts
 *   npx tsx scripts/audit-amu-2026-password-migration.ts --csv path/to/amu_2026_spring_initial_passwords.csv
 *   npx tsx scripts/audit-amu-2026-password-migration.ts --repair
 *
 * Default CSV: backend/amu_2026_spring_initial_passwords.csv
 * Reports: backend/reports/amu-2026-spring-password-audit/<runId>/
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, pool, type RowDataPacket } from "../src/lib/db.js";
import { legacyStudentPasswordMd5Hex } from "../src/repositories/studentLegacyAccountRepository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");

const DEFAULT_CSV_NAME = "amu_2026_spring_initial_passwords.csv";
const REPORTS_BASE = path.join(BACKEND_ROOT, "reports", "amu-2026-spring-password-audit");

type CsvRow = {
  student_id: string;
  name: string;
  initial_password: string;
  matched_in_db: string;
  note: string;
};

type AuditBucket =
  | "correct"
  | "mismatched"
  | "missing"
  | "no_plaintext_in_csv";

type AuditRecord = CsvRow & {
  bucket: AuditBucket;
  expected_md5_hex: string;
  stored_password: string | null;
};

/** Matches `generate-initial-passwords.ts` CSV headers (`student_id`, `initial_password`, …). */
function csvHeaderKey(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

function parseArgs(argv: string[]): { csvPath: string; repair: boolean; outDir?: string } {
  let csvPath = path.join(BACKEND_ROOT, DEFAULT_CSV_NAME);
  let repair = false;
  let outDir: string | undefined;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--repair") repair = true;
    else if (a === "--csv" && argv[i + 1]) {
      csvPath = path.resolve(String(argv[++i]).trim());
    } else if (a === "--out-dir" && argv[i + 1]) {
      outDir = path.resolve(String(argv[++i]).trim());
    }
  }
  return { csvPath, repair, outDir };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvLine(fields: string[]): string {
  return fields.map(escapeCsvCell).join(",");
}

function parseInitialPasswordsCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("CSV is empty");
  const headerCells = parseCsvLine(lines[0]!);
  const headerMap = new Map<string, number>();
  headerCells.forEach((h, idx) => {
    headerMap.set(csvHeaderKey(h), idx);
  });
  const idIdx = headerMap.get("student id");
  const nameIdx = headerMap.get("name");
  const pwIdx = headerMap.get("initial password");
  const matchedIdx = headerMap.get("matched in db");
  const noteIdx = headerMap.get("note");
  if (idIdx == null || nameIdx == null || pwIdx == null) {
    throw new Error(
      "CSV must include headers: student_id, name, initial_password (and optionally matched_in_db, note)",
    );
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const student_id = (cells[idIdx] ?? "").trim();
    if (!student_id) continue;
    rows.push({
      student_id,
      name: (cells[nameIdx] ?? "").trim(),
      initial_password: (cells[pwIdx] ?? "").trim(),
      matched_in_db: matchedIdx != null ? (cells[matchedIdx] ?? "").trim() : "",
      note: noteIdx != null ? (cells[noteIdx] ?? "").trim() : "",
    });
  }
  return rows;
}

function hashesEqual(stored: string, expected: string): boolean {
  return stored.trim().toLowerCase() === expected.trim().toLowerCase();
}

async function fetchPasswordStuPasswords(
  studentIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const CHUNK = 400;
  for (let i = 0; i < studentIds.length; i += CHUNK) {
    const chunk = studentIds.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => "?").join(",");
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT TRIM(id) AS id, TRIM(password) AS pw FROM password_stu WHERE TRIM(id) IN (${placeholders})`,
      chunk,
    );
    for (const r of rows) {
      const id = String(r.id ?? "").trim();
      if (!id) continue;
      const pw = r.pw == null ? "" : String(r.pw).trim();
      map.set(id, pw);
    }
  }
  return map;
}

function classifyRow(
  row: CsvRow,
  storedPw: string | undefined,
): { bucket: AuditBucket; expected_md5_hex: string; stored_password: string | null } {
  if (!row.initial_password) {
    return {
      bucket: "no_plaintext_in_csv",
      expected_md5_hex: "",
      stored_password: storedPw != null && storedPw.length > 0 ? storedPw : null,
    };
  }
  const expected = legacyStudentPasswordMd5Hex(row.initial_password);
  if (storedPw == null || storedPw.length === 0) {
    return {
      bucket: "missing",
      expected_md5_hex: expected,
      stored_password: null,
    };
  }
  if (hashesEqual(storedPw, expected)) {
    return {
      bucket: "correct",
      expected_md5_hex: expected,
      stored_password: storedPw,
    };
  }
  return {
    bucket: "mismatched",
    expected_md5_hex: expected,
    stored_password: storedPw,
  };
}

function auditRecordToCsvLine(r: AuditRecord): string {
  return toCsvLine([
    r.student_id,
    r.name,
    r.initial_password,
    r.matched_in_db,
    r.note,
    r.bucket,
    r.expected_md5_hex,
    r.stored_password ?? "",
  ]);
}

const AUDIT_HEADER = toCsvLine([
  "student_id",
  "name",
  "initial_password",
  "matched_in_db",
  "note",
  "audit_bucket",
  "expected_md5_hex",
  "stored_password",
]);

async function main(): Promise<void> {
  const { csvPath, repair, outDir: outDirArg } = parseArgs(process.argv);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = outDirArg ?? path.join(REPORTS_BASE, runId);

  const csvText = await readFile(csvPath, "utf8");
  const rows = parseInitialPasswordsCsv(csvText);

  const idsForDb = [...new Set(rows.map((r) => r.student_id.trim()))];
  const pwById = await fetchPasswordStuPasswords(idsForDb);

  const auditRows: AuditRecord[] = [];
  for (const row of rows) {
    const id = row.student_id.trim();
    const stored = pwById.get(id);
    const { bucket, expected_md5_hex, stored_password } = classifyRow(
      row,
      stored,
    );
    auditRows.push({
      ...row,
      bucket,
      expected_md5_hex,
      stored_password,
    });
  }

  const correct = auditRows.filter((r) => r.bucket === "correct");
  const mismatched = auditRows.filter((r) => r.bucket === "mismatched");
  const missing = auditRows.filter((r) => r.bucket === "missing");
  const noPlain = auditRows.filter((r) => r.bucket === "no_plaintext_in_csv");

  await mkdir(outDir, { recursive: true });

  const writeGroup = async (name: string, recs: AuditRecord[]) => {
    const body = [AUDIT_HEADER, ...recs.map(auditRecordToCsvLine)].join("\n");
    const p = path.join(outDir, `${name}.csv`);
    await writeFile(p, body + "\n", "utf8");
    return p;
  };

  const paths = {
    correct: await writeGroup("correct", correct),
    mismatched: await writeGroup("mismatched", mismatched),
    missing: await writeGroup("missing", missing),
    no_plaintext_in_csv: await writeGroup("no_plaintext_in_csv", noPlain),
    all: path.join(outDir, "all_rows.csv"),
  };
  await writeFile(
    paths.all,
    [AUDIT_HEADER, ...auditRows.map(auditRecordToCsvLine)].join("\n") + "\n",
    "utf8",
  );

  let repairPath: string | null = null;
  if (repair && mismatched.length > 0) {
    const repairLines: string[] = [
      toCsvLine([
        "student_id",
        "name",
        "initial_password",
        "stored_password_before",
        "expected_md5_hex",
        "stored_password_after",
        "repair_action",
      ]),
    ];

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const r of mismatched) {
        const id = r.student_id.trim();
        const [checkRows] = await conn.query<RowDataPacket[]>(
          "SELECT TRIM(password) AS pw FROM password_stu WHERE TRIM(id) = ? LIMIT 1",
          [id],
        );
        const before =
          checkRows[0]?.pw == null ? "" : String(checkRows[0].pw).trim();
        let action: string;
        if (!before) {
          action = "skipped_no_password_stu_row";
        } else if (hashesEqual(before, r.expected_md5_hex)) {
          action = "skipped_already_matches_csv";
        } else {
          await conn.execute(
            "UPDATE password_stu SET password = ? WHERE TRIM(id) = ?",
            [r.expected_md5_hex, id],
          );
          action = "updated";
        }
        const [afterRows] = await conn.query<RowDataPacket[]>(
          "SELECT TRIM(password) AS pw FROM password_stu WHERE TRIM(id) = ? LIMIT 1",
          [id],
        );
        const after =
          afterRows[0]?.pw == null ? "" : String(afterRows[0].pw).trim();
        repairLines.push(
          toCsvLine([
            r.student_id,
            r.name,
            r.initial_password,
            before,
            r.expected_md5_hex,
            after,
            action,
          ]),
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    repairPath = path.join(outDir, "repair_applied.csv");
    await writeFile(repairPath, repairLines.join("\n") + "\n", "utf8");
  }

  const summaryLines = [
    `AMU 2026 Spring password_stu audit`,
    `CSV: ${csvPath}`,
    `Output directory: ${outDir}`,
    ``,
    `Total CSV data rows (non-empty student_id): ${rows.length}`,
    `correct (DB hash matches CSV initial password): ${correct.length}`,
    `mismatched (password_stu row exists, wrong hash): ${mismatched.length}`,
    `missing (no password_stu row, CSV had initial password): ${missing.length}`,
    `no_plaintext_in_csv (empty initial_password in CSV): ${noPlain.length}`,
    ``,
    `Files:`,
    `  ${paths.correct}`,
    `  ${paths.mismatched}`,
    `  ${paths.missing}`,
    `  ${paths.no_plaintext_in_csv}`,
    `  ${paths.all}`,
  ];
  if (repairPath) {
    summaryLines.push(`  ${repairPath}`);
  } else if (repair && mismatched.length === 0) {
    summaryLines.push(
      ``,
      `--repair was set but there were no mismatched rows; no DB writes.`,
    );
  }

  const summaryPath = path.join(outDir, "summary.txt");
  await writeFile(summaryPath, summaryLines.join("\n") + "\n", "utf8");

  console.log(summaryLines.join("\n"));
}

try {
  await main();
} finally {
  await closePool().catch(() => undefined);
}
