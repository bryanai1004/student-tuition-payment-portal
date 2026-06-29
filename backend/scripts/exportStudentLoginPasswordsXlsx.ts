#!/usr/bin/env npx tsx
/**
 * Export student id, name, and portal login password to xlsx.
 * Password = defaultStudentPassword(name, id) for students with password_stu row.
 * Output: ../exports/student-login-passwords-<timestamp>.xlsx (gitignored)
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { closePool, pool, type RowDataPacket } from "../src/lib/db.js";
import { defaultStudentPassword } from "../src/lib/defaultStudentPassword.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const exportsDir = path.resolve(scriptDir, "../../exports");

type ExportRow = {
  student_id: string;
  name: string;
  password: string;
  login_url: string;
};

async function main(): Promise<void> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT TRIM(s.id) AS id, TRIM(s.name) AS name
       FROM students s
       INNER JOIN password_stu p ON TRIM(p.id) = TRIM(s.id)
       ORDER BY s.id ASC`,
    );

    const loginUrl = "https://myamu.wanpanel.ai/login";
    const data: ExportRow[] = [];

    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      const name = String(row.name ?? "").trim();
      if (id === "" || name === "") continue;
      data.push({
        student_id: id,
        name,
        password: defaultStudentPassword(name, id),
        login_url: loginUrl,
      });
    }

    fs.mkdirSync(exportsDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const outPath = path.join(exportsDir, `student-login-passwords-${stamp}.xlsx`);

    const sheet = XLSX.utils.json_to_sheet(data, {
      header: ["student_id", "name", "password", "login_url"],
    });
    sheet["!cols"] = [
      { wch: 12 },
      { wch: 32 },
      { wch: 24 },
      { wch: 36 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "students");
    XLSX.writeFile(wb, outPath);

    console.log(`Exported ${data.length} rows → ${outPath}`);
  } finally {
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
