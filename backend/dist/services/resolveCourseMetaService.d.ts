export type InstructorSuggestion = {
    source: "timetable" | "marks";
    instructorId: string | null;
    nameEng: string | null;
    nameChi: string | null;
    rawText: string | null;
};
export type ResolvedCourseMeta = {
    title: string;
    /** @deprecated Prefer `instructorSuggestion` + stable display (eng → chi → raw); kept Chinese-first for compatibility. */
    suggestedInstructor: string | null;
    instructorSuggestion: InstructorSuggestion | null;
};
/**
 * Admin course-section helper: authoritative Chinese-first title from `courses`, and an instructor
 * hint from legacy timetables (any available name) or marks (first stable string when multiple).
 */
export declare function resolveCourseMeta(courseCodeRaw: string): Promise<ResolvedCourseMeta | null>;
//# sourceMappingURL=resolveCourseMetaService.d.ts.map