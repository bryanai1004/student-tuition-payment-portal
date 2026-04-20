import type { Pool } from "mysql2/promise";
import { legacyStudentPasswordMd5Hex } from "../repositories/studentLegacyAccountRepository.js";
import {
  findLegacyStudentById,
  findLegacyStudentPasswordStored,
} from "../repositories/studentLegacyAuthRepository.js";

export type LegacyLoginResult = {
  studentId: string;
  displayName: string;
};

function storedPasswordMatchesInput(
  inputPlain: string,
  stored: string,
): boolean {
  const s = stored.trim();
  if (s.length === 0) return false;
  if (/^[a-f0-9]{32}$/i.test(s)) {
    return legacyStudentPasswordMd5Hex(inputPlain) === s.toLowerCase();
  }
  return inputPlain.trim() === s;
}

export async function authenticateLegacyStudent(
  pool: Pool,
  studentIdRaw: string,
  passwordRaw: string,
): Promise<LegacyLoginResult | null> {
  const studentId = studentIdRaw.trim();
  const password = passwordRaw.trim();
  if (studentId.length === 0 || password.length === 0) return null;

  const row = await findLegacyStudentById(pool, studentId);
  if (!row) return null;

  const storedPw = await findLegacyStudentPasswordStored(pool, studentId);
  if (storedPw == null || !storedPasswordMatchesInput(password, storedPw)) {
    return null;
  }

  const displayName = row.name.trim();
  return {
    studentId: row.id,
    displayName: displayName.length > 0 ? displayName : row.id,
  };
}
