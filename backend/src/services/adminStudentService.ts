import { pool } from "../lib/db.js";
import { listLegacyAdminStudentRows } from "../repositories/studentLegacyAccountRepository.js";
import type { AdminStudentListItem } from "../types/adminStudent.js";
import { trackFromRequirementsId } from "./studentProfileService.js";

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

export async function listAdminStudents(): Promise<AdminStudentListItem[]> {
  const rows = await listLegacyAdminStudentRows(pool);
  return rows.map((r) => {
    const studentId = str(r.id);
    const nameRaw = str(r.name);
    const name = nameRaw.length > 0 ? nameRaw : studentId;
    const emailRaw = str(r.email);
    const email = emailRaw.length > 0 ? emailRaw : null;
    const bg = str(r.background);
    const program =
      bg.length > 0 ? bg : trackFromRequirementsId(r.requirements_id);

    let balance: number | null = null;
    const term = str(r.latest_term);
    const yearN = num(r.latest_year);
    if (term.length > 0 && Number.isFinite(yearN)) {
      const acctRows = num(r.acct_rows);
      if (!Number.isFinite(acctRows) || acctRows === 0) {
        const tf = num(r.total_fees);
        balance = Number.isFinite(tf) ? roundMoney(tf) : null;
      } else {
        const sd = num(r.sum_debit);
        const sc = num(r.sum_credit);
        if (Number.isFinite(sd) && Number.isFinite(sc)) {
          balance = roundMoney(sd - sc);
        }
      }
    }

    return {
      studentId,
      name,
      program,
      status: null,
      email,
      balance,
    };
  });
}
