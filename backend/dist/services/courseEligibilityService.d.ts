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
export declare function evaluateEligibilityQuestion(studentId: string, question: string): Promise<CourseEligibilityAnswer | null>;
export {};
//# sourceMappingURL=courseEligibilityService.d.ts.map