import {
  deleteCourseBinItem as deleteCourseBinItemRepo,
  listCourseBinByStudentId,
  upsertCourseBinItem,
} from "../repositories/courseBinRepository.js";
import type { CourseBinApiItem, CourseBinUpsertInput } from "../types/courseBin.js";

function normalizeStudentId(raw: string): string {
  return raw.trim();
}

export async function getCourseBinForStudent(
  studentIdRaw: string,
): Promise<{ studentId: string; items: CourseBinApiItem[] } | null> {
  const studentId = normalizeStudentId(studentIdRaw);
  if (!studentId) return null;
  const items = await listCourseBinByStudentId(studentId);
  return { studentId, items };
}

export async function addOrUpdateCourseBinItem(
  studentIdRaw: string,
  input: CourseBinUpsertInput,
): Promise<{ studentId: string; item: CourseBinApiItem } | null> {
  const studentId = normalizeStudentId(studentIdRaw);
  if (!studentId) return null;
  const item = await upsertCourseBinItem(studentId, input);
  return { studentId, item };
}

export async function removeCourseBinItem(
  studentIdRaw: string,
  itemId: number,
): Promise<{ studentId: string; removed: boolean } | null> {
  const studentId = normalizeStudentId(studentIdRaw);
  if (!studentId) return null;
  const removed = await deleteCourseBinItemRepo(studentId, itemId);
  return { studentId, removed };
}
