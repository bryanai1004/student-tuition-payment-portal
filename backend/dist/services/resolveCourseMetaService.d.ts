export type ResolvedCourseMeta = {
    title: string;
    suggestedInstructor: string | null;
};
/**
 * Admin course-section helper: authoritative Chinese-first title from `courses`, and a single
 * high-confidence instructor suggestion from legacy timetables or marks (never ambiguous).
 */
export declare function resolveCourseMeta(courseCodeRaw: string): Promise<ResolvedCourseMeta | null>;
//# sourceMappingURL=resolveCourseMetaService.d.ts.map