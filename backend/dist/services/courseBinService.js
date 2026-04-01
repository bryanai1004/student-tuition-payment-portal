import { deleteCourseBinItem as deleteCourseBinItemRepo, listCourseBinByStudentId, upsertCourseBinItem, } from "../repositories/courseBinRepository.js";
function normalizeStudentId(raw) {
    return raw.trim();
}
export async function getCourseBinForStudent(studentIdRaw) {
    const studentId = normalizeStudentId(studentIdRaw);
    if (!studentId)
        return null;
    const items = await listCourseBinByStudentId(studentId);
    return { studentId, items };
}
export async function addOrUpdateCourseBinItem(studentIdRaw, input) {
    const studentId = normalizeStudentId(studentIdRaw);
    if (!studentId)
        return null;
    const item = await upsertCourseBinItem(studentId, input);
    return { studentId, item };
}
export async function removeCourseBinItem(studentIdRaw, itemId) {
    const studentId = normalizeStudentId(studentIdRaw);
    if (!studentId)
        return null;
    const removed = await deleteCourseBinItemRepo(studentId, itemId);
    return { studentId, removed };
}
//# sourceMappingURL=courseBinService.js.map