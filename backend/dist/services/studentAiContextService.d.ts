export type StudentAiContextBuildResult = {
    studentId: string;
    contextText: string;
    dataSources: string[];
    meta: {
        hasProfile: boolean;
        hasCurrentTerm: boolean;
        currentEnrollmentCount: number;
        recentHistoryCount: number;
        completedGradeCount: number;
        notesCount: number;
    };
};
export declare function buildStudentAiContext(studentId: string): Promise<StudentAiContextBuildResult>;
//# sourceMappingURL=studentAiContextService.d.ts.map