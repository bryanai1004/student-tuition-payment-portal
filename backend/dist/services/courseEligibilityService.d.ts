export type EligibilityResolvedCourse = {
    code: string;
    engName: string | null;
    chiName: string | null;
    prerequisiteText: string | null;
    corequisiteText: string | null;
};
type PrerequisiteRuleSet = {
    prerequisites: string[];
    corequisites: string[];
    gradeRequirements: string[];
    programRestrictions: string[];
    rawText: string;
};
export type CourseEligibilityResult = {
    eligible: true | false | "unknown";
    missingPrerequisites: string[];
    matchedPrerequisites: string[];
    blockingReasons: string[];
};
export type CourseEligibilityAnswer = {
    resolvedCourse: EligibilityResolvedCourse | null;
    ambiguousMatches: EligibilityResolvedCourse[];
    rules: PrerequisiteRuleSet | null;
    result: CourseEligibilityResult;
};
export type ResolveAmuCourseResult = {
    status: "resolved";
    course: EligibilityResolvedCourse;
} | {
    status: "ambiguous";
    matches: EligibilityResolvedCourse[];
} | {
    status: "no_match";
};
export type StudentAcademicCourseContext = {
    studentId: string;
    studentExternalId: string;
    program: "DAHM" | "MAHM" | null;
    track: string | null;
    preferredLanguage: "en" | "zh" | null;
    catalogYear: string | null;
    completedCourses: Array<{
        code: string;
        title: string;
        grade: string | null;
    }>;
    transferCredits: number;
    currentRegistrations: Array<{
        code: string;
        title: string;
    }>;
};
export declare function isLikelyPassingGrade(value: string | null | undefined): boolean;
export declare function parsePrerequisiteRules(course: EligibilityResolvedCourse): PrerequisiteRuleSet | null;
export declare function isLikelyCourseRelatedQuery(question: string): boolean;
export declare function isShortCourseLikeQuery(question: string): boolean;
export declare function detectPrerequisiteQuestion(question: string): boolean;
export declare function detectEligibilityQuestion(question: string): boolean;
export declare function resolveAmuCourse(query: string, _studentContext?: StudentAcademicCourseContext | null): Promise<ResolveAmuCourseResult>;
export declare function evaluateCourseEligibility(args: {
    targetCourse: EligibilityResolvedCourse;
    prerequisites: PrerequisiteRuleSet | null;
    studentCompletedCourses: Array<{
        code: string;
        passed: boolean;
    }>;
    studentEnrollments: Array<{
        code: string;
        status: string;
    }>;
}): CourseEligibilityResult;
export declare function loadStudentAcademicCourseContext(studentId: string): Promise<StudentAcademicCourseContext>;
export declare function evaluateEligibilityQuestion(studentId: string, question: string): Promise<CourseEligibilityAnswer | null>;
export {};
//# sourceMappingURL=courseEligibilityService.d.ts.map