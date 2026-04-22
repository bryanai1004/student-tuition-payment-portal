export declare const STUDENT_PHOTO_ALLOWED_MIME_TYPES: readonly ["image/jpeg", "image/jpg", "image/png", "image/webp"];
export declare const STUDENT_PHOTO_MAX_SIZE_BYTES: number;
export declare class StudentPhotoServiceError extends Error {
    status: number;
    constructor(status: number, message: string);
}
export type StudentPhotoResult = {
    success: true;
    studentId: string;
    photoPath: string | null;
    photoUrl: string | null;
};
export declare function getStudentPhotoUrl(studentIdRaw: string): Promise<StudentPhotoResult>;
export declare function uploadStudentPhotoForStudentId(input: {
    studentId: string;
    fileBuffer: Buffer;
    contentType: string;
}): Promise<StudentPhotoResult>;
export { StudentPhotoServiceError as AdminStudentPhotoServiceError };
export type AdminStudentPhotoResult = StudentPhotoResult;
export declare function getAdminStudentPhotoUrl(studentIdRaw: string): Promise<AdminStudentPhotoResult>;
export declare function uploadAdminStudentPhoto(input: {
    studentId: string;
    fileBuffer: Buffer;
    contentType: string;
}): Promise<AdminStudentPhotoResult>;
//# sourceMappingURL=adminStudentPhotoService.d.ts.map