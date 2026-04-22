export declare function uploadStudentPhoto(input: {
    studentId: string;
    fileBuffer: Buffer;
    contentType: string;
}): Promise<string>;
export declare function createStudentPhotoSignedUrl(photoPath: string, ttlSeconds?: number): Promise<string>;
export declare function deleteStudentPhoto(photoPath: string): Promise<void>;
//# sourceMappingURL=studentPhotoStorageService.d.ts.map