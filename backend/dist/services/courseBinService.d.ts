import type { CourseBinApiItem, CourseBinUpsertInput } from "../types/courseBin.js";
export declare function getCourseBinForStudent(studentIdRaw: string): Promise<{
    studentId: string;
    items: CourseBinApiItem[];
} | null>;
export declare function addOrUpdateCourseBinItem(studentIdRaw: string, input: CourseBinUpsertInput): Promise<{
    studentId: string;
    item: CourseBinApiItem;
} | null>;
export declare function removeCourseBinItem(studentIdRaw: string, itemId: number): Promise<{
    studentId: string;
    removed: boolean;
} | null>;
//# sourceMappingURL=courseBinService.d.ts.map