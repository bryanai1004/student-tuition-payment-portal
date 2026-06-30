import {
  deleteCourseBinForStudentTerm,
  deleteCourseBinItem as deleteCourseBinItemRepo,
  listCourseBinByStudentAndTerm,
  upsertCourseBinItem,
} from "../repositories/courseBinRepository.js";
import type { CourseBinApiItem, CourseBinUpsertInput } from "../types/courseBin.js";

function normalizeStudentId(raw: string): string {
  return raw.trim();
}

function normalizeAcademicTermId(raw: string): string {
  return raw.trim();
}

export async function getCourseBinForStudentTerm(
  studentIdRaw: string,
  academicTermIdRaw: string,
): Promise<{ studentId: string; academicTermId: string; items: CourseBinApiItem[] } | null> {
  const studentId = normalizeStudentId(studentIdRaw);
  const academicTermId = normalizeAcademicTermId(academicTermIdRaw);
  if (studentId === "" || academicTermId === "") return null;
  const items = await listCourseBinByStudentAndTerm(studentId, academicTermId);
  return { studentId, academicTermId, items };
}

export async function addOrUpdateCourseBinItem(
  studentIdRaw: string,
  input: CourseBinUpsertInput,
): Promise<{ studentId: string; item: CourseBinApiItem } | null> {
  const studentId = normalizeStudentId(studentIdRaw);
  if (studentId === "" || input.academic_term_id.trim() === "") return null;
  const item = await upsertCourseBinItem(studentId, input);
  return { studentId, item };
}

export async function removeCourseBinItem(
  studentIdRaw: string,
  itemId: number,
): Promise<{ studentId: string; removed: boolean } | null> {
  const studentId = normalizeStudentId(studentIdRaw);
  if (studentId === "") return null;
  const removed = await deleteCourseBinItemRepo(studentId, itemId);
  return { studentId, removed };
}

export async function clearCourseBinForStudentTerm(
  studentIdRaw: string,
  academicTermIdRaw: string,
): Promise<{ studentId: string; academicTermId: string; removedCount: number } | null> {
  const studentId = normalizeStudentId(studentIdRaw);
  const academicTermId = normalizeAcademicTermId(academicTermIdRaw);
  if (studentId === "" || academicTermId === "") return null;
  const removedCount = await deleteCourseBinForStudentTerm(studentId, academicTermId);
  return { studentId, academicTermId, removedCount };
}
