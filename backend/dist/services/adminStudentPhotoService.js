import { pool } from "../lib/db.js";
import { getLegacyStudentPhotoPath, legacyStudentMasterExists, updateLegacyStudentPhotoPath, } from "../repositories/studentLegacyAccountRepository.js";
import { createStudentPhotoSignedUrl, deleteStudentPhoto, uploadStudentPhoto, } from "./studentPhotoStorageService.js";
export const STUDENT_PHOTO_ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
];
export const STUDENT_PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024;
export class StudentPhotoServiceError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.name = "StudentPhotoServiceError";
        this.status = status;
    }
}
function normalizeStudentId(studentIdRaw) {
    const studentId = studentIdRaw.trim();
    if (studentId === "") {
        throw new StudentPhotoServiceError(400, "Invalid student id.");
    }
    return studentId;
}
export async function getStudentPhotoUrl(studentIdRaw) {
    const studentId = normalizeStudentId(studentIdRaw);
    const exists = await legacyStudentMasterExists(pool, studentId);
    if (!exists) {
        throw new StudentPhotoServiceError(404, "Student not found.");
    }
    const photoPath = await getLegacyStudentPhotoPath(pool, studentId);
    if (!photoPath) {
        return {
            success: true,
            studentId,
            photoPath: null,
            photoUrl: null,
        };
    }
    const photoUrl = await createStudentPhotoSignedUrl(photoPath);
    return {
        success: true,
        studentId,
        photoPath,
        photoUrl,
    };
}
export async function uploadStudentPhotoForStudentId(input) {
    const studentId = normalizeStudentId(input.studentId);
    const exists = await legacyStudentMasterExists(pool, studentId);
    if (!exists) {
        throw new StudentPhotoServiceError(404, "Student not found.");
    }
    const oldPhotoPath = await getLegacyStudentPhotoPath(pool, studentId);
    const newPhotoPath = await uploadStudentPhoto({
        studentId,
        fileBuffer: input.fileBuffer,
        contentType: input.contentType,
    });
    try {
        const updated = await updateLegacyStudentPhotoPath(pool, studentId, newPhotoPath);
        if (!updated) {
            throw new StudentPhotoServiceError(404, "Student not found.");
        }
    }
    catch (err) {
        await deleteStudentPhoto(newPhotoPath).catch((cleanupErr) => {
            console.warn(`[admin/students/photo] cleanup uploaded photo failed for ${studentId}:`, cleanupErr);
        });
        throw err;
    }
    if (oldPhotoPath && oldPhotoPath !== newPhotoPath) {
        deleteStudentPhoto(oldPhotoPath).catch((deleteErr) => {
            console.warn(`[admin/students/photo] old photo delete failed for ${studentId}:`, deleteErr);
        });
    }
    const photoUrl = await createStudentPhotoSignedUrl(newPhotoPath);
    return {
        success: true,
        studentId,
        photoPath: newPhotoPath,
        photoUrl,
    };
}
export { StudentPhotoServiceError as AdminStudentPhotoServiceError };
export async function getAdminStudentPhotoUrl(studentIdRaw) {
    return getStudentPhotoUrl(studentIdRaw);
}
export async function uploadAdminStudentPhoto(input) {
    return uploadStudentPhotoForStudentId(input);
}
//# sourceMappingURL=adminStudentPhotoService.js.map