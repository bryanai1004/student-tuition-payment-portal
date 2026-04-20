/**
 * One-time batch: read AMU Spring 2026 student Excel, generate random 6-char
 * A–Z / 0–9 initial passwords, store MD5 hex in legacy `password_stu.password`,
 * export a CSV of plaintext passwords for distribution.
 *
 * Usage (from backend/):
 *   npx tsx scripts/generate-initial-passwords.ts [path/to/AMU_2026_Spring.xlsx]
 *
 * Default Excel path: /Users/libingchen/Desktop/AMU_2026_Spring.xlsx
 * Output CSV: backend/amu_2026_spring_initial_passwords.csv
 */

import { randomInt } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RowDataPacket } from "mysql2/promise";
import XLSX from "xlsx";

import { closePool, pool } from "../src/lib/db.js";
import { legacyStudentPasswordMd5Hex } from "../src/repositories/studentLegacyAccountRepository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");

const DEFAULT_EXCEL_PATH =
  "/Users/libingchen/Desktop/AMU_2026_Spring.xlsx";
const OUTPUT_CSV_NAME = "amu_2026_spring_initial_passwords.csv";

const PASSWORD_LEN = 6;
const PASSWORD_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

type CleanRow = { student_id: string; name: string };

function normalizeHeaderKey(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function isHeaderDuplicateRow(studentId: string, name: string): boolean {
  if (studentId.toLowerCase() === "student id") return true;
  if (name.toLowerCase() === "name" && studentId.toLowerCase() === "student id")
    return true;
  return false;
}

type SheetPick = {
  sheetName: string;
  records: CleanRow[];
  headerWidth: number;
};

function parseSheet(wb: XLSX.WorkBook, sheetName: string): SheetPick | null {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return null;

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (rows.length === 0) return null;

  const headers = Object.keys(rows[0]!);
  const idCol = headers.find((h) => normalizeHeaderKey(h) === "student id");
  const nameCol = headers.find((h) => normalizeHeaderKey(h) === "name");
  if (!idCol || !nameCol) return null;

  const records: CleanRow[] = [];
  for (const row of rows) {
    const student_id = String(row[idCol] ?? "").trim();
    const name = normalizeName(String(row[nameCol] ?? ""));
    if (!student_id) continue;
    if (isHeaderDuplicateRow(student_id, name)) continue;
    records.push({ student_id, name });
  }

  const headerWidth = headers.filter((h) => String(h).trim() !== "").length;
  return { sheetName, records, headerWidth };
}

function pickBestSheet(wb: XLSX.WorkBook): SheetPick {
  let best: SheetPick | null = null;
  for (const sheetName of wb.SheetNames) {
    const parsed = parseSheet(wb, sheetName);
    if (!parsed) continue;
    if (!best) {
      best = parsed;
      continue;
    }
    const a = parsed.records.length;
    const b = best.records.length;
    if (a > b) best = parsed;
    else if (a === b && parsed.headerWidth > best.headerWidth) best = parsed;
  }
  if (!best) {
    throw new Error(
      "No sheet found with columns 'Student ID' and 'Name'. Check the workbook.",
    );
  }
  return best;
}

function dedupeByStudentId(rows: CleanRow[]): {
  unique: CleanRow[];
  duplicateIds: string[];
} {
  const seen = new Set<string>();
  const unique: CleanRow[] = [];
  const duplicateIds: string[] = [];
  for (const r of rows) {
    if (seen.has(r.student_id)) {
      duplicateIds.push(r.student_id);
      continue;
    }
    seen.add(r.student_id);
    unique.push(r);
  }
  return { unique, duplicateIds };
}

function generatePassword(used: Set<string>): string {
  for (;;) {
    let pwd = "";
    for (let i = 0; i < PASSWORD_LEN; i++) {
      pwd += PASSWORD_CHARS[randomInt(0, PASSWORD_CHARS.length)]!;
    }
    if (!used.has(pwd)) {
      used.add(pwd);
      return pwd;
    }
  }
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

async function fetchMatchedPasswordStuIds(
  studentIds: string[],
): Promise<Set<string>> {
  const matched = new Set<string>();
  const CHUNK = 400;
  for (let i = 0; i < studentIds.length; i += CHUNK) {
    const chunk = studentIds.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => "?").join(",");
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT TRIM(id) AS id FROM password_stu WHERE TRIM(id) IN (${placeholders})`,
      chunk,
    );
    for (const r of rows) {
      const id = String(r.id ?? "").trim();
      if (id) matched.add(id);
    }
  }
  return matched;
}

async function main(): Promise<void> {
  const excelPath = process.argv[2]?.trim() || DEFAULT_EXCEL_PATH;
  const outCsvPath = path.join(BACKEND_ROOT, OUTPUT_CSV_NAME);

  const wb = XLSX.readFile(excelPath);
  const { sheetName, records: rawRecords } = pickBestSheet(wb);
  console.log(`[excel] using sheet "${sheetName}"`);

  const excelBeforeDedupe = rawRecords.length;
  const { unique: students, duplicateIds } = dedupeByStudentId(rawRecords);

  if (duplicateIds.length > 0) {
    console.log(
      `[excel] skipped ${duplicateIds.length} duplicate row(s) for student_id(s): ${[
        ...new Set(duplicateIds),
      ].join(", ")}`,
    );
  }

  const ids = students.map((s) => s.student_id);
  const matchedSet = await fetchMatchedPasswordStuIds(ids);
  const unmatched = ids.filter((id) => !matchedSet.has(id));

  console.log(`[excel] total valid rows (non-empty Student ID): ${excelBeforeDedupe}`);
  console.log(`[excel] unique students after dedupe: ${students.length}`);
  console.log(`[db] matched in password_stu: ${matchedSet.size}`);
  console.log(`[db] unmatched student_ids (${unmatched.length}):`);
  if (unmatched.length === 0) console.log("  (none)");
  else console.log(`  ${unmatched.join(", ")}`);

  const batchPasswords = new Map<string, string>();
  const usedPw = new Set<string>();

  for (const s of students) {
    if (!matchedSet.has(s.student_id)) continue;
    batchPasswords.set(s.student_id, generatePassword(usedPw));
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [studentId, plain] of batchPasswords) {
      const hash = legacyStudentPasswordMd5Hex(plain);
      await conn.execute(
        `UPDATE password_stu SET password = ? WHERE TRIM(id) = ?`,
        [hash, studentId.trim()],
      );
    }
    await conn.commit();
    console.log(
      `[db] updated password_stu for ${batchPasswords.size} student(s).`,
    );
  } catch (e) {
    await conn.rollback();
    console.error("[db] transaction rolled back:", e);
    throw e;
  } finally {
    conn.release();
  }

  const csvLines: string[] = [
    toCsvLine([
      "student_id",
      "name",
      "initial_password",
      "matched_in_db",
      "note",
    ]),
  ];

  for (const s of students) {
    const ok = matchedSet.has(s.student_id);
    const pw = batchPasswords.get(s.student_id) ?? "";
    const note = ok
      ? ""
      : "No password_stu row; password not changed.";
    csvLines.push(
      toCsvLine([
        s.student_id,
        s.name,
        pw,
        ok ? "yes" : "no",
        note,
      ]),
    );
  }

  await writeFile(outCsvPath, csvLines.join("\n") + "\n", "utf8");
  console.log(`[csv] wrote ${outCsvPath}`);
}

try {
  await main();
} finally {
  await closePool().catch(() => undefined);
}
