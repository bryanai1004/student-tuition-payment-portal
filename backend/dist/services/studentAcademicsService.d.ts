/**
 * Student academics API: merges **portal registration** (`portal_enrollments` + `course_sections`) with **marks**
 * attempts. `transcript` in the response is marks-only; `enrollmentHistory` is the **combined** sorted timeline
 * (legacy JSON field name). This service does **not** compute degree audit or clinical progress — those belong in
 * `computeDegreeAudit` and `clinicalProgressService` respectively, merged only at the account layer when needed.
 */
import type { StudentAcademicsResponse } from "../types/studentAcademics.js";
export declare function getStudentAcademicsPayload(studentId: string): Promise<StudentAcademicsResponse>;
//# sourceMappingURL=studentAcademicsService.d.ts.map