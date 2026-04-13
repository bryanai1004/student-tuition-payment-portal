import type { StudentProgram } from "./studentProgram.js";

/** GET /api/students/:studentId/profile — legacy `students` row, portal-shaped. */
export type StudentProfilePayload = {
  studentId: string;
  fullName: string;
  program: StudentProgram;
  track: string | null;
  gender: string | null;
  age: number | null;
  /** ISO calendar date `YYYY-MM-DD`, or null when unknown. */
  enrollmentDate: string | null;
  background: string | null;
  credits: number | null;
  highestDegree: string | null;
  race: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  email: string | null;
};
