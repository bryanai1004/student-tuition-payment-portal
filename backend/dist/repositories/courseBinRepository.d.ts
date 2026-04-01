import type { CourseBinApiItem, CourseBinUpsertInput } from "../types/courseBin.js";
export declare function listCourseBinByStudentId(studentId: string): Promise<CourseBinApiItem[]>;
export declare function upsertCourseBinItem(studentId: string, input: CourseBinUpsertInput): Promise<CourseBinApiItem>;
export declare function deleteCourseBinItem(studentId: string, itemId: number): Promise<boolean>;
//# sourceMappingURL=courseBinRepository.d.ts.map