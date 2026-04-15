export type AuthenticatedStudent = {
    studentId: string;
};
export declare function issueStudentAccessToken(studentId: string): string;
export declare function verifyStudentAccessToken(authorizationHeader: string | undefined): AuthenticatedStudent | null;
//# sourceMappingURL=studentAuthToken.d.ts.map