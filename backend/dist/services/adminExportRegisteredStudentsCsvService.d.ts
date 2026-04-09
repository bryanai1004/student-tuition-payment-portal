export type BuildRegisteredStudentsCsvResult = {
    ok: true;
    filename: string;
    /** UTF-8 text without BOM (caller may prepend BOM for Excel). */
    csvBody: string;
} | {
    ok: false;
    kind: "section_not_found";
};
export declare function buildRegisteredStudentsCsvForSection(sectionId: number): Promise<BuildRegisteredStudentsCsvResult>;
//# sourceMappingURL=adminExportRegisteredStudentsCsvService.d.ts.map